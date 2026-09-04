# Phase 26: Mock 全清 — tab 接引擎 - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

用户在产研中心任一 tab(需求/原型/代码脚手架/测试用例/竞品分析/一键交付物)点 AI 生成按钮,触发真实 `engine_run`(携带 tab 上下文、独立 sessionId、batch 优先级),tab 内嵌进度面板流式可见、可取消、事件日志可审计;产物统一走候选→HITL 确认卡→版本化落槽(knowledge_docs 唯一真相源);`rndStore` 六个 `generate*AI` + `FullDeliverablesTab` + `productStore.runProductSkill` 的 mock/fabricate 代码全部删除,UI 无死路径;Rust 调度器支持交互优先(双队列),防止批量 run 饿死聊天。

不包含:文档摄取(Phase 27)、反向创建产品(Phase 28)、真写文件(v0.4 coding 工具)、引擎 channel 协议改动(除 priority 字段外零改动)。

</domain>

<decisions>
## Implementation Decisions

### 数据落点裁定(roadmap 标记的避债点,PITFALLS #1)
- knowledge_docs 为交付物唯一真相源:版本链 + FTS5 + AI 溯源徽章与 PRD 生产线(Phase 16)同构;不做 kv_store 双写
- rndStore `deliverables` 降为投影缓存:从 knowledge_docs 按 productId+category 读,供 tab 渲染;不作为落槽写路径
- 既有 mock 种子数据直接删除,不迁移(v0.3.3 语义 = mock 全清)
- `FULL_LIFECYCLE_DELIVERABLES_CATALOG` 保留为目录定义(模板/元数据/文案驱动 tab 渲染),实例全部走 knowledge_docs;目录数据化留 999.4(v0.4)

### 调度优先级(TAB-06,与接线同 phase 交付)
- Rust 调度器双队列:interactive 队列优先出队,batch FIFO 次之;单点改动在 scheduler
- `engine_run` 新增可选 `priority` 字段(默认 interactive)——本 phase 唯一协议增量,不属于 tab 元数据装饰
- batch = tab 生成 run + 一键交付物 run;interactive = 聊天/⌘K(用户在等的才是交互)
- 一键十八份交付物 = 单 run 多步:system prompt 指示 + 每份一次 tool call,候选逐份出、逐份 HITL,复用既有 knowledge_write 候选流;不改 loop_runner

### TabRunPanel 进度 UX(TAB-02)
- 面板内嵌于 tab 内容区:生成按钮触发展开,run 结束自动收起
- 紧凑摘要:run 状态 + 当前步骤 + 可折叠事件列表(展开才见 tool 细节)
- 每 tab 同时 1 个 run:运行中按钮禁用至完成/取消
- 取消语义:engineCancel 杀 run;已落槽产物保留、未确认候选作废(与 Phase 16 取消无损一致)
- HITL 确认卡不走面板内嵌,继续走全局确认队列(D-05);面板只提供"等待确认→打开队列"入口

### 候选→HITL→落槽管线统一(TAB-03/04)
- 六 tab 产物编辑体验复用 PrdDraftDialog 模式:候选确认卡→编辑 Dialog(MDXEditor)→版本化落槽
- 落槽 category 按 deliverable code 映射 knowledge_docs category(十八种目录 code 即分类键)
- runProductSkill 同走 tabRunStore.startTabRun:skill prompt 模板进 coreContext,产物同管线(为 v0.4 Skill 系统留同构路径)
- web dev fallback(Express)下 tab AI 按钮禁用 + 提示需桌面引擎;不留 mock 假数据路径

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engineRun()` in `src/ai/api.ts` — 完整 TS IPC 面,已接受 run_id/session_id/product_id/workspace_id/core_context/Channel;零签名改动即可用
- `engineCommitDeliverable` / `engineAppendToolResult` seam(23-04 模式)— TS applier + Rust 审计事件的合法过渡架构
- Phase 16 PRD 生产线:两段式候选 + PrdDraftDialog + 落槽版本链 + AI 溯源徽章 — 直接同构复制
- 全局确认队列(confirmationStore)— HITL 唯一界面(D-05)
- `buildCoreContext()` — 已注入 Rust system prompt,按 tab 扩展 payload 段
- Radix UI 原语 + tokens — TabRunPanel 组装材料

### Established Patterns
- Zustand store 持有 Channel 回调(store 级,非组件级)— tab 切走再切回无需重连
- webview 重载恢复走既有 restore 路径:按 sessionId 查事件一次性 rehydrate,不做轮询
- runId 由 webview mint(crypto.randomUUID)
- 调度器:VecDeque FIFO + per-run Connection,cap 3

### Integration Points
- `src/stores/rndStore.ts` — 六个 `generate*AI` mock 调用点(244-500 行区段)+ deliverables 状态
- `src/stores/productStore.ts` — `runProductSkill`(102 行)
- `FullDeliverablesTab` 一键生成按钮
- `src-tauri/src/engine/` scheduler — 双队列优先级改动点
- `src-tauri/src/engine/commands.rs` — engine_run priority 字段

</code_context>

<specifics>
## Specific Ideas

- 数据落点裁定锁本 phase 首个 plan(roadmap 决策:接线前裁定是最便宜的避债点)
- 引擎协议零改动是研究核心结论;唯一例外 = priority 字段
- tab 不废弃(D-05):tab 保留编辑/管理功能,AI 按钮是增量不是替代

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
