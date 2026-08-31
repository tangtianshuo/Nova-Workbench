// Phase 26 (26-01) — tab-run infrastructure. Tab-triggered engine runs live
// here, NOT in chatConsoleStore: each run gets its own sessionId (TAB-05, the
// session never enters any chat session list) and the Channel onEvent callback
// is store-level, so events keep accumulating while the tab is unmounted.
// Runs are transient (never persisted); rehydrateTabRuns rebuilds from the
// event log by sessionId when run records survive a webview reload.
import { create } from 'zustand';
import { engineCancel, engineRun } from '@/src/ai/api';
import { routeEngineCandidateToConsole } from '@/src/stores/chatConsoleStore';
import { resolveSessionEvents } from '@/src/ai/fork';
import { useUIStore } from '@/src/stores/uiStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';

export type TabRunKind =
  | 'requirement'
  | 'prototype'
  | 'code'
  | 'test'
  | 'competitor'
  | 'deliverable-single'
  | 'deliverable-batch'
  | 'product-skill';

export type TabRunStatus =
  | 'queued'
  | 'running'
  | 'waiting-for-confirmation'
  | 'done'
  | 'error'
  | 'cancelled';

export interface TabRunEventRow {
  ts: number;
  kind: string;
  name?: string;
  summary?: string;
}

export interface TabRunRecord {
  runId: string;
  tabId: string;
  kind: TabRunKind;
  sessionId: string;
  productId: string;
  status: TabRunStatus;
  currentStep: string;
  events: TabRunEventRow[];
  startedAt: number;
  error?: string;
  candidateCount: number;
}

export interface StartTabRunParams {
  tabId: string;
  kind: TabRunKind;
  productId: string;
  userMessage: string;
  coreContext: string;
  sessionTitle?: string;
  workspaceId?: string | null;
  workspaceRoot?: string | null;
}

interface TabRunState {
  /** key = runId */
  runs: Record<string, TabRunRecord>;
  /** tabId → active (queued/running/waiting) runId — 1-run-per-tab guard. */
  runsByTab: Record<string, string>;
  startTabRun: (params: StartTabRunParams) => string;
  cancelTabRun: (runId: string) => Promise<void>;
  rehydrateTabRuns: () => Promise<void>;
  clearRun: (runId: string) => void;
}

/** Cap per-run event rows — batch runs (18 deliverables) must not grow unbounded. */
const MAX_EVENTS = 200;
const ACTIVE: readonly TabRunStatus[] = ['queued', 'running', 'waiting-for-confirmation'];

function appendEvent(run: TabRunRecord, row: TabRunEventRow): TabRunRecord {
  const events = [...run.events, row];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return { ...run, events };
}

function patchRun(set: (fn: (s: TabRunState) => Partial<TabRunState>) => void, runId: string, patch: (run: TabRunRecord) => TabRunRecord) {
  set((state) => {
    const run = state.runs[runId];
    if (!run) return {};
    return { runs: { ...state.runs, [runId]: patch(run) } };
  });
}

export const useTabRunStore = create<TabRunState>()((set, get) => ({
  runs: {},
  runsByTab: {},

  startTabRun: (params) => {
    const existingId = get().runsByTab[params.tabId];
    if (existingId) {
      const existing = get().runs[existingId];
      if (existing && ACTIVE.includes(existing.status)) return existingId;
    }

    const runId = crypto.randomUUID();
    // TAB-05: independent sessionId — never reused from chat, never listed.
    const sessionId = crypto.randomUUID();
    const provider = useUIStore.getState().activeAIProvider;

    const record: TabRunRecord = {
      runId,
      tabId: params.tabId,
      kind: params.kind,
      sessionId,
      productId: params.productId,
      status: 'queued',
      currentStep: '排队中…',
      events: [],
      startedAt: Date.now(),
      candidateCount: 0,
    };
    set((state) => ({
      runs: { ...state.runs, [runId]: record },
      runsByTab: { ...state.runsByTab, [params.tabId]: runId },
    }));

    void (async () => {
      try {
        await engineRun({
          runId,
          userMessage: params.userMessage,
          sessionId,
          provider,
          ollamaModel: provider === 'ollama' ? useUIStore.getState().ollamaModel : undefined,
          workspaceId: params.workspaceId ?? useWorkspaceStore.getState().activeWorkspaceId,
          workspaceRoot:
            params.workspaceRoot ??
            (() => {
              const ws = useWorkspaceStore.getState();
              return ws.workspaces.find((w) => w.id === ws.activeWorkspaceId)?.folderPath ?? null;
            })(),
          productId: params.productId,
          sessionTitle: params.sessionTitle ?? params.userMessage.slice(0, 24),
          coreContext: params.coreContext,
          onEvent: (msg) => {
            if (msg.kind === 'run_status' && (msg.data?.status === 'queued' || msg.data?.status === 'running')) {
              patchRun(set, runId, (run) => ({
                ...run,
                status: msg.data!.status as TabRunStatus,
                currentStep: msg.data!.status === 'queued' ? '排队中…' : '运行中…',
              }));
              return;
            }
            if (msg.kind === 'confirmation' && msg.data?.candidate) {
              // D-05: HITL cards only go through the global confirmation queue.
              routeEngineCandidateToConsole(msg.data.candidate, sessionId);
              patchRun(set, runId, (run) => ({
                ...appendEvent(run, { ts: Date.now(), kind: 'confirmation', name: msg.data!.candidate!.kind }),
                status: 'waiting-for-confirmation',
                candidateCount: run.candidateCount + 1,
                currentStep: '等待确认…',
              }));
              return;
            }
            if (msg.kind === 'tool_start' && msg.data?.name) {
              const name = msg.data.name;
              patchRun(set, runId, (run) => ({
                ...appendEvent(run, { ts: Date.now(), kind: 'tool_start', name }),
                currentStep: `正在调用 ${name}…`,
              }));
              return;
            }
            if (msg.kind === 'tool_end' && msg.data?.name) {
              patchRun(set, runId, (run) => appendEvent(run, { ts: Date.now(), kind: 'tool_end', name: msg.data!.name, summary: msg.data!.ok === false ? 'failed' : 'ok' }));
              return;
            }
            if (msg.kind === 'tool_output' && msg.data?.name) {
              patchRun(set, runId, (run) => appendEvent(run, { ts: Date.now(), kind: 'tool_output', name: msg.data!.name }));
              return;
            }
            if (msg.kind === 'token' && msg.data?.text) {
              const text = msg.data.text;
              patchRun(set, runId, (run) => appendEvent(run, { ts: Date.now(), kind: 'token', summary: text.slice(0, 80) }));
              return;
            }
            if (msg.kind === 'error' && msg.data?.message) {
              const message = msg.data.message;
              patchRun(set, runId, (run) => ({ ...run, status: 'error', error: message, currentStep: '出错' }));
            }
          },
        });
        // Settled without stream error: done unless candidates await the user.
        patchRun(set, runId, (run) =>
          ACTIVE.includes(run.status)
            ? { ...run, status: 'done', currentStep: '完成' }
            : run,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        patchRun(set, runId, (run) => ({ ...run, status: 'error', error: message, currentStep: '出错' }));
      } finally {
        set((state) => (state.runsByTab[params.tabId] === runId
          ? { runsByTab: Object.fromEntries(Object.entries(state.runsByTab).filter(([tab, id]) => !(tab === params.tabId && id === runId))) }
          : {}));
      }
    })();

    return runId;
  },

  cancelTabRun: async (runId) => {
    await engineCancel(runId);
    patchRun(set, runId, (run) => ({ ...run, status: 'cancelled', currentStep: '已取消' }));
    set((state) => {
      const entries = Object.entries(state.runsByTab).filter(([, id]) => id !== runId);
      return { runsByTab: Object.fromEntries(entries) };
    });
  },

  // Webview-reload recovery: one-shot event pull by sessionId (no polling).
  // Runs left in an active status get their events rebuilt from agent_events;
  // runs whose stream cannot be resolved keep their status for user cancel/retry.
  rehydrateTabRuns: async () => {
    for (const run of Object.values(get().runs)) {
      if (!ACTIVE.includes(run.status)) continue;
      try {
        const events = await resolveSessionEvents(run.sessionId);
        if (events.length === 0) continue;
        const rows: TabRunEventRow[] = events.map((e) => ({
          ts: Date.parse(e.createdAt) || Date.now(),
          kind: String(e.eventType),
        }));
        patchRun(set, run.runId, (r) => ({
          ...r,
          events: rows.slice(-MAX_EVENTS),
          status: events.some((e) => e.eventType === 'turn_ended') ? 'done' : r.status,
          currentStep: events.some((e) => e.eventType === 'turn_ended') ? '完成' : r.currentStep,
        }));
      } catch (err) {
        console.warn('[tabRunStore] rehydrate failed for run', run.runId, err);
      }
    }
  },

  clearRun: (runId) => {
    set((state) => {
      const runs = { ...state.runs };
      delete runs[runId];
      return { runs };
    });
  },
}));
