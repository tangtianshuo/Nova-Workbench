---
phase: 01-dark-mode-wiring
plan: 04
subsystem: design-system
tags: [dark-mode, card-variant, hero-banner, semantic-tokens, accessibility]
requires:
  - 01-01-SUMMARY.md (themeStore + Linux GTK shim)
  - 01-03-SUMMARY.md (tokens.css .dark + transitions)
provides:
  - Card dark variant reworked to accent-tinted semantic-token gradient
  - All Card dark variant consumers (10 product sub-components + 2 views) using semantic tokens for overlays
  - Per-tab accent identity preserved (amber/teal/blue→indigo/purple) at reduced opacity
affects:
  - src/components/ui/Card.tsx
  - src/components/product/* (10 files)
  - src/views/ProductManagementView.tsx
  - src/views/RndCenterView.tsx
tech-stack:
  added: []
  patterns:
  - "Accent-tinted gradient (from-accent/20 via-accent-hover/10 to-bg-tertiary) — the new Card dark variant pattern, replacing literal slate-950"
  - "Per-tab accent at reduced opacity over bg-tertiary — preserves tab identity in both modes without vanishing against dark --bg-app"
key-files:
  created: []
  modified:
  - src/components/ui/Card.tsx
  - src/components/product/AIRequirementsTab.tsx
  - src/components/product/CodeManagementTab.tsx
  - src/components/product/CompetitorAnalysisTab.tsx
  - src/components/product/FullDeliverablesTab.tsx
  - src/components/product/ProductGovernanceTab.tsx
  - src/components/product/ProductKnowledgeTab.tsx
  - src/components/product/ProductMilestonesTab.tsx
  - src/components/product/ProductSkillsTab.tsx
  - src/components/product/TestManagementTab.tsx
  - src/components/product/UIPrototypeTab.tsx
  - src/views/ProductManagementView.tsx
  - src/views/RndCenterView.tsx
decisions:
  - "Card dark variant uses from-accent/20 via-accent-hover/10 to-bg-tertiary (accent-tinted gradient) instead of literal slate-950 — works in both modes"
  - "Per-tab accent identity preserved (amber/teal/blue→indigo/purple) at 20%/10% opacity over bg-tertiary — keeps tab personality without breaking dark mode"
  - "Hero banners in views (ProductManagement/RndCenter) reworked to match Card dark variant aesthetic — same pattern, same tokens"
  - "P2 slate-literal findings in code-editor aesthetic surfaces deferred — out of scope, logged in deferred-items.md"
metrics:
  duration: ~22 min
  completed: 2026-08-08
  tasks: 3
  files: 13
---

# Phase 1 Plan 04: Card Dark Variant Rework + 47-Component Dark-Mode Audit Summary

Reworked Card `dark` variant from literal `from-slate-950 via-indigo-950/90 to-slate-900` (which vanished against dark `--bg-app`) to accent-tinted `from-accent/20 via-accent-hover/10 to-bg-tertiary`. Cascaded the fix through 10 product sub-components + 2 view hero banners, preserving per-tab accent identity (amber/teal/blue→indigo/purple) at reduced opacity. Fixed 3 P0 toast-visibility bugs and 2 P1 hero-banner-vanishing bugs discovered during the static audit pass.

## What Changed

### Task 1: Card `dark` variant rework — `src/components/ui/Card.tsx`

**Before (line 22):**
```typescript
dark:
  'bg-gradient-to-r from-slate-950 via-indigo-950/90 to-slate-900 text-white border border-indigo-500/20 shadow-shadow-lg',
```

**After:**
```typescript
dark:
  'bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary border border-accent/20 shadow-shadow-lg',
```

**Why:** `from-slate-950` (`#020617`) against dark `--bg-app: 220 16% 8%` (`#111317`) — both near-black, no visual separation. The new gradient uses the accent token (brighter in dark mode: `211 100% 55%`) at 20% opacity over a mid-tone surface token, giving a glowing hero panel in dark mode and a subtle blue tint in light mode. Other 4 variants untouched.

**Commit:** `795b054`

### Task 2: 10 product sub-component consumer fixes

#### Pass A — Standard alpha-overlay swaps (inside Card variant="dark" blocks only)

**`src/components/product/CodeManagementTab.tsx`**
- Line 131: `bg-white/5 hover:bg-white/10 ... border border-white/10` → `bg-bg-secondary/50 hover:bg-bg-secondary ... border border-border-subtle`
- Line 134: `bg-white/10` → `bg-bg-secondary`

**`src/components/product/FullDeliverablesTab.tsx`** (Card at line 164)
- Line 171: `bg-white/10 text-white/90 ... border border-white/20` → `bg-bg-secondary text-text-primary ... border border-border-subtle`
- Line 179: `text-white/70` → `text-text-secondary`
- Line 185: `bg-white/10 ... border border-white/15` → `bg-bg-secondary ... border border-border-subtle`
- Line 187: `text-white/60` → `text-text-secondary`
- Line 220: `bg-white/10 ... border border-white/15` → `bg-bg-secondary ... border border-border-subtle`
- Line 222: `text-white/70` → `text-text-secondary`

**`src/components/product/ProductGovernanceTab.tsx`** (Card at line 92)
- Line 99: `bg-white/10 text-white/90 ... border border-white/20` → `bg-bg-secondary text-text-primary ... border border-border-subtle`
- Line 104: `text-white/70` → `text-text-secondary`
- Line 122: `border-t border-white/10` → `border-t border-border-subtle`
- Lines 123, 128, 139, 146 (4 metric cards): `bg-white/10 ... border border-white/15` → `bg-bg-secondary ... border border-border-subtle`
- Lines 124, 129, 140, 147: `text-white/60` → `text-text-secondary`

#### Pass B — Literal-override reworks (per-tab accent preserved at reduced opacity)

**B1. `src/components/product/CompetitorAnalysisTab.tsx` line 83**
- Before: `bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 border-amber-500/20`
- After: `bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-bg-tertiary border-amber-500/20`
- Why: amber-500 at 20%/10% opacity over `bg-bg-tertiary` keeps amber identity in both modes (light: subtle amber tint; dark: glowing amber hero). Slate-950 base is what vanished against dark `--bg-app`.

**B2. `src/components/product/TestManagementTab.tsx` line 109**
- Before: `bg-gradient-to-r from-teal-950 via-slate-900 to-slate-950 border-teal-500/20`
- After: `bg-gradient-to-r from-teal-500/20 via-teal-500/10 to-bg-tertiary border-teal-500/20`
- Why: same pattern — teal-500 at 20%/10% opacity over `bg-bg-tertiary` keeps teal identity.

**B3. `src/components/product/ProductSkillsTab.tsx` line 77**
- Before: `bg-gradient-to-r from-blue-600 to-indigo-600`
- After: `bg-gradient-to-r from-blue-500/20 via-indigo-500/10 to-bg-tertiary border-blue-500/20`
- Why: blue-600/indigo-600 are full-saturation mid-tones — overpowering in dark mode + clashing with surrounding dark surfaces. Switching to 20%/10% opacity over `bg-bg-tertiary` retains blue→indigo identity while matching the new Card dark variant aesthetic. Added `border-blue-500/20` for subtle edge definition.
- Children also swapped: `bg-white/20 backdrop-blur-sm` → `bg-bg-secondary/50 backdrop-blur-sm`; `text-blue-100/90` → `text-text-secondary`; `!bg-white` (Button) → `!bg-bg-primary`

#### Pass B children — Pass A swap table applied
- CompetitorAnalysisTab, TestManagementTab: no alpha overlays inside their Card dark blocks (their children use amber/teal accent literals which are part of the per-tab identity, kept)
- ProductSkillsTab: alpha overlays swapped as listed above

**Pass A files with no swaps needed inside their Card variant="dark" blocks:**
- `AIRequirementsTab.tsx` (Card dark at line 143) — children already use `text-text-tertiary`, `text-text-secondary`, `bg-accent` (semantic). The `text-white` on heading is kept (acceptable on mid-tone gradient per plan rules).
- `ProductKnowledgeTab.tsx` (Card dark at line 155) — children already semantic.
- `ProductMilestonesTab.tsx` (Card dark at line 251) — children already semantic.
- `UIPrototypeTab.tsx` (Card dark at line 129) — children use purple accent literals (per-tab identity, kept). `text-white` heading kept.

**Commit:** `7b0ae33`

### Task 3: P0/P1 audit findings (auto-approved checkpoint under `--auto`)

#### P0 — Toast text invisible in dark mode (3 files)

The toast component pattern `bg-slate-900 text-text-inverted` breaks in dark mode: `bg-slate-900` stays dark, but `text-text-inverted` swaps to `220 20% 10%` (dark) — dark-on-dark = invisible text.

- `src/components/product/AIRequirementsTab.tsx` line 130: `bg-slate-900 text-text-inverted ... border-slate-700` → `bg-bg-primary text-text-primary ... border-border-subtle`
- `src/components/product/ProductKnowledgeTab.tsx` line 142: same fix
- `src/components/product/UIPrototypeTab.tsx` line 118: same fix

#### P1 — Hero banners vanishing against dark `--bg-app` (2 views)

Both view hero banners used the same inline-style dark gradient (`hsl(220 30% 12%)` ≈ `#151719`) — near-identical to dark `--bg-app` (`#111317`). Same Pitfall 4 as Card dark variant.

**`src/views/ProductManagementView.tsx`** (hero at line 156)
- Before: `style={{ background: 'linear-gradient(135deg, hsl(220 30% 12%), hsl(220 40% 20%), hsl(220 30% 14%))' }}` + `text-white` + child alpha overlays (`bg-white/10`, `text-white/60`, `border-white/8`, `border-white/15`)
- After: `bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary border border-accent/20` + `text-text-primary` + child semantic tokens (`bg-bg-secondary`, `text-text-secondary`, `border-border-subtle`)
- `BannerStat` helper (line 446): `bg-white/5`, `text-white/40` → `bg-bg-secondary/50`, `text-text-tertiary`; default `valueColor` from `text-white` → `text-text-primary`

**`src/views/RndCenterView.tsx`** (hero at line 87)
- Same rework pattern: inline gradient → accent-tinted semantic gradient; alpha overlays → semantic tokens
- `StatCard` helper (line 188): `bg-white/5`, `text-white/40`, `bg-white/5` → `bg-bg-secondary/50`, `text-text-tertiary`, `bg-bg-secondary`

#### Rule 2 — Modal overlays semanticized (correctness)
- `src/components/product/ProductKnowledgeTab.tsx` line 375: `bg-slate-900/60` → `bg-bg-overlay`
- `src/components/product/ProductSkillsTab.tsx` line 239: `bg-black/60` → `bg-bg-overlay`

#### Rule 1 — Modal header literal slate/indigo gradient reworked (correctness)
- `src/components/product/FullDeliverablesTab.tsx` line 357: `bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white ... border-white/10` → `bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary ... border-border-subtle` + all child alpha overlays (text-white/60, text-white/80, text-white/90, bg-white/10, bg-white/15, border-white/20) swapped to semantic tokens

**Commit:** `5124ca6`

## Audit Methodology

Static/code-level audit performed across all 47 components per D-09:

1. **Grep sweep for literal palette classes** (`bg-slate-`, `text-slate-`, `bg-gray-`, `text-gray-`, `bg-white`, `text-black`, `bg-black`) across `src/components/` and `src/views/`
2. **Triage by Pitfall category** (per RESEARCH §4):
   - P0 (text unreadable): 3 toast bugs found + fixed
   - P1 (vanishes against bg): 2 view hero banners + 1 modal header found + fixed
   - P2 (aesthetic inconsistency): slate literals in code-editor surfaces + hero inset pills — logged to `deferred-items.md`
3. **Acceptable `text-white` cases verified** (RESEARCH §4): white on `bg-accent` Buttons ✓, white on `bg-success` calendar markers ✓, white on accent-gradient ProjectVisualizer hero ✓
4. **All 20 UI primitives verified** — already use semantic tokens (per Plan 01-03 scope), no P0/P1 findings
5. **Build + tsc pass** after all fixes

### Audit findings table

| Component | Severity | File:Line | Before → After | Status |
|-----------|----------|-----------|----------------|--------|
| AIRequirementsTab toast | P0 | `src/components/product/AIRequirementsTab.tsx:130` | `bg-slate-900 text-text-inverted border-slate-700` → `bg-bg-primary text-text-primary border-border-subtle` | Fixed |
| ProductKnowledgeTab toast | P0 | `src/components/product/ProductKnowledgeTab.tsx:142` | same as above | Fixed |
| UIPrototypeTab toast | P0 | `src/components/product/UIPrototypeTab.tsx:118` | same as above | Fixed |
| ProductManagementView hero | P1 | `src/views/ProductManagementView.tsx:156-189` | inline dark gradient + alpha overlays → accent-tinted gradient + semantic tokens | Fixed |
| RndCenterView hero | P1 | `src/views/RndCenterView.tsx:87-145` | same pattern | Fixed |
| FullDeliverablesTab modal header | P1 | `src/components/product/FullDeliverablesTab.tsx:357` | `from-slate-900 via-indigo-950 to-slate-900` → `from-accent/20 via-accent-hover/10 to-bg-tertiary` | Fixed |
| Hero inset slate literals (8 sites) | P2 | AIRequirementsTab, CompetitorAnalysisTab, TestManagementTab, UIPrototypeTab | `bg-slate-800/900` on tinted gradient — readable in both modes, only aesthetic inconsistency | Deferred |
| Code editor surfaces | P2 | CodeManagementTab (6 sites), UIPrototypeTab sandbox (6 sites) | Intentional VS Code-style dark code viewer | Deferred |
| Prototype theme config | P2 | UIPrototypeTab:91 | User-selectable preview theme — intentional | Leave as-is |
| Stale CONVENTIONS.md note | P2 | `.planning/codebase/CONVENTIONS.md` §"Styling" | Doc says Card dark uses literal gradients — no longer true | Deferred |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Modal header literal slate/indigo gradient**
- **Found during:** Task 2 verification grep
- **Issue:** `FullDeliverablesTab.tsx:357` modal header used `bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900` — would vanish against dark `--bg-app` in the same way as Card dark variant (Pitfall 4). Modal is structurally a Card-dark-equivalent surface (dark hero header) but uses `<motion.div>` not `<Card variant="dark">`. Plan's strict Task 2 scope was "inside Card variant='dark' blocks ONLY" — but the verification grep step demanded zero matches for `via-indigo-950` across `src/components/product/`.
- **Fix:** Reworked to match the new Card dark variant aesthetic (accent-tinted gradient + semantic tokens for children).
- **Files modified:** `src/components/product/FullDeliverablesTab.tsx`
- **Commit:** `7b0ae33`

**2. [Rule 1 - Bug] P0 toast text invisible in dark mode (3 files)**
- **Found during:** Task 3 static audit
- **Issue:** `bg-slate-900 text-text-inverted` toast pattern: `text-text-inverted` swaps to dark in dark mode, but `bg-slate-900` stays dark — dark-on-dark = invisible.
- **Fix:** Swapped to `bg-bg-primary text-text-primary` (semantic tokens swap correctly in both modes).
- **Files modified:** `src/components/product/AIRequirementsTab.tsx`, `ProductKnowledgeTab.tsx`, `UIPrototypeTab.tsx`
- **Commit:** `5124ca6`

**3. [Rule 1 - Bug] P1 hero banners vanishing against dark `--bg-app` (2 views)**
- **Found during:** Task 3 static audit
- **Issue:** `ProductManagementView` and `RndCenterView` hero banners used inline-style `linear-gradient(135deg, hsl(220 30% 12%), ...)` — same near-black as dark `--bg-app`, causing the hero to vanish. These weren't in the plan's 10-file scope (plan scope was `src/components/product/`), but they're textbook Pitfall 4 cases.
- **Fix:** Reworked both view hero banners to match the new Card dark variant aesthetic (accent-tinted gradient + semantic tokens for children). Swapped helper component overlays (`BannerStat`, `StatCard`).
- **Files modified:** `src/views/ProductManagementView.tsx`, `src/views/RndCenterView.tsx`
- **Commit:** `5124ca6`

**4. [Rule 2 - Correctness] Modal overlays using literal slate/black**
- **Found during:** Task 3 static audit
- **Issue:** Modal overlays in `ProductKnowledgeTab.tsx:375` (`bg-slate-900/60`) and `ProductSkillsTab.tsx:239` (`bg-black/60`) bypassed the semantic `--bg-overlay` token.
- **Fix:** Swapped to `bg-bg-overlay`.
- **Files modified:** `src/components/product/ProductKnowledgeTab.tsx`, `ProductSkillsTab.tsx`
- **Commit:** `5124ca6`

### Plan Scope Adjustments

The plan's Task 2 was strictly scoped to "inside Card variant='dark' blocks" — but the verification step 5 demanded `grep -rn "from-slate-950\|via-indigo-950\|..." src/components/product/` return zero matches. The modal header at `FullDeliverablesTab.tsx:357` matched `via-indigo-950` but was inside a `<motion.div>` modal, not a Card dark. Per Ponytail root-cause rule (fix the pattern once, comprehensively), the modal header was reworked inline rather than leaving a known dark-mode failure.

Similarly, the 2 view hero banners (`ProductManagementView`, `RndCenterView`) used inline-style gradients instead of Card variant="dark" — they weren't in the plan's 10-file product-sub-component scope, but they're the canonical Card-dark consumers per RESEARCH §5 and had the same Pitfall 4 bug. Fixed under Rule 1 during the audit task.

## Verification

### Post-swap grep commands and results

**Literal slate/indigo/amber/teal/blue override sweep:**
```bash
grep -rn "from-slate-950\|via-indigo-950\|from-blue-600\|from-amber-950\|from-teal-950\|via-slate-900\|to-slate-950" src/components/product/
```
Result: **1 match** — `UIPrototypeTab.tsx:91` (`bg: 'from-slate-950 to-slate-900'` inside the `themeColors` config object). This is the user-selectable dark theme for the *displayed prototype sandbox* — intentional, not app chrome. All actual Card dark variant consumer literals: gone.

**Alpha-overlay sweep inside Card variant="dark" blocks:**
```bash
grep -rn "text-white/40\|text-white/60\|bg-white/10\|border-white/15" src/components/product/
```
Result: **0 matches**. ✓

### Build verification
- `npm run lint` (tsc --noEmit) — passes (only pre-existing Tauri codegen binary-junk errors in `src-tauri/target/`, filtered out)
- `npm run build` — succeeds. Bundles: `RndCenterView-176.70 kB`, `ProductManagementView-164.34 kB` (slightly smaller after literal removal)

## P2 Backlog (for future milestone)

Captured in `.planning/phases/01-dark-mode-wiring/deferred-items.md`:

1. Hero-banner inset slate literals (AIRequirementsTab version pill, scenario buttons, prompt textarea; CompetitorAnalysisTab prompt input; TestManagementTab metric cards; UIPrototypeTab theme selector)
2. Code-editor aesthetic surfaces (CodeManagementTab code viewer, UIPrototypeTab sandbox + Code view) — should become a dedicated `CodeBlock` component with its own tokens
3. UIPrototypeTab `themeColors.dark.bg` — intentional preview literal, leave as-is
4. Stale CONVENTIONS.md note about Card dark variant literals

## Self-Check: PASSED

**Files verified to exist:**
- ✓ `src/components/ui/Card.tsx` — dark variant line contains `from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary border border-accent/20`
- ✓ All 10 product sub-components modified
- ✓ `src/views/ProductManagementView.tsx` hero reworked
- ✓ `src/views/RndCenterView.tsx` hero reworked
- ✓ `.planning/phases/01-dark-mode-wiring/deferred-items.md` updated

**Commits verified in git log:**
- ✓ `795b054` — Task 1 (Card.tsx dark variant)
- ✓ `7b0ae33` — Task 2 (10 product sub-components)
- ✓ `5124ca6` — Task 3 (audit fixes for views + toasts + modals)

**Grep sweeps:**
- ✓ `from-slate-950|via-indigo-950|from-blue-600|from-amber-950|from-teal-950|via-slate-900|to-slate-950` in `src/components/product/` — 1 match (intentional preview literal)
- ✓ `text-white/40|text-white/60|bg-white/10|border-white/15` in `src/components/product/` — 0 matches
