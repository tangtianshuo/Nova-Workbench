---
id: llama1b-oversearch-deferred
created: 2026-08-31
area: engine
priority: low
source: 22-UAT.md Test 8 (skipped, 延后修复)
---

# llama3.2 1b 过度检索 — 延后修复

## Context

- 22-09 已定性为 **known capability limitation**(non-code):DB 证据 session fc154236(1b,4 次过度检索)以 outcome=completed 正常结束,结构兜底(max_iterations_forces_wrapup_turn)断言完整。
- DeepSeek(主供应商)下无此问题;仅 Ollama llama3.2 1b 弱模型不遵循 prompt 级检索预算规则。
- 用户 2026-08-31 决定延后修复(22-UAT.md Test 8 skip)。

## Possible Directions (when picked up)

- prompt 级:检索预算规则改结构化(工具结果内嵌剩余次数提示)
- 结构级:knowledge_search 结果注入 "已检索 N 次,建议总结作答" 软约束
- 或接受现状(1B 模型天花板),仅在文档标注最低模型要求

## References

- .planning/phases/22-loop-replay-parity/22-UAT.md — Test 4 / Test 8
- src-tauri/src/engine/loop_runner.rs — MAX_ITERATIONS + wrap-up 收尾路径
