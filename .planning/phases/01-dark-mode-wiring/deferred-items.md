# Phase 01 Deferred Items

Out-of-scope issues discovered during plan execution. Not caused by current task changes.

## [Pre-existing] tsc scans `src-tauri/target/` build artifacts

**Found during:** 01-01 Task 1 verification
**Issue:** `npm run lint` (tsc --noEmit) walks `src-tauri/target/release/build/.../*.js` and reports hundreds of TS1127/TS1128/TS1490 errors because `tsconfig.json` has no `exclude` field. These are Rust build cache files, not source code.
**Impact:** Lint output is noisy; real errors are hard to spot. Does NOT affect Vite build (esbuild only bundles the entry graph).
**Suggested fix (future phase):** Add `"exclude": ["src-tauri/target", "dist", "node_modules"]` to `tsconfig.json`.
**Reason not fixed here:** Pre-existing (git history shows these errors existed before this plan). Out of scope per deviation Rule scope boundary.
