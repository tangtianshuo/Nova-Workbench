# ROADMAP: Nova-PM-Workspace v0.3.0 — 功能闭环

**Milestone:** v0.3.0 功能闭环 — Agent 为血肉,产品为骨架
**Created:** 2026-08-14
**Granularity:** Coarse (5 phases — upper edge, justified by dependency chain from research)
**Previous milestone:** v0.2.0 ended at Phase 12; v0.3.0 continues from Phase 13

**Goal:** 打通三条主循环(PM 工作流 / Agent 操作 / 第二大脑),以「事件日志 + 增强 tool loop + SQLite FTS5」为新架构真相源,把 agent 从侧边工具升级为有记忆、可恢复、可追责的一等执行者。

## Phases

- [ ] **Phase 13: Event Log 底座 + ToolLoop 重构** — Agent 每一步落入 SQLite 事件日志,ChatSession 成为投影,消除双历史分叉
- [ ] **Phase 14: 持久化确认 + 会话恢复 + 上下文压缩** — 重启后待确认项与最近会话可用,孤儿 tool_call 绝不重复执行,超长历史按配对边界摘要
- [ ] **Phase 15: 长期记忆 + 知识文档 + FTS5 检索** — 记忆候选确认流、版本化知识文档、中文可命中的 FTS5 混合检索、按优先级投影组装上下文
- [ ] **Phase 16: PRD 生产线** — agent 生成 PRD → HITL 确认 → MDXEditor 编辑 → 版本化落入研发中心卡槽,索引同事务更新
- [ ] **Phase 17: Agent UX + 架构文档** — Agent 工作区落地、⌘K 携带视图上下文、结构化晨报、右键快捷 AI 动作、ARCHITECTURE.md + ADR 重写

## Phase Details

### Phase 13: Event Log 底座 + ToolLoop 重构
**Goal**: Agent 运行时的每一步都作为不可变事件落入 SQLite,LLM messages 从单一真相派生 — 后续一切记忆/恢复/审计能力的基础
**Depends on**: Nothing (first phase of v0.3.0)
**Requirements**: EVT-01, EVT-02, EVT-03, EVT-06, EVT-07, EVT-08
**Success Criteria** (what must be TRUE):
  1. 一次含工具调用的对话结束后,`agent_events` 表中可见完整的配对事件序列(用户消息→模型输出→tool_call→tool_result),每条含会话内连续 seq 与 correlation_id
  2. 故意制造一条缺失 tool_result 的事件流,invariant checker 能检测并报告(不静默通过)
  3. ChatPanel 展示的消息与发送给 LLM 的 messages 数组来自同一次派生 — toolLoop 中不再存在第二份历史(旧双历史 bug 消失)
  4. 同一会话回放两次,派生出的 LLM messages 完全一致(replay parity 测试通过);中文上下文 token 估算不再溢出(4-8 倍低估已修复)
  5. 超过 4KB 的工具结果在模型历史中只出现摘要 + 引用 ID,完整内容可在 artifacts 表查到
**Plans**: TBD

### Phase 14: 持久化确认 + 会话恢复 + 上下文压缩
**Goal**: 应用崩溃或重启后,agent 的执行状态(待确认项、最近会话、未完成工具调用关系)可恢复且不会重复执行 — 可恢复执行底座闭环
**Depends on**: Phase 13
**Requirements**: EVT-04, EVT-05, CMP-01, CMP-02
**Success Criteria** (what must be TRUE):
  1. 杀进程重启后,重启前挂起的待确认项仍然出现在确认队列中;确认一次后再次重启,该项已被消费不再出现(原子条件 UPDATE 生效)
  2. 崩溃发生在 tool_call 与 tool_result 之间时,重启恢复的会话中该 tool_call 标记为 interrupted,业务数据无重复写入(崩溃恢复 UAT 通过)
  3. 恢复的会话可继续对话,历史上下文完整;崩溃尾部被切到最后一个完整 turn,不出现残缺消息
  4. token 压力 ≥0.8×窗口时触发摘要压缩;压缩只发生在工具调用配对平衡处,`agent_events` 原始事件无任何丢失;压缩摘要带事件范围/生成时间/模型记录
**Plans**: TBD

### Phase 15: 长期记忆 + 知识文档 + FTS5 检索
**Goal**: PM 拥有可管理的第二大脑 — 记忆需确认才入库、知识带版本与来源、中文关键词可命中、上下文按优先级投影注入
**Depends on**: Phase 14
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06, MEM-07, MEM-08
**Success Criteria** (what must be TRUE):
  1. 用户对模型推断的记忆候选点击确认后记忆入库;被拒绝的候选在任何后续检索结果中永不出现,且模型不再重复提出同一候选
  2. 待确认队列永不轰炸:同一记忆只入队一次,队列超过 ~20 上限时旧候选过期让位(防轰炸三项:去重/上限/过期全部可观察)
  3. 用户在知识库搜索"需求"或"日程"等 2 字中文词能命中目标文档;可叠加标签/产品/时间过滤;检索结果展示来源(文档/版本/时间)
  4. 知识文档更新后旧版本仍可审计;被 supersede 的旧记忆不再进入检索,但历史链完整保留
  5. 每轮对话注入的上下文按优先级组装(业务事实→待确认→已确认记忆→FTS5 top-k→最近对话),且每次注入留有 context_injected 事件可审计
**Plans**: TBD
**UI hint**: yes

### Phase 16: PRD 生产线
**Goal**: PM 工作流主循环闭环 — agent 生成 PRD 草稿,人确认并编辑,版本化落入研发中心对应卡槽,索引立即可检索
**Depends on**: Phase 15
**Requirements**: DELIV-01, DELIV-02, DELIV-03, DELIV-04
**Success Criteria** (what must be TRUE):
  1. 用户在 agent 对话中说"给当前产品生成 PRD",收到携带当前产品上下文的 PRD 草稿(generateDeliverable tool)
  2. PRD 草稿经 HITL 确认 → MDXEditor 编辑 → 落入研发中心 PRD 交付物卡槽,全程无手动复制粘贴
  3. 落槽的 PRD 带 AI 溯源标记(来源会话/事件、生成时间),在研发中心可查看
  4. PRD 落槽后立即在知识库检索命中(FTS5 索引与文档写入同一事务,无 stale index 窗口)
**Plans**: TBD
**UI hint**: yes

### Phase 17: Agent UX + 架构文档
**Goal**: Agent 成为一等入口 — 工作区视图落地、⌘K 携带上下文、晨报主动建议、右键快捷动作;架构文档与新真相源对齐
**Depends on**: Phase 15
**Requirements**: UX-01, UX-02, UX-03, UX-04, ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. AgentWorkspaceView 真实可用:承载 agent 会话,功能与 ChatPanel 一致(多 agent 形态不在本期)
  2. 在产品/任务/日程视图按 ⌘K,唤起的 agent 已携带当前选中产品/任务/日程上下文
  3. 每日首次启动时 Agent 工作区呈现结构化晨报卡片(今日日程/过期任务/待确认记忆候选),同一天不重复出现;内容来自数据查询而非 LLM 叙述
  4. 在任务/知识库等区域右键可见 3-5 个快捷 AI 动作;在 MDXEditor 可编辑区域内不劫持原生菜单,动作触发时携带选区快照
  5. docs/ARCHITECTURE.md 描述「事件日志 + tool loop + FTS5」架构,GraphFlow/Rig/LanceDB 正式出局,ADR 含 harness 复用 MIT 归属,后续里程碑无旧蓝图引用
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Event Log 底座 + ToolLoop 重构 | 0/? | Not started | - |
| 14. 持久化确认 + 会话恢复 + 上下文压缩 | 0/? | Not started | - |
| 15. 长期记忆 + 知识文档 + FTS5 检索 | 0/? | Not started | - |
| 16. PRD 生产线 | 0/? | Not started | - |
| 17. Agent UX + 架构文档 | 0/? | Not started | - |

## Coverage

| Category | Requirements | Phase |
|----------|--------------|-------|
| EVT (8) | EVT-01, EVT-02, EVT-03, EVT-06, EVT-07, EVT-08 | 13 |
| EVT (8) | EVT-04, EVT-05 | 14 |
| CMP (2) | CMP-01, CMP-02 | 14 |
| MEM (8) | MEM-01..08 | 15 |
| DELIV (4) | DELIV-01..04 | 16 |
| UX + ARCH (6) | UX-01..04, ARCH-01..02 | 17 |

**28/28 v1 requirements mapped, no orphans, no duplicates.**

## Research Flags

- Phase 15 needs `/gsd:research-phase` — FTS5 runtime probe (`CREATE VIRTUAL TABLE fts5_probe`) at hour one on the packaged build + CJK tokenizer decision (char-split vs trigram+LIKE)
- Phases 13, 14, 16, 17: standard patterns, no research needed

## Notes

- 5 phases (upper edge of coarse) follows the research-validated dependency chain: event log → confirmations/restore → memory/FTS5 → deliverable line → UX+docs. Phase 16 and 17 can run in parallel after 15.
- Phase 13/14 split mirrors research recommendation: isolate the riskiest refactor (toolLoop → event log) from state persistence changes.
- v0.2.0 Phase 7 的 35 步人工回归 (release sign-off suggestion) folds into Phase 17 execution as a checkpoint, not a separate phase.

## Backlog

### Phase 999.1: 工作区先行的产品入驻（文档 → 产品 → AI 摄取） (BACKLOG)

**Goal:** [Captured for future planning] 用户已有 PRD 等产品文档,以工作区(本地文件夹)为起点入驻:从工作区派生产品(反向创建 + 自动关联 projectId),AI 摄取文档 → 分类进知识库 → 抽取任务/日程草稿 → 批量 HITL 确认。这是 v0.3.0 三个技术投资(事件日志/FTS5/记忆)的用户可见收口叙事。
**依赖:** Phase 13-15(事件日志 + toolLoop 底座、FTS5 + 记忆)落地后再排期
**已知缺口:**
1. 文档摄取 — docx/pdf → 文本解析(Rust 侧,零 sidecar),当前仅有文件列表 + 手工 contentSnippet
2. 摄取编排 — 扫描工作区 → 逐文档分类 → 抽取任务/日程草稿 → 批量 HITL 确认的 pipeline(执行器 `ai/tools/` 的 task/schedule/knowledgeWrite 已就绪)
3. 反向创建入口 — "从工作区创建产品"向导(读文件夹 → AI 猜产品名/定位 → 建产品 + 自动挂 projectId)
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)
