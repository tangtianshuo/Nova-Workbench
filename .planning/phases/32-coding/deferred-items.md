# Phase 32 — Deferred / Out-of-scope items

## 2026-09-04 (32-01, out of scope — pre-existing)

- `engine::tools::tests::workflow_crud_via_tools_three_tiers` fails on clean
  HEAD (b900be2^): `workflow_search {"query":"周末"}` returns count=2, expected
  1 — a builtin template matches the query alongside the just-created user
  template. Verified pre-existing via `git stash` + rerun. Not caused by 32-01
  changes. Fix belongs to a workflow_search matching pass (likely builtin
  「周末扫描」-style catalog entry vs test expectation drift).
- Disk pressure: `src-tauri/target` had grown to 40G (D: at 0.7G free).
  `target/debug/incremental` (6G) deleted during 32-01; `deps` still ~29G of
  stale artifacts — a `cargo clean` before the next release build is advisable.
