---
phase: 02-persistence-zustand-persist-sqlite
plan: 01
subsystem: testing
tags: [zustand, rndStore, node-test, tdd, persistence-prereq]

# Dependency graph
requires: []
provides:
  - "rndStore accessors return typed EMPTY values for unknown productIds (no more P1 silent fallback)"
  - "node:test self-check suite covering 6 accessor paths"
  - "npm test script using tsx --test (no new deps)"
affects: [02-02 (rndStore persist), 02-03, 02-04, any caller of rndStore accessors]

# Tech tracking
tech-stack:
  added: []  # tsx already devDep; node:test ships with Node 22+
  patterns:
    - "Typed EMPTY_* constants as fallbacks for unknown-id paths in Zustand stores"
    - "console.warn tagged [rndStore] for unknown-id regressions (visible in devtools)"
    - "node:test self-check (D-08) — minimal, no jest/vitest"

key-files:
  created:
    - "src/stores/__tests__/rndStore.test.ts"
  modified:
    - "src/stores/rndStore.ts"
    - "package.json"

key-decisions:
  - "Synthesizing accessors (getRequirement/getPrototype/getCompetitor) still synthesize for KNOWN products with unseeded records — only the unknown-id path returns EMPTY. Preserves demo feature."
  - "getDeliverablesForProduct still writes-on-miss for KNOWN products (lazy seed behavior preserved); only unknown-id path returns [] without writing."
  - "TDD ordering: RED test committed first (6b1ba4c) including package.json test script, then GREEN fix (2bcd52c). Task 2's artifacts therefore ride in the RED commit."

patterns-established:
  - "Typed EMPTY constants near top of store file, with ponytail: comment naming the ceiling (replaces silent .p1 fallback that froze wrong-product data into persistence)"
  - "Every accessor with productId param: null-guard on getProd + console.warn tagged [storeName] on unknown path"

requirements-completed: [PERSIST-08]

# Metrics
duration: 3min
completed: 2026-08-08
---

# Phase 02 Plan 01: rndStore INITIAL.p1 Fallback Bug Fix Summary

**Fixed all 6 bug sites in rndStore.ts so unknown productIds return typed EMPTY values + console.warn instead of Product 1's seed data; added 6 node:test self-checks (npm test) to lock the fix.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-08-08T06:38:11Z
- **Completed:** 2026-08-08T06:41:56Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 3 (rndStore.ts, package.json, new test file)

## Accomplishments
- 4 OR-fallback sites (`|| INITIAL_*.p1 || []`) replaced with typed-empty + warn
- 2 synthesizing sites (getRequirement, getPrototype) gained null-guard returning EMPTY_REQUIREMENT / EMPTY_PROTOTYPE
- getCompetitorDataForProduct returns EMPTY_COMPETITOR for unknown ids, preserves synthesis for KNOWN products
- getDeliverablesForProduct no longer writes to store on miss for unknown ids (write-on-miss bug eliminated)
- 6 node:test assertions covering all 6 unknown-id paths, all passing
- Wave 2 (rndStore persist) is unblocked — persisting the store is now safe

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: failing test for rndStore INITIAL.p1 fallback** - `6b1ba4c` (test)
   - Also includes package.json test script + test file scaffolding (Task 2 artifacts)
2. **Task 1 GREEN: rndStore returns typed EMPTY for unknown productId** - `2bcd52c` (fix)
3. **Task 2: npm test script + node:test self-check** - covered by `6b1ba4c` (no separate commit — TDD ordered the test first, the script rode along)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/stores/rndStore.ts` — Added 3 EMPTY_* constants; getProd returns `Product | null`; 7 accessor sites (requirement/prototype/knowledge/codeScaffolds/testCases/competitor/deliverables) gained null/empty guards with `console.warn('[rndStore] ...')`
- `src/stores/__tests__/rndStore.test.ts` — 6 node:test cases using `node:assert/strict`, covering empty-array, no-mutation, EMPTY-object, console.warn spy
- `package.json` — Added `"test": "tsx --test src/stores/__tests__/*.test.ts"` (between lint and tauri)

## Decisions Made
- **Synthesis preserved for KNOWN products:** getRequirement/getPrototype/getCompetitor still synthesize from `getProd(productId)` when the record is unseeded but the product exists. Only the unknown-id path (prod === null) returns EMPTY. This keeps the demo feature working.
- **Write-on-miss preserved for KNOWN products:** getDeliverablesForProduct still calls `set(...)` to lazy-seed deliverables for known products. Only the unknown-id path returns `[]` without writing.
- **TDD commit shape:** RED commit included both the test file AND the package.json test script (Task 2's content), because the test cannot run without the script. GREEN commit then contains only the rndStore.ts fix. Net result: 2 atomic commits for 2 tasks, with Task 2's artifacts front-loaded into RED.
- **No new dependencies:** tsx (4.21.0) already a devDep, node:test ships with Node 22+. Plan explicitly scoped to minimal self-check per D-08.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing `npm run lint` exit 2 from tauri build artifacts**
- **Found during:** Task 1 verification (`npm run lint`)
- **Issue:** `tsc --noEmit` produces hundreds of errors from `src-tauri/target/release/build/nova-*/out/tauri-codegen-assets/*.js` (binary/minified tauri codegen output). Root cause: `tsconfig.json` has `allowJs: true` and no `exclude` field. Pre-existing — confirmed by stashing changes and re-running lint (same exit 2, same errors).
- **Fix:** Out of scope for this plan (touching tsconfig.json affects every phase). Logged to `deferred-items.md`. Verified this plan's changes produce zero new tsc errors: `grep -E "(src/stores|src/data)" lint-output.txt` returns empty.
- **Files modified:** `.planning/phases/02-persistence-zustand-persist-sqlite/deferred-items.md` (new)
- **Verification:** Baseline lint (without this plan's changes) also exits 2 with identical errors
- **Committed in:** pending metadata commit

---

**Total deviations:** 1 (Rule 3 — blocking issue logged to deferred-items, NOT auto-fixed because root cause is pre-existing and out of scope)
**Impact on plan:** Zero scope creep. Plan's `npm run lint exits 0` success criterion cannot be met due to pre-existing debt; substituted verification confirms src/stores/rndStore.ts is type-clean.

## Issues Encountered
None beyond the deferred tsconfig issue above. All 6 tests pass. All grep acceptance checks pass.

## User Setup Required
None — no external service configuration required.

## Known Stubs
None — this plan wires no data to UI; it fixes accessor return values for an edge case (unknown productId). All EMPTY_* constants are real typed values, not placeholders.

## Next Phase Readiness
- **Wave 2 (02-02, rndStore persist):** Unblocked. Persisting rndStore is now safe — unknown productIds will rehydrate to typed empty values, not P1 seed data.
- **Verifier note:** Manual UAT — in tauri:dev console, `useRndStore.getState().getKnowledgeForProduct('zzz')` returns `[]` and prints `[rndStore] unknown productId in getKnowledgeForProduct: zzz` to console.
- **Deferred:** `tsconfig.json` exclude rule for `src-tauri/target` (see deferred-items.md).

## Self-Check: PASSED

Files verified:
- FOUND: src/stores/__tests__/rndStore.test.ts
- FOUND: src/stores/rndStore.ts
- FOUND: package.json

Commits verified:
- FOUND: 6b1ba4c (test: add failing test for rndStore INITIAL.p1 fallback bug)
- FOUND: 2bcd52c (fix: rndStore returns typed EMPTY for unknown productId)

Acceptance grep results:
- `grep '|| INITIAL_' src/stores/rndStore.ts` → 0 matches ✓
- `grep 'products\[0\]' src/stores/rndStore.ts` → 0 matches ✓
- `grep -c 'EMPTY_REQUIREMENT\|EMPTY_PROTOTYPE\|EMPTY_COMPETITOR' src/stores/rndStore.ts` → 6 ✓
- `grep -A4 'const prod = getProd' src/stores/rndStore.ts | grep -c 'if (!prod)'` → 4 ✓
- `npm test` → 6 pass / 0 fail ✓
- `npm run lint` → exit 2 (pre-existing tauri target noise, NOT caused by this plan; src files clean)

---
*Phase: 02-persistence-zustand-persist-sqlite*
*Plan: 01*
*Completed: 2026-08-08*
