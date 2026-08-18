# Requirements: Nova-PM-Workspace v0.3.1 多 Session 会话体系

**Defined:** 2026-08-18
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)

## v1 Requirements

### 会话数据模型与运行时 (SESS)

- [x] **SESS-01**: sessions 元数据表落地(workspace_id/title/parent_session_id/fork_cut_seq/created_at/last_active_at),migration 0007 含历史会话幂等回填,fixture DB 升级测试保证旧数据不丢失、历史会话不消失
- [ ] **SESS-02**: 用户进入应用时默认获得新 session,工作区为上次退出时选择的工作区(activeWorkspaceId 持久化)
- [x] **SESS-03**: 用户可切换 session,切换后该会话完整历史投影恢复(与原会话逐字一致)
- [ ] **SESS-04**: streaming 进行中 session 切换与工作区切换被锁定(禁用入口 + 守卫),防止事件串流
- [x] **SESS-05**: pending 确认卡片(知识写入/删除确认/PRD 草稿)按 session 过滤,不跨会话串卡;修复 confirmations.ts 现有 sessionId:null stamp 缺失
- [x] **SESS-06**: agent_events 事件 scope 记录 workspaceId 并回填历史(列表过滤的数据基础)

### 最近任务列表 (LIST)

- [ ] **LIST-01**: Agent 页「最近任务」显示真实 session 列表(标题 + 相对时间 + 消息数),按当前工作区过滤,按最近活动倒序
- [ ] **LIST-02**: 用户点击列表项即恢复该 session 到对话区
- [ ] **LIST-03**: 分支 session 在列表中显示分支徽章,可识别其来源会话

### 分支与卡片操作 (FORK)

- [ ] **FORK-01**: 用户鼠标聚焦 assistant 消息卡片时,卡片下方浮出分支 icon 与复制 icon
- [ ] **FORK-02**: 用户点击分支 icon 后,以该卡片所在 turn 的 turn_ended 为切点创建新 session(引用式 fork:parent 事件前缀投影 + 零事件复制),UI 跳转新 session,原会话保持不动
- [ ] **FORK-03**: 用户点击复制 icon 后,该 assistant 消息全文写入系统剪贴板

### 快捷助手 (QUICK)

- [ ] **QUICK-01**: Ctrl+Shift+K 打开的 ChatPanel 头部提供工作区与 session 两个下拉框
- [ ] **QUICK-02**: 工作区下拉切换后,session 下拉联动过滤为该工作区的会话
- [ ] **QUICK-03**: Ctrl+K 保持现状(无选择器的纯净快速对话,行为不变)

### 自动命名 (TITLE)

- [ ] **TITLE-01**: session 首个 turn 完成后 LLM 自动生成标题(fire-and-forget),失败回退首条用户消息截断
- [ ] **TITLE-02**: 标题生成后静默更新列表显示,不打断用户;异步回来时按 sessionId 守卫,不写错会话

## v2 Requirements

### 会话管理增强

- **SESS2-01**: 用户可手动重命名 session(Claude Desktop 社区痛点,但 LLM 命名 + 截断回退已够用)
- **SESS2-02**: 用户可删除 session(含事件日志的墓碑语义设计)
- **SESS2-03**: 用户可固定/置顶 session(工作区过滤已承担 scoping 职责)
- **SESS2-04**: 分支树可视化(线性列表 + 徽章已满足识别需求)
- **SESS2-05**: 编辑历史用户消息产生隐式分支(Cursor classic 模式,复杂度高且有 UX 歧义)

### 隔离增强

- **ISO-01**: 跨工作区严格隔离(记忆/知识库按工作区过滤) — 当前为列表过滤级,记忆保持全局共享

## Out of Scope

| Feature | Reason |
|---------|--------|
| Session 手动重命名/删除/置顶 | 用户圈定排除;LLM 命名 + 回退链已覆盖命名需求 |
| 分支树/图谱可视化 | 无主流产品做好;线性列表 + 分支徽章已可识别 |
| 编辑消息产生分支 | Cursor classic 模式复杂度高,hover fork 已覆盖核心场景 |
| Streaming 后台化(切走后续流) | 多活跃 session 运行时复杂度大;可比产品均串行生成 |
| 跨工作区 strict 隔离 | 用户锁定列表过滤级;记忆/知识库保持全局 |
| 定时任务 tab 真实化 | 保持 mock,不在本里程碑范围 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 18 | Complete |
| SESS-06 | Phase 18 | Complete |
| SESS-02 | Phase 19 | Pending |
| SESS-03 | Phase 19 | Complete |
| SESS-04 | Phase 19 | Pending |
| SESS-05 | Phase 19 | Complete |
| FORK-01 | Phase 20 | Pending |
| FORK-02 | Phase 20 | Pending |
| FORK-03 | Phase 20 | Pending |
| LIST-03 | Phase 20 | Pending |
| LIST-01 | Phase 21 | Pending |
| LIST-02 | Phase 21 | Pending |
| QUICK-01 | Phase 21 | Pending |
| QUICK-02 | Phase 21 | Pending |
| QUICK-03 | Phase 21 | Pending |
| TITLE-01 | Phase 21 | Pending |
| TITLE-02 | Phase 21 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16 (Phase 18: 2, Phase 19: 4, Phase 20: 4, Phase 21: 7)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-18*
*Last updated: 2026-08-18 — roadmap created (Phases 18-21)*
