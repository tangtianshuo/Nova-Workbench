# Phase 17 — UI Review

**Audited:** 2026-08-17
**Baseline:** 17-UI-SPEC.md (approved design contract)
**Screenshots:** not captured (no dev server on 3000/5173/8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All 20+ contract strings verbatim across all 4 surfaces; zero generic labels |
| 2. Visuals | 3/4 | ContextMenu `min-w-[10rem]` vs DropdownMenu `min-w-[8rem]` — menu families differ by 2rem |
| 3. Color | 4/4 | Zero hex/rgb/gray/white/black; accent strictly within reserved-for list |
| 4. Typography | 4/4 | Exactly the declared roles: 400/500 + 600 on 晨报 title only |
| 5. Spacing | 4/4 | Declared scale matched exactly; no rogue arbitrary values |
| 6. Experience Design | 3/4 | Chip × hit target ~10px; kanban column-header category select has zero affordance |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **Menu min-width family mismatch** — ContextMenuContent (`ContextMenu.tsx:20`) uses `min-w-[10rem]`, DropdownMenuContent (`DropdownMenu.tsx:24`) uses `min-w-[8rem]`; right-click and dropdown menus read as different systems at close glance — change one to match the other (one-line diff; the spec's "pixel-identical" intent was defeated by a stale width in its own quoted string).
2. **Chip remove button hit target** — `X size={10}` with no padding (`AgentConsole.tsx:249-252`) gives a ~10px click target for a primary carry-removal control; add `px-1 py-0.5` (keeps icon size, grows hit area toward a11y minimum).
3. **Invisible column-header category selection** — `TaskKanban.tsx:254-259` sets the ⌘K carry category on header click with "zero visual change" by design; users cannot discover the「任务 · {分类}」carry path — add `cursor-pointer` plus a subtle active state (e.g. `text-accent` on the active column header).

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Every Copywriting Contract row verified in code: console header (`ChatPanel.tsx:20`), empty state (`AgentConsole.tsx:131-132`), `已携带:` + `今日日程 ({n})` + `移除 {label}` (`AgentConsole.tsx:244-250`), 晨报 title/date/sections/collapsed bar/`收起晨报` (`MorningReport.tsx:73-96,108-144`), `AI 动作` label (`ContextMenu.tsx:88`), all 6 menu labels and all 6 prefill templates verbatim with {title} substitution (`TaskKanban.tsx:578-580`, `KnowledgeBaseView.tsx:324-326`), `引用选区：「{≤200 chars}」` prefix (`aiActions.ts:9-11`), `Enter 发送，Shift + Enter 换行` hint (`AgentConsole.tsx:288`). Zero generic Submit/OK/Save patterns in new surfaces.

### Pillar 2: Visuals (3/4)
- Focal hierarchy correct: page host = 晨报 hero above glass console card (`AgentWorkspaceView.tsx:7-11`); collapsed bar demotes correctly (`MorningReport.tsx:65-79`).
- Icon-only buttons carry aria-labels (收起晨报, chip ×); menu icons uniform 14px duotone `text-accent`.
- **Finding:** ContextMenu Content `min-w-[10rem]` (`ContextMenu.tsx:20`) vs DropdownMenu Content `min-w-[8rem]` (`DropdownMenu.tsx:24`). The spec quoted the class string with 10rem and demanded pixel-identity; the live DropdownMenu is 8rem, so the two menu families now differ. Spec-compliant letter, spec-defeating spirit.

### Pillar 3: Color (4/4)
Grep for hex/rgb/`text-gray-`/`bg-white`/`bg-black` across all new phase files: zero hits. Accent usage maps 1:1 to the reserved-for list: menu action icons (`TaskKanban.tsx:578-580`, `KnowledgeBaseView.tsx:324-326`), carry chips `border-accent/20 bg-accent-subtle text-accent` (`AgentConsole.tsx:247`), 晨报 Sparkle both states (`MorningReport.tsx:72,94`). `text-warning` appears exactly once, on the overdue section icon (`MorningReport.tsx:123`).

### Pillar 4: Typography (4/4)
New code uses only: `text-sm` (body/rows/menu items), `text-xs` (labels/meta/chips/collapsed bar), inherited `text-[11px]` (input hint). Weights: 400 default, `font-medium` section headers + collapsed 晨报, `font-semibold` expanded 晨报 title only (`MorningReport.tsx:73,95,105`). No undeclared sizes or weights.

### Pillar 5: Spacing (4/4)
All declared values present and unmodified: console chrome `px-5 pb-4` / `px-5 py-4` (`AgentConsole.tsx:127,241`), chip row `mb-2 gap-1.5` (`AgentConsole.tsx:243`), report `p-5 mt-4 space-y-4`, rows `px-2 py-1.5 space-y-0.5 mt-1.5 gap-1.5` (`MorningReport.tsx:22,102,105-110`), menu `p-1 px-2.5 py-1.5 gap-2` (`ContextMenu.tsx:20,38`), page `gap-4` + mandated height calc (`AgentWorkspaceView.tsx:7`). Arbitrary values limited to `var(--radius-*)` tokens and the spec-mandated 100dvh calc.

### Pillar 6: Experience Design (3/4)
Strong coverage: loading (button `loading` + disabled textarea + `AI 思考中...` + tool-trace `执行中` states), empty states (console hero, 晨报 null-when-empty, chips hidden when carry empty), confirmation patterns (4 inherited HITL cards with `disabled={loading}`; prefill-not-send is itself a review gate), keyboard (Radix ContextMenu key, Enter/Shift+Enter, ⌘K with web fallback). Issues:
- **Chip × hit target** ~10px, no padding (`AgentConsole.tsx:249-252`).
- **Hidden interaction:** kanban column-header click sets the carry category with deliberately no visual state (`TaskKanban.tsx:254-259`) — the「任务 · 分类」carry path is undiscoverable; the chip row only reveals it after ⌘K.
- Minor: memory `listPending()` rejection swallowed silently (`MorningReport.tsx:51`) — spec-sanctioned ("no error state exists for this surface"), informational only.

Accepted deviations (per orchestrator, not scored): capture-phase stopPropagation contenteditable guard; plain-function ContextMenu; restore on first host mount.

---

## Registry Safety

shadcn not initialized (`components.json` absent); UI-SPEC declares no third-party registries. Registry audit: not applicable. Only new dependency is official `@radix-ui/react-context-menu` per spec mandate.

---

## Files Audited
- src/components/AgentConsole.tsx
- src/components/ChatPanel.tsx
- src/views/AgentWorkspaceView.tsx
- src/components/MorningReport.tsx
- src/stores/reportSelectors.ts
- src/components/ui/ContextMenu.tsx (+ DropdownMenu.tsx for clone verification)
- src/lib/aiActions.ts
- src/components/TaskKanban.tsx (menu mount + carry lift)
- src/views/KnowledgeBaseView.tsx (menu mount)
- src/hooks/useCmdK.ts, src/ai/context.ts, src/stores/uiStore.ts (carry/prefill wiring)
