---
status: partial
phase: 17-agent-ux
source: [17-01-PLAN.md, 17-02-PLAN.md, 17-03-PLAN.md, 17-04-PLAN.md, 17-05-PLAN.md]
started: 2026-08-17
updated: 2026-08-17
---

## Current Test

[awaiting human testing — 按用户指令延后至统一 UAT 会话（含 v0.2.0 35 步人工回归合并执行）]

## Tests

前置：`npm run tauri:dev`（SQLite 真路径；web 模式可验流程但涉及持久化/重启的子步骤须 tauri:dev）。

### 1. 双宿主同构（UX-01，17-01）
expected: agent 标签页发一条消息，流式中途按 ⌘K 打开 Drawer：同一消息流、流式状态、pending 确认卡片连续不丢失；关闭 Drawer 回到 agent 标签页不重跑 restore、历史不重复
result: partial-pass（web Playwright 预验 2026-08-17：agent 标签页消息「你好」在 ⌘K Drawer 中同一消息流可见，会话状态共享 ✓；流式中途切换连续性 + restore 不重跑需真实 LLM → Tauri 会话待验）

### 2. 裸 ⌘K 携带视图上下文（UX-02，17-02）
expected: 产品视图选中某产品 → ⌘K → chip「已携带: {产品名}」；任务视图选中任务 → chip 含任务名，未选中任务时 chip 显示当前列表过滤器（任务 · {分类名}/按日期/全部分类）；日程视图 → chip「今日日程 (n)」（今日无事件则无 chip）；点 chip × 移除后发送，下一轮上下文不含该项
result: partial-pass（web Playwright 预验 2026-08-17：产品选中 → chip「NovaAgent 移动端智能助手」✓；任务选中 → chip「[high] 需求评审会」✓；未选中 → chip「任务 · 全部分类」✓；列头点选 → chip「任务 · 需求评审」✓；日程今日 0 事件 → 无 chip ✓；chip × 移除即时消失 ✓。「移除后发送、下一轮上下文不含该项」需真实发送 → Tauri 会话待验；「今日日程 (n)」正数 case 需当日有事件）

### 3. 晨报（UX-03，17-03）
expected: 清 localStorage 的 `morning-report:last-shown` → 首次进 agent 标签页出现晨报（今日日程/过期任务/待确认记忆候选三段，各段计数与实际数据一致，空段不渲染）；当日再次进入不出现；三段全空的日子整个晨报区不渲染；条目点击跳转对应视图（日程→schedule、任务→tasks+选中、记忆候选→ChatPanel）；发送一条消息后晨报折叠为顶部横条
result: partial-pass（web Playwright 预验 2026-08-17：首次进入呈现 ✓；过期任务 (5) 计数与列表一致 ✓；今日日程/记忆候选空段未渲染 ✓；当日再进不重现 ✓；日期戳 yyyy-MM-dd ✓；过期任务条目点击 → 任务管理 + 任务选中呈编辑态 ✓；发送消息后折叠为「晨报 今日日程 0 · 过期任务 5 · 待确认 0」横条 ✓。三段全空日边缘 case + 记忆候选跳转需对应数据态 → Tauri 会话待验）

### 4. 右键快捷 AI 动作（UX-04，17-05）
expected: 任务卡右键出 3 项（总结此任务/AI 拆解子任务/安排到日程）；知识库侧栏文档行右键出 3 项（总结文档/存为记忆/相关问题追问）；触发后 Drawer 滑开 + 输入区预填指令但未发送（无 toast）；先选中文本再右键 → 预填带「引用选区：「…」」前缀（>200 字截断加省略号）；MDXEditor 编辑区域内右键 = 原生菜单（菜单不劫持）
result: partial-pass（web Playwright 预验 2026-08-17：任务卡右键 3 项 ✓；知识库文档行右键 3 项 ✓；触发 → Drawer 滑开 + 预填「请总结任务『需求评审会』…」未发送、无 toast ✓；选中文本后触发 → 预填带「引用选区：『WenXiBuddy 采用现代化前后端一体化…』」前缀 ✓；MDXEditor 编辑区右键无 Radix 菜单（原生菜单不劫持）✓。>200 字截断加省略号 case → Tauri 会话待验，截断逻辑已有单测覆盖）

### 5. ChatPanel 既有能力回归旁证（17-01 重构后）
expected: 对照 16-HUMAN-UAT 步骤 1-3 重跑：PRD 草稿卡片生成、取消无损、落槽至研发中心 + 溯源徽章，行为与 Phase 16 一致；记忆卡片、知识写入确认卡、会话重启恢复同样不变
result: [pending]

### 6. 统一会话合并项 — v0.2.0 35 步人工回归
expected: 与本清单同会话一并执行 35 步回归（清单源：`.planning/milestones/v0.2.0-MILESTONE-AUDIT.md` 及 `.planning/phases/07-cross-module/07-VERIFICATION.md`），全部通过
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 2
partial-pass: 4（web Playwright 预验 2026-08-17，剩余子项待 Tauri 会话）
skipped: 0
blocked: 0

## Gaps
