---
phase: 20-fork
plan: "02"
subsystem: agent-console-fork-ux
tags: [fork, clipboard, hover-toolbar, session-badge]
requires: ["20-01"]
provides: ["chatConsoleStore.forkFromMessage", "forkableIds/parentTitle store data", "AgentConsole hover toolbar + provenance badge"]
affects: [src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
tech-stack:
  added: []
  patterns: ["CSS group-hover reveal (no motion)", "ordered content-match message↔event zip"]
key-files:
  created: [src/stores/__tests__/phase20Fork.test.ts]
  modified: [src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
decisions:
  - forkable resolution is eager (refreshForkable after send/switch) — zip prefix match, store-only acks never forkable
  - fork success = switchSession jump + badge, no toast (UI-SPEC locked)
  - switchSession now awaits refreshForkable/refreshParentMeta for deterministic badge render
metrics:
  duration: 16m
  completed: 2026-08-18
  tasks: 2
  files: 3
---

# Phase 20 Plan 02: Fork & Card Actions (hover toolbar, jump, copy, badge) Summary

**One-liner:** forkFromMessage(ordered content-match → findForkCutSeq → createForkSession → session_forked marker → jump) + AgentConsole hover 分支/复制 toolbar with never-silent copy toast and "来自 {parentTitle}" provenance chip.

## What Was Done

### Task 1: chatConsoleStore — forkFromMessage + forkable/parent metadata (67fb084)
- `resolveMessageSeqs()` — ordered content-match zip of store messages vs user_message/assistant_message event projection; store-only ack messages resolve to null (first mismatch ends match window)
- `forkFromMessage(messageId)`: loading guard (toast 当前回复尚未完成) → resolveSessionEvents(parent-aware) → seq lookup → findForkCutSeq (null → mid-turn toast) → createForkSession → append `session_forked` marker (child ≥1 row so restoreSession never treats it as not-found) → switchSession(childId); all failures toast "创建分支时出错，原会话未受影响", parent never written
- Eager `forkableIds: Set<number>` refreshed after submit / switchSession; `parentSessionId`/`parentTitle` from getSession LEFT JOIN for the badge
- 3 store tests: streaming guard, ack not forkable, happy path (child prefix verbatim + marker event + parent untouched)

### Task 2: AgentConsole — hover toolbar + badge + copy toast (c9a250a)
- Assistant rows wrapped in `group flex flex-col`; toolbar `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100` (CSS-only, keyboard reachable)
- Fork button rendered ONLY when `forkableIds.has(id)` (hidden, not disabled-gray per UI-SPEC), `disabled={loading}` while streaming; copy always rendered for assistant messages
- `navigator.clipboard.writeText` → success/error toast (never silent)
- Provenance chip (carry-chip recipe, GitBranch 12 fill, `max-w-[160px] truncate` + title tooltip, fallback 来自原会话) as first child of scroll container when parentSessionId set

## Verification

- `npm test`: 204/204 pass (3 new)
- `npm run lint` (tsc --noEmit): pass
- All acceptance_criteria greps satisfied (forkFromMessage/findForkCutSeq/createForkSession/session_forked, group-hover:opacity-100, navigator.clipboard.writeText, 来自, bg-accent-subtle, toast copy)
- Manual UAT deferred to phase UAT pass (hover reveal, packaged-build clipboard is a UAT item per Pitfall 5)

## Deviations from Plan

- switchSession awaits refreshForkable/refreshParentMeta instead of fire-and-forget — [Rule 1] deterministic forkable state for tests and immediate badge render after fork jump. No behavior downside (both are fast in-memory/SQLite reads).

## Known Stubs

None.

## Self-Check: PASSED
