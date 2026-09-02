// Phase 26 (26-01) — tab-run infrastructure. Tab-triggered engine runs live
// here, NOT in chatConsoleStore: each run gets its own sessionId (TAB-05, the
// session never enters any chat session list) and the Channel onEvent callback
// is store-level, so events keep accumulating while the tab is unmounted.
// Runs are transient (never persisted); rehydrateTabRuns rebuilds from the
// event log by sessionId when run records survive a webview reload.
import { create } from 'zustand';
import { engineCancel, engineCommitDeliverable, engineRun } from '@/src/ai/api';
import { confirmDeliverableDraft, rejectDeliverableDraft } from '@/src/ai/confirmations';
import { executeTool } from '@/src/ai/registry';
import { routeEngineCandidateToConsole } from '@/src/stores/chatConsoleStore';
import { resolveSessionEvents } from '@/src/ai/fork';
import { useRndStore } from '@/src/stores/rndStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useWorkflowStore } from '@/src/stores/workflowStore';

export type TabRunKind =
  | 'requirement'
  | 'prototype'
  | 'code'
  | 'test'
  | 'competitor'
  | 'deliverable-single'
  | 'deliverable-batch'
  | 'product-skill'
  | 'ingestion'
  | 'workflow';

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
  /** Kept verbatim so TabRunPanel retry can re-run startTabRun with identical params. */
  userMessage: string;
  coreContext: string;
  /** Kept for the distill dialog's default template name (30-04). */
  sessionTitle?: string;
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

/**
 * Deliverable candidate queued by a tab run. Confirmed in the tab surface
 * (TabRunPanel card + PrdDraftDialog): the run's dedicated session never
 * becomes the console's activeSession (TAB-05), so the console's PRD card
 * would be unreachable for tab-originated drafts.
 */
export interface TabDeliverableCandidate {
  tabId: string;
  sessionId: string;
  confirmationToken: string;
  code: string;
  title: string;
  draft: string;
  productId: string;
}

interface TabRunState {
  /** key = runId */
  runs: Record<string, TabRunRecord>;
  /** tabId → active (queued/running/waiting) runId — 1-run-per-tab guard. */
  runsByTab: Record<string, string>;
  /** Queue head renders first; commit/reject dequeues the next candidate. */
  pendingDeliverables: TabDeliverableCandidate[];
  tabDeliverableBusy: boolean;
  startTabRun: (params: StartTabRunParams) => string;
  cancelTabRun: (runId: string) => Promise<void>;
  rejectTabDeliverable: (confirmationToken: string) => Promise<void>;
  commitTabDeliverable: (editedDraft: string, confirmationToken: string) => Promise<boolean>;
  rehydrateTabRuns: () => Promise<void>;
  clearRun: (runId: string) => void;
}

/** Cap per-run event rows — batch runs (18 deliverables) must not grow unbounded. */
const MAX_EVENTS = 200;
export const ACTIVE: readonly TabRunStatus[] = ['queued', 'running', 'waiting-for-confirmation'];

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

/** Channel delivery races the invoke resolution — late events must never
 *  regress a settled run back to waiting/running. */
function guardTerminal(run: TabRunRecord, status: TabRunStatus): TabRunStatus {
  return ACTIVE.includes(run.status) ? status : run.status;
}

/** After the tab's last candidate is resolved, settle any run still parked in
 *  waiting-for-confirmation (the settled stream can no longer flip it). */
function settleTabRunIfDrained(set: (fn: (s: TabRunState) => Partial<TabRunState>) => void, tabId: string) {
  set((state) => {
    if (state.pendingDeliverables.some((c) => c.tabId === tabId)) return {};
    const runs = { ...state.runs };
    for (const [rid, r] of Object.entries(runs)) {
      if (r.tabId === tabId && ACTIVE.includes(r.status)) {
        runs[rid] = { ...r, status: 'done', currentStep: '完成' };
      }
    }
    return { runs };
  });
}

export const useTabRunStore = create<TabRunState>()((set, get) => ({
  runs: {},
  runsByTab: {},
  pendingDeliverables: [],
  tabDeliverableBusy: false,

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
      userMessage: params.userMessage,
      coreContext: params.coreContext,
      sessionTitle: params.sessionTitle ?? params.userMessage.slice(0, 24),
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
          // TAB-06: tab runs are batch — interactive chat runs always win the scheduler.
          priority: 'batch',
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
                status: guardTerminal(run, msg.data!.status as TabRunStatus),
                currentStep: ACTIVE.includes(run.status) ? (msg.data!.status === 'queued' ? '排队中…' : '运行中…') : run.currentStep,
              }));
              return;
            }
            if (msg.kind === 'confirmation' && msg.data?.candidate) {
              const cand = msg.data.candidate;
              if (cand.kind === 'ingestion_batch') {
                // 27-03 D-09: the batch candidate routes to the ingestion
                // aggregate view (FileArchiveView), not the console PRD chain.
                // Dynamic import — ingestionStore imports startTabRun from here.
                void import('@/src/stores/ingestionStore').then((m) =>
                  m.useIngestionStore.getState().setBatchCandidate(cand));
              } else if (cand.kind === 'deliverable_draft') {
                set((state) => ({
                  pendingDeliverables: [...state.pendingDeliverables, {
                    tabId: params.tabId,
                    sessionId,
                    confirmationToken: String(cand.confirmationToken ?? ''),
                    code: String(cand.code ?? ''),
                    title: String(cand.title ?? ''),
                    draft: String(cand.draft ?? ''),
                    productId: String(cand.productId ?? params.productId),
                  }],
                }));
              } else {
                // D-05: non-deliverable HITL kinds go through the global confirmation queue.
                routeEngineCandidateToConsole(cand, sessionId);
              }
              patchRun(set, runId, (run) => ({
                ...appendEvent(run, { ts: Date.now(), kind: 'confirmation', name: msg.data!.candidate!.kind }),
                status: guardTerminal(run, 'waiting-for-confirmation'),
                candidateCount: run.candidateCount + 1,
                currentStep: ACTIVE.includes(run.status) ? '等待确认…' : run.currentStep,
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
              // Phase 29 (29-04): tab-run 内的 PM 写落库后刷新视图(全表拉回)。
              const toolName = msg.data.name;
              if (toolName.startsWith('task_')) void useTaskStore.getState().refreshFromSql();
              else if (toolName.startsWith('schedule_')) void useScheduleStore.getState().refreshFromSql();
              else if (toolName.startsWith('workflow_')) void useWorkflowStore.getState().refreshFromSql();
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
              patchRun(set, runId, (run) =>
                ACTIVE.includes(run.status)
                  ? { ...run, status: 'error', error: message, currentStep: '出错' }
                  : run);
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
        // engine_cancel rejects the run with "llm: cancelled" — a user cancel
        // races this catch, so never overwrite the cancelled status with error.
        patchRun(set, runId, (run) =>
          run.status === 'cancelled'
            ? run
            : { ...run, status: 'error', error: message, currentStep: '出错' });
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

  // Phase 26 落槽链 (16-DELIV-02 同构): confirm → executeTool consume → Rust
  // deliverable_committed 审计 (sessionId = tab run 自己的) → 投影刷新。
  commitTabDeliverable: async (editedDraft, confirmationToken) => {
    const head = get().pendingDeliverables.find((c) => c.confirmationToken === confirmationToken);
    if (!head || get().tabDeliverableBusy) return false;
    set({ tabDeliverableBusy: true });
    try {
      await confirmDeliverableDraft(head.confirmationToken);
      const result = await executeTool('generateDeliverable', {
        code: head.code,
        title: head.title,
        draft: editedDraft,
        confirmationToken: head.confirmationToken,
      }) as { docId: string; version: number; ftsHitCount: number; ftsImmediateHit: boolean };
      await engineCommitDeliverable({
        sessionId: head.sessionId,
        token: head.confirmationToken,
        code: head.code,
        title: head.title,
        editedDraft,
        productId: head.productId,
        docId: result.docId,
        version: result.version,
        ftsHitCount: result.ftsHitCount,
        ftsImmediateHit: result.ftsImmediateHit,
      });
      set((state) => ({ pendingDeliverables: state.pendingDeliverables.filter((c) => c.confirmationToken !== confirmationToken) }));
      settleTabRunIfDrained(set, head.tabId);
      await useRndStore.getState().hydrateDeliverableSlots();
      return true;
    } catch (error) {
      console.error('[tabRunStore] deliverable commit failed', error);
      return false;
    } finally {
      set({ tabDeliverableBusy: false });
    }
  },

  rejectTabDeliverable: async (confirmationToken) => {
    const head = get().pendingDeliverables.find((c) => c.confirmationToken === confirmationToken);
    if (!head) return;
    try {
      await rejectDeliverableDraft(confirmationToken);
    } catch (error) {
      console.error('[tabRunStore] deliverable reject failed', error);
    }
    set((state) => ({ pendingDeliverables: state.pendingDeliverables.filter((c) => c.confirmationToken !== confirmationToken) }));
    settleTabRunIfDrained(set, head.tabId);
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
