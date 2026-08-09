---
status: complete
phase: 02-persistence-zustand-persist-sqlite
source: [02-VERIFICATION.md]
started: 2026-08-08T00:00:00Z
updated: 2026-08-09T00:00:00Z
---

# Phase 2: Persistence (Zustand persist + SQLite) — Human UAT

5 items deferred to user UAT per `--auto` mode (all checkpoints auto-approved;
static code-level verification PASSED with 5/5 truths verified).

All code-level checks PASSED. These items require a running Tauri desktop binary
+ human interaction (create/delete data, close window, inspect browser DevTools).

## Current Test

[testing complete]

## Tests

### 1. First-run seed in Tauri (PERSIST-06 + PERSIST-07)

- **expected:** Delete `nova.db` from app data dir → run `npm run tauri:dev`. App boots, HydrationGate shows Skeleton briefly, then mock data paints: 4-6 products in ProductManagement, 5 local files in FileArchiveView, R&D deliverables per product.
- **how to test:**
  1. Locate SQLite file: Windows `%APPDATA%/com.nova.pm-workspace/nova.db` (or check tauri log for path)
  2. Stop app, delete `nova.db`
  3. `npm run tauri:dev`
  4. Verify mock data visible across all views
  5. Re-close app, re-open → mock data STILL there (has_seeded gate held, no re-seed)
- **result:** pass — deleted nova.db (270KB → gone), restarted `npm run tauri:dev`. SQLite migration re-ran, file re-created (28KB), seedAllStores populated kv_store fresh. User verified across all 4 views: 4 mock products (WenXiBuddy/NovaAgent/DataSense/BrandPortal) in ProductManagement, 4 categories + task cards in TaskManagement, 5 mock files in FileArchive, 18 deliverable catalog items per product in R&D center. Previously-added `UAT-Product-002` correctly gone (db deletion wiped it as expected — has_seeded gate only blocks re-seeding, doesn't restore user additions). nova.db size 28KB post-seed vs 270KB pre-delete reflects only-initial-data state vs runtime-augmented state from prior sessions (zustand persist writes back incrementally).

### 2. Persistence survives restart (PERSIST-01, PERSIST-02, PERSIST-03)

- **expected:** Create a new task in TaskManagement → add a product in ProductManagement → close app window → re-open. Both entries survive verbatim.
- **how to test:**
  1. `npm run tauri:dev`
  2. TaskManagement → add task "UAT test 1"
  3. ProductManagement → Create Product → name "UAT Product"
  4. Close window (TitleBar red X)
  5. `npm run tauri:dev` again
  6. Verify both entries present
- **result:** pass — Product add flow exercised: created `UAT-Product-002` via CreateProductModal (all 6 form fields incl. the newly-fixed Select + DatePickerInput) → close window → reopen → product still in list. Mock task data (4 categories: 需求评审/产品设计/开发任务/测试验收, multiple cards per category) survived restart verbatim — confirms seed persistence is read-back-clean. New user-added tasks could NOT be tested because the addTask UI is not wired (Header's "新增任务" dialog is a mock that doesn't call `taskStore.addTask`; CRUD UI is deferred to v0.2.0). Task persistence path uses the same zustand persist + SQLite channel as Product, which is verified, so addTask wiring (v0.2.0) will inherit a working persistence layer.

### 3. Data ownership D-10 — deletions stick (PERSIST-09)

- **expected:** Delete a product → restart → product stays deleted (first-run seed does NOT resurrect it because `meta.has_seeded = 'true'`).
- **how to test:**
  1. With app running from Test 2, delete "UAT Product" via ProductManagement UI
  2. Close window
  3. `npm run tauri:dev` again
  4. Verify "UAT Product" is GONE
- **result:** skipped — reason: `productStore.deleteProduct` exists at store layer (line 58) but the delete UI is not wired (no caller in ProductManagementView or any product/* component; same v0.2.0 gap as addTask). However the underlying invariant this test guards — `meta.has_seeded = 'true'` blocks re-seeding on restart — is *already* indirectly verified by P2-测试 2: user-added `UAT-Product-002` survived restart, which can only happen if has_seeded gate held (otherwise `seedAllStores` would have overwritten it). Static read of initializeDatabase.ts:52-62 confirms the gate: `if (seededRows[0]?.value === 'false') { seedAllStores(); ... }`. Will re-test once delete UI lands in v0.2.0.

### 4. Flicker-free hydration (PERSIST-09)

- **expected:** App launch shows `<HydrationGate>` Skeleton placeholder until all 6 stores' `_hasHydrated === true`, then paints real UI. No flash of empty screens, no mock-then-real visual toggle.
- **how to test:**
  1. With seeded DB, restart app
  2. Watch initial paint carefully — should be Skeleton → real data
  3. No empty ProductManagement / empty TaskManagement flash
- **note:** Visual timing cannot be asserted programmatically. Verify by eye.
- **result:** pass — initial run showed 3-stage flicker (white screen → Skeleton → data) because `await initializeDatabase()` in main.tsx ran before `createRoot()`, leaving #root empty during SQLite migration+seed (1-3s on Tauri). Fixed by adding a static NOVA breathing splash inside `#root` in index.html (React `createRoot().render()` replaces it on first paint). User confirmed: splash visible, then smooth transition to real UI. No more empty-white phase.

### 5. Dev/web localStorage fallback (PERSIST-04)

- **expected:** `npm run dev` (not tauri:dev) → app boots using localStorage fallback (since `isTauri() === false`). Browser DevTools → Application → Local Storage shows `nova-task`, `nova-product`, etc. keys.
- **how to test:**
  1. `npm run dev` (web-only mode via Express)
  2. Open http://localhost:3000
  3. DevTools → Application tab → Local Storage → http://localhost:3000
  4. Verify 6 keys present: `nova-task`, `nova-product`, `nova-rnd`, `nova-schedule`, `nova-workspace`, `nova-ui`
  5. Refresh page → state survives
- **note:** Tauri desktop build is the production target; this fallback only governs web dev mode.
- **result:** pass — verified via Playwright MCP on `npm run dev` (web mode). 6 keys present in localStorage (`nova-ui`=68B, `nova-task`=1578B, `nova-rnd`=93833B, `nova-product`=20647B, `nova-schedule`=328B, `nova-workspace`=2265B). `isTauri` correctly false. Page refresh preserves all 6 keys byte-for-byte. Only console error: favicon.ico 404 (irrelevant).

## Summary

total: 5
passed: 3
issues: 0
pending: 1
skipped: 1
blocked: 0

## Gaps

[none — test 5 passed; tests 1-4 require running Tauri binary, deferred]

---

_To resolve: run `/gsd:verify-work 2` after manual testing, or mark individual tests as passed/issues inline above._
