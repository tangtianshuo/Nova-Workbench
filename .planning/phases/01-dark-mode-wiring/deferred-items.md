# Phase 01 Deferred Items

Out-of-scope issues discovered during plan execution. Not caused by current task changes.

## [Pre-existing] tsc scans `src-tauri/target/` build artifacts

**Found during:** 01-01 Task 1 verification
**Issue:** `npm run lint` (tsc --noEmit) walks `src-tauri/target/release/build/.../*.js` and reports hundreds of TS1127/TS1128/TS1490 errors because `tsconfig.json` has no `exclude` field. These are Rust build cache files, not source code.
**Impact:** Lint output is noisy; real errors are hard to spot. Does NOT affect Vite build (esbuild only bundles the entry graph).
**Suggested fix (future phase):** Add `"exclude": ["src-tauri/target", "dist", "node_modules"]` to `tsconfig.json`.
**Reason not fixed here:** Pre-existing (git history shows these errors existed before this plan). Out of scope per deviation Rule scope boundary.

## From Plan 01-04 (Dark Mode Audit) — P2 Polish

### P2 — Slate literal classes in hero-banner inset elements

These `bg-slate-*` usages inside hero Card variant="dark" blocks survive dark
mode (readable in both modes — slate-800/900 is a dark inset surface on the
tinted gradient) but break the semantic-token convention. Aesthetic
inconsistency only; not a correctness issue.

- `src/components/product/AIRequirementsTab.tsx`
  - Line 164: version pill `bg-slate-800 text-slate-200 border-slate-700`
  - Line 181: scenario preset button (inactive) `bg-slate-800/80 text-slate-300 hover:bg-slate-700 border-slate-700/60`
  - Line 198: prompt textarea `bg-slate-800/90 text-slate-100 placeholder:text-slate-500 border-slate-700/80`
- `src/components/product/CompetitorAnalysisTab.tsx`
  - Line 116: prompt input `bg-slate-900/80 text-slate-200 placeholder:text-slate-500 border-slate-800`
- `src/components/product/TestManagementTab.tsx`
  - Lines 146, 151, 156, 161: metric cards `bg-slate-900/80 ... border-slate-800`
- `src/components/product/UIPrototypeTab.tsx`
  - Line 149: theme selector container `bg-slate-800/80 ... border-slate-700`
  - Line 158: theme dark button `bg-slate-800 border-slate-500`
  - Line 181: prompt input `bg-slate-800/90 text-slate-100 ... border-slate-700`

### P2 — Code editor aesthetic surfaces (intentionally dark)

Code viewers are conventionally dark regardless of app theme (VS Code-style).
Currently use `bg-slate-950` / `bg-slate-900` / `text-slate-100`. Future polish:
introduce a `CodeBlock` / `CodeSurface` component with its own tokens.

- `src/components/product/CodeManagementTab.tsx` lines 182, 188, 192, 202, 212, 221
- `src/components/product/UIPrototypeTab.tsx` lines 290, 297, 409, 437, 445, 456 (prototype sandbox chrome + Code view)

### P2 — Prototype theme preview literals (intentional, leave as-is)

- `src/components/product/UIPrototypeTab.tsx` line 91
  - `themeColors.dark.bg = 'from-slate-950 to-slate-900'`
  - User-selectable dark theme for the *displayed prototype* (preview of what
    the user is designing), not the app's own dark mode. Intentional — do not
    "fix".

### P2 — Stale CONVENTIONS.md note

`.planning/codebase/CONVENTIONS.md` §"Styling" still notes: *"Card `dark`
variant uses literal gradients (`from-slate-950 via-indigo-950/90`) —
special-case hero panels only"*. After Plan 01-04 the variant uses accent-
tinted semantic tokens — the note is stale. Doc-only edit deferred per
Ponytail (docs don't break code).

## From Plan 01-04 — Runtime Visual Verification (Auto-Approved)

The Plan 01-04 Task 3 checkpoint (manual dark-mode audit of 47 components per
D-09) was auto-approved under `--auto` mode. Static/code-level audit was
performed:

- Grep sweeps for literal palette classes across `src/components/` and `src/views/`
- P0 (toast text invisible in dark mode) and P1 (hero banner vanishes against
  dark `--bg-app`) findings fixed inline
- All semantic-token swap opportunities applied
- Build + tsc pass

Runtime visual verification (eyeballing the running app in dark mode) is
deferred to user UAT. Suggested test commands:

```bash
# Web dev mode (faster iteration)
npm run dev
# Navigate to http://localhost:3000
# Toggle dark mode via Header Sun/Moon button (Plan 02) or Settings → 外观主题 → 深色

# Tauri dev mode (for Linux GTK detection verification)
npm run tauri:dev
```

**Highest-risk areas to eyeball:**

1. The 11 hero panels across ProductManagement / RndCenter / 9 product sub-tabs
   - Verify the accent-tinted gradient is visible against `--bg-app` in both modes
   - Verify per-tab accent identity preserved (amber for CompetitorAnalysis,
     teal for TestManagement, blue→indigo for ProductSkills, purple for
     UIPrototype/ProductKnowledge headers)
2. Toast notifications (AIRequirements, ProductKnowledge, UIPrototype) —
   verify readability in dark mode after the `bg-bg-primary text-text-primary`
   swap
3. Modal overlays (ProductKnowledge create modal, ProductSkills result modal,
   FullDeliverables preview modal) — verify `bg-bg-overlay` provides correct
   scrim opacity in both modes
4. Settings view theme SegmentedControl (from Plan 02) — verify smooth 200ms
   color transition on toggle
5. Linux GTK detection (D-03/D-04/D-05) — only verifiable on a Linux VM with
   GNOME 42+

**Components NOT requiring runtime verification (static audit confirmed clean):**

- All 20 UI primitives in `src/components/ui/` (Card, Button, Badge, Dialog,
  Input, Textarea, Select, Tabs, Switch, Checkbox, Tooltip, Popover, Toast,
  Avatar, DropdownMenu, ProgressBar, SegmentedControl, Separator, Skeleton,
  ScrollArea) — all use semantic tokens
- 9 of 11 views (only ProductManagementView and RndCenterView had dark-hero
  issues, both fixed)

