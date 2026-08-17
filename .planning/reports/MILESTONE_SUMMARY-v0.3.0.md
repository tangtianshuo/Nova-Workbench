# Milestone v0.3.0 — 项目汇总

**生成日期:** 2026-08-17
**用途:** 团队 onboarding 与项目回顾
**状态:** 全部 5 个 phase 已完成;统一 UAT(16/17 HUMAN-UAT)进行中,milestone audit/complete 待 UAT 后执行

---

## 1. 项目概览

**Nova** 是一个 AI native 的产品经理桌面工作台(Tauri v2 + React 19)。v0.3.0「功能闭环」把 agent 从侧边聊天工具升级为**贯穿产品的一等执行者**:每一步操作落入 SQLite 事件日志(可恢复、可审计、可回放),拥有需确认才入库的长期记忆与中文可命中的 FTS5 知识检索,能驱动 PRD 生产线(生成 → HITL 确认编辑 → 版本化落研发中心卡槽),并通过 Agent 工作区/⌘K 上下文携带/晨报/右键快捷动作成为全局入口。

**核心价值主张:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent —— 不是 chatbot,而是有第二大脑、关键节点 HITL 的真 Agent。

**里程碑目标达成情况:** 三条主循环(PM 工作流 / Agent 操作 / 第二大脑)全部打通;「事件日志 + 增强 tool loop + SQLite FTS5」正式取代 GraphFlow/Rig/LanceDB 旧蓝图成为架构真相源(ADR-0001)。

## 2. 架构与技术决策

- **事件日志为唯一真相源,ChatSession 是投影**
  - 为什么:消除 toolLoop 双历史分叉(展示消息与 LLM messages 两份真相),使恢复/审计/回放成为可能
  - Phase 13(EVT-01..03/06..08)
- **tool_call/tool_result 严格配对不变量 + seq 连续 + correlation_id**
  - 为什么:配对平衡是崩溃恢复切分与压缩切分的可靠锚点;缺失/重复必须可检测
  - Phase 13,算法复用 deepseek-harness 纯函数(MIT 归属见 ADR-0002)
- **确认候选 SQLite 持久化(paramsHash = 规范化 JSON SHA-256 + 原子条件 UPDATE 消费)**
  - 为什么:重启后待确认项存活、重复恢复不重复消费;consume 恰一成功由 SQL 保证
  - Phase 14(EVT-05)
- **崩溃恢复:尾切到最后一个完整 turn,孤儿 tool_call 追加 tool_result 标记 interrupted,绝不重执行**
  - 为什么:业务数据零重复写入是 agent 可追责的前提
  - Phase 14(EVT-04)
- **上下文压缩只在配对平衡处切分,原始事件无损,摘要带事件范围/模型记录**
  - Phase 14(CMP-01/02)
- **记忆候选确认流 + 防轰炸三项(paramsHash 去重 / cap-20 让位 / TTL 过期)+ supersedes 链**
  - 为什么:静默自动记忆是反功能(对标 ChatGPT 最受抱怨的行为);保存前确认是 Nova 差异化
  - Phase 15(MEM-01..05)
- **FTS5 关键词 + 结构过滤(标签/产品/时间),CJK 字符切分,索引/查询同源 helper**
  - 为什么:中文 2 字词可命中;P2 向量检索仅作未来派生加速层,永不做事实源
  - Phase 15(MEM-06..08)
- **PRD 生产线 consume-at-落槽:卡片确认只表达编辑意图,Dialog 落槽是唯一确认消费点**
  - 为什么:取消无损(候选是落槽前唯一真相);stable docId 使重复落槽 supersede 为新版本而非覆盖
  - Phase 16(DELIV-01..04)
- **会话状态唯一归属 transient chatConsoleStore,AgentConsole 双宿主组件**
  - 为什么:Drawer 壳与 Agent 工作区视图字面上同一场对话,UX-01 同构由结构保证而非测试保证
  - Phase 17(UX-01)
- **晨报 = 纯数据查询零 LLM(reportSelectors 纯函数)**
  - 为什么:复述 SQLite 已有数据是失败模式;结构化卡片 + 每日一戳(localStorage)即可
  - Phase 17(UX-03)
- **右键动作 = fireAiAction 单一入口:选区快照(≤200 字截断)+ 预填不自动发送**
  - 为什么:用户在 ChatPanel 看到即将发送的内容再确认;MDXEditor contenteditable 区域结构性不包裹 + capture-phase 守卫双保险
  - Phase 17(UX-04)

## 3. 已交付 Phase

| Phase | 名称 | 状态 | 一句话 |
|-------|------|--------|--------|
| 13 | Event Log 底座 + ToolLoop 重构 | ✅ Complete(VERIFICATION PASS) | Agent 每一步落入 SQLite 事件日志,ChatSession 成为投影,消除双历史分叉 |
| 14 | 持久化确认 + 会话恢复 + 上下文压缩 | ✅ Complete(VERIFICATION PASS) | 重启后待确认项与最近会话可用,孤儿 tool_call 绝不重复执行,超长历史按配对边界摘要 |
| 15 | 长期记忆 + 知识文档 + FTS5 检索 | ✅ Complete(4/4 plans;无 VERIFICATION 文件 — 见 tech debt) | 记忆候选确认流、版本化知识文档、中文可命中的 FTS5 混合检索、五段优先级上下文投影 |
| 16 | PRD 生产线 | ✅ Complete(代码项全过;8 项 UAT 延后至 16-HUMAN-UAT.md) | agent 生成 PRD → HITL 确认 → MDXEditor 编辑 → 版本化落研发中心卡槽,索引同事务更新 |
| 17 | Agent UX + 架构文档 | ✅ Complete(代码项全过;6 项 UAT 延后,web Playwright 预验 4 项 partial-pass) | Agent 工作区落地、⌘K 携带上下文、结构化晨报、右键快捷动作、ARCHITECTURE.md v2.0 + 2 ADR |

## 4. 需求覆盖

**28/28 v1 需求全部标记 Complete**(REQUIREMENTS.md Traceability):

- ✅ P0 可恢复执行底座 EVT-01..08(Phase 13/14)
- ✅ 上下文压缩 CMP-01/02(Phase 14)
- ✅ P1 长期记忆 MEM-01..08(Phase 15)
- ✅ PM 生产线 DELIV-01..04(Phase 16)
- ✅ Agent 交互 UX-01..04(Phase 17)
- ✅ 架构文档 ARCH-01/02(Phase 17)

**注意:** 需求侧标记 Complete 基于代码检查 + 单元测试(160/160 绿);Phase 16/17 的交互链路 UAT 按用户指令统一延后(16-HUMAN-UAT.md 8 项、17-HUMAN-UAT.md 6 项),web 模式 Playwright 预验已覆盖 17 的 ⌘K 携带/晨报/右键动作纯 UI 子项。**Milestone audit 尚未执行** —— 需求的最终签核以 audit + UAT 关闭为准。

**v2 需求(下一里程碑候选):** SEM-01..03(embedding/向量派生索引)、DELIV-05/06(18 种交付物推广/全自动编排)、UX-05..08(多会话/inline 嵌入/多 agent/OS 通知)。

## 5. 关键决策日志

完整决策清单见 `.planning/STATE.md` Accumulated Context(30+ 条,含 roadmap 级与 plan 级)。影响最深远的十条:

| # | 决策 | Phase | 理由 |
|---|------|-------|------|
| 1 | 事件日志 + tool loop + FTS5 取代 GraphFlow/Rig/LanceDB | Roadmap | 可恢复/可审计/可回放的运行时优先于工作流引擎;pre-1.0 crate 风险 |
| 2 | toolLoop 单历史化:删除第二份 messages 数组 | 13-P03 | 每迭代从 session.getMessagesForLLM() 重新派生;公开签名零变化 |
| 3 | 确认 WAIT 也落 tool_result({ ok: false, awaitingConfirmation: true }) | 13-P03 | 保持配对不变量在确认流中成立 |
| 4 | 原子条件 UPDATE 消费确认候选 | 14-P01 | 双并发恰一成功由 SQL 保证,不靠应用锁 |
| 5 | 崩溃尾切 + 孤儿 tool_call settled-by-append(NEVER re-execute) | 14-P04 | 业务数据零重复写入 |
| 6 | 记忆防轰炸三项 + user_directed 直接确认 | 15-P01 | 队列永不轰炸;用户明示「记住」绕过候选流但留审计 |
| 7 | deliverable eventId 骑在候选 params 里但不进 dedup key | 16-P01 | 事件溯源跨重启存活,去重键稳定 |
| 8 | consume-at-落槽(卡片 ≠ 确认消费) | 16-P02 | 取消无损;Dialog 是唯一消费点 |
| 9 | chatConsoleStore 唯一归属 + AgentConsole 双宿主 | 17-P01 | Drawer 与视图同一场对话,同构由结构保证 |
| 10 | harness 复用 = 设计思想 + 纯函数算法,不引入框架 | 17-P04 | dsh 是 Node 运行时违反零 sidecar;MIT 归属入 ADR-0002 |

## 6. 技术债与延后项

**待关闭(阻塞 milestone complete):**
- 16-HUMAN-UAT.md 8 项:PRD 端到端(生成/取消无损/落槽/溯源徽章/立即检索/版本链/重启恢复/审计)—— 需 tauri:dev + Ollama
- 17-HUMAN-UAT.md 6 项:双宿主流式中途切换、携带真实发送验证、晨报记忆候选跳转、>200 字截断、ChatPanel 回归、v0.2.0 35 步人工回归

**已知技术债(非阻塞):**
- Phase 15 无 VERIFICATION.md(v0.2.0 同款文档债;lesson #1 再次应验)
- STATE.md TODOs:FTS5 runtime probe on packaged build、产品删除时 events/memories/FTS 保留策略、中文 PM 词汇 recall 质量决策点
- Phase 13/14 残留手动 UAT:tauri:dev 下 nova.db agent_events 真实 INSERT 序列验证(SqliteEventStore.append 返回 seq:-1 无自动化覆盖)
- v0.2.0 遗留:云 provider 真实凭据 UAT、taskStore/scheduleStore v1→v2 迁移实测、MarkdownEditor chunk ~297 KB gzip(超 250 KB 目标)
- 16-UI-REVIEW 记录:FullDeliverablesTab 图标按钮 aria-label 前置债

**延后想法(deferred,见各 CONTEXT.md):**
- 多会话管理器、inline 视图 agent 嵌入、多 agent 形态、OS 原生通知(UX-05..08 → v2)
- 晨报批量操作(一键确认全部记忆候选)
- Backlog:999.1 工作区先行的产品入驻、999.2 Skill 系统(v0.4 候选)、999.3 MCP 集成(v0.5+)、999.4 垂类扩展隔离

## 7. 上手指引

**运行项目:**
```bash
npm run dev          # web 开发模式(localhost:3000;AI 走 Express fallback)
npm run tauri:dev    # 桌面开发模式(SQLite 真路径 + Rust llm.rs IPC;UAT 必须用这个)
npm run lint         # tsc --noEmit
npm test             # tsx --test src/{stores,ai}/__tests__/*.test.ts(160 tests)
```

**关键目录(新真相源架构):**
- `src/ai/events/` — 事件存储/不变量检查/artifacts(EVT 核心)
- `src/ai/toolLoop.ts` — 单历史增强 tool loop(压缩触发/配对审计)
- `src/ai/chatSession.ts` — 事件投影 + compaction-aware 重建
- `src/ai/confirmationStore.ts` + `paramsHash.ts` — 持久化确认(EVT-05)
- `src/ai/sessionRestore.ts` / `compaction.ts` — 恢复与压缩(EVT-04/CMP)
- `src/ai/memoryStore.ts` / `knowledgeRepo.ts` / `ftsTokens.ts` — 记忆与 FTS5(MEM)
- `src/ai/contextAssembler.ts` — 五段优先级上下文投影(MEM-08)
- `src/stores/chatConsoleStore.ts` + `src/components/AgentConsole.tsx` — 双宿主会话(UX-01)
- `src-tauri/migrations/0002..0005` — agent_events / 确认候选 / 记忆+知识+FTS5 / (16 落槽)schema
- `docs/ARCHITECTURE.md` v2.0 + `docs/adr/ADR-0001/0002` — 架构真相源(**从这读起**)
- `docs/AGENT_MEMORY_REFERENCE.md` — 记忆分层设计参考

**先看什么:** `docs/ARCHITECTURE.md`(v2.0,只描述已落地系统)→ 本汇总 → `src/ai/toolLoop.ts` 跟一次完整对话流 → `.planning/STATE.md` 决策日志。

---

## 统计

- **时间线:** 2026-08-14 → 2026-08-17(4 天)
- **Phases:** 5 / 5 完成(19/19 plans)
- **Commits:** 138(自 `45dcee6` "docs: start milestone v0.3.0")
- **变更规模:** 314 files changed, +22,752 / −19,996(含 .planning 工件)
- **测试:** 160/160 pass(store + ai 双域)
- **贡献者:** ttshuo
