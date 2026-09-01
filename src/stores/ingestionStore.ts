// Phase 27 (27-03) — workspace ingestion projection + batch HITL state (D-01..D-16).
// The orchestration run itself lives in tabRunStore (kind 'ingestion',
// tabId 'workspace-ingest'); this store holds the run's projection: three-state
// scan results, the single ingestion_batch candidate, the UI-edited item copies,
// and the submit path (engine_consume_ingestion_batch + task/schedule applier).
import { create } from 'zustand';
import { engineConsumeIngestionBatch, engineIngestPendingCount, type IngestionConsumeResult } from '@/src/ai/api';
import type { EnginePendingCandidate } from '@/src/ai/api';
import { useTabRunStore } from '@/src/stores/tabRunStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useProductStore } from '@/src/stores/productStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { isTauri } from '@/src/lib/api';

export const INGESTION_TAB_ID = 'workspace-ingest';

/** PAIRED with KNOWLEDGE_CATEGORIES (tools.rs / knowledgeWrite.ts) — 13 values. */
export const INGESTION_CATEGORIES = [
  '架构设计', '领域字典', '技术协议', 'FAQ与排障', '最佳实践',
  '经验沉淀', '业务规则', '架构约束', '踩坑指南',
  '会议纪要', '竞品分析', '需求文档', '项目周报',
] as const;

export type IngestionItemType = 'knowledge' | 'task_draft' | 'schedule_draft';

/** File-level three-state row (ING-02/D-01) — derived from the batch items. */
export interface IngestionScanItem {
  sourcePath: string;
  status: 'extracted' | 'partial' | 'failed' | 'skipped';
  reason?: string;
  pagesEmpty?: number[];
  previousStatus?: string;
}

/** UI-mutable copy of an ingest_submit item (Phase 26 editedDraft 同构). */
export interface IngestionBatchItem {
  id: string;
  type: IngestionItemType;
  title: string;
  content?: string;
  category?: string;
  dueHint?: string;
  selected: boolean;
  sourcePath: string;
  contentHash: string;
  status: string;
}

export interface IngestionBatchCandidate {
  confirmationToken: string;
  workspaceId: string;
  productId: string;
  sessionId: string;
}

/** Orchestration prompt (D-08/D-13/D-14): scan → filter to selection →
 *  one knowledge doc per file with LLM semantic title → conservative drafts
 *  → single ingest_submit. */
const INGESTION_PROMPT = (selectedPaths: string[]) => `请摄取工作区文档并提交批量确认候选。流程：
1. 调用 ingest_scan（workspaceRoot 用本次 run 的工作区根目录）。扫描结果里只处理以下选中路径的文件（文件精确匹配、文件夹按路径前缀匹配）：
${selectedPaths.map((p) => `- ${p}`).join('\n')}
2. 对每个非 failed 的文档生成一条知识条目（type=knowledge）：
   - 一份文件 = 一条知识文档；标题用语义化中文标题概括内容（不要直接用文件名）。
   - content 为文档正文（可整理排版），category 从 13 个枚举值中选最贴切的一个。
3. 仅当文档中有明确行动项（todo 标记、"需要完成 X"、责任人明确的任务、明确约定的会议/截止）才抽取草稿：
   - 任务草稿 type=task_draft，日程草稿 type=schedule_draft，dueHint 用识别到的日期（YYYY-MM-DD）。
   - 保守抽取：独立出现的日期不成草稿；每个源文档的 task/schedule 草稿合计不超过 5 条。
   - status 为 failed 或 skipped 的文件不产生任何条目。
4. 每个条目的 id 必须是 "ing-{contentHash前8位}"（同一 contentHash 前缀区分多草稿，如 ing-abcdef12-t1）。
5. 最后调用 ingest_submit（workspaceId 见上下文，items 为全部条目）一次性提交批次。`;

interface IngestionState {
  /** File-level three-state list of the latest batch (D-01 同屏三态). */
  scanResults: IngestionScanItem[];
  batchCandidate: IngestionBatchCandidate | null;
  /** UI-mutable copies; submit sends these (selected/title/content edits honored). */
  batchItems: IngestionBatchItem[];
  aggregateExpanded: boolean;
  submitBusy: boolean;
  /** D-03 badge: count of docx/pdf not yet ingested (hash probe, no extraction). */
  badgeCount: number;
  startIngestion: (workspaceId: string, root: string, selectedPaths: string[]) => { success: boolean; reason?: string };
  setBatchCandidate: (candidate: EnginePendingCandidate) => void;
  toggleItem: (id: string) => void;
  renameItem: (id: string, title: string) => void;
  editContent: (id: string, content: string) => void;
  setCategory: (id: string, category: string) => void;
  setDueHint: (id: string, dueHint: string) => void;
  setGroupSelected: (type: IngestionItemType, selected: boolean) => void;
  setAggregateExpanded: (expanded: boolean) => void;
  submitBatch: () => Promise<IngestionConsumeResult | null>;
  dismissScan: () => void;
  refreshBadge: (root: string) => Promise<void>;
}

function toScanItems(items: IngestionBatchItem[]): IngestionScanItem[] {
  const byPath = new Map<string, IngestionScanItem>();
  for (const it of items) {
    const prev = byPath.get(it.sourcePath);
    const status = it.status as IngestionScanItem['status'];
    // failed < partial < extracted/skipped — keep the worst status visible.
    const rank = (s: string) => (s === 'failed' ? 0 : s === 'partial' ? 1 : 2);
    if (!prev || rank(status) < rank(prev.status)) {
      byPath.set(it.sourcePath, { sourcePath: it.sourcePath, status });
    }
  }
  return Array.from(byPath.values());
}

function parseDate(dueHint?: string): string {
  const m = dueHint?.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : new Date().toISOString().slice(0, 10);
}

/** D-15/16 webview applier: confirmed drafts land as real tasks/events in the
 *  same user action as the Rust consume (audit events already written Rust-side). */
function applyDrafts(items: IngestionBatchItem[], productId: string): void {
  const productName =
    useProductStore.getState().products.find((p) => p.id === productId)?.name ?? '';
  for (const it of items) {
    if (!it.selected || it.type === 'knowledge' || it.status === 'failed') continue;
    if (it.type === 'task_draft') {
      useTaskStore.getState().addTask({
        id: it.id,
        title: it.title,
        priority: 'medium',
        status: '未开始',
        description: it.content ?? '',
        project: productName,
        projectId: productId,
        assignee: 'AI 摄取',
        assigneeAvatar: 'AI',
        deadline: it.dueHint ?? '',
        aiSuggestions: [],
      });
    } else {
      useScheduleStore.getState().addEvent({
        id: it.id,
        title: it.title,
        time: '09:00',
        date: parseDate(it.dueHint),
        type: 'reminder',
        location: '',
        projectId: productId,
      });
    }
  }
}

export const useIngestionStore = create<IngestionState>()((set, get) => ({
  scanResults: [],
  batchCandidate: null,
  batchItems: [],
  aggregateExpanded: false,
  submitBusy: false,
  badgeCount: 0,

  startIngestion: (workspaceId, root, selectedPaths) => {
    if (!isTauri()) return { success: false, reason: '桌面模式才支持文档摄取' };
    if (selectedPaths.length === 0) return { success: false, reason: '请先勾选要摄取的文件或文件夹' };
    const productId = useUIStore.getState().selectedProductId; // D-05
    if (!productId) return { success: false, reason: '请先选择产品' };
    // Fresh batch surfaces clear the previous confirmation state.
    set({ scanResults: [], batchCandidate: null, batchItems: [], aggregateExpanded: false });
    const userMessage = INGESTION_PROMPT(selectedPaths);
    useTabRunStore.getState().startTabRun({
      tabId: INGESTION_TAB_ID,
      kind: 'ingestion',
      productId,
      userMessage,
      coreContext: JSON.stringify({ workspaceId, productId, selectedPaths }),
      sessionTitle: '摄取工作区文档',
      workspaceId,
      workspaceRoot: root,
    });
    return { success: true };
  },

  setBatchCandidate: (candidate) => {
    // Rust candidate payload is flat (tools.rs ingest_submit): {kind,
    // confirmationToken, workspaceId, productId, items} — not nested in args.
    const c = candidate as unknown as Record<string, unknown>;
    const rawItems = Array.isArray(c.items) ? (c.items as Record<string, unknown>[]) : [];
    const items: IngestionBatchItem[] = rawItems.map((it) => ({
      id: String(it.id ?? ''),
      type: (it.type as IngestionItemType) ?? 'knowledge',
      title: String(it.title ?? ''),
      content: typeof it.content === 'string' ? it.content : undefined,
      category: typeof it.category === 'string' ? it.category : undefined,
      dueHint: typeof it.dueHint === 'string' ? it.dueHint : undefined,
      selected: it.selected !== false,
      sourcePath: String(it.sourcePath ?? ''),
      contentHash: String(it.contentHash ?? ''),
      status: String(it.status ?? 'extracted'),
    }));
    set({
      batchCandidate: {
        confirmationToken: candidate.confirmationToken,
        workspaceId: String(c.workspaceId ?? ''),
        productId: String(c.productId ?? useUIStore.getState().selectedProductId ?? ''),
        sessionId: '',
      },
      batchItems: items,
      scanResults: toScanItems(items),
      aggregateExpanded: true,
    });
  },

  toggleItem: (id) =>
    set((s) => ({ batchItems: s.batchItems.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it)) })),
  renameItem: (id, title) =>
    set((s) => ({ batchItems: s.batchItems.map((it) => (it.id === id ? { ...it, title } : it)) })),
  editContent: (id, content) =>
    set((s) => ({ batchItems: s.batchItems.map((it) => (it.id === id ? { ...it, content } : it)) })),
  setCategory: (id, category) =>
    set((s) => ({ batchItems: s.batchItems.map((it) => (it.id === id ? { ...it, category } : it)) })),
  setDueHint: (id, dueHint) =>
    set((s) => ({ batchItems: s.batchItems.map((it) => (it.id === id ? { ...it, dueHint } : it)) })),
  setGroupSelected: (type, selected) =>
    set((s) => ({ batchItems: s.batchItems.map((it) => (it.type === type ? { ...it, selected } : it)) })),
  setAggregateExpanded: (expanded) => set({ aggregateExpanded: expanded }),

  submitBatch: async () => {
    const cand = get().batchCandidate;
    if (!cand || get().submitBusy) return null;
    set({ submitBusy: true });
    try {
      const result = await engineConsumeIngestionBatch(cand.confirmationToken, get().batchItems);
      applyDrafts(get().batchItems, cand.productId);
      set({ batchCandidate: null, batchItems: [], aggregateExpanded: false, scanResults: [] });
      return result;
    } finally {
      set({ submitBusy: false });
    }
  },

  dismissScan: () => set({ scanResults: [] }),

  refreshBadge: async (root) => {
    if (!isTauri() || !root) return;
    try {
      const badgeCount = await engineIngestPendingCount(root);
      set({ badgeCount });
    } catch (e) {
      console.warn('[ingestionStore] badge probe failed', e);
    }
  },
}));

/** Convenience for the panel: badge probes use the active workspace root. */
export function activeWorkspaceRoot(): string | null {
  const ws = useWorkspaceStore.getState();
  return ws.workspaces.find((w) => w.id === ws.activeWorkspaceId)?.folderPath ?? null;
}
