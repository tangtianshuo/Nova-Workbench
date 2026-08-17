# Phase 13: Event Log 底座 + ToolLoop 重构 - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Agent 运行时的每一步都作为不可变事件落入 SQLite,LLM messages 从单一真相派生 — 后续一切记忆/恢复/审计能力的基础。

覆盖需求:EVT-01, EVT-02, EVT-03, EVT-06, EVT-07, EVT-08。

明确不在本 phase:确认候选持久化(EVT-05,Phase 14)、会话恢复(EVT-04,Phase 14)、上下文压缩(CMP-*,Phase 14)、记忆/知识/FTS5(Phase 15)。确认流在本 phase 保持内存 Map 不动,隔离最高风险重构。

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Locked by Research(v0.3.0 调研与 roadmap 已定,不得重开)
- **事件日志在 JS 侧**经 `tauri-plugin-sql` 写 SQLite;DDL 放 Rust 前向迁移文件(`src-tauri/migrations/0002_agent_events.sql`);`llm.rs` 不动。
- **ChatSession 改为事件日志的投影**:保留类与 API;`addMessage` 同时追加事件(按会话串行 promise 链);提供 `ChatSession.fromEvents()` 重建;toolLoop 不再维护第二份 messages 数组 — LLM messages 从 session 单一派生(消除双历史分叉)。
- **tool_call ↔ tool_result 严格成对**(复用 harness tool-pairing 思路),invariant checker 可检测缺失/重复并报告(不静默通过)。
- **toolCallId 用 UUID**(替代现状位置计数器 `${iteration}-${name}-${count}`)。
- **seq 在 SQL 侧分配**,`UNIQUE(session_id, seq)`;启用 `PRAGMA journal_mode = WAL`。
- **事件类型与字段**按 docs/AGENT_MEMORY_REFERENCE.md §3:event_id/session_id/seq/event_type/created_at/workspace_id/product_id/project_id/correlation_id/payload_json;本 phase 至少落地 session_created/user_message/assistant_message/tool_call/tool_result/turn_ended(审批与记忆类事件由后续 phase 追加)。
- **超长工具结果(>4KB)存 artifacts 表**,模型历史只留摘要 + 引用 ID + 必要片段(替代现状 `JSON.stringify(...).slice(0, 2000)` 盲切)。
- **中文 token 估算修复**(替代 `length/4` 的 4-8 倍低估),回放不溢出。
- **replay parity 为永久测试**:同一会话回放两次派生的 LLM messages 完全一致;`0bbc3f2` trace-color 测试是回归金丝雀。
- **日志追加后不可静默覆盖**,修正通过新事件表达。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/chatSession.ts`(137 行)— ChatSession 类,turn 分组 + token budget 裁剪;本 phase 重构核心。
- `src/ai/toolLoop.ts`(169 行)— runToolLoop 双历史现场;callbacks 接口(onToken/onToolStart/onToolEnd/onConfirmationRequired)保持不变,ChatPanel 依赖。
- `src/ai/confirmations.ts` — ConfirmationRequiredError + 内存候选 Map,本 phase 不动。
- `src/ai/registry.ts` — executeTool/ToolArgError/toolsToSchemas,事件写入的挂载点。
- `src/ai/__tests__/` — 已有测试目录(沿用其 runner/约定)。
- `src-tauri/migrations/0001_init.sql` — 迁移约定:forward-only additive、永不 DROP、幂等 seed。
- `tauri-plugin-sql` 已在依赖中(业务 store 持久化已走它)。

### Established Patterns
- DB 写入在 TypeScript 侧(tauri-plugin-sql),Rust 只管迁移 DDL 与 LLM provider。
- 工具结果现状经 `stringifyResult` 盲切 2000 字符;toolLoop 内 `[tool_result name]`/`[tool_error name]` 前缀拼进 user role。
- 前端组件模式见 .planning/codebase/CONVENTIONS.md(zustand 直连、cn()、Radix)。

### Integration Points
- `runToolLoop` 调用方:ChatPanel 与 ⌘K palette(接口签名不变是硬约束)。
- 迁移注册点:`src-tauri/src/lib.rs`(0001 的加载方式即 0002 的模式)。
- 事件写入需按会话串行化,避免并发写乱 seq。

</code_context>

<specifics>
## Specific Ideas

- docs/AGENT_MEMORY_REFERENCE.md 是 v0.3.0 架构真相源(§3 Event Log、§6 投影与压缩、§9 不采用清单)。
- docs/DSSH_INSIGHTS.md 记录 DeepSeek Harness 借鉴结论(只抄设计不引入框架;纯函数复用需 MIT 归属说明,归 Phase 17 文档)。
- .planning/research/SUMMARY.md 含四路调研收敛结论与 pitfalls top 5(双执行/replay 分叉/中文分词等)。

</specifics>

<deferred>
## Deferred Ideas

- 确认候选持久化 + 会话恢复 + 孤儿 tool_call interrupted 语义 → Phase 14
- 上下文压缩(token 阈值触发、配对平衡切分)→ Phase 14
- context_injected 审计事件、记忆候选事件 → Phase 15(依赖记忆层)
- 业务 store 变更与 agent 事件的关联 ID 全面打通 → 视 Phase 14/15 需要

</deferred>
