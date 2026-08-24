# 产研中心落地路线:v0.3.3 ~ v0.4.0

**日期:** 2026-08-24(discuss-phase 路线规划)
**目的:** 把产研中心从 mock 演示转正为真实 AI 驱动的整体版本计划;重新归位既有 v0.4 记录(backlog 999.x、REQUIREMENTS v2)。
**消费方式:** v0.3.2 收口后 `/gsd:new-milestone` v0.3.3 的直接输入;REQUIREMENTS/ROADMAP 已同步归期注记。

---

## 1. 整体路线总览(v0.3 → v0.4)

| 版本 | 主题 | 内容 | 状态 |
|------|------|------|------|
| v0.3.1 | session/fork/多会话 | Phase 18-21 全 PASS | 待收口(3 项人工 UAT + complete-milestone) |
| **v0.3.2** | **Rust Run Engine** | Phase 22-25(ADR-0003);纯引擎迁移,不动产研 UI | 已立项,待执行 |
| **v0.3.3** | **产研半落地 + 工作区入驻** | mock 全清(接 Rust 引擎,一遍接线)+ 999.1;原型/代码/测试走文档级生成 | 本路线新设 |
| **v0.4.0** | **产研全落地(紧凑版)** | coding 5 工具+diff 审批 + subagent(ADR-0004)+ pipeline 编排+确认门 + Skill(999.2+999.4) | 本路线重划 |
| v0.5+ | 扩展入口与增强 | MCP(999.3)、IM 入口(ENTRY-01)、hashline、向量检索 P2 候选评估 | 池 |

**核心节奏原则:** 一个版本一层落地——v0.3.3 收"视图真实化"(①层),v0.4.0 收"能力+流程真实化"(②③层);引擎(v0.3.2)与产品(v0.3.3+)严格分离,避免双重接线与迁移期范围膨胀。

## 2. 决策明细

- **D-01 版本骨架:** v0.3.3 = 轻版本先收(产研半落地 + 999.1);不选直冲 v0.4.0(周期长、中间无可见交付)、不选 coding 先行(coding 依赖引擎稳定,顺序倒置)
- **D-02 v0.4.0 边界:** 紧凑产研版 = coding 工具 + subagent + pipeline + Skill(+999.4 数据化 1-2 天协同);MCP 不进(外部集成风险不进主版本);Skill 不拆出(与子 agent 规格 manifest 同形状,拆开重复设计)
- **D-03 v0.5+ 池:** MCP(999.3)、IM 入口、hashline(stale-anchor 拒绝为核心)、向量检索 P2
- **D-04 mock 清理归 v0.3.3:** 全部统一接 Rust 引擎(TOOL-01 已迁 deliverable/knowledge 工具),**接线只做一遍**——若 v0.3.2 期间接 TS toolLoop,Phase 25 下线后须重接,纯属浪费;v0.3.2 执行期间不动产研 UI
- **D-05 tab 交互形态:** 按钮→触发 run(带 tab 上下文)→tab 内嵌进度/事件流;确认卡走现有确认队列;与 Phase 16"候选→HITL→编辑→落槽"模式同构;v0.4.0 原型/代码 tab 自然增量 diff 审批卡。**tab 不废弃、不收敛进 Agent 面板**(保留编辑/管理功能)
- **D-06 999.1 归 v0.3.3:** plans 3/3 已就绪但写于 v0.3.0/TS toolLoop 时代,**执行前需按 Rust 引擎校准**(工具桥/无头 run 约束下复核)
- **D-07 999.2 + 999.4 归 v0.4.0 协同期:** Skill manifest 与垂类数据化用同一模板格式,避免两套 DSL
- **D-08 999.3 + IM 归 v0.5+:** 两者均为"新入口/新工具源"扩展,与产研落地正交

## 3. v0.3.3 内容清单(供 new-milestone)

1. **mock 全清(接 Rust 引擎 run):**
   - `rndStore.generateRequirementAI / generatePrototypeAI / generateCodeScaffoldAI / generateTestCasesAI / generateCompetitorAnalysisAI / generateAllDeliverablesBatchAI`(rndStore.ts:244-500 一带)
   - `FullDeliverablesTab` 一键生成按钮(mock 路径)
   - 模式统一:候选→HITL 确认卡→落槽(复用 Phase 16 卡槽 + 版本化真相源 knowledge_docs)
   - `productStore.runProductSkill` 等残留 mock 一并清理或对齐
2. **tab 接 run:** 各 tab AI 按钮触发带上下文 run,tab 内嵌进度/事件流投影(D-05)
3. **999.1 工作区入驻:** 文档摄取(docx/pdf→文本,Rust 侧零 sidecar)、摄取编排(扫描→分类→抽取任务/日程草稿→批量 HITL)、反向创建入口("从工作区创建产品");plans 校准后执行
4. **边界:** 原型/代码/测试 tab = 文档级生成,**不写真文件**(真写文件是 v0.4.0 coding 工具的事);不引入 subagent/pipeline/Skill

## 4. v0.4.0 内容清单(供 new-milestone)

1. **coding 工具层:** read/write/edit(str-replace,**必须项:old_string 唯一性校验 + 失败回带行号上下文**)/exec/grep;diff 审批卡片 UI;exec 白名单细化(TOOL-02 已给 exec 进程组/超时/取消基础)
2. **subagent(ADR-0004):** `spawn_subagent` 工具 + 首批两规格(prd-writer、prototype-builder);结果 = schema-validated 对象回传;深度 1;取消级联
3. **pipeline(PIPE-01):** 编排 run 依次 spawn 阶段 run + 确认门当门;门可配置 = 默认带门 + 会话级"跳过后续确认"开关(不做配置系统);断点续跑走事件日志检查点
4. **Skill(999.2)+ 垂类数据化(999.4):** manifest + 加载器,骑引擎新入口;交付物目录/pipeline 模板数据化,与 Skill 同模板格式
5. **可选护栏(立项时再定):** 全自动模式末尾廉价整体审查(低配 advisor)
6. **边界:** MCP/IM 不做;hashline 不做(v0.5)

## 5. 与既有记录的冲突消解

| 既有记录 | 原说法 | 新归位 |
|---|---|---|
| ROADMAP backlog 999.1 | "可排期"(无版本) | **v0.3.3**(plans 校准后执行) |
| ROADMAP backlog 999.2 | "v0.4.0 候选" | v0.4.0(确认) |
| ROADMAP backlog 999.3 | "v0.4.0+" | **v0.5+**(推迟) |
| ROADMAP backlog 999.4 | "v0.4.0 前后或与 999.2 同期" | v0.4.0 与 999.2 同期(确认) |
| REQUIREMENTS v2 ENTRY-01(IM) | 未标归期 | v0.5+ |
| REQUIREMENTS v2 ENTRY-02(MCP) | "v0.4.0+" | **v0.5+**(推迟) |
| REQUIREMENTS v2 ENTRY-03(Skill) | 未标归期 | v0.4.0 |
| 记忆 project-rust-run-engine(v0.4 提案顺序) | "工作区入驻/产研转正/Skill 骑新引擎" | 细化为:入驻→v0.3.3,产研转正→v0.3.3/v0.4.0 两步,Skill→v0.4.0 |

## 6. Canonical refs

- `docs/adr/ADR-0003-rust-run-engine.md` — v0.3.2 引擎架构(v0.3.3 接线的基础设施)
- `docs/adr/ADR-0004-subagent-as-tool.md` — v0.4.0 subagent 语义(schema-validated 回传、深度 1、门开关)
- `.planning/REQUIREMENTS.md` — v0.3.2 v1 需求 + v2 预埋(已加归期注记)
- `.planning/phases/16-*` — PRD 生产线模式(v0.3.3 mock 清理的同构模板)
- `.planning/research/PRODUCT-RND-LINKAGE.md` — 产研数据流全景(联动点 L0-L14)
- `src/stores/rndStore.ts` — mock 清理点位(244-500 一带)
- 记忆 `project_coding_agent_design.md`(hashline 数据、v0.4 str-replace 必须项)、`project_subagent_architecture.md`

## 7. 立项检查单

- [ ] v0.3.2 complete-milestone 后:`/gsd:new-milestone` v0.3.3,REQUIREMENTS 从本文 §3 派生
- [ ] 999.1 plans 校准:对照 Rust 工具注册表(TOOL-01)与无头 run 约束(TOOL-04)复核 3 份 plan
- [ ] v0.4.0 REQUIREMENTS 派生时复核 ADR-0004 全部裁定仍成立

---
*Gathered via discuss-phase routing (2026-08-24).*
