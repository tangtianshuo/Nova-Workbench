# Phase 23: 工具层(原生工具集,无桥) - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust 引擎可调用首批原生工具(exec/fs/knowledge/deliverable),全部 Rust 原生执行、不依赖 webview 存活;PM CRUD 工具缺席于模型 schema 但有明确降级提示;两个 carry-in TS 写接缝(deliverable_committed / consumeIntoMemories)迁移到 Rust 唯一写者。

边界:**不含** TS 工具桥(已取消)、多 run 调度器与托盘(Phase 24)、TS loop 删除(Phase 25)、业务数据关系化与 PM CRUD 原生回归(v0.3.3 正主)。

</domain>

<decisions>
## Implementation Decisions

### 无桥决策(用户 2026-08-24,推翻 ADR-0003 原物料决策 #3)
- **TS 工具桥整体取消**。根因:业务数据(task/schedule/product/rnd)是 kv_store 里的整库 JSON 快照(zustand persist → sqliteStorage),非关系表 — Rust 原生写不可行,桥是"建即拆"的过渡架构(v0.3.3 业务数据关系化后即废)
- **PM CRUD 工具持续缺席**(Phase 22 起从模型 schema 消失),v0.3.3 关系化迁移后以 Rust 原生工具直接回归
- **代价已被接受**:v0.3.2 期间 agent 建不了任务/日程;系统提示须含降级说明,模型引导用户手动操作
- ADR-0003 具体裁定 #3 与附则 A.4 已修订(2026-08-24 注记);REQUIREMENTS TOOL-03/04 已重定义

### exec 工具白名单(用户选定:安全只读白名单 + HITL 学习)
- 内置只读安全命令默认放行(git status/diff/log、ls、cat 等约 10 条,精确清单 researcher/planner 定)
- 白名单外命令一律 HITL 确认卡;确认时可选「仅本次允许」或「永久加入白名单」(持久化到 DB kv_store)
- 不建设置页编辑 UI(Deferred)

### fs 工具边界(用户选定:workspace 内读自由/写 HITL,越界拒绝)
- 路径解析以 workspace 为根,复用 file_ops.rs 既有路径安全先例
- workspace 内:读自由、写走 HITL(与 knowledge_write 候选语义一致)
- workspace 外路径:直接 error 拒绝(不给 HITL 选项)

### deliverable 生成工具形态(用户选定:生成原生 + 落槽走 webview 确认动作)
- 生成 = Rust 原生:调 llm.rs 复刻 generateDeliverable prompt 语义,返回候选走 HITL
- 落槽 = webview 用户确认动作:确认后 TS 写 rndStore 卡槽(业务表过渡期 TS 写,合法),agent_events 落库走 Rust command — 与 carry-in 接缝同一模式(不是桥:方向为 TS 用户动作 → Rust command)
- 无头 run 可生成不可落槽(落槽本身是 HITL 用户动作,天然如此)

### 无头 run(继承无桥决策,TOOL-04 简化)
- 全部工具 Rust 原生,无头 run 与有头 run 工具集一致,无可用性差异
- exec/fs 不依赖 webview 存活(Phase 24 后台 run 的前置)

### 系统提示指南块(22-05 deferred 项的落地方式调整)
- 原计划恢复 Phase 10 PM 工具指南块 — 无桥后改为:**适配版指南块**,描述现有原生工具 + CRUD 缺席降级说明(引导用户手动建任务/日程);原 PM CRUD 指南文本待 v0.3.3 工具回归时恢复

### 已锁定的前置决策(不重开)
- PORT-01:exec 工具注册时 idempotency 分类填真值(rerunnable/verify_first);工具描述带 verify-before-rerun 后缀(tools.rs PORT_01_SUFFIX 已字节锁定)
- 两个 carry-in 接缝必须迁移(22-VERIFICATION SC-3 缺口):① chatConsoleStore appendAuxEvent('deliverable_committed') → engine command;② memoryStore consumeIntoMemories → engine command(engine_consume_memory 风格)
- exec 确认后重执行走 engine_append_tool_result 既有接缝(22-06 已建,fresh tool_call_id + [confirmed rerun] 协议已测试锁定)

### Claude's Discretion
- 白名单精确命令清单、HITL 永久加入的 kv key 结构
- exec 进程管理实现(Windows Job Object vs taskkill /T 等价方案,researcher 定)
- 工具注册表扩展方式(ToolSpec enum 扩展 vs trait 对象)
- deliverable 生成的 prompt 复刻细节与候选 payload 形状

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 架构决策
- `docs/adr/ADR-0003-rust-run-engine.md` — 具体裁定 #3(修订版:桥取消)+ 附则 A(协议/幂等/工具集边界)
- `.planning/ROADMAP.md` Phase 23 section — 重定义后的 goal + 5 success criteria
- `.planning/REQUIREMENTS.md` TOOL-01..04 — 重定义后的需求文本

### 上游验证缺口(carry-in 依据)
- `.planning/phases/22-loop-replay-parity/22-VERIFICATION.md` — SC-3 PARTIAL 详情:两接缝 TS 直写证据(file:line)

### v0.3.3 衔接
- `.planning/research/RND-ROLLOUT-V0.3-V0.4.md` §3 — PM CRUD 原生回归的归属里程碑与关系化迁移计划

### 语义规格源(TS 侧,保留到 Phase 25)
- `src/ai/tools/generateDeliverable.ts` — deliverable 生成 prompt/候选语义
- `src/ai/registry.ts` — zod→JSON schema 生成 + executeTool 模式(schema 形状参照)
- `src/stores/chatConsoleStore.ts:713-715,786` — 两个 carry-in 接缝现状
- `src/ai/memoryStore.ts:675` — consumeIntoMemories 写路径

### Rust 侧既有先例
- `src-tauri/src/engine/tools.rs` — ToolSpec/registry/idempotency/PORT_01_SUFFIX 模式(22-05)
- `src-tauri/src/file_ops.rs` — 路径安全先例(workspace 根解析)
- `src-tauri/src/engine/commands.rs` — engine_* command 模式 + run 注册表 + append_tool_result 协议
- `src-tauri/src/llm.rs` — Llm trait(22-05 注入点)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/tools.rs` ToolSpec + registry() 静态注册 — 四类新工具直接扩展此模式
- `engine/confirmations.rs` 候选/原子消费 — exec/fs 写确认复用
- `file_ops.rs` workspace 根路径安全 — fs 工具直接复用
- `engine/commands.rs` engine_append_tool_result — exec HITL 确认后重执行零新增
- `llm.rs` Llm trait — deliverable 生成调用点
- kv_store(sqliteStorage 同库)— 白名单持久化落点

### Established Patterns
- 工具描述 = TS registry.ts 文本 + PORT_01_SUFFIX;idempotency 随 tool_call 落盘
- HITL 候选流:候选落库 → webview 卡片 → 原子条件 UPDATE 恰一消费 → 确认后重执行/落库
- Tauri command + Channel 流式(llm.rs / engine_run 先例)— exec stdout/stderr 流式回传同构

### Integration Points
- `engine/loop_runner.rs` 工具分发点(tools.rs execute) — 新工具接入处
- `chatConsoleStore.ts` 确认卡片流 — exec/fs 写确认 + 白名单「永久加入」选项 UI
- 系统提示组装 `context_assembler.rs` — 指南块 + 降级说明插入点

</code_context>

<specifics>
## Specific Ideas

- 用户对桥的原始顾虑:"这增加了不少架构复杂度,能否 rust 原生直接进行数据操作" — 最终选择 B(不建桥推迟 v0.3.3),宁可接受 v0.3.2 能力缺席也不要过渡架构
- exec 白名单 HITL 学习语义:确认卡上「永久加入白名单」是用户对 agent 的渐进授权,持久化到 kv_store

</specifics>

<deferred>
## Deferred Ideas

- 白名单设置页编辑 UI — v0.3.3 顺手做(本 phase 用 HITL 学习替代)
- PM CRUD Rust 原生工具 — v0.3.3 正主(业务数据关系化迁移后)
- 原 Phase 10 PM 工具指南文本恢复 — v0.3.3 PM CRUD 回归时

</deferred>

---

*Phase: 23-tools-native*
*Context gathered: 2026-08-24*
