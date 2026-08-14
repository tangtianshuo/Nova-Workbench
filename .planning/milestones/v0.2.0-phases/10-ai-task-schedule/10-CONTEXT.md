# Phase 10: AI 任务+日程闭环 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — used REQUIREMENTS.md + ROADMAP.md + STATE.md as spec)

<domain>
## Phase Boundary

AI 深度参与任务管理和日程安排的全流程。用户可以用自然语言完成任务的创建/编辑/删除/安排。本 phase 扩展 Phase 9 的 tool set,在 ⌘K palette 与 chat panel 内提供任务/日程相关的 NL 操作。

**Depends on:** Phase 9 (AI 基础架构) + Phase 7 (弱关联字段作为 AI 操作目标)

</domain>

<decisions>
## Implementation Decisions

### Tool Set 扩展 (基于 Phase 9 registry)
- **D-01:** 新增任务相关 tools:`updateTask(taskId, fields)`、`deleteTask(taskId)`、`moveTask(taskId, toCategoryId)`、`rescheduleTask(taskId, newDate)`
- **D-02:** 新增日程相关 tools:`createEvent(...)`、`updateEvent(eventId, fields)`、`deleteEvent(eventId)`、`listEvents(dateRange)`
- **D-03:** 新增批量操作 tools:`bulkCompleteTasks(taskIds[])`、`bulkDeleteTasks(taskIds[])`
- **D-04:** 沿用 Phase 9 tool registry 模式(hand-rolled,~200 LOC),不引入复杂 framework

### NL 任务 CRUD
- **D-05:** 用户输入 "创建一个高优先级任务,标题是 X,截止日期 Y" → AI 调用 createTask tool,返回确认 + 任务卡片预览
- **D-06:** "把任务 X 改成中等优先级" → updateTask
- **D-07:** "删除任务 X" → AI 二次确认( destructive action),用户确认后 deleteTask

### AI "安排到日历"
- **D-08:** NL "把任务 X 安排到下周三" → AI 调用 rescheduleTask 或 arrangeOnCalendar(Phase 7 wrapper)
- **D-09:** AI 理解相对日期("下周三"、"明天"、"3 天后")通过 prompt 内的 date helper context 注入

### Multi-turn Conversations
- **D-10:** Chat panel 支持 multi-turn 上下文(同 Phase 9 chat panel 基础上扩展)。最近 N 轮对话作为 context 注入
- **D-11:** 任务/日程操作的上下文敏感("把它改成下周" → 引用上一轮讨论的任务)

### 截止日期智能建议
- **D-12:** 当用户创建任务未指定截止日期时,AI 基于任务标题/描述推断合理截止日期,作为建议(用户可接受/修改)

### Claude's Discretion
- tool 调用 confirmation UX(inline preview vs modal)
- 截止日期推断的 prompt engineering
- multi-turn 上下文窗口大小(N 轮)

</decisions>

<canonical_refs>
## Canonical References

### 项目级约束
- `.planning/PROJECT.md` — Core Value, Constraints, Key Decisions
- `.planning/STATE.md` — Phase 9 22 decisions locked(MUST READ,AI 基础架构选型)
- `.planning/REQUIREMENTS.md` — v0.2.0 phase 10 描述

### Phase 9 参考
- `.planning/phases/9-ai/9-CONTEXT.md` — Phase 9 全部 22 decisions(tool registry / ⌘K / chat panel / multi-provider LLM / context injection)

### Phase 5/6/7 参考
- 弱关联字段:task.projectId/scheduledEventId、scheduleEvent.projectId/taskId
- deleteProductWrapped / arrangeOnCalendar: AppContext.tsx wrappers(Phase 7 实施)

### 架构与代码规范
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`

### ROADMAP
- `.planning/ROADMAP.md` §Phase 10

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 9 提供)
- Tool registry + tool loop(JS webview 内,~200 LOC)
- ⌘K command palette(Raycast-style)
- Slide-out chat panel(400-480px,复用 Phase 5 Drawer)
- Multi-provider LLM proxy endpoint

### Established Patterns
- Direct store hooks:`useTaskStore()`、`useScheduleStore()`
- AppContext wrapper:cross-store orchestration
- 弱关联字段访问:无 AI 特殊处理,直接读 task.projectId 等

### Integration Points
- 新增 tools 文件:`src/lib/ai/tools/taskTools.ts`、`scheduleTools.ts`
- Phase 9 tool registry 注册新 tools
- Phase 9 chat panel / ⌘K 自然语言理解路径增强

</code_context>

<specifics>
## Specific Ideas

- 用户输入 "把我这周所有完成度低的任务挪到周末" → AI 列出任务 + 用户确认 + 批量更新
- "今天有什么会" → AI 列出今日日程
- "把这个任务安排到下次空闲" → AI 查日程找空闲时段

</specifics>

<deferred>
## Deferred Ideas

- AI 自动 prioritization(基于历史数据)— v0.3+
- 语音输入(NL via speech-to-text)— v0.3+
- AI 主动建议(不基于用户输入,基于时间/上下文)— v0.3+

</deferred>

---

*Phase: 10-ai-task-schedule*
*Context gathered: 2026-08-10 (autonomous mode)*
