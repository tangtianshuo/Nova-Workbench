// Phase 30 (30-03) — 工作流视图:模板库(内置参考 + 自建)+ 模板 run。
// 硬约束(D-05):「运行工作流」一键发起,无参数表单、无逐步确认;
// 「参考剧本,可微调」措辞在卡片元信息与 run userMessage 双出现。
import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  ChartLine,
  FileText,
  FlowArrow,
  FolderOpen,
  RocketLaunch,
} from '@phosphor-icons/react';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/src/components/ui/Dialog';
import { Input } from '@/src/components/ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/src/components/ui/Tabs';
import { useToast } from '@/src/components/ui/Toast';
import { TabRunPanel } from '@/src/components/rnd/TabRunPanel';
import { cn } from '@/src/lib/utils';
import { buildCoreContext } from '@/src/ai/context';
import { useTabRunStore, ACTIVE } from '@/src/stores/tabRunStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useWorkflowStore, type WorkflowTemplate } from '@/src/stores/workflowStore';

const TEMPLATE_ICONS: Record<string, typeof FlowArrow> = {
  'builtin-prd-draft': FileText,
  'builtin-competitor-analysis': ChartLine,
  'builtin-weekly-review': CalendarCheck,
  'builtin-weekend-scan': FolderOpen,
  'builtin-release-checklist': RocketLaunch,
};

const SOURCE_LABEL: Record<WorkflowTemplate['source'], string> = {
  builtin: '内置参考',
  user: '自建',
  distilled: '沉淀',
};

const SOURCE_VARIANT: Record<WorkflowTemplate['source'], 'accent' | 'neutral' | 'success'> = {
  builtin: 'accent',
  user: 'neutral',
  distilled: 'success',
};

export function WorkflowView({ className }: { className?: string }) {
  const templates = useWorkflowStore((s) => s.templates);
  const refreshFromSql = useWorkflowStore((s) => s.refreshFromSql);
  const runsByTab = useTabRunStore((s) => s.runsByTab);
  const { toast } = useToast();

  const [renameTarget, setRenameTarget] = useState<WorkflowTemplate | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);

  useEffect(() => { void refreshFromSql(); }, [refreshFromSql]);

  const startWorkflowRun = (t: WorkflowTemplate) => {
    const existingId = runsByTab['workflows'];
    const existing = existingId ? useTabRunStore.getState().runs[existingId] : undefined;
    if (existing && ACTIVE.includes(existing.status)) {
      toast({ type: 'warning', title: '已有工作流在运行,先等它完成或取消' });
      return;
    }
    const steps = t.steps.map((s, i) => `${i + 1}. ${s.name}:${s.prompt}`).join('\n');
    useTabRunStore.getState().startTabRun({
      tabId: 'workflows',
      kind: 'workflow',
      productId: useUIStore.getState().selectedProductId ?? '',
      userMessage: `执行工作流「${t.name}」。以下为参考剧本,可按当前上下文合理微调(顺序、跳过明显不适用的步骤),但每步产物都走候选确认:\n${steps}\n完成后简要汇总每步结果。`,
      coreContext: buildCoreContext(),
      sessionTitle: `工作流 · ${t.name}`,
    });
  };

  const handleCopy = async (t: WorkflowTemplate) => {
    await useWorkflowStore.getState().createTemplate({
      name: `${t.name} 副本`,
      description: t.description,
      steps: t.steps,
      source: 'user',
    });
    toast({ type: 'success', title: `已复制为「${t.name} 副本」` });
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await useWorkflowStore.getState().renameTemplate(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await useWorkflowStore.getState().deleteTemplate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const cardGrid = (list: WorkflowTemplate[]) =>
    list.length === 0 ? (
      <div className="py-12 text-center">
        <FlowArrow size={40} weight="duotone" className="mx-auto mb-3 text-text-tertiary" />
        <p className="text-md font-semibold text-text-primary">还没有工作流模板</p>
        <p className="mt-2 text-sm text-text-secondary max-w-md mx-auto">
          让 agent 帮你建一个——在对话框说「建个周末扫描工作流」,或跑完一次任务后点「把这次沉淀成模板」。也可以先复制一个内置参考模板改着用。
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((t) => {
          const Icon = TEMPLATE_ICONS[t.id] ?? FlowArrow;
          return (
            <Card key={t.id} className="p-5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon size={20} weight="duotone" className="shrink-0 text-text-secondary" />
                <span className="text-md font-semibold text-text-primary truncate">{t.name}</span>
                <Badge variant={SOURCE_VARIANT[t.source]} className="ml-auto shrink-0">
                  {SOURCE_LABEL[t.source]}
                </Badge>
              </div>
              <p className="text-sm text-text-secondary line-clamp-2">{t.description}</p>
              <p className="text-sm text-text-tertiary">
                {t.steps.length} 步 · 参考剧本(agent 可按上下文微调顺序与取舍)
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button variant="primary" size="sm" onClick={() => startWorkflowRun(t)}>
                  运行工作流
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleCopy(t)}>
                  复制
                </Button>
                {t.source !== 'builtin' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setRenameTarget(t); setRenameValue(t.name); }}
                    >
                      改名
                    </Button>
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleteTarget(t)}>
                      删除
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    );

  return (
    <div className={cn('space-y-6', className)}>
      {runsByTab['workflows'] && <TabRunPanel tabId="workflows" />}

      <Tabs defaultValue="builtin">
        <TabsList>
          <TabsTrigger value="builtin">内置参考</TabsTrigger>
          <TabsTrigger value="mine">我的模板</TabsTrigger>
        </TabsList>
        <TabsContent value="builtin" className="pt-4">
          {cardGrid(templates.filter((t) => t.source === 'builtin'))}
        </TabsContent>
        <TabsContent value="mine" className="pt-4">
          {cardGrid(templates.filter((t) => t.source !== 'builtin'))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader title="重命名模板" />
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button variant="primary" onClick={() => void handleRename()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader
            title="删除模板"
            description={`「${deleteTarget?.name ?? ''}」将被删除,此操作不可撤销。`}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" onClick={() => void handleDelete()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
