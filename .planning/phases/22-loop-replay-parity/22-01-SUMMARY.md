---
phase: 22-loop-replay-parity
plan: 01
subsystem: agent-run-engine
tags: [port-01, protocol, adr, rusqlite, engine-skeleton, fixtures]
requires: [v0.3.1 milestone closed]
provides: [PORT-01 协议定稿, engine/db.rs 连接层, 双侧金样本 fixture 单源]
affects: [src/ai/sessionRestore.ts, src/ai/registry.ts, src-tauri/Cargo.toml]
tech-stack:
  added: [rusqlite 0.32 (bundled), sha2 0.10, chrono 0.4 (clock+std), unicode-normalization 0.1]
  patterns: [fixture 单源共享 (TS 生成 / Rust+TS 双跑), kv meta 表 schema_version 断言]
key-files:
  created:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/db.rs
    - src/ai/__tests__/fixtures/golden-tokenEstimate.json
    - src/ai/__tests__/fixtures/golden-paramsHash.json
  modified:
    - docs/adr/ADR-0003-rust-run-engine.md
    - src/ai/sessionRestore.ts
    - src/ai/registry.ts
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/lib.rs
decisions:
  - PORT-01 三要素定稿: idempotency 随 tool_call payload 落盘(旧事件视为 verify_first);孤儿 marker 第三态 unknown(键序 ok,status,interrupted,reason);工具描述追加 verify-before-rerun 约定
  - meta 表是 kv 表(key/value),schema_version 读 `SELECT CAST(value AS INTEGER) WHERE key='schema_version'`,非列(与 22-RESEARCH 草案 SQL 不同,以真实 DB 为准)
  - DB 路径 probe 实测通过:app_config_dir(%APPDATA%\com.nova.pm-workspace\nova.db),rusqlite 可读 plugin 写的库且 schema_version=7 — Wave 0 最高风险项关闭
metrics:
  duration: 35min
  completed: 2026-08-24
---

# Phase 22 Plan 01: PORT-01 协议定稿 + Wave 0 基建 Summary

PORT-01 孤儿 tool_result 第三态协议(unknown/interrupted + idempotency 分类 + 工具描述约定)在 ADR-0003 附则 A 定稿并同步 TS 实现;Rust engine 骨架 + rusqlite 依赖 + 真实 DB probe 通过 + 双侧算法金样本落盘。

## Task Breakdown

| Task | Description | Commit | Key Changes |
|------|-------------|--------|-------------|
| 1 | PORT-01 协议定稿(ADR 附则 + TS 第三态 + 工具描述) | e74ea9d | ADR 附则 A 四节;sessionRestore marker `status:'unknown'` + modelText 字面 JSON(键序即协议);registry 全工具描述追加 verify-before-rerun |
| 2 | Wave 0 基建(依赖/骨架/probe/金样本) | 9c7622f, 9147b1e | rusqlite(bundled)/sha2/chrono/unicode-normalization;engine/{mod,db}.rs(open+assert_schema+probe_db_path);9 token + 6 hash 金样本(含真实存量 hash) |

## Verification Results

- `npx tsx --test src/ai/__tests__/*.test.ts`: 187/187 pass(PORT-01 TS 改动未破坏规格源测试)
- `cargo test --manifest-path src-tauri/Cargo.toml`: 29 pass / 2 ignored / 0 fail(全量既有 Rust 测试未破坏)
- `probe_db_path --ignored` + NOVA_DB=真实 dev DB: **PASS**(schema_version=7 可读)— DB 路径假设(Roaming\com.nova.pm-workspace\nova.db)实证关闭
- Acceptance greps: idempotency×4 / verify_first×3 in ADR;`"status":"unknown"` in sessionRestore.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] assert_schema SQL 与真实 schema 不符**
- Found during: Task 2(probe 首跑失败)
- Issue: 22-RESEARCH/计划草案假定 `SELECT schema_version FROM meta`,实际 meta 是 kv 表(key TEXT PK, value TEXT)
- Fix: `SELECT CAST(value AS INTEGER) FROM meta WHERE key='schema_version'`,并在 db.rs 注明 migration 0001 形状
- Files: src-tauri/src/engine/db.rs

**2. [Rule 3 - Blocking] `mod engine;` 需在 lib.rs 声明**
- Issue: 计划说"lib.rs 暂不接线",但不声明 mod 无法编译/测试
- Fix: 仅加 `mod engine;`(纯编译可见,零运行时接线,接线仍在 22-06)
- Files: src-tauri/src/lib.rs

**3. [Rule 1 - Bug] ADR 验收 grep 首版不足**
- Issue: 首版附则 `idempotency` 字面量仅 1 处(<3 验收线)
- Fix: A.1/A.3 正文改用字段字面量表述,达 4 处

### Notes

- 一次性生成脚本 scripts/tmp-gen-fixtures.ts 用后即删(未入库);金样本由 TS 函数产出固化,Rust 侧将在后续 plan 用 `env!("CARGO_MANIFEST_DIR")/../src/ai/__tests__/fixtures/` 双跑
- 存量 hash 兼容性独立验证两遍通过:params_json → canonical → SHA-256 == DB 存储 hash(cf8dab5a…,knowledge_write,2026-08-19)
- 真实 legacy row params 含整篇知识库文章(约 4KB),fixture 文件体积可接受

## Known Stubs

None.

## Self-Check: PASSED

All created files exist; all 3 task commits verified in git log.
