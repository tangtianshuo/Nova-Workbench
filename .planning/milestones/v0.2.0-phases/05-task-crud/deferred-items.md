# Phase 5 Deferred Items

Out-of-scope issues discovered during plan execution. Not fixed by the discovering plan.

## 2026-08-10 — Plan 05-02

**TS errors in `src/store/AppContext.tsx`** — `AppContextType` is missing `updateTask`, `deleteTask`, `reopenTask`, `moveTask`, `setTaskProject` (TS2739).
- **Discovered by:** Plan 05-02 (Drawer + ProductSummaryDrawer)
- **Owner:** Plan 05-01 (taskStore CRUD + AppContext wrappers)
- **Reason not fixed:** Plan 05-01 (running in parallel) adds these taskStore actions and exposes them via AppContext. Once 05-01 lands, AppContextType will be satisfied. Plan 05-02's scope is limited to Drawer.tsx + ProductSummaryDrawer.tsx, which compile cleanly against the project's tsconfig.
- **Verification:** After 05-01 completes, `npm run lint` should pass.
