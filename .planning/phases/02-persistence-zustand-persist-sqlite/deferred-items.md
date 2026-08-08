# Deferred Items (Phase 02)

Out-of-scope discoveries logged during execution. Not fixed because they are pre-existing and unrelated to current task changes.

## 2026-08-08 — `npm run lint` exit 2 from pre-existing tauri build artifacts

**Found during:** Plan 02-01, Task 1 verification
**Issue:** `npm run lint` (which runs `tsc --noEmit`) exits 2 with hundreds of errors from `src-tauri/target/release/build/nova-*/out/tauri-codegen-assets/*.js`. These are binary/minified tauri codegen output that tsc tries to parse due to `allowJs: true` in tsconfig.json with no `exclude` field.
**Baseline confirmation:** Stashed all 02-01 changes and re-ran lint — same exit 2, same errors. Pre-existing, not caused by this plan.
**Fix (when ready to address):** Add `"exclude": ["src-tauri/target", "dist"]` to tsconfig.json, OR run `npm run clean` + avoid building tauri in dev. Belongs in a separate cleanup task — touching tsconfig.json affects every phase.
**Scope:** This plan's src/stores/rndStore.ts changes produce zero new tsc errors (verified: `grep -E "(src/stores|src/data)" lint-output.txt` returns nothing).
