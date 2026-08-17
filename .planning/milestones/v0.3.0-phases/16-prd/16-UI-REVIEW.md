# Phase 16 — UI Review

**Audited:** 2026-08-17
**Baseline:** 16-UI-SPEC.md (approved 2026-08-15)
**Screenshots:** not captured (no dev server on 3000/5173/8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All 15 contract strings verbatim; no generic labels |
| 2. Visuals | 4/4 | Card clones memory-card pattern exactly; badge per spec |
| 3. Color | 4/4 | Accent confined to reserved list; zero hardcoded colors in new code |
| 4. Typography | 4/4 | Only text-sm/text-xs/font-medium in new surfaces |
| 5. Spacing | 4/4 | Verbatim `px-3.5 py-3` / `gap-2` / `size="sm"`; DialogBody fix correct |
| 6. Experience Design | 3/4 | Failure-path edited-draft loss contradicts error toast copy |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **Failure path unmounts the edit Dialog, losing the edited draft** — when consume succeeds but the write fails, `refreshPrdCard()` clears `pendingPrdDraft`, and the Dialog (rendered under `{pendingPrdDraft && ...}`, ChatPanel.tsx:585) unmounts — yet the toast says 草稿仍保留在对话中 (ChatPanel.tsx:475) and the inline comment claims Dialog 留开. Fix: render `PrdDraftDialog` unconditionally (state lives in `prdDialogOpen`), or on error hold the last candidate/draft locally so the user can copy their edits.
2. **`initialDraft` in the reset effect deps can wipe live edits** — PrdDraftDialog.tsx:30-32 resets whenever `initialDraft` identity changes; if a refresh swaps the candidate object while the dialog is open, in-progress edits vanish. Fix: reset only on `open` false→true transition (track previous open in a ref), keep `initialDraft` read at reset time.
3. **Icon-only ghost buttons rely on `title`, not `aria-label`** — FullDeliverablesTab.tsx:326-350 (regenerate/sync/download). Pre-existing, outside Phase 16 scope, but it is an audited surface and a screen-reader gap. Fix: add `aria-label` alongside each `title`.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Every Copywriting Contract row matched verbatim:
- Card title/product/origin/CTAs — ChatPanel.tsx:575-581 (`待确认的 PRD 草稿`, `确认并编辑`, `忽略`)
- Origin time via `formatMemoryTime` (HH:mm, ChatPanel.tsx:66-68, :578)
- Dialog title fallback `PRD 草稿` (:589) and description template (:590)
- `落槽至研发中心` / `取消` — PrdDraftDialog.tsx:42-43
- Success toast/message — ChatPanel.tsx:462, :466
- Error toasts — ChatPanel.tsx:153 (Phase 15 reuse copy), :475
- Tool no-product copy — generateDeliverable.ts:93, exact match
- AI badge tooltip — FullDeliverablesTab.tsx:292 (`AI 生成 · yyyy-MM-dd HH:mm · 会话 <8位>`, formatAiSourceTime :44-48)

No generic Submit/OK/Save patterns in new surfaces. Fallback `?? productId` (:576) may surface a raw id, but only when the product was deleted — acceptable degradation.

### Pillar 2: Visuals (4/4)
- Surface 1 card is a faithful clone of the Phase 15 memory card (border-accent/30 bg-accent-subtle, font-medium → text-xs secondary → text-xs tertiary hierarchy, mt-2 action row). Insertion position correct (after destructive, before memory).
- line-clamp-3 whitespace-pre-wrap preview matches "recognize, don't read" contract.
- Surface 3 badge: Sparkle size=12 weight="fill" (active-state convention per spec), placed after phase badge, conditional on `d.aiSource` — mock/manual slots render nothing (FullDeliverablesTab.tsx:291-298).
- Preview Modal untouched (spec requirement).

### Pillar 3: Color (4/4)
Accent usage in new code is exactly the reserved list: card border/background, two primary buttons, AI Badge variant="accent". Grep for `#hex|rgb(|bg-white|bg-black|text-gray` in ChatPanel.tsx: zero matches. `bg-gradient-to-r from-success to-teal-600` (FullDeliverablesTab.tsx:207) is pre-existing, out of phase scope. Danger unused, as specified.

### Pillar 4: Typography (4/4)
New-surface roles: `text-sm` (card body), `text-xs` (metadata/preview), `font-medium` (card title) — the declared 400/500 only. PrdDraftDialog contains zero typography classes; dialog title/editor styling delegated to DialogHeader/MDXEditor token remap, exactly per spec. `font-black`/`font-bold` occurrences in FullDeliverablesTab are pre-existing.

### Pillar 5: Spacing (4/4)
Verbatim spec values: `px-3.5 py-3` card, `mt-1`/`mt-2` rhythm, `gap-2` button rows, `size="sm"` card buttons, `max-w-3xl` dialog, editor `minHeight="320px"`. DialogBody wrap (documented deviation in 16-02-SUMMARY) is the correct fix for the plan's edge-to-edge editor. No arbitrary `[..px]` values in new code.

### Pillar 6: Experience Design (3/4)
Present and correct:
- busy: commit button `loading`, 取消 `disabled`, card buttons `disabled={prdBusy}` (PrdDraftDialog.tsx:42-43, ChatPanel.tsx:580-581)
- cancel lossless: reset-on-open effect, candidate untouched (PrdDraftDialog.tsx:30-32)
- restore: `refreshPrdCard` in restore effect (ChatPanel.tsx:186) + onToolEnd hook (:252)
- silent reject (MEM-02 pattern, ChatPanel.tsx:424-435)
- audit event with ftsHitCount payload (:456-461)
- deduction: failure-path draft loss (Top 3 #1) — a data-loss-shaped gap on the error branch; comment and toast copy both promise behavior the render condition does not deliver.

---

## Files Audited
- src/components/ChatPanel.tsx
- src/components/PrdDraftDialog.tsx
- src/components/product/FullDeliverablesTab.tsx
- src/ai/tools/generateDeliverable.ts (copy check only)
- .planning/phases/16-prd/16-UI-SPEC.md, 16-01/02/03-PLAN.md, 16-01/02/03-SUMMARY.md, 16-CONTEXT.md

Registry audit: skipped — no components.json; UI-SPEC declares zero third-party registries.
