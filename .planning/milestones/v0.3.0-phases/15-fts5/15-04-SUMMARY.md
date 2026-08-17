---
phase: 15-fts5
plan: 04
subsystem: ui
tags: [react, memory-cards, fts5-search, knowledge-filters, memory-management, phosphor-icons]

requires:
  - phase: 15-02
    provides: memoryStore candidate flow (listPending/confirm/reject/consumeIntoMemories/listRecentUserDirected) + context assembler
  - phase: 15-03
    provides: knowledgeRepo search (FTS5 + structured filters), product-delete cascade, hydrateKnowledgeFromRepo
provides:
  - ChatPanel 待确认的记忆 confirmation card (model_inferred queue head) + 已记住 info card (user_directed, not rejectable)
  - KnowledgeBaseView FTS5 search box + 标签/产品/时间 filters with dual browse/search modes
  - 长期记忆 memory list pane (view + danger-dialog delete, superseded visible)
affects: [phase-16, phase-17, uat-phase-15]

tech-stack:
  added: []  # zero new deps per 15-UI-SPEC
  patterns:
    - "Memory card refresh: mount-restore + onToolEnd('proposeMemory') hook pulls queue head via listPending()"
    - "Search mode = query non-empty OR any filter active; debounce 300ms single repo channel"

key-files:
  created: []
  modified:
    - src/components/ChatPanel.tsx
    - src/views/KnowledgeBaseView.tsx
    - src/ai/toolLoop.ts

key-decisions:
  - "标签 filter = category Select (UI spec); repo `tag` param matches tags array, so category filtering applied client-side on KnowledgeHit.category"
  - "Select filters use undefined value + placeholder (全部X) instead of an 'all' item — 清除筛选 is the single reset affordance"
  - "Memory list filters soft-deleted rows (deletedAt) client-side; superseded rows stay visible per UI spec audit requirement"

patterns-established:
  - "Origin-branched memory cards: model_inferred → confirm/reject slot, user_directed → info-only card (locked decision second half)"

requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-06, MEM-07]

duration: 32min
completed: 2026-08-15
---

# Phase 15 Plan 04: Memory UI Surfaces + UAT Checkpoint Summary

**ChatPanel memory confirmation cards (待确认/已记住 origin branches) + KnowledgeBaseView FTS5 search with tag/product/time filters + 长期记忆 management pane — all three UI surfaces from 15-UI-SPEC, zero new dependencies**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-08-15T14:01:15Z
- **Completed:** 2026-08-15T14:33:00Z
- **Tasks:** 3 of 4 (Task 4 is checkpoint:human-verify — awaiting user UAT)
- **Files modified:** 3

## Accomplishments
- Surface 1: ChatPanel renders the model_inferred queue head as a 待确认的记忆 card (记住/忽略, both `disabled={memoryBusy}`); user_directed proposals render an 已记住 info card with only a ghost 知道了 button — already auto-consumed by the store, not rejectable (locked decision second half)
- Surface 2: search input is now controlled with 300ms debounce; 标签/产品/时间 Select filters trigger search mode even with empty query; flat result rows carry `{产品} · v{version} · {时间}` source line; 清除筛选 returns to browse tree
- Surface 3: 长期记忆 sidebar entry (Brain icon) swaps the main pane to a memory list with scope Badge, 确认于 timestamp, 已被取代 warning Badge, and per-item delete behind a danger Dialog
- 15-02 leftover cleanup: dropped both @ts-ignore lines on the knowledgeRepo dynamic import in toolLoop.ts; verified `searchKnowledgeHybrid(query, limit)` signature matches

## Task Commits

Each task was committed atomically:

1. **Pre-task cleanup: drop toolLoop ts-ignore** - `aa38306` (chore)
2. **Task 1: ChatPanel memory cards (Surface 1)** - `4be2f3d` (feat)
3. **Task 2: KnowledgeBaseView search + filters (Surface 2)** - `13141b3` (feat)
4. **Task 3: memory list pane (Surface 3)** - `081d344` (feat)

**Plan metadata:** see final commit (docs)

## Files Created/Modified
- `src/components/ChatPanel.tsx` - memory card state (pendingMemory/autoRemembered/memoryBusy), refresh on mount-restore + onToolEnd('proposeMemory'), confirm→consume→toast chain, silent reject, both cards between pending banners and bottomRef
- `src/views/KnowledgeBaseView.tsx` - controlled search + 3 filters + dual-mode sidebar, memory pane with delete Dialog
- `src/ai/toolLoop.ts` - ts-ignore removal only (no behavior change)

## Decisions Made
- 标签 filter shows categories (per UI spec) but repo `tag` param matches the tags array → category filtering applied client-side on `hit.category` rather than passing a semantically wrong value to the repo
- Radix Select cannot hold an empty-string value; filters use `value={x || undefined}` so the placeholder (全部X) shows; no per-select "all" item — 清除筛选 is the single reset (keeps copy-contract strings unique, satisfies acceptance `grep -c = 3`)
- `listAllMemories()` returns soft-deleted rows too; UI filters `deletedAt !== null` (deleted memories must not resurrect in the list) while superseded rows stay visible for audit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Category filter would yield zero hits via repo `tag` param**
- **Found during:** Task 2
- **Issue:** Plan action said pass `tag: filterTag` where filterTag comes from the categories memo — but repo `search` matches `tag` against the doc's `tags` array, so selecting a category would return nothing
- **Fix:** Client-side filter `hits.filter(h => h.category === filterTag)`; repo receives only productId/since/limit
- **Files modified:** src/views/KnowledgeBaseView.tsx
- **Verification:** lint pass; repo search behavior unchanged (both impls include `category` on KnowledgeHit)
- **Committed in:** `13141b3`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for the 标签 filter to function at all. No scope creep.

## Issues Encountered
None

## CHECKPOINT: Task 4 — Phase 15 UAT 人工验收 (pending)

Task 4 is `checkpoint:human-verify` (blocking). All automated verification has passed:
- `npm test` → 128/128 green (no regression)
- `npm run lint` → exit 0
- All acceptance greps per task pass (card copy, filter placeholders, version source line, danger dialog, no 删除全部)

### What the user must verify (run `npm run tauri:dev` first — startup itself is the FTS5 runtime probe; migration 0004 failing to start = packaged SQLite lacks FTS5, report immediately)

1. **FTS5 中文命中 (MEM-06):** 知识库搜索框输入 `需求` → results with `{产品} · v1 · {时间}` source lines; then select only 最近 7 天 filter (no keyword) → only recent docs
2. **记忆候选流 (MEM-01/02/03):** (a) get the model to infer a preference ("我喜欢简洁的周报") → 待确认的记忆 card → 忽略 → card disappears; same candidate re-proposed → does NOT re-appear; a new candidate → 记住 → toast 已记住. (b) user_directed: say 「记住我用深色主题」→ no confirmation card, instead 已记住 info card (知道了 only) → entry immediately visible in 长期记忆 list
3. **记忆列表 (Surface 3):** 知识库侧栏 → 长期记忆 → confirmed memories visible (全局/产品 Badge + 确认时间); delete → danger dialog → confirm → list refreshes
4. **上下文注入审计 (MEM-08):** after step 2, check nova.db `agent_events` for a `context_injected` event this turn with 5 segments in payload (incl. fts_topk real hit count)
5. **产品删除级联:** delete a test product → knowledge search for its docs → 0 hits; no delete events in agent_events
6. **回归:** Phase 14 UAT-A (knowledge write confirm → restart → banner re-appears) still passes; pending memory candidate card re-appears after restart

**Resume signal:** reply "approved" or describe issues per numbered step.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 15 UI surfaces implemented and typechecked; backend artifacts from 15-01/02/03 all wired
- Phase 15 cannot be marked complete until UAT checkpoint passes (6 steps above)
- Phase 16/17 can start after UAT approval

## Known Stubs
None - all surfaces wired to live stores (memoryStore/knowledgeRepo); no placeholder data paths.

## Self-Check: PASSED
All 4 task commits found in git log; SUMMARY.md present at .planning/phases/15-fts5/15-04-SUMMARY.md.

---
*Phase: 15-fts5*
*Completed: 2026-08-15 (UAT pending)*
