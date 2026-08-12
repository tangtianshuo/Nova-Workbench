---
phase: quick
plan: 260812-ovp
subsystem: ui
tags: [ux, chatpanel, focus, radix-dialog]
dependency_graph:
  requires: []
  provides: [chatpanel-textarea-autofocus]
  affects: [src/components/ChatPanel.tsx]
tech_stack:
  added: []
  patterns: [useEffect-on-prop-driven-focus]
key_files:
  created: []
  modified:
    - src/components/ChatPanel.tsx
decisions:
  - "Reclaim focus via useEffect on isOpen after Radix's synchronous close-button autofocus, no setTimeout/rAF deferral needed"
metrics:
  duration: ~3m
  completed: 2026-08-12
  tasks_completed: 1
  files_changed: 1
---

# Quick Task 260812-ovp: Sidebar ChatPanel Auto-Focus Summary

Added a ref + `isOpen`-driven `useEffect` so opening the AI ChatPanel drawer places cursor in the message textarea immediately — no extra click needed.

## What Changed

**`src/components/ChatPanel.tsx`** (3-line patch, +6 lines):
1. Declared `textareaRef = useRef<HTMLTextAreaElement>(null)` next to existing refs.
2. Added `useEffect(() => { if (isOpen) textareaRef.current?.focus(); }, [isOpen])` right after the existing `bottomRef` scroll effect.
3. Attached `ref={textareaRef}` to the message `<textarea>` in `DrawerFooter`.

No new imports (`useRef` and `useEffect` already imported on line 1). `Drawer.tsx` untouched — Radix's `onOpenAutoFocus` plumbing stays as-is; our effect fires after Radix's synchronous close-button autofocus and reclaims focus to the textarea.

## Verification

- `npm run lint` (`tsc --noEmit`) passes clean.
- Manual (per plan): opening drawer via sidebar button or Cmd/Ctrl+K should focus the textarea; closing and reopening re-focuses each time.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/components/ChatPanel.tsx` — FOUND (modified in commit de64cda)
- Commit `de64cda` — FOUND in `git log`
