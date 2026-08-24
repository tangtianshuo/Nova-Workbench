# ADR-0003: Agent 核心迁 Rust Run Engine — webview 退化为投影 + HITL UI

> Status: Proposed(草案,随 v0.3.2 Phase 22 启动生效;Phase 25 收口时转 Accepted)
> Date: 2026-08-23
> Phase: v0.3.2(Phase 22-25)
> Supersedes: ADR-0001 中「agent 运行时驻留 TS 侧」单一条款;ADR-0001 其余决定(事件日志真相源 / FTS5 / HITL 队列 / 零 sidecar)不变

## Context

ADR-0001(2026-08-17)判定 agent 运行时驻留 TS 侧(`src/ai/`),Rust 职责收缩为壳层(llm.rs / keychain / SQL 迁移)。该判定在当时的条件下成立:**当时 Rig 对 LLM 调用层无增量价值**,且 TS 运行时尚未验证。

v0.3.0 + v0.3.1 之后条件已经变化:

1. **TS 运行时已完成产品线路验证**——事件日志、配对不变量、HITL 确认队列、崩溃恢复、压缩、fork、多 session,217/217 测试,语义可信且被 replay parity 永久测试锁定。
2. **出现三类只有 Rust 常驻引擎才能满足的需求**(用户 2026-08-23 确认):
   - 长时间运行的 agent run 需要**后台持续执行**(不被 webview 刷新/关闭打断)
   - **多 session 并行运行**(切换会话不停止其他会话的 run)
   - 后续 **IM / MCP / Skill 系统**需要丝滑接入——三者本质是 run engine 的新入口与新工具源,引擎只有一份才不用重复接线

TS 运行时的历史任务已经完成:它验证了语义,而语义是可移植的(真相源在 SQLite,不在 TS 内存)。

## Decision

**Agent 核心迁入 Rust 常驻 run engine;webview 退化为投影 + HITL UI。**

### 目标架构

```
┌─────────────────────────── Rust 进程(常驻)───────────────────────────┐
│  Run Engine                                                             │
│  ├─ 调度器:多 run 并行,run 状态机(running / 等确认 / done / cancelled)│
│  ├─ agent loop(toolLoop / compaction / contextAssembler 语义移植)      │
│  ├─ 工具注册表:内置工具 │ MCP 动态工具(未来)│ Skill 允许工具集(未来)  │
│  ├─ 事件日志唯一写者(rusqlite 直写 agent_* 表)                          │
│  └─ llm.rs(保留,provider-agnostic)                                    │
│  入口层(触发 run):webview 对话 │ IM(未来)│ 定时(未来)│ Pipeline(未来)│
└────────────┬────────────────────────────────────────────────────────────┘
             │ Channel/emit(流式 token、事件、待确认推送)
┌────────────▼─────────────┐
│  webview:投影 + HITL UI   │
└──────────────────────────┘
```

「一个引擎,多个门」:IM 是新入口,MCP 是新工具源,Skill 是 prompt+工具集 manifest——引擎只有一份,后续接入不动架构。

### 具体裁定

1. **状态归属不变**:事件日志仍是唯一真相源,ChatSession 仍是投影,可重建。迁移是"按同一 schema 重新实现 loop",不是重新设计。
2. **双写者规则**:Rust 立即接管 `agent_*` 全部表(agent_events / agent_artifacts / agent_confirmation_candidates / memory_candidates);业务表(产品/任务/日程)过渡期 TS 写、Rust 只读(contextAssembly 本来只读);Rust 工具需要写业务数据时走 Rust command 写 SQLite + emit 事件刷新 TS store;**同表双写绝对禁止**。
3. **工具移植次序**:先搬无头 run 需要的(exec / fs / knowledge 检索 / deliverable);PM CRUD 工具经「TS 工具桥」过渡(Rust loop 经 IPC 回调 TS 工具,仅 webview 存活时可用,无头 run 限制工具集)。桥是过渡态,不得活过两个版本。
4. **后台运行 = 托盘常驻**(hide-on-close + tray),不是独立守护进程、不做进程间通信。
5. **验收标准 = 事件日志回放平价**:Rust 引擎逐位回放 v0.3.x 存量日志,投影与 TS 引擎一致;TS 纯函数(fork.ts / compaction)与 217 个测试是移植的可执行规格,fixture 直接复用。
6. **HITL 跨边界**:确认队列持久化 + 原子条件 UPDATE 消费的语义原样保留,webview 只是确认 UI 的宿主。

### 物料决策(不引入项与依据)

| 依赖 | 裁定 | 依据 |
|------|------|------|
| rig-core / rig-agent | **不采用** | 只供给 loop 骨架 + provider(引擎最廉价部分);AgentRun 自带状态机与事件日志真相源相克(双记账);AgentHook 是进程内钩子,弱于现有持久化确认队列;调度器/事件日志/HITL/入口层/exec 全不供;pre-1.0 单作者风险进心脏(ADR-0001 论据在依赖位置恶化场景下加倍) |
| GraphFlow(调度) | **不采用** | subAgent 本质是工具调用(spawn → 子 run → 父 loop await),拓扑由 LLM 运行时决定,与静态预定义 StateGraph 相克;SqliteSaver 与 agent_events 双记账;自写调度器 ≈ 数百行 tokio(run 注册表 + spawn/await + cancel 传播 + 并发上限) |
| oh-my-pi | **借模式,不引依赖** | exec/进程组/超时/取消/流式输出设计;MIT 许可,归属先例见 ADR-0002 |
| llm.rs | **原地保留** | 已经生产 tool-call UAT 验证 |

### 协议决策(引擎动手前定稿)

**孤儿 exec 第三态**:崩溃发生在「命令已发出」与「tool_result 已落盘」之间时,恢复后该 tool_result 呈 `unknown/interrupted`(非 error——命令可能已成功);命令幂等分类(可重跑 / 须先验证)随 tool_call 落盘;模型收到 unknown 的约定动作是先验证(git status / ls)再决定重跑。引擎搬家时改协议最贵,要改趁现在。

## 附则 A:孤儿 tool_result 第三态与幂等分类协议(PORT-01,2026-08-24 定稿)

引擎动手前锁定的恢复协议。三要素:

### A.1 幂等分类随 tool_call 落盘

tool_call 事件 payload 新增字段 `idempotency: 'rerunnable' | 'verify_first'`:
- 由工具注册时声明(每个工具一个静态 `idempotency` 分类),随 tool_call 事件 payload_json 落盘,**不建单独表**。
- 旧事件(无 `idempotency` 字段)读取侧一律视为 `verify_first`(保守默认:恢复后先验证再决定重跑)。
- Phase 22 无 exec 实体工具,字段与协议先落;Phase 23 exec 工具注册时填真值。

### A.2 孤儿 tool_result 第三态(unknown / interrupted)

崩溃发生在「命令已发出」与「tool_result 已落盘」之间时,恢复追加的 marker:

- payload:`{ok:false, interrupted:true, status:'unknown', reason:'app-restart', modelText:...}`
- modelText:`[tool_result <name>] {"ok":false,"status":"unknown","interrupted":true,"reason":"app restarted before tool completion"}` —— 键序即此序(`ok` 不再单独承载语义;`status:"unknown"` 区别于 error,模型不得假定命令失败:命令可能已执行成功,也可能未执行)。
- TS 侧 sessionRestore.ts 同步实现(双侧 parity;一行级别 diff)。

### A.3 工具描述约定

工具 description 生成模板追加一句:「若 tool_result 状态为 unknown,先验证(如查看文件/状态)再决定是否重跑;verify_first 类命令禁止未验证直接重跑」。落在 registry 的 schema 生成处(Phase 22 生效,Phase 23 exec 工具注册 `idempotency` 分类时受益)。

### A.4 Phase 22 工具集边界(orchestrator 裁决)

PM CRUD 工具(createTask/scheduleCrud 等)在 Phase 22 期间从模型 schema 消失(TOOL-04 降级先例:能力降级一个 phase 优于提前引入 TS 工具桥);Phase 23 经 TS 桥恢复。Phase 22 的 Rust 工具注册表只含 Rust 侧可执行的工具(候选类 + knowledge 检索)。

## Consequences

- **对 ADR-0001**:仅「agent 运行时驻留 TS 侧」条款被取代;其否决 Rig/GraphFlow 的结论**不变且被本 ADR 重申**(否决理由从"当时无增量"演化为"供给错位")。
- **TS 侧资产去向**:TS toolLoop 在 Phase 25 下线;纯函数与测试作为规格消费后归档;webview 侧保留投影、HITL UI、编辑器。
- **subAgent / IM / MCP / Skill**:本里程碑不实现,仅由调度器结构与入口层预留扩展位(subAgent = spawn 工具 + 父子 correlation_id,结构已支持)。
- **PIPELINE_DESIGN.md / ARCHITECTURE.md**:Phase 25 时更新为引擎分层;多步 Pipeline(DELIV-06)仍按 ADR-0001 路径——事件日志检查点语义评估,pipeline ≈ 编排 run 依次 spawn 阶段 run + 确认队列当门。
- **风险**:引擎移植期间存在双引擎并存窗口,以 replay parity 测试与逐 phase 切换收窄;v0.3.1 遗留 3 项人工 UAT 需在 Phase 22 执行前收口。
