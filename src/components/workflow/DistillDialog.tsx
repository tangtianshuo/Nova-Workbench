// src/components/workflow/DistillDialog.tsx
// Phase 30 (30-04) — 沉淀确认卡 (UI-SPEC §3). Pure Dialog, deterministic path:
// editable step drafts → executeTool('workflow_create', {source:'distilled'}).
// Never enters the candidates table, never starts an LLM run.
import { useState } from 'react';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/src/components/ui/Dialog';
import { Input } from '@/src/components/ui/Input';
import { useToast } from '@/src/components/ui/Toast';
import type { DistilledStep } from '@/src/ai/distill';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  steps: DistilledStep[];
}

export function DistillDialog({ open, onOpenChange, defaultName, steps }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [draftSteps, setDraftSteps] = useState<DistilledStep[]>(steps);
  const [saving, setSaving] = useState(false);

  const updateStep = (i: number, patch: Partial<DistilledStep>) => {
    setDraftSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    if (!name.trim() || draftSteps.length === 0) return;
    setSaving(true);
    try {
      const { useWorkflowStore } = await import('@/src/stores/workflowStore');
      await useWorkflowStore.getState().createTemplate({
        name: name.trim(),
        description: description.trim(),
        steps: draftSteps,
        source: 'distilled',
      });
      toast({ type: 'success', title: '模板已保存,可在工作流视图找到' });
      onOpenChange(false);
    } catch (e) {
      console.error('[DistillDialog] save failed:', e);
      toast({ type: 'error', title: '保存失败', description: '请重试' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader title="沉淀为模板" description="从这次运行的产物步骤提取,可编辑后保存" />
        <div className="space-y-3">
          <Input label="模板名称" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className="w-full rounded-[var(--radius-md)] border border-border-subtle bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            rows={2}
            placeholder="一句话描述(可选)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="space-y-2">
            {draftSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-[var(--radius-md)] bg-bg-secondary p-2">
                <span className="text-sm text-text-tertiary tabular-nums shrink-0">{i + 1}</span>
                <Input
                  className="h-7 text-sm"
                  value={s.name}
                  onChange={(e) => updateStep(i, { name: e.target.value })}
                />
                {s.toolHint && (
                  <Badge variant="neutral" className="shrink-0">
                    {s.toolHint}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  onClick={() => setDraftSteps((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={saving || !name.trim() || draftSteps.length === 0} onClick={() => void handleSave()}>
            保存模板
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
