---
phase: quick-260819-dxl
plan: 01
subsystem: agent-drawer
tags: [uat-fix, workspace-switch, chat-panel]
requires: [SESS-04 store guard, ScopedSelectorRow (phase 21 QUICK-02)]
provides: [drawer workspace switcher, mode-conditional switcher row]
affects: [src/components/ChatPanel.tsx]
tech-stack: { added: [], patterns: [DropdownMenu clone of page pattern, conditional render per chatPanelMode] }
key-files:
  modified: [src/components/ChatPanel.tsx]
decisions:
  - Scoped mode hides WorkspaceSwitcherRow (session Select row already contains a workspace Select)
  - Pure mode keeps DropdownMenu switcher (zero extra DOM before, one row now)
metrics: { duration: 15m, completed: 2026-08-19 }
---

# Quick Task 260819-dxl: Agent Drawer Workspace Switch Summary

Right-bottom Agent Drawer (ChatPanel) gained a workspace switcher. Checkpoint feedback surfaced a duplicate-switcher bug in scoped mode, fixed in a follow-up commit.

## Changes

`src/components/ChatPanel.tsx`:
- Task 1 (19d0df5): New `WorkspaceSwitcherRow` — DropdownMenu trigger (secondary xs Button + Folder duotone 12 + truncate name + CaretDown 10), accent highlight on active workspace. `onSelect` delegates to `setActiveWorkspaceId`; `{ success: false, reason: 'streaming' }` → error toast「无法切换工作区」. Rendered below DrawerHeader, initially in all modes per plan.
- Checkpoint fix (aaad9aa): User reported Ctrl+Shift+K scoped panel showed duplicate workspace switchers (WorkspaceSwitcherRow + ScopedSelectorRow's workspace Select). Render is now conditional: scoped mode → ScopedSelectorRow only; pure mode → WorkspaceSwitcherRow.

## Verification

- `npm run lint` (tsc --noEmit): zero errors (both commits).
- Human checkpoint: user confirmed scoped panel shows a single selector row — approved 2026-08-19.

## Deviations from Plan

- Plan said "无条件渲染…不做去重逻辑" (let both rows coexist in scoped mode); real usage showed this reads as duplication — replaced with per-mode conditional render.

## Self-Check: PASSED

- File modified: src/components/ChatPanel.tsx — FOUND
- Commits 19d0df5 / aaad9aa — FOUND
