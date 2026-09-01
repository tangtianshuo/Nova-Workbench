/**
 * Phase 27 (27-03) — workspace ingestion surface, embedded in FileArchiveView
 * (D-01: no new tab). Scope selection (D-02) → ingestion run progress
 * (TabRunPanel same-构) → three-state list (ING-02/D-01) → aggregate batch
 * confirmation view (D-09..D-11): type-grouped, group select-all, per-item
 * selected toggle / inline title / category select / content edit Dialog.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, WarningCircle, CheckCircle, XCircle, PencilSimple } from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Input } from '@/src/components/ui/Input';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';
import { useToast } from '@/src/components/ui/Toast';
import { TabRunPanel } from '@/src/components/rnd/TabRunPanel';
import { PrdDraftDialog } from '@/src/components/PrdDraftDialog';
import { cn } from '@/src/lib/utils';
import type { Workspace } from '@/src/stores/workspaceStore';
import {
  useIngestionStore,
  INGESTION_TAB_ID,
  INGESTION_CATEGORIES,
  type IngestionBatchItem,
} from '@/src/stores/ingestionStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useTabRunStore, ACTIVE } from '@/src/stores/tabRunStore';

const GROUP_LABELS: Record<string, string> = {
  knowledge: '知识文档',
  task_draft: '任务草稿',
  schedule_draft: '日程草稿',
};
const GROUP_ORDER = ['knowledge', 'task_draft', 'schedule_draft'] as const;

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function ScanRow({ status, reason, pagesEmpty, sourcePath }: {
  status: string; reason?: string; pagesEmpty?: number[]; sourcePath: string;
}) {
  const badge =
    status === 'extracted' ? <Badge variant="success">extracted</Badge> :
    status === 'partial' ? <Badge variant="warning">partial{pagesEmpty?.length ? ` · ${pagesEmpty.length} 页空白` : ''}</Badge> :
    status === 'skipped' ? <Badge variant="neutral">已摄取（跳过）</Badge> :
    <Badge variant="danger">failed</Badge>;
  const icon =
    status === 'extracted' ? <CheckCircle size={14} weight="duotone" className="text-success" /> :
    status === 'failed' ? <XCircle size={14} weight="duotone" className="text-danger" /> :
    <WarningCircle size={14} weight="duotone" className="text-warning" />;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle last:border-b-0 bg-bg-secondary/40">
      {icon}
      <span className="text-xs text-text-primary truncate flex-1">{fileName(sourcePath)}</span>
      {badge}
      {reason && <span className="text-[10px] text-text-tertiary truncate max-w-[240px]">{reason}</span>}
    </div>
  );
}

function ItemRow({ item }: { item: IngestionBatchItem }) {
  const toggleItem = useIngestionStore((s) => s.toggleItem);
  const renameItem = useIngestionStore((s) => s.renameItem);
  const setCategory = useIngestionStore((s) => s.setCategory);
  const setDueHint = useIngestionStore((s) => s.setDueHint);
  const [editing, setEditing] = useState(false);
  const editContent = useIngestionStore((s) => s.editContent);

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border-subtle last:border-b-0">
      <div className="flex items-center gap-2">
        <Checkbox checked={item.selected} onCheckedChange={() => toggleItem(item.id)} />
        <Input
          value={item.title}
          onChange={(e) => renameItem(item.id, e.target.value)}
          className="h-7 text-xs flex-1"
          aria-label="标题"
        />
        <Badge variant="neutral" className="shrink-0 max-w-[180px] truncate" title={item.sourcePath}>
          {fileName(item.sourcePath)}
        </Badge>
      </div>
      <div className="flex items-center gap-2 pl-6">
        {item.type === 'knowledge' ? (
          <>
            <Select value={item.category} onValueChange={(v) => setCategory(item.id, v)}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue placeholder="分类" />
              </SelectTrigger>
              <SelectContent>
                {INGESTION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
              <PencilSimple size={12} weight="duotone" /> 编辑内容
            </Button>
          </>
        ) : (
          <Input
            value={item.dueHint ?? ''}
            placeholder="截止/日期 (YYYY-MM-DD)"
            onChange={(e) => setDueHint(item.id, e.target.value)}
            className="h-7 text-xs w-48"
            aria-label="日期"
          />
        )}
      </div>
      {editing && (
        <PrdDraftDialog
          open
          onOpenChange={(open) => { if (!open) setEditing(false); }}
          title={item.title || '知识文档'}
          description="编辑后随批次落库至知识库，并同步 FTS 索引"
          initialDraft={item.content ?? ''}
          busy={false}
          onCommit={(draft) => { editContent(item.id, draft); setEditing(false); }}
        />
      )}
    </div>
  );
}

export function IngestionPanel({ workspace }: { workspace: Workspace | null }) {
  const { toast } = useToast();
  const selectedProductId = useUIStore((s) => s.selectedProductId);
  const scanResults = useIngestionStore((s) => s.scanResults);
  const batchCandidate = useIngestionStore((s) => s.batchCandidate);
  const batchItems = useIngestionStore((s) => s.batchItems);
  const aggregateExpanded = useIngestionStore((s) => s.aggregateExpanded);
  const badgeCount = useIngestionStore((s) => s.badgeCount);
  const submitBusy = useIngestionStore((s) => s.submitBusy);
  const startIngestion = useIngestionStore((s) => s.startIngestion);
  const refreshBadge = useIngestionStore((s) => s.refreshBadge);
  const setGroupSelected = useIngestionStore((s) => s.setGroupSelected);
  const setAggregateExpanded = useIngestionStore((s) => s.setAggregateExpanded);
  const submitBatch = useIngestionStore((s) => s.submitBatch);
  const runId = useTabRunStore((s) => s.runsByTab[INGESTION_TAB_ID]);
  const run = useTabRunStore((s) => (runId ? s.runs[runId] : undefined));
  const runActive = !!run && ACTIVE.includes(run.status);

  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  // D-03: hash-probe badge refresh on mount / workspace switch.
  const root = workspace?.folderPath;
  useEffect(() => {
    if (root) void refreshBadge(root);
    setSelectedPaths([]);
  }, [root, refreshBadge]);

  const ingestibleFiles = useMemo(
    () => (workspace?.files ?? []).filter((f) => f.type !== 'dir' && /\.(docx|pdf)$/i.test(f.name)),
    [workspace],
  );
  const dirPaths = useMemo(
    () => (workspace?.files ?? []).filter((f) => f.type === 'dir').map((f) => f.path),
    [workspace],
  );

  const togglePath = (path: string, isDir: boolean) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
    void isDir; // dir prefix semantics live in the prompt (INGESTION_PROMPT)
  };
  const selectAll = () => setSelectedPaths(ingestibleFiles.map((f) => f.path));
  const clearSelection = () => setSelectedPaths([]);

  const handleIngest = () => {
    if (!workspace) return;
    const result = startIngestion(workspace.id, workspace.folderPath, selectedPaths);
    if (!result.success && result.reason) {
      toast({ type: 'warning', title: '无法发起摄取', description: result.reason });
    }
  };

  const handleSubmit = async () => {
    const result = await submitBatch();
    if (!result) return;
    toast({
      type: 'success',
      title: '摄取批次已落库',
      description: `已落库：${result.knowledge} 知识 + ${result.taskDrafts} 任务草稿 + ${result.scheduleDrafts} 日程草稿${result.skipped ? `（跳过 ${result.skipped} 项）` : ''}`,
    });
    if (root) void refreshBadge(root);
  };

  if (!workspace) return null;

  const groups = GROUP_ORDER
    .map((type) => ({ type, items: batchItems.filter((it) => it.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
          <FileText size={14} weight="duotone" className="text-accent" />
          文档摄取（docx / pdf → 知识库 + 任务/日程草稿）
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="xs" onClick={selectAll} disabled={ingestibleFiles.length === 0}>
          全选整个工作区
        </Button>
        {selectedPaths.length > 0 && (
          <Button variant="ghost" size="xs" onClick={clearSelection}>清空选择</Button>
        )}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedProductId || selectedPaths.length === 0 || runActive}
            title={!selectedProductId ? '请先选择产品' : undefined}
            onClick={handleIngest}
          >
            摄取选中（{selectedPaths.length}）
          </Button>
          {badgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-warning text-white text-[10px] font-semibold flex items-center justify-center">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </div>
      </div>
      {!selectedProductId && (
        <p className="text-[11px] text-warning">请先在顶部选择产品 — 摄取的知识文档将归属当前选中产品。</p>
      )}

      {/* Scope selection: files + folders */}
      <div className="max-h-40 overflow-y-auto rounded-[var(--radius-sm)] border border-border-subtle">
        {ingestibleFiles.length === 0 && dirPaths.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-tertiary bg-bg-secondary">工作区内暂无 docx / pdf 文档</div>
        ) : (
          ingestibleFiles.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-1 border-b border-border-subtle last:border-b-0">
              <Checkbox
                checked={selectedPaths.includes(f.path)}
                onCheckedChange={() => togglePath(f.path, false)}
                label={f.name}
              />
              <span className="text-[10px] text-text-tertiary font-mono truncate ml-auto">{f.path}</span>
            </div>
          ))
        )}
      </div>

      {/* Run progress (TabRunPanel 同构) */}
      <TabRunPanel tabId={INGESTION_TAB_ID} />

      {/* Three-state list */}
      {scanResults.length > 0 && !batchCandidate && (
        <div className="rounded-[var(--radius-sm)] border border-border-subtle overflow-hidden">
          {scanResults.map((r) => (
            <ScanRow key={r.sourcePath} {...r} />
          ))}
        </div>
      )}

      {/* Aggregate confirmation view (D-09..D-11) */}
      <AnimatePresence initial={false}>
        {batchCandidate && aggregateExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-subtle/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-primary">
                  摄取批次待确认（{batchItems.length} 项）
                </span>
                <span className="text-[10px] text-text-tertiary">
                  已选 {batchItems.filter((i) => i.selected).length} · 确认后落库（知识进知识库，草稿进任务/日程）
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="xs" onClick={() => setAggregateExpanded(false)}>收起</Button>
              </div>
              {groups.map((g) => {
                const allSelected = g.items.every((it) => it.selected);
                return (
                  <div key={g.type} className="rounded-[var(--radius-sm)] border border-border-subtle bg-bg-primary overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary/60">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => setGroupSelected(g.type, v)}
                        label={`${GROUP_LABELS[g.type]}（${g.items.length}）`}
                      />
                    </div>
                    {g.items.map((it) => <ItemRow key={it.id} item={it} />)}
                  </div>
                );
              })}
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" disabled={submitBusy} onClick={() => void handleSubmit()}>
                  {submitBusy ? '落库中…' : `确认提交（${batchItems.filter((i) => i.selected).length} 项）`}
                </Button>
                <span className={cn('text-[10px] text-text-tertiary', submitBusy && 'animate-pulse')}>
                  未勾选的项不会被写入
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed entry row when a batch waits but the view is collapsed */}
      {batchCandidate && !aggregateExpanded && (
        <button
          className="text-xs text-accent hover:underline"
          onClick={() => setAggregateExpanded(true)}
        >
          展开待确认的摄取批次（{batchItems.length} 项）
        </button>
      )}
    </Card>
  );
}
