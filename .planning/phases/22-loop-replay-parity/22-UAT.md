---
status: testing
phase: 22-loop-replay-parity
source: [22-05-SUMMARY.md, 22-06-SUMMARY.md, 22-VERIFICATION.md]
started: 2026-08-28T00:00:00Z
updated: 2026-08-30T08:30:00Z
---

## Current Test

number: 2
name: ChatPanel 对话走 Rust 引擎(修复后复测)
expected: |
  22-08 修复后:在 ChatPanel 发一条普通消息(如"帮我总结一下当前产品"),
  流式响应逐字出现;run 正常完成 — 无 "[tool loop reached the ... limit]" 英文 marker;
  即使打满工具预算(MAX_ITERATIONS=8)也以中文收尾句完成,非异常终止。
  run 完成后消息持久化,切走再切回 session 内容不丢。
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: 完全杀掉 Nova 进程(含托盘)后重启。启动无报错无白屏,session 列表正常加载,历史 session 消息完整可读。
result: pass

### 2. ChatPanel 对话走 Rust 引擎(修复后复测)
expected: 在 ChatPanel 发一条普通消息(如"帮我总结一下当前产品"),流式响应逐字出现;run 正常完成 — 无英文 "[tool loop reached...]" marker;打满预算时以中文收尾句完成。run 完成后消息持久化,切走再切回 session 内容不丢。
result: [pending]

### 3. CmdK 发起对话走引擎
expected: CmdK palette 发起一个 run,行为与 ChatPanel 一致:流式输出、正常完成、session 中可见。
result: pass

### 4. knowledge_search 只读检索(修复后复测)
expected: 让 agent 检索知识库(如"搜一下知识库里关于竞品的文章"),agent 1-2 次 knowledge_search 后停止检索并总结作答(prompt 新增检索预算规则);run 正常完成,无确认卡片打断,无英文 marker 异常终止。
result: [pending]

### 5. knowledge_write / memory_write HITL 确认(修复后复测)
expected: 触发需确认的写入工具(如让 agent 把某条内容写入知识库,不必提供 productId — 引擎已用 ctx 兜底),出现带「确认/拒绝」按钮的 HITL 确认卡片;点「确认」→ 工具重新执行且结果落库;点「拒绝」→ 走取消路径,无孤儿事件。
result: [pending]

### 6. 中断恢复(重启后 session 恢复)
expected: 在一个 run 进行中(或工具待确认时)强杀 app,重启后该 session 恢复;被中断的 tool_call 显示为 unknown/中断状态,不重复执行,可在 UI 正常续跑或取消。
result: pass

## Summary

total: 6
passed: 3
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

- truth: "ChatPanel 普通消息 run 正常完成:流式输出、消息持久化、session 内容不丢"
  status: failed
  reason: "User reported: knowledge_search 失败 → 重试已完成 ×2 → knowledge_write 失败 ×2 → [tool loop reached the 5-iteration limit],run 未正常完成"
  severity: blocker
  test: 2
  root_cause: "三层复合:①knowledge_write 必填 productId 但无 ctx.product_id 兜底,模型传 \"\"/null → arg_error 循环(session 85f505a7 seq6-15:5 轮中 3 次空参数、2 次 productId 缺失);②ROLE_AND_TOOL_RULES(loop_runner.rs:94)无搜索终止约束,assistant 工具轮投影为 [requesting tools]、tool_result 以 user 文本回传(:249),模型无自我轨迹而重复检索;③MAX_ITERATIONS=5(:398-420)按 LLM 轮计数且含 arg_error 轮,打满即终死(truncated=true, outcome=tool_limit),无最后一轮无工具收尾路径"
  artifacts:
    - path: "src-tauri/src/engine/loop_runner.rs"
      issue: "MAX_ITERATIONS=5 无收尾路径(:26,:398-420);系统提示无终止约束(:94);Tool→User 轨迹剥离(:249)"
    - path: "src-tauri/src/engine/tools.rs"
      issue: "knowledge_write 必填 productId 无 ctx 兜底、无『勿重试』语义(:385-411);str_arg 空串 arg_error(:331)"
  missing:
    - "knowledge_write 的 productId 解析改为 str_arg(...).or(ctx.product_id),两者皆空才报错(对齐 memory_write :421)"
    - "系统提示加工具预算/终止约束(如 knowledge_search ≤3 次后必须作答)"
    - "iteration==MAX 最后一轮以 tool_choice=none 强制收尾替代终死"
    - "评估按 tool_calls_executed 计数而非 LLM 轮数"
  debug_session: .planning/debug/chat-run-tool-loop.md

- truth: "knowledge_search 只读检索直接返回结果,run 正常完成,无确认卡片打断"
  status: failed
  reason: "User reported: agent 输出『继续用更多关键词搜索,确保覆盖全部文章。』随后 [tool loop reached the 5-iteration limit],run 异常终止"
  severity: major
  test: 4
  root_cause: "工具与数据均健康(session 50597f85:14 次 knowledge_search 全部 ok 且 matches 非空)。根因:①ROLE_AND_TOOL_RULES(loop_runner.rs:94)无停止条件,模型制定无限检索计划(每轮 3 个并行 search 枚举全部 11 篇文章);②MAX_ITERATIONS=5 按每轮 LLM 交互计数,5 轮即截断(turn_ended iterations=5, toolCallsExecuted=14);③上限终态本身优雅(assistant_message+outcome=tool_limit+truncated)但英文 marker 拼在中文句中,被感知为崩溃。与 Test 2 触发不同、放大机制相同(共用 5 轮预算)"
  artifacts:
    - path: "src-tauri/src/engine/loop_runner.rs"
      issue: "MAX_ITERATIONS=5 计数所有轮次含 arg_error(:26);提示词无工具使用停止规则(L94);limit 提示文案(L399)"
    - path: "src-tauri/src/engine/tools.rs"
      issue: "str_arg 空串参数 arg_error 放大了 Test 2 的预算消耗(:331)"
  missing:
    - "系统提示加搜索预算与停止规则(『1-2 次搜索后停止并总结,勿穷尽知识库』)"
    - "上调 MAX_ITERATIONS 或按已执行 tool_calls 计数/不计 arg_error 轮"
    - "limit 终态文案改为中文明确『已达工具循环上限,可继续提问』"
  debug_session: .planning/debug/knowledge-search-loop.md

- truth: "HITL 确认卡片带「确认/拒绝」按钮;确认→重执行落库,拒绝→取消路径无孤儿事件"
  status: failed
  reason: "User reported: 卡片无确认或拒绝按钮,也无选项按钮。只是提到了需要确认,输入数字键进行选择。"
  severity: major
  test: 5
  root_cause: "确认卡片从未发出,不是渲染失败。execute_knowledge_write(tools.rs:385-393)要求模型自给 productId 非空,无 ctx.product_id 兜底(execute_memory_write :421 有兜底,不对称);模型不知 productId(schema 无 enum/default/提示)→传 \"\" 再传 null→两次均在 create_candidate 之前被参数验证拒绝(session 85f505a7 seq12-15,arg_error, retryAvailable:false)。无 candidate→无 Confirmation 事件→无 pendingConfirmation→卡片不渲染。『需要确认,输入数字键进行选择』是 LLM 在工具失败后自己编造的文本(src/ 无此字符串)"
  artifacts:
    - path: "src-tauri/src/engine/tools.rs"
      issue: "knowledge_write 参数验证块(:385-393)缺少 ctx.product_id 兜底,与 memory_write(:421)不对称;工具 schema(:94-111)未告知模型可用 productId"
  missing:
    - "execute_knowledge_write 中 productId 解析改为 str_arg(...).or(ctx.product_id),两者皆空才报错"
    - "可选:丰富工具描述/core context,让模型知晓当前产品 ID"
  debug_session: .planning/debug/hitl-card-no-buttons.md
