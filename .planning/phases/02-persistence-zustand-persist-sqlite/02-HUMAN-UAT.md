---
status: partial
phase: 02-persistence-zustand-persist-sqlite
source: [02-VERIFICATION.md]
started: 2026-08-08T00:00:00Z
updated: 2026-08-08T00:00:00Z
---

# Phase 2: Persistence (Zustand persist + SQLite) — Human UAT

5 items deferred to user UAT per `--auto` mode (all checkpoints auto-approved;
static code-level verification PASSED with 5/5 truths verified).

All code-level checks PASSED. These items require a running Tauri desktop binary
+ human interaction (create/delete data, close window, inspect browser DevTools).

## Current Test

[awaiting human testing — run `npm run tauri:dev` to begin]

## Tests

### 1. First-run seed in Tauri (PERSIST-06 + PERSIST-07)

- **expected:** Delete `nova.db` from app data dir → run `npm run tauri:dev`. App boots, HydrationGate shows Skeleton briefly, then mock data paints: 4-6 products in ProductManagement, 5 local files in FileArchiveView, R&D deliverables per product.
- **how to test:**
  1. Locate SQLite file: Windows `%APPDATA%/com.nova.pm-workspace/nova.db` (or check tauri log for path)
  2. Stop app, delete `nova.db`
  3. `npm run tauri:dev`
  4. Verify mock data visible across all views
  5. Re-close app, re-open → mock data STILL there (has_seeded gate held, no re-seed)
- **result:** [pending]

### 2. Persistence survives restart (PERSIST-01, PERSIST-02, PERSIST-03)

- **expected:** Create a new task in TaskManagement → add a product in ProductManagement → close app window → re-open. Both entries survive verbatim.
- **how to test:**
  1. `npm run tauri:dev`
  2. TaskManagement → add task "UAT test 1"
  3. ProductManagement → Create Product → name "UAT Product"
  4. Close window (TitleBar red X)
  5. `npm run tauri:dev` again
  6. Verify both entries present
- **result:** [pending]

### 3. Data ownership D-10 — deletions stick (PERSIST-09)

- **expected:** Delete a product → restart → product stays deleted (first-run seed does NOT resurrect it because `meta.has_seeded = 'true'`).
- **how to test:**
  1. With app running from Test 2, delete "UAT Product" via ProductManagement UI
  2. Close window
  3. `npm run tauri:dev` again
  4. Verify "UAT Product" is GONE
- **result:** [pending]

### 4. Flicker-free hydration (PERSIST-09)

- **expected:** App launch shows `<HydrationGate>` Skeleton placeholder until all 6 stores' `_hasHydrated === true`, then paints real UI. No flash of empty screens, no mock-then-real visual toggle.
- **how to test:**
  1. With seeded DB, restart app
  2. Watch initial paint carefully — should be Skeleton → real data
  3. No empty ProductManagement / empty TaskManagement flash
- **note:** Visual timing cannot be asserted programmatically. Verify by eye.
- **result:** [pending]

### 5. Dev/web localStorage fallback (PERSIST-04)

- **expected:** `npm run dev` (not tauri:dev) → app boots using localStorage fallback (since `isTauri() === false`). Browser DevTools → Application → Local Storage shows `nova-task`, `nova-product`, etc. keys.
- **how to test:**
  1. `npm run dev` (web-only mode via Express)
  2. Open http://localhost:3000
  3. DevTools → Application tab → Local Storage → http://localhost:3000
  4. Verify 6 keys present: `nova-task`, `nova-product`, `nova-rnd`, `nova-schedule`, `nova-workspace`, `nova-ui`
  5. Refresh page → state survives
- **note:** Tauri desktop build is the production target; this fallback only governs web dev mode.
- **result:** [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

[none yet — populate after running UAT]

---

_To resolve: run `/gsd:verify-work 2` after manual testing, or mark individual tests as passed/issues inline above._
