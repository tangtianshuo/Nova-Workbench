---
phase: quick
plan: 260812-ovp
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ChatPanel.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Opening the AI ChatPanel drawer puts keyboard focus in the message textarea"
    - "User can type immediately without an extra click"
    - "Re-opening the drawer re-focuses the textarea each time"
  artifacts:
    - path: "src/components/ChatPanel.tsx"
      provides: "Textarea ref + open-driven focus effect"
  key_links:
    - from: "isOpen (useUIStore)"
      to: "textareaRef.current.focus()"
      via: "useEffect on isOpen"
      pattern: "useEffect.*isOpen.*textareaRef\\.current\\?.focus"
---

<objective>
Make the AI ChatPanel drawer auto-focus its message textarea when opened, so users can type immediately without clicking.

Purpose: Remove one click from every chat interaction — Radix Dialog currently grabs focus for the close button, stranding the user.
Output: 3-line patch to ChatPanel.tsx (ref + effect + ref attachment).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auto-focus ChatPanel textarea on open</name>
  <files>src/components/ChatPanel.tsx</files>
  <action>
In `src/components/ChatPanel.tsx`:

1. Add a ref next to the existing refs (around line 91-95, where `bottomRef` lives):
   ```ts
   const textareaRef = useRef<HTMLTextAreaElement>(null);
   ```

2. Add a `useEffect` (anywhere after the `isOpen` selector and the existing refs; natural spot is right after the `bottomRef` scroll effect at lines 97-99):
   ```ts
   useEffect(() => {
     if (isOpen) textareaRef.current?.focus();
   }, [isOpen]);
   ```

3. Attach `ref={textareaRef}` to the `<textarea>` at line 370 (the one with `aria-label="输入 AI 问题"`).

`useRef` and `useEffect` are already imported on line 1 — do not re-import. Do NOT modify `src/components/ui/Drawer.tsx`. The shared Radix `onOpenAutoFocus` plumbing stays untouched; our effect runs after Radix's initial autofocus on the close button and reclaims focus to the textarea.

Radix timing note: Radix focuses the close button synchronously on open; our effect fires after paint, so the textarea wins. No `setTimeout`/`requestAnimationFrame` deferral needed unless testing shows otherwise (it won't).
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>
  - `tsc --noEmit` passes (no new imports, no type errors).
  - Opening the AI ChatPanel via the sidebar "AI 助手" button or Cmd/Ctrl+K places the cursor in the textarea without an extra click.
  - Closing and reopening re-focuses each time.
  - The close (X) button is no longer the focused element when the drawer opens.
  </done>
</task>

</tasks>

<verification>
- `npm run lint` passes (tsc --noEmit).
- Manual: open the AI drawer, type immediately without clicking the textarea — focus is already there.
</verification>

<success_criteria>
ChatPanel textarea receives focus on every open. No new dependencies, no shared-component changes.
</success_criteria>

<output>
After completion, create `.planning/quick/260812-ovp-sidebar-auto-focus/260812-ovp-SUMMARY.md`.
</output>
