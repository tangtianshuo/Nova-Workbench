# Phase 18: Session 数据模型与底座 - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped per autonomous mode)

<domain>
## Phase Boundary

session 成为有持久元数据的一等实体,旧数据无损升级 — 一切多 session 能力的数据基础。交付:migration 0007(sessions 表 + agent_events workspaceId 回填)、sessionRepo、confirmations.ts sessionId 修复、fixture-DB 升级测试。不含运行时切换逻辑(Phase 19)、分支(Phase 20)、列表 UI(Phase 21)。

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Follow RESEARCH.md recommendations (HIGH confidence):
- Migration 0007 单文件包含全部 DDL + 回填(Rust 侧 sqlx 每文件一事务,天然原子)
- workspace_id 列已存在(0002),只补 toolLoop.ts 写入 + SQL 回填
- 回填历史 workspace 经 kv_store json_extract,无需 JS
- Fixture 测试扩展 src/ai/__tests__/sqlSchemaCheckConstraints.test.ts 模式(node:sqlite)
- sessionId 修复在 confirmations.ts 内部(getActiveAgentScope 已带 sessionId),所有 caller 自动覆盖;sessionId 不进 paramsHash
- 新 session 的 sessions row 创建时机:upsert at turn start(最终接线归 Phase 19)
- agent_artifacts workspace scoping:不动(YAGNI)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src-tauri/migrations/ 0002..0006 既有格式与 Rust 侧 Migrator::run 管线
- src/ai/events/eventStore.ts 事件持久层
- src/ai/__tests__/sqlSchemaCheckConstraints.test.ts — fixture-DB 测试的在库先例(node:sqlite DatabaseSync)
- getActiveAgentScope() 已携带 sessionId

### Established Patterns
- 迁移在 Rust 侧经 tauri-plugin-sql 的 sqlx Migrator 执行,每文件一事务
- zustand persist blob 存 kv_store(key='nova-workspace')

### Integration Points
- src/ai/toolLoop.ts:39(workspaceId: null 硬编码)
- confirmations.ts ~152/~217(sessionId: null 硬编码)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description, success criteria, and RESEARCH.md.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
