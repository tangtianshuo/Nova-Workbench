# Phase 20: 分支与卡片操作 - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss — 推荐方案已按用户指示自动采纳(无需逐项确认)

<domain>
## Phase Boundary

用户可以从任意 assistant 消息创建引用式分支并一键复制消息。交付:buildForkEventStream 纯函数(测试先行)+ resolveSessionEvents 投影融合(restore/compaction 双接线)+ hover 分支/复制操作 + 复制 toast + fork 元数据与来源徽章(数据层 + in-console 徽章;列表徽章 UI 归 Phase 21)。不含:session 列表 UI、选择器、自动命名(Phase 21)。

</domain>

<decisions>
## Implementation Decisions

### Fork 语义(引用式,PROJECT.md 已锁定 + RESEARCH 裁决)
- 子会话零复制父事件:子会话自身 agent_events 从 seq 1 开始;融合在投影期完成
- buildForkEventStream(parentPrefix, childEvents, cutSeq):前缀 seq 1..cut 恒等映射;子事件 +cut 偏移。compaction remap 两规则:coveredSeq 字段在前缀事件 = 恒等,在子事件 = +prefix.length
- resolveSessionEvents 接线两处:sessionRestore.ts:96(漏接 → switchSession(child) not_found)与 compaction.ts:130(漏接 → 子压缩把父历史挤出 LLM 上下文)
- fork 时向子会话追加 session_forked 标记事件(≥1 行、溯源审计、投影忽略)
- 切点规则:目标 assistant_message seq 之后第一个 turn_ended;前置 checkEventStream 干净前缀;mid-turn/不平衡拒绝并给出类型化 reason

### UI 交互(ROADMAP criteria 锁定)
- hover assistant 消息卡片时卡片下方浮出 分支 + 复制 icon(Phosphor GitBranch / Copy,duotone)
- 渲染点单一:AgentConsole.tsx:136 消息卡片
- 消息→事件定位:有序内容匹配 zip(store-only ack 消息如"已取消本次知识库写入"无事件支撑,不匹配 → 不显示分支 icon,复制仍可用)
- 分支成功 → switchSession(新 session id)跳转;原会话保持不动
- 复制:navigator.clipboard(库内 8 处先例),失败 toast(useToast),不静默;packaged-build 剪贴板为 UAT 项

### 徽章(LIST-03 拆分)
- Phase 20 交付:fork 元数据(parent_session_id + fork_cut_seq 已在 sessions 表)+ sessionRepo 可查 parent 标题;in-console 来源徽章
- Phase 21 消费:列表徽章 UI

### Claude's Discretion
sessionRepo.getSession 放置位置(约 10 LOC)、测试文件组织、icon 尺寸/动效细节(遵循既有 hover 模式)。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- checkEventStream 配对不变量(events 层);findCrashTailCutSeq / findOrphanToolCallEvents(sessionRestore.ts)
- ChatSession.fromEvents(compaction-aware 投影);switchSession(chatConsoleStore,Phase 19)
- getSessionRepo() + sessions 表(parent_session_id, fork_cut_seq 就绪)
- useToast();Phosphor icons;既有 hover 模式(motion whileHover)

### Established Patterns
- agent_events 键:session_id + seq;correlation_id turn 配对
- 测试:node:test(tsx --test),先 RED 后 GREEN(TDD,Phase 18/19 已践行)
- 单一渲染点 AgentConsole.tsx:136

### Integration Points
- sessionRestore.ts:96(restore 读事件 → 需 fork 融合)
- compaction.ts:130(压缩读事件 → 需 fork 融合)
- chatConsoleStore(store-only ack 消息 → 内容匹配 zip 的存在理由)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — 引用式 fork 是 PROJECT.md 2026-08-18 用户锁定决策。

</specifics>

<deferred>
## Deferred Ideas

- 列表徽章 UI、session 列表、双下拉 → Phase 21

</deferred>
