---
phase: 07-cross-module
plan: 04
subsystem: product-rnd-ui
tags: [react, typescript, appcontext, rndstore, l5, l6]

# Phase 07 Plan 04: Product-R&D Linkage UI Summary

## Accomplishments

- `ProductMilestonesTab` now reads product deliverables through `useApp().getDeliverablesForProduct()` and renders status badges for `ready`, `draft`, and `generating` deliverables.
- Milestone linkage prefers `deliverableCodes`; legacy `deliverables` strings use title-based approximate matching and show a neutral `未关联` badge when no deliverable matches.
- `ProductGovernanceTab` maps the product stage to one or more R&D phases and displays the current-stage ready/total ratio, progress bar, phase breakdown, and generating count.
- `RndCenterView` displays the same current-stage progress summary in the top product context area and reacts to product selection and R&D store updates through the existing `AppContext` subscriptions.

## Files Modified

- `src/components/product/ProductMilestonesTab.tsx`
- `src/components/product/ProductGovernanceTab.tsx`
- `src/views/RndCenterView.tsx`

## Verification

- `npm run lint` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

The build emitted existing Vite warnings about CSS token parsing, mixed static/dynamic imports, and large chunks; none blocked the build.

## Human UAT

Not executed. The plan's 10-step manual UAT, including generation-state transitions and stage/product switching in a running UI, remains pending and is intentionally not represented as passed.

---
*Phase: 07-cross-module*
*Completed: 2026-08-10 (automated verification only)*
