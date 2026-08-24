# Phase 24: 多 run 并行 + 后台运行(托盘) - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

用户可以多 session 并行跑 agent(并发上限 3 + FIFO 排队)、关窗后 run 继续(hide-on-close + 托盘常驻,托盘带运行中 run 列表)、后台完成/等待确认有桌面通知(仅后台场景)并可一键回到对应 session;取消入口保持应用内。

边界:**不含** TS loop 删除(Phase 25)、新无头入口 IM/定时(ENTRY 留 v0.5+)、业务数据关系化(v0.3.3)。

</domain>

<decisions>
## Implementation Decisions

### 托盘形态(用户选定:带 run 列表,2026-08-24)
- 托盘菜单 = 动态运行中 run 列表(session 标题 + 状态 running/queued)+ 分隔线 + 「显示 Nova」+「退出」
- run 生命周期变化(start/finish/queue)时 Rust 侧重建菜单(Tauri v2 TrayIconBuilder set_menu)
- 点击 run 项 = 显示窗口 + emit 事件,webview 接收后跳转对应 session
- tooltip 显示运行计数;图标变化(运行态换图)为 Claude 裁量,不做硬性要求

### 通知策略(用户选定:仅后台场景)
- 仅窗口处于隐藏态(hide-on-close 后台)时通知:run 完成、或 run 等待 HITL 确认
- 前台活跃对话不通知(用户正在看)
- 通知点击 = 聚焦窗口 + 跳对应 session;tauri-plugin-notification

### 并发模型(用户选定:上限 3 + FIFO 排队)
- 并发上限 3 个 run;超限新 run 排队(FIFO),前序完成自动开始
- 排队状态在 UI 可见(ChatPanel run 状态"排队中")
- 实现建议:run 注册表扩状态枚举(running/queued)+ tokio semaphore 或队列 channel(researcher/planner 定)

### 取消入口(用户选定:仅应用内)
- engine_cancel 既有接缝保持;后台 run 取消 = 通知/托盘回 app 操作
- 托盘菜单不做 per-run 取消(与带列表但不做操作面板的定位一致:列表只读跳转)

### hide-on-close 语义(推荐默认,用户未单独确认)
- 一律 hide-on-close:Rust on_window_event CloseRequested → hide + prevent_close;退出仅走托盘「退出」
- 托盘常驻 = 本 phase 起的默认行为(非"有 run 才隐藏")

### 已锁定的前置决策(不重开)
- 调度器自写 tokio(数百行),不引工作流引擎(ADR-0003 物料决策)
- 后台 = 托盘常驻,不做守护进程/进程间通信
- workspace_root 后台来源:run 由 webview 发起时已带参数(engine_run payload);本 phase 无新无头入口,通用无头来源留 v0.5+(IM 入口时再解)
- SCHED-01 的"互不串扰"建立在 v0.3.1 per-session streaming guard 之上,补集成测试锁定

### Carry-in(23-VERIFICATION note,低危顺手)
- exec/fs 确认卡 sessionRestore 不恢复(候选在 DB,24h TTL)— 后台 run 窗口重开场景补确认卡重现;顺手项不阻塞 SC

### Claude's Discretion
- 队列实现细节(semaphore vs channel)、run 生命周期事件结构、托盘菜单刷新节流
- 托盘图标运行态是否换图、tooltip 文案
- 排队 run 的 UI 呈现细节(ChatPanel 内状态展示)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 架构决策
- `docs/adr/ADR-0003-rust-run-engine.md` — 调度器自写/托盘常驻/双写者规则;具体裁定 #4(后台=托盘)
- `.planning/ROADMAP.md` Phase 24 section — goal + 4 SC + carry-in note

### 既有实现(扩展点)
- `src-tauri/src/engine/commands.rs` — engine_runs 注册表(runId → CancellationToken)+ engine_cancel;本 phase 扩展为状态化调度器
- `src-tauri/src/engine/channel.rs` — EngineEvent;run 生命周期事件形态参照
- `src/stores/chatConsoleStore.ts` — per-session streaming guard(v0.3.1)+ run 状态 UI 接线点
- `src/components/layout/TitleBar.tsx:148-152` — 现 handleClose = win.close()(Rust 侧拦截,TS 无需改)

### 上游验证
- `.planning/phases/23-tools-native/23-VERIFICATION.md` — carry-in note 来源(exec/fs 确认卡 restore)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- engine_runs 注册表 + CancellationToken + engine_cancel(22-06)—— 调度器的心脏已在
- tokio full features 已在(Cargo.toml)—— semaphore/queue 零新增依赖
- ChatPanel per-session streaming guard(v0.3.1 SESS-04)—— 串扰防线已有
- tauri-plugin-notification 未装(需新增);tauri tray-icon feature 未开(Cargo.toml features 现仅 macos-private-api)

### Established Patterns
- Tauri command + Channel 流式;webview emit/listen(工作区切换通知先例)
- 确认候选流(HITL)—— 等待确认状态可从候选表/EngineEvent 推导

### Integration Points
- lib.rs run() builder — 托盘初始化 + on_window_event 拦截点
- commands.rs engine_run — 排队闸门插入点
- chatConsoleStore — run 排队状态接收 + 托盘跳转事件监听

</code_context>

<specifics>
## Specific Ideas

- 用户明确选择托盘**带 run 列表**(非极简)— 菜单动态重建、点击跳 session 是核心体验
- 排队体验:agent 不拒客,超限自动排队,状态可见

</specifics>

<deferred>
## Deferred Ideas

- 通用无头 workspace_root 来源(IM 入口)— v0.5+
- 托盘 per-run 取消菜单 — 未来若用户反馈需要
- 定时触发 run(晨报调度)— v0.4+ pipeline 范畴

</deferred>

---

*Phase: 24-multi-run-tray*
*Context gathered: 2026-08-24*
