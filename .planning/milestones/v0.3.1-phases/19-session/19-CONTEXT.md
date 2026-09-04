# Phase 19: 多 Session 运行时 - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss — 推荐方案已按用户指示自动采纳(无需逐项确认)

<domain>
## Phase Boundary

用户可以在多个 session 之间安全切换,会话历史逐字恢复,流式中不串话。交付:activeSessionId 运行时状态、restoreSession(sessionId?) 参数化(移除 sessions[0] 假设)、启动默认新 session、streaming 切换守卫(UI 禁用 + store 兜底)、pending 卡片按 session 过滤。不含:分支创建(Phase 20)、列表 UI/选择器/自动命名(Phase 21)。

</domain>

<decisions>
## Implementation Decisions

### Session 生命周期与切换状态
- activeSessionId 存 chatConsoleStore(内存 state,不持久化)— 启动总是新 session(SESS-02),持久化无意义
- 保留 sessionRef.current 单例(17-UI-SPEC locked);switchSession 原子替换 sessionRef.current + 同步 activeSessionId + setActiveAgentScope 自然随 turn 重设。不做多实例 Map 缓存(复杂度不值)
- 启动默认:新建 ChatSession(不落库,首个 turn 的 upsert 才持久化 — 与 Phase 18 upsert-at-turn-start 一致);activeWorkspaceId 已持久化(zustand persist 'nova-workspace',无需新增工作)
- streamingResponseRef/streamingTraceRef 模块级缓冲保留,靠"streaming 中禁止切换"守卫防串话,不做多缓冲隔离

### restoreSession(sessionId?) 设计
- restoreLatestSession → restoreSession(sessionId?):无参保持现行为(崩溃恢复启动路径兼容);有参恢复指定 session;dedupe promise cache 改为 per-sessionId
- sessions[0] 假设(P-B)移除:显式按 sessionId 查询;有参路径同样走 orphan settlement + crash tail cut(复用既有结算逻辑)
- 逐字一致:fromEvents 投影复用;扩展 phase14SessionRestore.test.ts 断言切换恢复后 messages 与原会话逐字一致(replay parity 模式)

### Streaming 守卫
- 双层守卫:UI 入口禁用(loading 时 disabled 态)+ store action 内部守卫(switchSession / setActiveWorkspaceId 在 loading 时 early-return 失败结果,兜底不依赖 UI)
- 工作区切换 = 结束当前 session 进入新 session(新工作区新会话;列表按工作区过滤是 Phase 21 消费)
- 守卫返回可观察结果({ success: false, reason }),不静默吞

### Pending 卡片 session 过滤
- 读取路径加 sessionId 过滤:listPendingKnowledgeWrites / listPendingDestructiveActions / listPendingDeliverableDrafts / memory listPending 全部按 activeSessionId 过滤
- 类型修复:KnowledgeWriteCandidate / DestructiveActionCandidate 暴露 sessionId 字段(行数据已有,candidateFromRow 不再丢弃);DeliverableDraftCandidate 已有
- 切换动作后刷新全部 pending 卡片(refreshMemoryCards 等)

### Claude's Discretion
具体函数签名、测试文件组织、守卫错误消息文案。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- ChatSession.fromEvents(events, { sessionId, tokenBudget })(chatSession.ts:293)— 投影重建,compaction-aware,不再发射事件
- resumeEventEmission()(chatSession.ts:153)
- findCrashTailCutSeq / findOrphanToolCallEvents(sessionRestore.ts:29/40)
- getSessionRepo()(sessionRepo.ts,Phase 18)+ sessions 表(session_id, workspace_id, title, title_source, parent_session_id, fork_cut_seq, created_at, last_active_at — 无 updated_at)
- setActiveAgentScope / getActiveAgentScope(agentScope.ts)— toolLoop.ts:119 每 turn 重设
- setEventScopeProvider(toolLoop.ts:41-45)workspaceId stamping

### Established Patterns
- sessionRef 单例:chatConsoleStore.ts:75(module-level,{ current: new ChatSession({ tokenBudget: 8_000 }) })
- restore() dedupe:chatConsoleStore.ts:187 + module restorePromise(L80)
- loading flag:submit 置 true(L239)/ finally 置 false(L310)— streaming 判据
- activeWorkspaceId 持久化已就绪:workspaceStore.ts persist('nova-workspace', partialize 含 activeWorkspaceId, L199-213)

### Integration Points
- sessionRestore.ts:73 `const latest = sessions[0]`(P-B,待移除)
- confirmations.ts:279/284/418 listPending* 无 sessionId 参数;candidateFromRow/destructiveFromRow 丢弃 sessionId
- chatConsoleStore pendingConfirmation/pendingDestructiveAction/pendingMemory/pendingPrdDraft 各持队列头 pending[0],未 session-scoped
- setActiveWorkspaceId(workspaceStore.ts:139)无 streaming 守卫

### 测试基线
src/ai/__tests__/:phase13ChatSessionProjection / phase13ReplayParity / phase14SessionRestore / phase14Integration / phase14Confirmations / phase18SessionRepo / phase18MigrationUpgrade / sessionSummaryProjection — 扩展 phase14SessionRestore(restoreSession)与 phase14Confirmations(sessionId 过滤)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — 推荐方案按 PROJECT.md key decisions(列表过滤级隔离,记忆/知识库保持全局 — 即只有 pending 卡片与会话历史按 session 隔离,知识库/记忆库本体仍全局)。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
