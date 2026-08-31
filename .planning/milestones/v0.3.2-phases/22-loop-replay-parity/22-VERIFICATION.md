---
phase: 22-loop-replay-parity
verified: 2026-08-31T00:00:00Z
status: passed
score: 2/2 must-haves verified (code level; Test 7 UAT re-test routed to human)
re_verification:
  previous_status: passed
  previous_score: 6/6 (22-09 round)
  gaps_closed:
    - "22-10: knowledge_write params_mismatch on every confirm — Rust effective_args normalized to TS knowledgeParams(resolveDraft) canonical shape, hash domains unified, locked by bidirectional SHA-256 constant test"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "UAT Test 7 re-test: knowledge_write card -> confirm -> replay -> 落库"
    expected: "no params_mismatch toast; knowledge row written; reject path leaves no orphan"
    why_human: "cross-boundary HITL confirm chain needs real LLM + built desktop app; code-level parity is locked by constant tests on both sides"
traceability_notes:
  - "22-10 frontmatter lists requirement PARITY-KW-HASH — this ID does NOT exist in REQUIREMENTS.md (it is a gap-closure tracking label, not a v1 requirement). All 6 official Phase 22 IDs (ENG-01..05, PORT-01) are accounted for. No orphaned official requirements."
---

# Phase 22: 引擎核心 Verification Report (re-verification round 3 — after 22-10)

**Phase Goal:** 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity)— Rust 接管 agent loop 与 agent_* 唯一写者,ChatPanel 打通,验收 = 事件日志逐位回放平价
**Verified:** 2026-08-31
**Status:** passed (code level; 1 manual UAT re-test pending, non-blocking)
**Re-verification:** Yes — after 22-08, 22-09, and 22-10 gap closures

## 22-10 Gap Closure Verification

### Observable Truths (22-10 must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | knowledge_write 卡片出现 → 确认 → 重放落库成功(无 params_mismatch) | ✓ VERIFIED (structural) | tools.rs:457-472 explicit `json!({...})` normalization with `// 22-10: TS parity boundary` comment; 9-key create-path shape (itemId key omitted when absent, tools.rs:~478), operation from `knowledge_docs` lookup (:426-435), summary = content first 100 chars (:467, was wrongly title-fallback), author/readTime defaults (:471-472). Hash parity locked BIDIRECTIONALLY: Rust test asserts `292fee04f1f110cf2c58fd244a2e1c4435582b9085bb4f6d8b986f1fc792eb4e` (tools.rs:871, test `knowledge_write_params_hash_matches_ts_create_path_constant`) and TS mirror test asserts the SAME constant via real `computeParamsHash` (phase14Confirmations.test.ts:34-45). Rust candidate hash and TS consume re-hash now live in the same domain. End-to-end toast behavior = human UAT. |
| 2 | 拒绝路径不受影响(无孤儿事件) | ✓ VERIFIED | Invalid-category pre-card rejection preserved (22-09 regression tests still in suite); tags pre-card guard added (empty string / non-string / >20 → Failed{arg_error}, tools.rs:437+); `cargo test` 176/0 failed includes all reject-path tests; create_candidate remains the sole candidate writer. |

**Score:** 2/2

### Artifact Verification

| Artifact | Status | Details |
|----------|--------|---------|
| `src-tauri/src/engine/tools.rs` | ✓ VERIFIED | Exists; substantive (normalization block + tests :857-924); wired (execute_knowledge_write in live tool registry); contains required marker "TS parity boundary" (:457). No raw-args clone remains in hash path. |
| `src/ai/__tests__/phase14Confirmations.test.ts` | ✓ VERIFIED | TS mirror constant test added (:26-45); no TS production code touched (git show 8ff361e touches only tools.rs + test module; b677925 touches only the TS test). |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| tools.rs create_candidate | confirmations.ts consumeKnowledgeWriteConfirmation | params_hash over identical canonical object | ✓ WIRED — same SHA-256 constant asserted on both sides of the boundary (Rust tools.rs:871, TS phase14Confirmations.test.ts:45); fixed point holds: replay args carry normalized summary/author/readTime (non-empty) so resolveDraft `??` fallbacks never re-trigger; `operation` excluded from zod replay args (chatConsoleStore picks known fields only). |

### Known Edges (documented, not gaps)

- Update-path `operation`: Rust knowledge_docs vs webview rndStore dual source — `ponytail:` comment at tools.rs:426 names the ceiling; create path (no itemId) is parity-locked.
- `chars().take(100)` vs JS UTF-16 `slice(0,100)`: identical for BMP/Chinese, diverges on astral emoji — `ponytail:` comment at tools.rs:468.

## Regression Suite (re-run this verification)

- `cargo test`: **176 passed / 0 failed / 2 ignored** ✓
- `npm test`: **222 pass / 0 fail** ✓
- `npm run lint` (tsc --noEmit): **exit 0** ✓

## Prior Must-Have Regression (quick pass)

- MAX_ITERATIONS=8 + Chinese wrap-up, knowledge prompt budget, engineRun sole path, 22-08 productId fallback, 22-09 category enum + tags default, PORT-01 third-state, ENG-05 restore — all covered by the green full suites above; no parity fixtures changed in 22-10 (diff confined to tools.rs + one TS test file).

## Requirements Coverage

| REQ | Source Plans | Status | Evidence |
|-----|-------------|--------|----------|
| ENG-01 | 22-01..06 | SATISFIED | engineRun sole runtime; TS loop deleted (Phase 25) |
| ENG-02 | 22-01..06, 22-08..09 | SATISFIED | event_log sole writer; TS seams removed |
| ENG-03 | 22-03..07 | SATISFIED | bilateral parity tests green (incl. new params-hash constant pair) |
| ENG-04 | 22-03..06, 22-08..10 | SATISFIED (code) | candidate/hash/confirm chain now structurally sound end-to-end; final E2E = human UAT |
| ENG-05 | 22-07 | SATISFIED | restore idempotence tests green |
| PORT-01 | 22-01 | SATISFIED | unchanged, tests green |

**Traceability observation:** plan 22-10 declares `PARITY-KW-HASH`, which does not exist in REQUIREMENTS.md. It is a gap-closure label for an ENG-04 sub-defect, not an orphaned official requirement. No action required; noted for the audit trail.

## Anti-Patterns Found

None blocking. Raw-args-clone-into-hash (the actual 22-10 bug class) is structurally eliminated — the normalized object is constructed field-by-field, so unknown model keys cannot leak into the hash.

## Human Verification Required (non-blocking)

### 1. UAT Test 7 re-test — knowledge_write confirm chain
**Test:** 选中产品,让 agent 写知识库 → 卡片 → 确认
**Expected:** 落库成功,无 params_mismatch toast;拒绝 → 无孤儿
**Why human:** 需真实 LLM + built app 的跨边界确认流;代码级 parity 已被双侧常量测试锁定

### Gaps Summary

No gaps. 22-10 closes the third and final round of the knowledge_write hash-domain bug class (productId → category → params shape). All gates green (176 cargo / 222 TS / lint clean). Phase 22 goal achieved at code level; milestone close awaits the human UAT re-test of Test 7.

---

_Verified: 2026-08-31_
_Verifier: Claude (gsd-verifier)_
_Previous reports preserved in git history (22-08 and 22-09 re-verifications)._
