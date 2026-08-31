---
phase: 22-loop-replay-parity
plan: 10
subsystem: engine-tools
tags: [hitl, params-hash, parity, knowledge-write]
requires: [22-08 productId fallback, 22-09 category enum]
provides: [knowledge_write confirm-chain hash parity (create path)]
affects: [src-tauri/src/engine/tools.rs]
tech-stack:
  added: []
  patterns: [TS-computed SHA-256 constant asserted in Rust (commands.rs:1099 precedent), mirrored in TS test]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/tools.rs
    - src/ai/__tests__/phase14Confirmations.test.ts
decisions:
  - Rust normalizes effective_args into the exact knowledgeParams(resolveDraft) shape at candidate creation — normalized object is a fixed point of TS re-normalization
  - operation computed from Rust knowledge_docs on update path (known dual-store edge, create path locked by constant test)
  - tags pre-card guard mirrors zod array(z.string().min(1)).max(20)
metrics:
  duration: 25m
  completed: 2026-08-31
  tasks: 2
  files: 2
---

# Phase 22 Plan 10: knowledge_write params_hash cross-boundary parity Summary

**One-liner:** Rust `execute_knowledge_write` now normalizes effective_args into the exact TS `knowledgeParams(resolveDraft(...))` 10-field canonical shape (itemId key omitted when absent, summary falls back to content's first 100 chars, operation/author/readTime filled), so candidate `params_hash` and TS consume re-hash live in the same domain — closing UAT Test 7's `params_mismatch` on every confirm.

## What Was Done

### Task 1: Normalize effective_args to the TS knowledgeParams shape (commit 8ff361e)

- Replaced the old "clone raw args + patch productId/category/tags" block in `execute_knowledge_write` with an explicit `json!({...})` construction of the canonical object — no unknown model-arg keys can leak into the hash anymore.
- Fields: productId (arg > ctx, 22-08), operation (created/updated — updated iff itemId exists in `knowledge_docs`, lookup errors treated as not-found), title, category (22-09 enum), tags (validated pre-card: every element a non-empty string, max 20 — mirrors `zod array(z.string().min(1)).max(20)`), content, summary (arg ?? content first 100 chars — was wrongly title-fallback before), author (?? "AI 助手"), readTime (?? "待阅读"). `itemId` key omitted entirely when the model did not provide one (canonical JSON drops undefined).
- Card summary + candidate args + `create_candidate` hash source all use the same normalized value. `operation` in card args is harmless (chatConsoleStore.ts:941 picks only known fields).
- Hash parity locked by a TS-precomputed SHA-256 constant (generated via `npx tsx` against the real `computeParamsHash`), asserted in Rust — commands.rs:1099 memory precedent.
- Tests updated/added: exact-shape (9-key create path, no leftovers), constant parity, explicit-fields-preserved + update/create operation from knowledge_docs, bad-tags pre-card rejection (empty string / non-string / 21 tags), plus all 22-08/22-09 regressions kept passing.

### Task 2: Full gate + TS-side fixed point (commit b677925)

- `cargo test`: 176 passed / 0 failed / 2 ignored. `npm test`: 222 pass / 0 fail. `npm run lint` (tsc): clean.
- Fixed-point sanity confirmed by reading chatConsoleStore.ts:941-951: replay args carry the Rust-normalized summary/author/readTime (all non-empty) + itemId/tags verbatim, no `operation` — resolveDraft's `??` fallbacks never re-trigger, so TS consume re-hashes the identical object.
- Added a minimal TS-side mirror test in phase14Confirmations.test.ts asserting the same SHA-256 constant for the same fixed input — both sides of the boundary now lock the pair. No TS production code touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's "10-field" key-count expectation corrected to 9 on create path**
- **Found during:** Task 1 test run
- **Issue:** The canonical object has 10 fields only when itemId is present; on the create path the key is omitted entirely, so the object has 9 keys.
- **Fix:** Test asserts 9 keys + `itemId` key absent. Plan's interface spec itself was correct ("OMIT the key entirely when absent").

**2. [Rule 3 - Blocking] match-arm type mismatch on tags**
- **Found during:** Task 1 compile
- **Issue:** `list.clone()` (Vec<Value>) vs `json!([])` (Value) in match arms.
- **Fix:** Wrap in `Value::Array(...)`.

## Known Stubs

None.

## Known Edges (deliberate, documented in code)

- Update-path `operation` is computed from Rust `knowledge_docs` at candidate time and from webview `rndStore` at TS replay — if the two stores disagree, hashes drift. Create path (no itemId) is parity-locked by the constant test. `ponytail:` comment names the upgrade path (single source of truth for knowledge tables).
- `content.chars().take(100)` counts Unicode scalars vs JS `slice(0,100)` UTF-16 units — identical for BMP (all Chinese), diverges for astral chars (emoji). `ponytail:` comment in place.
- **Human UAT re-test of Test 7 remains the final gate** (non-blocking for plan completion): card → confirm → replay → 落库 with no `params_mismatch` toast.

## Self-Check: PASSED

- src-tauri/src/engine/tools.rs modified — FOUND
- src/ai/__tests__/phase14Confirmations.test.ts modified — FOUND
- Commits 8ff361e, b677925 — FOUND in git log
