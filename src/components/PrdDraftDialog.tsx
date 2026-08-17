import { useEffect, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/src/components/ui/Dialog';
import { Button } from '@/src/components/ui/Button';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';

// Phase 16 (DELIV-02) Surface 2 — PRD draft edit Dialog. Pure presentational:
// the candidate (initialDraft) is the source of truth until 落槽; cancelled
// edits are never persisted — every open resets to the original draft.
interface PrdDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialDraft: string;
  busy: boolean;
  onCommit: (editedDraft: string) => void;
}

export function PrdDraftDialog({
  open,
  onOpenChange,
  title,
  description,
  initialDraft,
  busy,
  onCommit,
}: PrdDraftDialogProps) {
  const [editedDraft, setEditedDraft] = useState(initialDraft);

  useEffect(() => {
    if (open) setEditedDraft(initialDraft);
  }, [open, initialDraft]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader title={title} description={description} />
        <DialogBody className="min-h-0 flex-1 overflow-y-auto">
          <MarkdownEditor value={editedDraft} onChange={setEditedDraft} minHeight="320px" />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button variant="primary" onClick={() => onCommit(editedDraft)} loading={busy}>落槽至研发中心</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
