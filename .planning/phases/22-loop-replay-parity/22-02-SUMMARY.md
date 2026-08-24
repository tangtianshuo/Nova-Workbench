---
phase: 22-loop-replay-parity
plan: "02"
subsystem: rust-engine
tags: [parity, token-estimate, fts, params-hash, golden-tests]
requires: ["22-01"]
provides: ["estimate_tokens", "fts_tokens", "fts_match_string", "canonical_json", "params_hash"]
affects: []
tech-stack:
  added: []
  patterns: ["golden fixture locking via CARGO_MANIFEST_DIR concat"]
key-files:
  created:
    - src-tauri/src/engine/token_estimate.rs
    - src-tauri/src/engine/fts_tokens.rs
    - src-tauri/src/engine/params_hash.rs
  modified:
    - src-tauri/src/engine/mod.rs
decisions:
  - "estimate_tokens 按 UTF-16 code unit 迭代 — TS regex 实际下界是 U+8C48(非注释声称的 F900),surrogate halves 落入 8C48..=FAFF 算 CJK(emoji 两半各计 1),这是金样本锁定的行为,不可『修复』"
  - "fts_tokens 顺序 = 先全部 latin 词再 CJK 逐字(TS [...words, ...cjk] 展开序),dedup keep-first"
  - "canonical_json 依赖 serde_json 默认 BTreeMap 键序(= TS sort());勿启用 preserve_order"
metrics:
  duration: 25m
  completed: 2026-08-24
  tasks: 2
  files: 4
---

# Phase 22 Plan 02: 算法基石逐位复刻 Summary

三个 parity 底座算法函数移植 Rust 并用 22-01 金样本逐位锁定:estimate_tokens(UTF-16 CJK 感知估算)、fts_tokens/fts_match_string(CJK 切分 + FTS5 安全 match 串)、params_hash(canonical JSON + SHA-256 小写 hex)。cargo test 40 通过 0 失败,含真实存量 hash cf8dab5a 例。

## Tasks Completed

| Task | Name | Commit | Key Files |
| ---- | ---- | ------ | --------- |
| 1 | token_estimate.rs + fts_tokens.rs 逐位复刻 | 60cf2c5 | src-tauri/src/engine/token_estimate.rs, fts_tokens.rs, mod.rs |
| 2 | params_hash.rs(canonical JSON + SHA-256) | 65fb31a | src-tauri/src/engine/params_hash.rs, mod.rs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] plan 中 CJK range 规格(F900..FAFF)与 TS 实际实现不符**
- **Found during:** Task 1
- **Issue:** plan/TS 注释声称 range 是 U+F900..FAFF,但 TS 源码实际下界是 U+8C48(豈),使 8C48..=FAFF 吞掉全部 UTF-16 surrogate halves(D800-DFFF)—— emoji 两个代理半各计 1 个 CJK token(金样本 "crown 👑 emoji"=5 的唯一解释)
- **Fix:** Rust 按 UTF-16 code unit 迭代并复刻 8C48..=FAFF 实际区间;代码注释明确标注不可"修复"
- **Files modified:** src-tauri/src/engine/token_estimate.rs
- **Commit:** 60cf2c5

**2. [Rule 1 - Bug] fts_tokens 单遍扫描输出顺序与 TS 不一致**
- **Found during:** Task 1 测试 RED
- **Issue:** 单遍扫描产生 interleaved 顺序 ["hello","世","界","abc"],TS 是 [...words, ...cjk] = words 全部在前
- **Fix:** 改两遍:先 latin 词后 CJK 逐字,统一 dedup keep-first
- **Files modified:** src-tauri/src/engine/fts_tokens.rs
- **Commit:** 60cf2c5

TDD 说明:测试与实现同 commit(金样本 fixture 即 RED 规格,首次运行为 RED→修复→GREEN);未拆独立 test commit。

## Verification

- `cargo test` 全绿:40 passed / 0 failed(全 crate)
- golden-tokenEstimate.json 9 例全断言通过;golden-paramsHash.json 6 例全通过(含存量 cf8dab5a)
- fts_tokens 行为用例 + NFKC 全角用例 + 键序无关断言通过

## Self-Check: PASSED
