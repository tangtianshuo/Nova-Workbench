# Requirements: Nova-PM-Workspace v0.3.0

**Defined:** 2026-08-14
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)—— v0.3.0 聚焦功能闭环:产品功能为骨架,agent 为血肉

## v1 Requirements

### P0 可恢复执行底座 (EVT)

- [x] **EVT-01**: Agent 运行时每一步(用户消息/模型输出/工具调用/工具结果/审批请求/审批决定)作为事件追加写入 SQLite Agent Event Log,含会话内连续 seq 与 correlation_id
- [x] **EVT-02**: tool_call 与 tool_result 严格成对(复用 harness tool-pairing 算法),缺失或重复可被检测并报告
- [x] **EVT-03**: ChatSession 重构为事件日志的投影(复用 harness surface.ts/deriveEventMessage 纯函数),LLM messages 数组从 session 单一真相派生,消除 toolLoop 双历史分叉
- [x] **EVT-04**: 应用重启后能恢复最近会话(含未完成审批和工具调用关系);孤儿 tool_call 标记为 interrupted,绝不自动重试造成重复业务写入;加载时崩溃尾切到最后一个完整 turn
- [x] **EVT-05**: 确认候选从内存 Map 迁移到 SQLite 持久化表(params_hash = 规范化 JSON 的 SHA-256、过期时间、原子条件 UPDATE 消费),重启后待确认项仍然可用,重复恢复不重复消费
- [x] **EVT-06**: toolCallId 使用 UUID(替代位置计数器),事件可精确回放
- [x] **EVT-07**: 中文 token 估算修复(替代 length/4 的 4-8 倍低估),回放时上下文不溢出
- [x] **EVT-08**: 超长工具结果(>4KB)存入 artifacts 表,模型历史只保留摘要、引用 ID 和必要片段

### P1 可管理长期记忆 (MEM)

- [x] **MEM-01**: 用户通过记忆候选确认流保存长期记忆(识别→候选→去重/冲突检查→用户确认→入库);模型推断只能创建候选,用户明确说"记住"才能直接创建确认候选
- [x] **MEM-02**: 被拒绝的记忆候选永不进入检索结果,且反馈给模型避免重复提出
- [x] **MEM-03**: 记忆候选防轰炸:入队前去重、待确认队列有上限(~20)、候选带过期时间
- [x] **MEM-04**: 知识文档带版本和来源;更新后旧版本仍可审计,检索不返回失效索引
- [x] **MEM-05**: 长期记忆通过 supersedes 链替换(新事实取代旧事实而非覆盖历史),每条记忆保留来源和版本
- [x] **MEM-06**: 用户可通过 FTS5 混合检索搜索知识库(关键词+标签+产品/项目/时间结构过滤),中文 2 字查询(需求/日程)可命中(CJK 字符切分,索引与查询共用同一 helper)
- [x] **MEM-07**: 检索结果带来源元数据(source_type/source_id/version/scope/updated_at),模型收到的每段知识可追溯出处
- [x] **MEM-08**: 每轮请求的上下文按优先级投影组装(业务事实→待确认动作→已确认记忆约束→FTS5 top-k→最近对话),并记录 context_injected 事件以供审计

### 上下文压缩 (CMP)

- [x] **CMP-01**: token 压力达到阈值(≥0.8×上下文窗口)时触发 LLM 摘要压缩,只在工具调用配对平衡处切分,原始事件日志无损
- [x] **CMP-02**: 压缩摘要记录覆盖的事件范围、生成时间和使用的模型;更早会话以带来源摘要形式进入上下文

### PM 生产线 (DELIV)

- [ ] **DELIV-01**: 用户可通过 agent 对话生成 PRD 草稿(generateDeliverable tool,携带当前产品上下文)
- [ ] **DELIV-02**: PRD 草稿经 HITL 确认后可在 MDXEditor 中编辑,再落入研发中心 PRD 交付物卡槽(版本化)
- [ ] **DELIV-03**: 生成的 PRD 带 AI 溯源标记(来源会话/事件、生成时间)
- [ ] **DELIV-04**: PRD 落槽后 FTS5 索引在同一事务内同步更新(单一写 API),检索立即可命中

### Agent 交互升级 (UX)

- [ ] **UX-01**: Agent 工作区(AgentWorkspaceView)真正实现,承载 agent 会话,功能与侧栏 ChatPanel 一致(多 agent 形态留后期规划)
- [ ] **UX-02**: 全局 agent 入口 ⌘K 携带当前视图上下文(选中产品/任务/日程)唤起
- [ ] **UX-03**: 晨报在 Agent 工作区以结构化卡片呈现(今日日程/过期任务/待确认记忆候选),启动触发、每日一次,非 LLM 叙述
- [ ] **UX-04**: 右键菜单提供 3-5 个快捷 AI 动作(@radix-ui/react-context-menu),在可编辑区域(MDXEditor contenteditable)内不劫持原生菜单,触发时快照选区

### 架构文档 (ARCH)

- [ ] **ARCH-01**: docs/ARCHITECTURE.md 重写为「事件日志 + tool loop + FTS5」架构,GraphFlow/Rig/LanceDB 正式出局,docs/AGENT_MEMORY_REFERENCE.md 纳入真相源
- [ ] **ARCH-02**: 相关 ADR 更新(含 deepseek-harness 纯函数复用的 MIT 归属说明),后续里程碑不再引用旧蓝图

## v2 Requirements

### 检索语义增强 (P2)

- **SEM-01**: 本地 embedding 生成与混合检索(向量+关键词)
- **SEM-02**: LanceDB / SQLite-vec 增量索引能力评估(仅作派生索引,永不做事实源)
- **SEM-03**: 会话全文搜索(跨会话 FTS5 查询 UI)

### 生产线扩展

- **DELIV-05**: PRD 端到端跑通后推广到全部 18 种交付物卡槽生成
- **DELIV-06**: 需求→PRD→原型→代码→测试 全自动编排(依赖工作流引擎评估)

### 交互扩展

- **UX-05**: 多会话管理器(恢复历史任意会话,非仅最近一条)
- **UX-06**: inline 视图内 agent 嵌入(任务卡「让 AI 拆解」等)
- **UX-07**: 多 agent 形态(AgentWorkspaceView 演进)
- **UX-08**: OS 原生通知(tauri-plugin-notification)

## Out of Scope

| Feature | Reason |
|---------|--------|
| GraphFlow 工作流引擎 | 正式否决:pre-1.0 crate 风险 + AGENT_MEMORY_REFERENCE §9 不采用其插件树;事件日志+tool loop 取代 |
| LanceDB 向量库作为事实源 | 向量索引只是检索加速层;P2 仅评估其派生索引能力 |
| 静默自动写记忆 | 反功能:ChatGPT 静默记忆是最受抱怨的行为;保存前确认是 Nova 差异化 |
| 业务事实复制为自由文本记忆 | 双真相源反模式(AGENT_MEMORY_REFERENCE §9) |
| inline 视图内 agent 嵌入 | 用户决策移交 v0.4+ |
| 编辑事件日志的 UI | 日志追加后不可静默覆盖,修正通过新事件表达 |
| LLM 叙述式晨报 | 复述 SQLite 已有数据是失败模式;结构化卡片 + 数据查询即可 |
| 多人协作 / 云同步 | 本地优先原则,SQLite 单机足够 |
| 无持久检查点的动态脚本工作流 | AGENT_MEMORY_REFERENCE §9 明确不采用 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EVT-01 | Phase 13 | Complete |
| EVT-02 | Phase 13 | Complete |
| EVT-03 | Phase 13 | Complete |
| EVT-04 | Phase 14 | Complete |
| EVT-05 | Phase 14 | Complete |
| EVT-06 | Phase 13 | Complete |
| EVT-07 | Phase 13 | Complete |
| EVT-08 | Phase 13 | Complete |
| MEM-01 | Phase 15 | Complete |
| MEM-02 | Phase 15 | Complete |
| MEM-03 | Phase 15 | Complete |
| MEM-04 | Phase 15 | Complete |
| MEM-05 | Phase 15 | Complete |
| MEM-06 | Phase 15 | Complete |
| MEM-07 | Phase 15 | Complete |
| MEM-08 | Phase 15 | Complete |
| CMP-01 | Phase 14 | Complete |
| CMP-02 | Phase 14 | Complete |
| DELIV-01 | Phase 16 | Pending |
| DELIV-02 | Phase 16 | Pending |
| DELIV-03 | Phase 16 | Pending |
| DELIV-04 | Phase 16 | Pending |
| UX-01 | Phase 17 | Pending |
| UX-02 | Phase 17 | Pending |
| UX-03 | Phase 17 | Pending |
| UX-04 | Phase 17 | Pending |
| ARCH-01 | Phase 17 | Pending |
| ARCH-02 | Phase 17 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-14*
*Last updated: 2026-08-15 — EVT-03 Complete (Phase 13 Plan 02: ChatSession as event-log projection)*
