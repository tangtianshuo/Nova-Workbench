---
status: complete
phase: 22-loop-replay-parity
source: [22-05-SUMMARY.md, 22-06-SUMMARY.md, 22-VERIFICATION.md]
started: 2026-08-28T00:00:00Z
updated: 2026-08-30T06:20:49Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: 完全杀掉 Nova 进程(含托盘)后重启。启动无报错无白屏,session 列表正常加载,历史 session 消息完整可读。
result: pass

### 2. ChatPanel 对话走 Rust 引擎
expected: 在 ChatPanel 发一条普通消息(如"帮我总结一下当前产品"),流式响应逐字出现;run 完成后消息持久化,切走再切回 session 内容不丢。
result: issue
reported: "knowledge_search 失败 / knowledge_search 已完成 / knowledge_search 已完成 / knowledge_write 失败 / knowledge_write 失败 / [tool loop reached the 5-iteration limit]"
severity: blocker

### 3. CmdK 发起对话走引擎
expected: CmdK palette 发起一个 run,行为与 ChatPanel 一致:流式输出、正常完成、session 中可见。
result: pass

### 4. knowledge_search 只读检索
expected: 让 agent 检索知识库(如"搜一下知识库里关于竞品的文章"),agent 调用 knowledge_search 只读工具直接返回检索结果,无确认卡片打断。
result: issue
reported: "agent 输出『继续用更多关键词搜索,确保覆盖全部文章。』随后 [tool loop reached the 5-iteration limit],run 异常终止"
severity: major

### 5. knowledge_write / memory_write HITL 确认
expected: 触发需确认的写入工具(如让 agent 把某条内容写入知识库或记忆),出现 HITL 确认卡片;点「确认」→ 工具重新执行且结果落库;点「拒绝」→ 走取消路径,无孤儿事件。
result: issue
reported: "卡片无确认或拒绝按钮,也无选项按钮。只是提到了需要确认,输入数字键进行选择。"
severity: major

### 6. 中断恢复(重启后 session 恢复)
expected: 在一个 run 进行中(或工具待确认时)强杀 app,重启后该 session 恢复;被中断的 tool_call 显示为 unknown/中断状态,不重复执行,可在 UI 正常续跑或取消。
result: pass

## Summary

total: 6
passed: 3
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "ChatPanel 普通消息 run 正常完成:流式输出、消息持久化、session 内容不丢"
  status: failed
  reason: "User reported: knowledge_search 失败 → 重试已完成 ×2 → knowledge_write 失败 ×2 → [tool loop reached the 5-iteration limit],run 未正常完成"
  severity: blocker
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "knowledge_search 只读检索直接返回结果,run 正常完成,无确认卡片打断"
  status: failed
  reason: "User reported: agent 输出『继续用更多关键词搜索,确保覆盖全部文章。』随后 [tool loop reached the 5-iteration limit],run 异常终止"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "HITL 确认卡片带「确认/拒绝」按钮;确认→重执行落库,拒绝→取消路径无孤儿事件"
  status: failed
  reason: "User reported: 卡片无确认或拒绝按钮,也无选项按钮。只是提到了需要确认,输入数字键进行选择。"
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
