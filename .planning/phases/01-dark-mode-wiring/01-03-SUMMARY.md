---
phase: 01-dark-mode-wiring
plan: 03
subsystem: design-system
tags: [css, dark-mode, animation, accessibility]
requires:
  - "tokens.css with .dark token block (pre-existing, lines 116-156)"
  - "tokens.css with @media (prefers-reduced-motion: reduce) override (pre-existing, lines 158-168)"
provides:
  - "Color transition rule on `*` selector — theme switches animate over 200ms"
affects:
  - "Every element in the app (color-only transition on theme change)"
tech-stack:
  added: []
  patterns:
    - "Color-restricted CSS transition on universal selector (avoid layout shift)"
key-files:
  created: []
  modified:
    - src/styles/tokens.css
decisions:
  - "200ms duration (CONTEXT D-06) over --duration-normal token (250ms) — deliberate departure to match Apple HIG"
  - "`*` selector over html/body — visible colors live on child elements, not the root"
  - "Property list excludes geometry (width/height/top/left) by construction — Pitfall 3 avoidance"
  - "D-08 accessibility satisfied by existing reduced-motion block, zero new code"
metrics:
  duration: ~1m
  completed: 2026-08-08
  tasks_completed: 1
  files_modified: 1
---

# Phase 01 Plan 03: Theme Switch Color Transition Summary

One CSS rule appended to `tokens.css` — universal selector animates `background-color, color, border-color, fill, stroke` over 200ms with `cubic-bezier(0.4, 0, 0.2, 1)`. Layout-shift properties excluded by construction; existing `prefers-reduced-motion` block overrides duration to 0.01ms for D-08 accessibility with zero additional code.

## What Was Built

**Appended to `src/styles/tokens.css` (after the Firefox scrollbar block, end of file):**

```css
/* === Theme Switch Color Transitions === */
* {
  transition-property: background-color, color, border-color, fill, stroke;
  transition-duration: 200ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

That is the entire change. No JS, no new deps, no token additions.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add theme-switch color transition rule to tokens.css | `fd6cc08` | `src/styles/tokens.css` |

## Verification

- `npm run build` — succeeds in 27.47s, no CSS errors.
- `transition:\s*all` grep — zero matches as actual CSS rule (only appears inside the warning comment, line 221).
- Reduced-motion block — unchanged at lines 158-168, `transition-duration: 0.01ms !important` intact at line 165.
- Property list exact: `background-color, color, border-color, fill, stroke`.
- Duration exact: `200ms` (NOT 250ms — matches CONTEXT D-06, deliberate departure from `--duration-normal`).
- Timing function exact: `cubic-bezier(0.4, 0, 0.2, 1)`.

## Decisions Made

1. **200ms over `--duration-normal` (250ms)** — CONTEXT D-06 explicit value; matches Apple HIG dark-mode transition feel. Documented as deliberate departure in RESEARCH §3.
2. **`*` selector, not `html`/`body`** — `.dark` class lives on `<html>` but the visible colors are on child elements. Restricting to root would skip everything visible (RESEARCH §3 anti-pattern).
3. **Property list excludes all geometry** — `width, height, top, left, transform, opacity, box-shadow, margin, padding` deliberately absent. Pitfall 3 (`transition: all` causes layout shift) avoided by construction.
4. **Zero new code for D-08** — existing `@media (prefers-reduced-motion: reduce)` block (lines 158-168) global-overrides `transition-duration` to 0.01ms with `!important`. No duplication needed.

## Deviations from Plan

None — plan executed exactly as written. Single 11-line append, build passes.

## Self-Check: PASSED

- [x] `src/styles/tokens.css` contains `transition-property: background-color, color, border-color, fill, stroke`
- [x] `src/styles/tokens.css` contains `transition-duration: 200ms`
- [x] `src/styles/tokens.css` contains `transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)`
- [x] No `transition: all` as actual CSS (only inside warning comment)
- [x] `@media (prefers-reduced-motion: reduce)` block unchanged at lines 158-168
- [x] `npm run build` succeeds
- [x] Commit `fd6cc08` exists in git log
