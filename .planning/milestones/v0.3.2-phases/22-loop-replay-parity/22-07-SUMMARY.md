---
phase: 22-loop-replay-parity
plan: "07"
subsystem: rust-run-engine
tags: [engine, parity, fixtures, replay, permanent-tests]
requires: ["22-04 projection parity fixtures", "22-06 engine wiring (replay surface)"]
provides: ["engine::parity harness (normalize/canonical_string/diff)", "双侧同 fixture 永久 parity 测试", "realdb-sample-1/2 真实 v0.3.x 存量日志 fixture"]
affects: [src-tauri/src/engine/parity.rs, src-tauri/src/engine/chat_session.rs, src/ai/__tests__/parity.rust.test.ts, src/ai/__tests__/fixtures/]
tech-stack:
  added: []
  patterns: ["fixture 单源双侧 glob(projection-cases*/realdb-sample* 自动纳入)", "node:sqlite DatabaseSync readOnly 抽样真实 DB", "canonical JSON diff: BTreeMap 键序 + 时间戳/ID 白名单占位 + null-vs-missing 严格"]
key-files:
  created:
    - src-tauri/src/engine/parity.rs
    - src/ai/__tests__/parity.rust.test.ts
    - src/ai/__tests__/fixtures/realdb-sample-1.json
    - src/ai/__tests__/fixtures/realdb-sample-2.json
  modified:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/chat_session.rs
decisions:
  - "parity.rs 拥有唯一的 fixture 回放测试;chat_session.rs 的 22-04 单例 fixture 测试删除(双份加载器维护成本 > 保留价值)"
  - "真实 DB 抽样走 node:sqlite 只读导出(一次性脚本,跑完即删,不入库);expectedMessages 由真实 TS ChatSession 投影生成"
  - "TS fork 成功路径返回 { events } 不含 invalid 字段 → 断言用 ok(!built.invalid) 而非 equal(null)"
metrics:
  duration: 12m
  completed: 2026-08-24
---

# Phase 22 Plan 07: replay parity 永久测试收口(ENG-03) Summary

**One-liner:** 永久 parity harness 落地 —— parity.rs 实现 22-RESEARCH 规范化五条(canonical 字典序键序、timestamp/createdAt/generatedAt/startedAt/lastEventAt→`<ts>` 与 eventId/artifactId/correlationId/toolCallId/confirmationToken→`<uuid>` 白名单占位、null vs 缺键视为不同、整数 i64、modelText 逐字节),glob 单源遍历 fixtures 目录 11 个用例(9 合成 + 2 真实 v0.3.x nova.db schema v7 抽样:264 events/48 tool pairs/3 compactions 与 42 events/16 pairs/1 compaction);TS 侧 parity.rust.test.ts 用同一批 fixture 跑 ChatSession.fromEvents 投影(12 tests)双侧全绿。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | parity.rs harness + Rust 回放测试(TDD) | 10d6ff0(RED)/ bf50ce0(GREEN) | parity.rs, mod.rs, chat_session.rs |
| 2 | TS 同 fixture 双跑 + 真实 DB 抽样 | aea4a7f | parity.rust.test.ts, fixtures/realdb-sample-{1,2}.json |

## Verification

- `cargo test`(全量): **118 passed / 0 failed / 2 ignored**(116 基线 + 3 parity 测试 − 1 删除的被取代测试)
- `cargo test parity`: 5 passed,含 `parity_projection_cases` 覆盖 **11 个 fixture 用例**(projection-cases 9 + realdb 2)
- `node --test src/ai/__tests__/parity.rust.test.ts`: **12/12 pass**(11 用例逐例 + corpus 形状测试)
- `npm test`(全量): **241/241 pass**(229 基线 + 12)
- `npm run lint`(tsc --noEmit): 通过
- `grep correlationId src-tauri/src/engine/parity.rs` 命中(ID_KEYS 白名单)

## Key Behavior Locks

- 规范化五条全部有专项测试:白名单占位(normalize_replaces_whitelist_keys_with_placeholders,含 modelText 内嵌 JSON 不动)、键序无关 + null-vs-missing 严格(diff_canonicalizes_key_order_and_rejects_null_vs_missing)
- diff 失败输出用例名 + 首个差异路径(`.a.y <missing in expected>` 形态)
- 新语义分支约定已写入双侧测试文件头注释:fixtures/ 加用例,Rust glob + TS 遍历自动纳入
- realdb 样本 expectedMessages 由真实 TS 投影生成 → Rust 逐位匹配即为存量兼容证明;预算取 session_created payload tokenBudget(缺省 8000)

## Deviations from Plan

- **删除 chat_session.rs::projection_cases_parity_fixture**(22-04 遗留):plan 未列出此项,但 parity.rs 的 glob 测试是其严格超集,保留双份 fixture 加载器是纯维护成本。[Rule 3 - 阻塞清理]
- **采样脚本不入库**:plan 未要求提交导出工具;一次性 node:sqlite 只读脚本跑完即删(Rule: YAGNI)。
- 其余无偏差 — plan 执行照写。

## Known Stubs

- 无。

## Self-Check: PASSED

- 文件存在:engine/parity.rs / parity.rust.test.ts / realdb-sample-1.json / realdb-sample-2.json FOUND
- 提交存在:10d6ff0 / bf50ce0 / aea4a7f FOUND
- cargo 118/118、TS 241/241、parity 双侧用例 11 cases 一致
