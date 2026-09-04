# Phase 20 — UI Review

**Audited:** 2026-08-18
**Baseline:** 20-UI-SPEC.md (approved design contract)
**Screenshots:** not captured (no dev server on :3000/:5173/:8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All locked strings verbatim (tooltips, toasts, badge fallback) |
| 2. Visuals | 4/4 | Toolbar/badge geometry matches contract exactly; icons aria-labeled |
| 3. Color | 4/4 | Semantic tokens only; accent confined to badge; toolbar neutral |
| 4. Typography | 4/4 | `text-xs` badge / `text-sm` bubbles — no new sizes or weights |
| 5. Spacing | 4/4 | `mt-1`/`gap-1`/`p-1`/`px-2 py-0.5`/`mb-2` all per spec |
| 6. Experience Design | 4/4 | Every failure path toasted, streaming guard, keyboard reveal present |

**Overall: 24/24**

---

## Top 3 Priority Fixes

None blocking. Minor recommendations (UAT-phase):

1. **Packaged-build clipboard (Pitfall 5, deferred to UAT)** — `navigator.clipboard` can fail in Tauri release builds; failure currently shows error toast (correct, not silent), but UAT should verify and, if broken, add the clipboard plugin per plan.
2. **Manual hover UAT deferred** — group-hover reveal, badge render, and fork jump were verified by code audit + 204 tests only; run the plan's manual UAT list when dev server is available.
3. **Toast type for mid-stream fork attempt is `warning`** (chatConsoleStore.ts:277, 291) while UI-SPEC doesn't pin a type — acceptable; consider documenting the warning/error split in UI-SPEC if Phase 21 reuses it.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Every UI-SPEC string is verbatim in code:
- Tooltips: "从这里创建分支" / "复制" (AgentConsole.tsx:188, 198); aria-labels "从这里创建分支" / "复制这条回复" (:189, 199)
- Copy toasts: "已复制/消息已复制到剪贴板" and "复制失败/无法访问剪贴板，请重试" (AgentConsole.tsx:134-135)
- Fork toasts: "创建分支失败" + both descriptions "当前回复尚未完成，请稍后再试" and "创建分支时出错，原会话未受影响" (chatConsoleStore.ts:277, 286, 291, 310, 314)
- Badge: "来自 {parentTitle}" with "原会话" fallback (AgentConsole.tsx:149); fork success correctly toast-free
- Empty state unchanged ("今天需要处理什么？", :156)

### Pillar 2: Visuals (4/4)
- Toolbar below bubble, fork-before-copy order, GitBranch/Copy size 14 duotone (AgentConsole.tsx:178-203) — exactly per spec
- Badge: GitBranch size 12 `weight="fill"` leading icon, carry-chip recipe (AgentConsole.tsx:142-152)
- Fork icon hidden (not disabled) for non-forkable ack messages — `forkableIds.has(message.id)` gate (:179); disabled+`opacity-50` while streaming (:183-187)
- Both toolbar buttons have `title` + `aria-label`; badge is text, SR-readable

### Pillar 3: Color (4/4)
- Toolbar: `text-text-tertiary hover:text-text-primary` — neutral, not accent (AgentConsole.tsx:185, 197), per spec's "no 10 accent rows" rule
- Badge: `border-accent/20 bg-accent-subtle text-accent` — accent confined to the single provenance chip (AgentConsole.tsx:145)
- No hex/rgb literals in new code; all semantic tokens; no destructive color used (correct — fork is additive)

### Pillar 4: Typography (4/4)
- Badge `text-xs` (12px), message bubbles remain `text-sm` — the only two sizes in the new surface, both declared in UI-SPEC
- No new font weights; badge default 400, toast titles use existing useToast styling
- No hardcoded px/rem font sizes

### Pillar 5: Spacing (4/4)
Spec table matched exactly: toolbar `mt-1` + `gap-1` (AgentConsole.tsx:178), icon buttons `p-1`, badge `px-2 py-0.5` (:145), badge-to-console `mb-2` (:143), truncation `max-w-[160px]` (:149 — the one arbitrary value, declared in the contract). No other arbitrary spacing.

### Pillar 6: Experience Design (4/4)
- Loading guard on fork (chatConsoleStore.ts:276) + disabled button while streaming — SESS-04 consistent
- Copy failure never silent (AgentConsole.tsx:135); fork failure never silent and parent never mutated (store catch-all :312-315)
- Keyboard access: `group-focus-within:opacity-100` present (AgentConsole.tsx:178) — the REQUIRED accessibility item from the spec
- Zero layout shift: opacity-only reveal, `transition-opacity duration-150`, no motion/react added — per motion contract
- State coverage backed by 3 store tests (streaming guard, ack-not-forkable, happy path incl. parent-untouched); 204/204 suite green, tsc clean

---

## Registry Safety

Registry audit: skipped — no `components.json` (not a shadcn project); UI-SPEC declares zero new dependencies. Confirmed.

## Files Audited
- src/components/AgentConsole.tsx (full read)
- src/stores/chatConsoleStore.ts (fork sections, lines 200-345)
- .planning/phases/20-fork/20-01-PLAN.md, 20-02-PLAN.md, 20-01-SUMMARY.md, 20-02-SUMMARY.md, 20-UI-SPEC.md, 20-CONTEXT.md
- src/stores/__tests__/phase20Fork.test.ts (existence/count check)
