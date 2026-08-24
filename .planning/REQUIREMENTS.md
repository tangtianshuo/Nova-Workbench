# Requirements: Nova-PM-Workspace — v0.3.2 Rust Run Engine

**Defined:** 2026-08-23
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Milestone:** v0.3.2 — agent 核心迁 Rust 常驻 run engine,webview 退化为投影 + HITL UI(决策见 `docs/adr/ADR-0003-rust-run-engine.md`)

## v1 Requirements

### 引擎核心 (ENG)

- [x] **ENG-01**: 用户在现有 ChatPanel 发起对话,由 Rust 引擎完成整轮 agent loop(意图→工具调用→配对落库→回复流式呈现),全程不经 TS toolLoop
- [x] **ENG-02**: Rust 引擎是 agent_* 表(agent_events / agent_artifacts / agent_confirmation_candidates / memory_candidates)唯一写者;TS 写路径下线后重启无孤儿事件、无重复写入
- [x] **ENG-03**: replay parity — Rust 引擎逐位回放 v0.3.x 存量事件日志,ChatSession 投影与 TS 引擎输出一致(fixture 复用,永久测试锁定)
- [x] **ENG-04**: HITL 跨边界 — 确认候选由 Rust 落库并推送 webview,卡片确认/取消/编辑流语义与现状一致,原子消费保持(并发恰一成功)
- [x] **ENG-05**: 崩溃恢复语义保持 — Rust 引擎启动时尾切不完整 turn、孤儿 tool_call 标记 interrupted 且绝不重执行,行为与 v0.3.x 一致

### 工具层 (TOOL)

- [x] **TOOL-01**: Rust 工具注册表落地(静态注册 + schema),首批 exec / fs 读写 / knowledge 检索 / deliverable 生成四类工具可被引擎调用
- [x] **TOOL-02**: exec 工具具备进程组清理、超时、取消与 stdout/stderr 流式回传,受命令白名单约束(白名单外命令须 HITL 确认;进程管理模式借 omp 设计)
- [x] **TOOL-03**: PM CRUD 工具本里程碑缺席(无桥决策 2026-08-24:业务数据为 kv_store JSON 快照,桥为建即拆的过渡架构)— 模型对 CRUD 能力缺失有明确感知与降级提示;v0.3.3 业务数据关系化后以 Rust 原生工具回归
- [x] **TOOL-04**: 无头 run(webview 不可用)与有头 run 工具集一致(全 Rust 原生,无桥即无可用性差异);exec/fs 工具不依赖 webview 存活

### 多 run 与后台 (SCHED)

- [ ] **SCHED-01**: 用户可在两个 session 同时发起对话,两个 run 并行流式输出,事件与确认卡片互不串扰
- [ ] **SCHED-02**: 用户关闭窗口(hide-on-close + 托盘常驻)后 run 继续执行;重新打开窗口时运行中状态与历史投影完整一致
- [ ] **SCHED-03**: 后台 run 完成或等待确认时,用户收到托盘通知/角标,可一键回到对应 session
- [ ] **SCHED-04**: 用户可取消运行中的 run(含后台 run),取消后子进程清理、事件日志状态一致

### 迁移收口 (PORT)

- [x] **PORT-01**: 孤儿 exec 第三态协议落地 — 崩溃恢复后未配对的 exec tool_result 呈 unknown/interrupted(非 error);命令幂等分类随 tool_call 落盘;模型对 unknown 先验证再重跑(工具描述/提示词约定)
- [ ] **PORT-02**: TS toolLoop 与双引擎并存代码删除,全量测试通过;agent 语义回归(对话/工具/HITL/恢复/压缩)无退化
- [ ] **PORT-03**: ADR-0003 转 Accepted;ARCHITECTURE.md 更新引擎分层;CLAUDE.md 同步

## v2 Requirements

### 多 Agent 编排 (SUBAGENT)

- **SUB-01**: 编排 agent 经 spawn 工具创建子 agent run(父子 correlation_id + 父 loop await 子结果 + 取消传播)— **v0.4.0**(ADR-0004)

### 新入口/新工具源 (ENTRY)

- **ENTRY-01**: IM 入口 — 外部 IM 消息触发 run 并回复(无头)— **v0.5+**(2026-08-24 归位)
- **ENTRY-02**: MCP client(rmcp)— 第三方工具动态注册进 Rust 工具注册表,外部写入默认 HITL — **v0.5+**(2026-08-24 归位)
- **ENTRY-03**: Skill manifest — prompt 模板 + 允许工具集 + 产出卡槽,FTS5 按需加载 — **v0.4.0**(与 999.4 数据化协同)

### Pipeline (PIPE)

- **PIPE-01**: 多步全自动 pipeline(DELIV-06)— 事件日志检查点语义评估,编排 run 依次 spawn 阶段 run + 确认队列当门 — **v0.4.0**(门 = 默认带 + 会话级跳过开关)

## Out of Scope

| Feature | Reason |
|---------|--------|
| rig-core / rig-agent / GraphFlow 依赖 | ADR-0003 物料决策否决(供给错位 + AgentRun/SqliteSaver 与事件日志双记账 + pre-1.0 风险进心脏) |
| 独立守护进程 / daemon | 后台 = 托盘常驻(hide-on-close),不做进程间通信 |
| 业务表(产品/任务/日程)Rust 直写 | 过渡期 TS 写、Rust 只读;同表双写绝对禁止(ADR-0003 双写者规则);关系化迁移归 v0.3.3 |
| subAgent / IM / MCP / Skill 实现 | 留 v0.4+;本里程碑仅由调度器结构与入口层预留扩展位 |
| 向量检索 P2(embedding/LanceDB/vec) | 维持 ADR-0001 边界:FTS5 先行,向量只作派生索引候选评估 |
| TS 工具桥 | 整体取消(2026-08-24 用户决策)— 业务数据 kv_store JSON 快照,桥期内无法原生写;不建即拆的过渡架构 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 22 | Complete |
| ENG-02 | Phase 22 | Complete |
| ENG-03 | Phase 22 | Complete |
| ENG-04 | Phase 22 | Complete |
| ENG-05 | Phase 22 | Complete |
| PORT-01 | Phase 22 | Complete |
| TOOL-01 | Phase 23 | Complete |
| TOOL-02 | Phase 23 | Complete |
| TOOL-03 | Phase 23 | Complete |
| TOOL-04 | Phase 23 | Complete |
| SCHED-01 | Phase 24 | Pending |
| SCHED-02 | Phase 24 | Pending |
| SCHED-03 | Phase 24 | Pending |
| SCHED-04 | Phase 24 | Pending |
| PORT-02 | Phase 25 | Pending |
| PORT-03 | Phase 25 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-23*
*Last updated: 2026-08-24 — TOOL-03/04 重定义:TS 工具桥取消(用户决策),PM CRUD 推迟 v0.3.3 原生回归*
