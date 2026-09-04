---
phase: 31-doc-workspace
plan: 09
subsystem: doc-workspace editor
tags: [milkdown, editor, prismjs, gfm, gap-closure]
requires: [31-05 editor headless, 31-07 multi-tab workspace]
provides: [enter-slash fix, codeBlock language picker + prism highlight, table row/col toolbar ops]
affects: [src/components/ui/MarkdownEditorInner.tsx, src/components/ui/MarkdownToolbar.tsx, src/index.css]
tech-stack:
  added: [prismjs, "@types/prismjs (dev)", "jsdom (dev, repro dep)"]
  patterns: ["$view NodeView (pure DOM, no React in ProseMirror lifecycle)"]
key-files:
  created: []
  modified:
    - src/components/ui/MarkdownEditorInner.tsx
    - src/components/ui/MarkdownToolbar.tsx
    - src/index.css
    - package.json
decisions:
  - "BR-only guard (not path move) in normalizeMarkdown — smallest diff, ingest inline <br> normalization preserved"
  - "codeBlock via $view(codeBlockSchema.node) pure-DOM NodeView + setNodeMarkup, not updateCodeBlockLanguageCommand"
  - "Toolbar row/col buttons use text labels 行↑/行↓/列←/列→ — clearer than ambiguous icons"
metrics:
  duration: 45m
  completed: 2026-09-04
---

# Phase 31 Plan 09: Editor Gap Closure (Enter Slash / Code Block / Table Ops) Summary

One-liner: BR-only guard fixes Enter backslash pollution; self-built pure-DOM codeBlock NodeView adds native language select + prismjs highlight; toolbar gains 4 preset-gfm row/col insert commands.

## What Was Done

### Task 1: Enter 斜杠污染修复 (gap #2)
- Root cause confirmed by repro Case K: Milkdown serializes empty non-last paragraphs as a lone `<br />` line; `normalizeMarkdown` converted it to `\`, which re-parsed as a literal backslash text node and got persisted.
- Fix: `BR_ONLY_RE = /^\s*<br\s*\/?>\s*$/i` guard — br-only lines pass through untouched (round-trip back to empty paragraph, lossless); inline `<br>` ingest normalization untouched.
- Repro script Case J/K upgraded with 5 assertions (all PASS): no backslash text node, guarded normalize is a no-op on Milkdown output, loop stability.

### Task 2: codeBlock NodeView + prismjs (gap #3)
- `$view(codeBlockSchema.node, ...)` overrides code_block with a pure-DOM NodeView (no React inside ProseMirror lifecycle; `@milkdown/components` are Vue-only in 7.22.1 — plan's verified finding, confirmed).
- Native `<select>` language picker (12 langs: plain/ts/js/json/bash/rust/python/md/sql/yaml/xml/css); `setNodeMarkup` dispatch on change; `disabled` when readonly.
- prismjs with 8 on-demand language packs (js/css/markup ship in core).
- CSS in `.milkdown-editor` block: code block/bar/lang + all prism token colors via Nova semantic tokens — zero external theme CSS (D-01).
- TS note: `$view` requires the `$Node` slice — `codeBlockSchema.node`, not `codeBlockSchema` itself (type error found at lint, fixed inline).

### Task 3: toolbar 表格行列按钮 (gap #4)
- 4 buttons wiring `add(Row|Col)(Before|After)Command` from `@milkdown/kit/preset/gfm` via existing `runCmd` pattern. No disable state outside tables (deliberate — sel-context subscription cost > benefit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `$view(codeBlockSchema, ...)` type error**
- **Found during:** Task 2
- **Issue:** `$view` signature expects `$Node | $Mark`; `codeBlockSchema` is a `$NodeSchema` tuple
- **Fix:** pass `codeBlockSchema.node` (the embedded `$Node` slice)
- **Files:** src/components/ui/MarkdownEditorInner.tsx
- **Commit:** af24585

**2. [Rule 1 - Bug] npm install pruned extraneous jsdom, breaking the repro script**
- **Fix:** `npm i -D jsdom` (committed as devDep)
- **Commit:** 6fe8374

### Plan-vs-reality Notes

- **Task 1 source fix already committed by parallel 31-08 executor** (d2a22e7 included the identical 6-line BR_ONLY_RE guard — overlapping scope). My edit converged to byte-identical content, so no separate commit for the guard; my Task-1 contribution is the repro script assertions (5 PASS). `.planning/debug/` is gitignored by design, so the script changes are uncommitted workspace tooling.
- Toolbar icons: plan suggested Phosphor Rows/Columns; used text labels 行↑/行↓/列←/列→ instead (unambiguous, zero icon dependency).

## Verification

- `npm run lint` — clean (all 3 tasks + final)
- `npm run build` — passes; MarkdownEditorInner chunk 418.74 kB / gzip 131.63 kB (includes prismjs + 8 language packs; chunk budget debt tracked in STATE as pre-existing)
- `node .planning/debug/repro-enter-slash.mjs` — 5/5 PASS, no FAIL
- grep: `codeBlockView` x2 in MarkdownEditorInner.tsx, `addRowBefore` in MarkdownToolbar.tsx, zero `@milkdown/theme-*` / `@milkdown/components` / `plugin/prism` imports (one comment mention only)
- Inline-code language annotation (optional UAT suggestion): not done — CommonMark capability boundary, per plan.

## Known Stubs

None.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 2 | af24585 | feat(31-09): self-built codeBlock NodeView ($view) + prismjs highlight |
| 3 | b9f9ce9 | feat(31-09): toolbar table row/col insert buttons |
| chore | 6fe8374 | chore(31-09): add jsdom devDep |
| (1) | d2a22e7 | guard landed via parallel 31-08 commit (see deviation note) |

## Self-Check: PASSED
