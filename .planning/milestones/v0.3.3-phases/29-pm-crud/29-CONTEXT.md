# Phase 29: PM CRUD 工具原生化 — agent 写路径 - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

把 task/schedule 的 CRUD 操作原生化为 Rust 引擎工具(task_create/update/complete/delete、schedule_create/update/delete + 两个 search 读工具),按 999.5 D-12 三档风险分级接入既有 HITL 机制,使助手能在对话中真实替用户写任务/日程——「Agent 替你干活」的地基,Phase 30 工作流自组织的执行基础。同期完成 task/schedule 业务数据关系化(kv_store JSON 快照 → SQLite 关系表,单真相源)。

边界:product 不做写工具、不迁关系表(Phase 30 按需再议);不做 subagent/pipeline/Skill;不引入新确认机制(复用 AwaitConfirmation)。

</domain>

<decisions>
## Implementation Decisions

### 数据落点(SC-4 裁定:同期关系化)
- task/schedule 同期迁 SQLite 关系表(migration 建 tasks/schedules 表)——v0.3.2 Key Decision 伏笔「v0.3.3 关系化后原生回归」;引擎直写 kv JSON 快照会与 webview persist 整快照写互相覆盖(丢写),关系表是引擎直写的唯一安全落点
- product 数据不迁:嵌套复杂(documents/skills/milestones),29 工具面聚焦 task/schedule;product 留 kv_store,Phase 30 按需再议
- 旧数据迁移 = 启动一次性搬移(kv JSON → 关系表,按 id 幂等去重),kv key 备份保留不删
- UI 手动 CRUD 同走关系表单真相源:taskStore/scheduleStore 的 persist 快照退役,CRUD 改 SQL 读写——双真相源正是 v0.3.2 桥取消的原因

### 工具面
- 9 工具同构四件套:task_create / task_update / task_complete / task_delete / task_search + schedule_create / schedule_update / schedule_delete / schedule_search
- product 无写工具:selected product 已由 context assembler 注入;product 创建走既有 UI 向导;Phase 30 再议
- 读工具 = 轻量 filter 查询(status/date/projectId 过滤 + 条数截断),学 knowledge_search MAX_ARTICLES=50 防上下文爆炸
- 参数 schema 对齐 TS 既有字段名(title/priority/status/deadline/projectId/date/time),id 服务端生成,不发明新 schema

### 三档风险分级(D-12 直译)
- 读(search)免确认;轻写(create/update/complete,非批量)免确认;删除(task_delete/schedule_delete)走 AwaitConfirmation HITL 卡
- 免确认写无阻塞:tool_result 在 chat 流内显示 diff 摘要(「已创建任务 X」),视图即时刷新;不做 toast/事后撤销
- 批量护栏:单 run 累计免确认写 >5 条 → 后续写升级 HITL(ingest cap-5 先例),防 LLM 失控刷库
- update 不做字段级危险区分:一律轻写档;删除语义只能显式走 delete 工具

### 写后可见性与集成
- 事件驱动 refresh:taskStore/scheduleStore 监听 agent_events 投影中 task_/schedule_ 前缀 tool_result → 从 SQL refresh(既有事件 Channel 已送 tool_result 到 webview)
- 删除确认用单一 candidate kind `pm_write` 覆盖全部删除类(学 ingestion_batch 一 kind 多类型先例):一个 migration + 一套双侧 parity fixture
- 日期/时间保持现状格式:deadline/date 存 YYYY-MM-DD 文本,time 存 HH:mm 文本,零转换
- 收口 UAT 主脚本 = 对话驱动端到端:「建 3 个任务,明天截止,高优先级」→ 免确认直落库、任务页立即可见 →「删掉刚才的任务」→ HITL 卡确认删除 → 重启不丢

### Claude's Discretion
- 关系表具体列设计(在字段名对齐前提下,索引/NOT NULL 细节)
- run 内写计数状态的管理位置(scheduler/loop_runner 侧的实现细节)
- kv → 关系表搬移的具体执行点(migration SQL vs 启动 hook,以幂等为准则)
- task_complete 与 task_update(status=完成)是否合并实现(一个工具别名一个)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/engine/tools.rs` — ToolSpec registry + `ToolOutcome::{Executed, AwaitConfirmation, Failed}` 三态;新工具照此模式加
- `src-tauri/src/engine/confirmations.rs` — create_candidate + params_hash 去重;新 kind = migration + CHECK 扩展(先例 0006/0008/0009/0011)
- `src-tauri/src/engine/ingest.rs` + `commands.rs::consume_ingestion_batch_inner` — 引擎写业务数据/审计事件先例;cap-5 护栏先例
- 事件 Channel(engine_run → webview)— tool_result 投影已有,事件驱动 refresh 挂这里
- migrations 0001-0011 前向序列,0012 起

### Established Patterns
- replay-parity 双侧 fixture 锁语义:新确认 kind / 新事件种类必须 cargo + npm fixture 同步
- 业务数据现状 = kv_store JSON 快照(zustand persist → tauri-plugin-sql,`src/stores/storage/sqliteStorage.ts`);webview 整快照写是引擎直写的并发障碍
- Phase 27 webview applier(ingestionStore.applyDrafts)是「TS 中转写」形态——29 要原生化的正是这一层

### Integration Points
- loop_runner → tools::execute 分发表(tools.rs:353)加 9 个新工具分支
- taskStore/scheduleStore persist 退役 → SQL 读写(adapter 或 actions 重写)
- context assembler(selected product 注入)已有,product 上下文不缺

</code_context>

<specifics>
## Specific Ideas

- 「帮我安排今天」不能变成确认地狱——助手侧低摩擦是产品体验要求(999.5 specifics 原文)
- 产品哲学(用户记忆,2026-09-02):工作流用户自组织,Nova 只给参考+模板,严禁强制流程设计——29 只交付原子 CRUD 工具,不预设工作流编排
- SC-4 原文「是否同期——discuss 裁定」已在 Area 1 裁定:同期迁

</specifics>

<deferred>
## Deferred Ideas

- product CRUD 工具与 product 关系化 — Phase 30 工作流自组织时再议
- 会话级信任开关(三档档案之上)— D-12 明确后续可叠加
- 事后撤销机制(免确认写的一键回滚)— v1 不做
- task 字段级危险区分 — 裁定不做,若日后失控再议

</deferred>
