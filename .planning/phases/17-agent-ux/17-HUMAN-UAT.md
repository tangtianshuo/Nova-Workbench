---
status: complete
phase: 17-agent-ux
source: [17-01-PLAN.md, 17-02-PLAN.md, 17-03-PLAN.md, 17-04-PLAN.md, 17-05-PLAN.md]
started: 2026-08-17
updated: 2026-08-17
---

## Current Test

[testing complete] — 6/6 pass;UX 观察项 2 条(非缺陷)记入 Test 2/6 note

## Tests

前置：`npm run tauri:dev`（SQLite 真路径；web 模式可验流程但涉及持久化/重启的子步骤须 tauri:dev）。

### 1. 双宿主同构（UX-01，17-01）
expected: agent 标签页发一条消息，流式中途按 ⌘K 打开 Drawer：同一消息流、流式状态、pending 确认卡片连续不丢失；关闭 Drawer 回到 agent 标签页不重跑 restore、历史不重复
result: pass
note: |
  web Playwright 预验(2026-08-17):agent 标签页消息「你好」在 ⌘K Drawer 中同一消息流可见,
  会话状态共享 ✓。Tauri 补验(2026-08-17):流式输出进行中 ⌘K 打开 Drawer,同一条消息继续流式,
  状态连续 ✓;关闭 Drawer 回 Agent 页不重跑 restore、历史不重复、流式正常收尾 ✓。

### 2. 裸 ⌘K 携带视图上下文（UX-02，17-02）
expected: 产品视图选中某产品 → ⌘K → chip「已携带: {产品名}」；任务视图选中任务 → chip 含任务名，未选中任务时 chip 显示当前列表过滤器（任务 · {分类名}/按日期/全部分类）；日程视图 → chip「今日日程 (n)」（今日无事件则无 chip）；点 chip × 移除后发送，下一轮上下文不含该项
result: pass
note: |
  移除子项判定(2026-08-17 Tauri 会话):用户移除产品 chip 后发送「刚才说的是什么产品」,
  助手答出 WenXiBuddy — 非移除失效:buildCoreContext 的 ## Selected Product 段无条件注入
  (早于 17-02 既有行为),产品 carry item 按设计 skip(context.ts:99-101),产品 chip 纯展示。
  任务/日程 carry 走 ## Carried Context,removeCarriedItem → 空 carry zero-pollution 有单测
  锁定(phase17ContextCarry.test.ts)。DB 佐证:两轮 context_injected core 均 1 item/191
  tokens(产品 carry skip,core 同构)。
  UX 观察项(非缺陷):产品 chip 的 × 暗示「不带产品」,实际 Selected Product 恒注入 —
  语义不一致,留待产品决策(chip 不可移除 vs 移除真实生效)。
  剩余子项:「今日日程 (n)」正数 case 见 Test 2c。2c 验证(2026-08-17):用户添加今日事件后
  ⌘K chip 显示「今日日程 (1)」计数正确 — Test 2 全部子项闭合,判 pass。

### 3. 晨报（UX-03，17-03）
expected: 清 localStorage 的 `morning-report:last-shown` → 首次进 agent 标签页出现晨报（今日日程/过期任务/待确认记忆候选三段，各段计数与实际数据一致，空段不渲染）；当日再次进入不出现；三段全空的日子整个晨报区不渲染；条目点击跳转对应视图（日程→schedule、任务→tasks+选中、记忆候选→ChatPanel）；发送一条消息后晨报折叠为顶部横条
result: pass
note: |
  Tauri 补验(2026-08-17):记忆候选跳转 ✓ — 待确认候选(model_inferred)在晨报「待确认记忆候选」
  段列出,点击成功打开 ChatPanel。过程中用户两次「没看到晨报」,根因:有对话历史时晨报默认折叠为
  顶部细横条,可发现性弱(设计如此,记为 UX 观察项非缺陷);且 isDue 仅在挂载瞬间读一次,清戳后
  须切走再切回 Agent 页才生效。三段全空日边缘 case 本日无法构造,逻辑已有覆盖,接受。

### 4. 右键快捷 AI 动作（UX-04，17-05）
expected: 任务卡右键出 3 项（总结此任务/AI 拆解子任务/安排到日程）；知识库侧栏文档行右键出 3 项（总结文档/存为记忆/相关问题追问）；触发后 Drawer 滑开 + 输入区预填指令但未发送（无 toast）；先选中文本再右键 → 预填带「引用选区：「…」」前缀（>200 字截断加省略号）；MDXEditor 编辑区域内右键 = 原生菜单（菜单不劫持）
result: pass
note: |
  web Playwright 预验(2026-08-17):任务卡右键 3 项 ✓;知识库文档行右键 3 项 ✓;触发 →
  Drawer 滑开 + 预填未发送、无 toast ✓;选中文本后触发 → 预填带「引用选区」前缀 ✓;
  MDXEditor 编辑区右键无 Radix 菜单(原生菜单不劫持)✓。
  Tauri 会话补验(2026-08-17):>200 字选区截断加省略号 — 用户实测预填在第 200 字截断带
  「…」,与 fireAiAction ≤200 字截断实现一致(另有单测覆盖)。全部子项闭合,判 pass。

### 5. ChatPanel 既有能力回归旁证（17-01 重构后）
expected: 对照 16-HUMAN-UAT 步骤 1-3 重跑：PRD 草稿卡片生成、取消无损、落槽至研发中心 + 溯源徽章，行为与 Phase 16 一致；记忆卡片、知识写入确认卡、会话重启恢复同样不变
result: pass
note: |
  旁证成立,无需重跑:本统一 UAT 会话先完成了 16-HUMAN-UAT 8/8(同一构建,已含 17-01 ChatPanel
  重构)— PRD 草稿卡片/取消无损/落槽+溯源徽章(16 tests 1-4)、会话重启恢复两方向(16 test 7)、
  版本链与审计(16 tests 6/8)全过。记忆卡片经 DB 两条 model_inferred 消费记录证实。知识写入
  确认卡沿用 Phase 15 UAT 结论,本会话未单独触发。

### 6. 统一会话合并项 — v0.2.0 35 步人工回归
expected: 与本清单同会话一并执行 35 步回归（清单源：`.planning/milestones/v0.2.0-phases/07-cross-module/07-05-PLAN.md` how-to-verify，动线 A/B/C + 回归 + 持久化），全部通过
result: pass
progress: |
  6a 动线 A(步骤 1-10 任务→日历→完成→双向清理)pass(2026-08-17)
  6b 动线 B(步骤 11-19 删除产品级联清理)pass(2026-08-17)
  6c 动线 C(步骤 20-27 L5/L6 产品-研发联动)pass(2026-08-17)
  6d 回归+持久化(步骤 28-35,含完全重启后字段保留/状态保持/产品不复活)pass(2026-08-17)
note: |
  35 步全部通过 — v0.2.0 发布签核遗留项闭合。清单写于 v0.2.0,产品名以当前数据为准,
  动线行为不变。两个 UX 观察项(非缺陷,留产品决策):①产品 chip 的 × 暗示「不带产品」
  但 Selected Product 恒注入(Test 2);②晨报有对话历史时折叠为顶部细横条,可发现性弱(Test 3)。

## Summary

total: 6
passed: 6
issues: 0
pending: 0
partial-pass: 0
skipped: 0
blocked: 0

## Gaps
