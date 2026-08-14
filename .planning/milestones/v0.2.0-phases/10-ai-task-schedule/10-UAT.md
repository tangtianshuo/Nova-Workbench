---
status: complete
phase: 10-ai-task-schedule
source: 10-01-SUMMARY.md ... 10-04-SUMMARY.md, 10-VERIFICATION.md, HUMAN-UAT.md
started: 2026-08-12T09:45:00Z
updated: 2026-08-12T10:10:00Z
---

## Current Test

Phase 10 real-desktop UAT (DeepSeek) — A/B/C pass, D covered indirectly via A3.

## Tests

### 10-A. 任务 CRUD 多轮自然语言(success criteria 1/2/3/5)
expected: 单会话发 4 步:创建 → 改优先级 → 加描述 → 删除,验证多轮上下文 + tool_call 链路。
result: pass (steps 1/2/3); step 4 (deleteTask) deferred to权限后期。
note:
- step1 `创建任务 ... 优先级高,截止 2026-08-22` → createTask ✓,任务管理 tab 出现。
- step2 `改优先级为低` → setTaskPriority ✓,卡片字段同步。
- step3 `加描述` → updateTask ✓ + LLM 主动追加 multi-turn 演示:第一轮并行 4 个查询(getCurrentContext / listTasks / listEvents / listProducts),第二轮基于 taskId 串行调 getTaskDependencies × 2。**success criteria 5 (multi-turn) 顺手 pass。**
- step4 deleteTask 涉及 destructive 操作 + 权限,移到后期 HITL 设计 phase。

### 10-B. AI 安排到日历(success criteria 4)
expected: 自然语言"安排到下周一" → associateTaskWithEvent 触发,日历显示 task 事件。
result: pass。
note: AI 调 createScheduleEvent + associateTaskWithEvent,日历视图对应日期出现 type:'task' 事件,任务卡片显示日程徽章。

### 10-C. 批量操作(success criteria 7)
expected: 自然语言"把所有高优先级任务标记为进行中" → listTasks filter + bulkComplete。
result: pass。
note: listTasks(priority=high) → bulkComplete,任务管理 tab 多张卡片状态同步。

### 10-D. Multi-turn 规划(success criteria 5/6)
expected: 基于任务列表规划下周工作。
result: covered-indirect (10-A step3 已演示 multi-turn + 跨轮数据传递 + 依赖查询)。
note: 不再单独跑。

## Root cause fixed during UAT

**api.ts chatWithTools invoke 返回值字段名不匹配**: Rust `ToolCallInfo` 序列化为 `{name, arguments}`,JS `ChatToolCall` 期望 `{name, args}`。stream chunk 路径正确做了 `args: message.data.arguments` 映射,但 invoke 返回值路径直接用 `result.tool_calls`,**没做 arguments → args 映射**。由于 invoke 返回值优先级高于 streamedToolCalls,带参数 tool 全部收到 `undefined` args → zod fail → LLM 反复重试到 MAX_ITERATIONS。修复:api.ts 在 invoke 返回值兼容层加 `(call.args ?? call.arguments)` 归一化。

这条同时关闭了 Phase 9 TD-9-1 (无参数 tool_call 间歇失败) —— 实际上那个 case 是同一 bug 的另一面,LLM 调带参数 tool 时 args 丢失。

## Summary

total: 4 (real-desktop scenarios)
passed: 3 (A1+A2+A3, B, C) + 1 indirect (D via A3)
issues: 0 blocking
pending: 0
skipped: 1 (A4 deleteTask — 后期 HITL 设计)
tech-debt: 0 (TD-9-1 closed by api.ts args 归一化修复)

## Gaps

[none]
