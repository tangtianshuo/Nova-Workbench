# Phase 30: 参考模板数据化 + 工作流用户自组织 - Research

**Researched:** 2026-09-02
**Domain:** 数据化(catalog JSON 双侧单源)+ 模板 CRUD 引擎工具 + 模板 run(TabRunPanel 复用)+ 事件日志沉淀提取
**Confidence:** HIGH(全部结论来自本仓库代码实证,无外部库依赖)

## Summary

Phase 30 建立在三条已验证的先例线上,几乎不需要新机制:(1) **单 run 多步** —— 一键十八份(FullDeliverablesTab)把 18 步指令拼进一个 userMessage,走 `startTabRun` 单 run,候选逐份出、逐份 HITL;模板 run 只是把这段指令从硬编码换成模板数据渲染。(2) **引擎 CRUD 工具** —— 29 的 `task_*/schedule_*` 9 工具三档风险模式(读/轻写直落库、delete+cap-5 走 `pm_write` HITL)+ `pm_store.rs` 关系表 + `refreshFromSql` 投影刷新,模板 CRUD 完全同构。(3) **数据化打包** —— `include_str!`(migrations 先例)让 Rust 编译期内嵌 JSON;TS 侧 Vite 直接 import 同一文件,实现双侧单源。

最大的坑是 **catalog 双源风险**:现状 `SLOT_BY_CODE`(TS `src/ai/tools/generateDeliverable.ts:27` 与 Rust `tools.rs:72`)是双侧硬编码 parity。数据化后必须让两侧读**同一个 JSON 文件**,且 Rust 的 `generate_deliverable` code enum(ToolSpec 运行时构建)从 JSON 解析生成,否则数据化只是把双源从 TS/Rust 挪到 JSON/Rust。第二个坑是 `mockRndData.ts` catalog 的 `defaultContent: (p)=>string` 是**函数**,JSON 装不下——但 Phase 26 已裁定 persist wipes fabricated slots(mock 桶已删),defaultContent 实际已无消费方,直接退役即可。

**Primary recommendation:** catalog 与内置模板存 `src/data/` 下 JSON(TS import + Rust `include_str!` 同一文件单源);用户层 SQLite `workflow_templates` + `deliverable_catalog_user`(JSON steps 列,不关系化);模板 CRUD 走 Rust 引擎工具(轻写直落 / delete 走 `pm_write` 复用,不加新 confirmation kind);模板 run = `startTabRun(kind:'workflow')` + 模板渲染成多步 userMessage(INGESTION_PROMPT 先例);沉淀 = TS 侧 `resolveSessionEvents` 过滤 tool_call 白名单生成草稿 → 确认卡 → `executeTool` 落库(commitTabDeliverable 先例)。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 两层数据形态——内置默认目录(18 交付物 catalog + 内置参考模板)打包为 JSON 只读层,换垂类只换文件;用户在 app 内增删的交付物种类/模板存 SQLite 用户层
- **D-02:** 数据层抽离(catalog + prompt 模板 + 参考工作流 → JSON),view 不动——六产研 tab 仍按现有结构渲染,只从数据层读 catalog。**view 全数据驱动明确否决**
- **D-03:** 能力/入口/浏览解耦;生成入口三等价(tab 按钮 / 对话 / 模板发起)
- **D-04:** 「工作流」= 侧边栏顶层入口(与任务/日程/知识库平级),不是产研第 7 tab;视图含模板库列表(内置 + 用户自建)+ 运行中模板 run(TabRunPanel 复用)
- **D-05:** 执行语义 = 单 run 多步,逐步 HITL(一键十八份先例);模板是参考剧本,agent 可微调;「帮我跑 X」一句话发起,不做逐步手动触发
- **D-06:** 创建/修改 = agent 对话为主;模板库页辅以复制/改名/删除(删除走确认卡);**不做表单编辑器**
- **D-07:** 沉淀入口:「把这次沉淀成模板」→ 事件日志提取步骤 → 草稿 → 确认卡 → 落库
- **D-08:** agent 自主检索加载推 v0.4;模板格式**预留 skill 字段兼容**(manifest 结构),单 DSL
- **D-09:** product 关系化 + product CRUD 工具继续推迟 v0.4

### Claude's Discretion
- 内置参考模板清单(3-5 个,质量优先)
- 模板数据结构细节(建议先无参数纯步骤序列)
- 模板 run 与 29 三档风险/cap-5 衔接细则
- 工作流视图信息架构(布局、运行历史深度)
- 沉淀提取实现方式(事件 → 步骤草稿映射规则)

### Deferred Ideas (OUT OF SCOPE)
- agent 自主检索加载模板(skill 触发 + FTS5 按需加载)— v0.4
- product 关系化 + product CRUD 工具 — v0.4
- 模板表单编辑器 — 否决
- view 全数据驱动 — 否决
- 逐步手动触发模板 — 否决
- 模板参数化 — 30 先无参数
</user_constraints>

<phase_requirements>
## Phase Requirements(SC-1..6,WF-xx 未编号)

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | 工作流视图浏览模板库、点模板/对话发起 run、单 run 多步、逐步 HITL、可取消 | TabRunPanel(`src/components/rnd/TabRunPanel.tsx`,props 仅 `{tabId, className}`,读 `runsByTab[tabId]`)+ startTabRun 全链路已 kind 无关;一键十八份多步 prompt 先例(FullDeliverablesTab.tsx:110-122) |
| SC-2 | 对话中 agent 创建/修改/复制/删除模板,真实落库,删除走确认卡 | 29 九工具注册模式(tools.rs registry + ToolKind::Pm)+ pm_store.rs 表操作 + pm_write HITL + cap-5(loop_runner.rs:233 `pm_writes_used`)完全可复制 |
| SC-3 | 对话/run 沉淀为模板(提取→草稿→确认→落库) | agent_events 有 tool_call/tool_result(带 payload.toolCallId 与 args);TS 侧 `resolveSessionEvents`(src/ai/fork.ts)先例;确认后 executeTool 落库先例(commitTabDeliverable) |
| SC-4 | catalog 与模板数据化:内置 JSON 只读 + SQLite 用户层;产研 tab 从数据层读,mockRndData catalog 退役 | include_str! 先例(lib.rs migrations);catalog 消费方已盘点(见「退役面」) |
| SC-5 | 模板 run 写操作遵循 29 三档风险;run 可审计 | 模板 run 走同一条 engine_run 链路,风险分级在工具层(tools.rs/loop_runner.rs)自动生效,模板天然不豁免 |
| SC-6 | 模板格式预留 skill 字段(manifest) | schema 设计节给出 manifestVersion/trigger/tools 字段预留 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 设计 token 强制:`bg-bg-primary`/`text-text-primary`/`border-border-subtle` 等,禁 hex/`bg-white`
- 图标只用 `@phosphor-icons/react`,`weight="duotone"`
- 状态:新代码直接 `useXxxStore()`,不新增 `useApp()` 消费
- 组件:`src/components/ui/` barrel import,Dialog 组合模式,`cn()` class 合并,className 永远最后
- 模态用 `Dialog/DialogContent/DialogHeader/DialogFooter`,确认卡样式复用现有 console 卡
- 命名:view `PascalCaseView.tsx`、store `camelCaseStore.ts`、工具名 `snake_case`(Rust 引擎侧)
- 路径别名 `@/src/...` 跨目录,相对路径 sibling

## Standard Stack

无新增依赖。全部复用既有:Rust(rusqlite、serde_json、include_str!)、TS(zustand、Radix ui 组件、`@tauri-apps/api` invoke 经 `src/ai/api.ts`)。**不引入任何新 crate / npm 包。**

## Architecture Patterns

### 数据化:双侧单源 JSON(核心设计)

现状双源(26-04 有意为之的 parity 硬编码):
- TS:`src/ai/tools/generateDeliverable.ts:27` `SLOT_BY_CODE`(19 键含 "prd")
- Rust:`src-tauri/src/engine/tools.rs:72` `SLOT_BY_CODE`(同表,注释明言 parity)

**推荐方案:单一 JSON 文件,双侧同读**

```
src/data/deliverables-catalog.json   ← 唯一真相源(18 条)
  TS: import catalog from '@/src/data/deliverables-catalog.json'(Vite 原生 JSON import,已有 tsconfig 支持需确认 resolveJsonModule)
  Rust: include_str!("../../../src/data/deliverables-catalog.json")
        + LazyLock<...> 解析(serde_json)→ 替换 tools.rs 的 const SLOT_BY_CODE
```

- `ToolSpec.parameters` 的 code enum 在 `registry()` 运行时构建(json! 宏本就是运行时求值),从解析后的 JSON 生成 enum 无障碍
- `slot_for_code()`(tools.rs:93)改查 JSON 解析结果
- 换垂类 = 换 JSON 文件(D-01 隔离投资),Rust 零改动
- **禁止**做成「JSON 归 TS、Rust 保留硬编码」——那只是换了双源位置

catalog JSON 条目字段(从现有 TS 类型去掉函数):
```json
{ "code": "DEL-REQ-01", "phase": "requirement", "phaseName": "需求规划阶段",
  "title": "标准产品需求规格说明书 (PRD v1.0)", "category": "需求文档",
  "format": "markdown", "icon": "FileText", "summary": "…" }
```
`defaultContent: (product)=>string` **直接退役**——它只被 mock fabrication 消费,而 Phase 26 已裁定 persist wipes fabricated slots(mock 桶已删)。若 plan 验证发现残留消费方,再降级为 JSON 字符串模板(占位符替换),但先按退役处理。

**用户层交付物种类**:新表 `deliverable_catalog_user`(SQLite,0013 起)。Rust `generate_deliverable` 的 code 校验 = 内置 JSON ∪ 用户表(运行时查询)。注意 docId 投影 `deliverable-${productId}-${slotCode}` 对任意 code 字符串天然可用(generateDeliverable.ts:62),无需扩展。

### 模板 schema(单 DSL,skill 兼容预留)

内置参考模板与用户模板**同一结构**(D-08 单 DSL),内置层 JSON(`src/data/workflow-templates-builtin.json`,include_str! 同 catalog 打包),用户层 SQLite:

```sql
-- 0013_workflow_templates.sql
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps_json TEXT NOT NULL,          -- 步骤数组,整存整取(不关系化,agent 读写全量)
  manifest_version INTEGER NOT NULL DEFAULT 1,
  skill_trigger TEXT,                -- D-08 预留:v0.4 agent 自主检索的触发条件(NULL=未启用)
  skill_tools_json TEXT,             -- D-08 预留:manifest 工具集
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('builtin','user','distilled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

steps_json 条目(无参数,纯步骤序列——D 裁定 discretionary 共识):
```json
{ "name": "生成 PRD 草稿",
  "prompt": "为当前产品调用 generate_deliverable 生成 PRD(code=DEL-REQ-01)…",
  "expectedSlotCode": "DEL-REQ-01",   // 可选:预期产物槽,UI 展示用;不给 agent 硬约束
  "toolHint": "generate_deliverable" } // 可选:沉淀提取时回填
```

呈现层统一:TS 读内置 JSON + `refreshFromSql` 拉用户表,合并为 `templates` 列表(source 字段区分,内置只读/可复制不可改删原版)。

### 模板 CRUD 工具(29 模式复制)

| 工具 | 风险档 | 确认 | 说明 |
|------|--------|------|------|
| `workflow_search` | 读 | 无 | 列表/详情查询 |
| `workflow_create` | 轻写 | 无,计 cap-5 | 复制 = create(带 sourceTemplateId 语义由 prompt 层处理) |
| `workflow_update` | 轻写 | 无,计 cap-5 | 改名/改步骤(整量 steps_json 替换) |
| `workflow_delete` | delete 档 | `pm_write` HITL | **复用 pm_write kind,不加新 confirmation kind** |

关键理由:0012 的 candidates 表 kind 是 CHECK 约束,加新 kind 需 copy→drop→rename 重建(migration 成本 + parity fixture)。`pm_write` 的 params_json 自带 entity 语义,确认卡 UI 按 params 分支渲染即可。若 plan 层裁定 UX 需要独立 kind(如沉淀草稿卡),migration 0013 一次把 `workflow_draft` 一并加进 CHECK(沉淀确认见下节)。

落库走 Rust `workflow_store.rs`(抄 pm_store.rs 结构:insert/update/delete/list + `update_row` 泛型 helper),TS 侧 `workflowStore.ts` + `refreshFromSql`(29-04 模式),tabRunStore onEvent 里 `tool_end` name 以 `workflow_` 前缀触发刷新(抄 task_/schedule_ 分支,tabRunStore.ts:253-254)。

### 模板 run 发起(两个入口,一条链路)

UI 点模板 → `startTabRun({ tabId: 'workflow', kind: 'workflow', … })`。`TabRunKind` union 加 `'workflow'`(tabRunStore.ts:19)。对话一句话发起 = console 正常 chat run(system prompt 不动,agent 需要能读模板 → `workflow_search` 工具已给)。

userMessage 渲染(INGESTION_PROMPT + 一键十八份先例合并):
```ts
const userMessage = `执行工作流「${t.name}」。以下步骤为参考剧本,可按当前上下文合理微调(顺序、跳过明显不适用的步骤),但每步产物都走候选确认:
1. ${step1.name}:${step1.prompt}
2. …
完成后简要汇总每步结果。`
```
「参考剧本,可微调」措辞是**产品哲学硬约束**(严禁刚性 pipeline),必须写进 prompt,不能只写在 UI。

HITL 路由零改动:tabRunStore onEvent 已按 candidate.kind 分流——`deliverable_draft` → tab pendingDeliverables、`pm_write` 等 → `routeEngineCandidateToConsole`、其余全局队列。TabRunPanel 复用即得进度/取消/事件流。tabId 用 `'workflow'`(与 ingestion 的 INGESTION_TAB_ID 先例一致,1-run-per-tab guard 顺带防重复发起)。

### 沉淀提取(SC-3)

数据源:`resolveSessionEvents(sessionId)`(src/ai/fork.ts,tabRunStore rehydrate 已用)拿 `agent_events`,过滤:
- **计入步骤**:`tool_call` 事件中 name ∈ 白名单(`generate_deliverable`、`knowledge_write`、`task_create/update/complete`、`schedule_create/update`、`ingest_scan/ingest_submit`)——args 里带 code/title 的直接映射 `expectedSlotCode`/`name`
- **噪音排除**:`knowledge_search`、`fs_list`、`fs_read`、`memory_write`、`exec`(探查类)
- 白名单定义为**共享常量**(TS 单侧即可,提取是 TS 侧动作;写入 tools hint 字段)

链路:用户说「沉淀成模板」→ 新 run(或当前 console run)调 `workflow_create`,prompt 里注入 TS 提取的步骤草稿?**更推荐确定性链路**:TS 侧提取 → 弹确认卡(Dialog 组合,展示可编辑步骤列表)→ 确认后 `executeTool('workflowCreate', …)` + Rust 审计事件(照 `engineCommitDeliverable` 先例加 `engine_commit_workflow` 或复用现有审计命令)。避免为确定性数据变换烧一次 LLM。此点标 MEDIUM(两条路都通,plan 层定;倾向确定性)。

### 视图接线

- `Sidebar.tsx` MENU_ITEMS(177 行)加 `{ id: 'workflows', icon: Flow, label: '工作流', … }`(Phosphor `Flow`/`TreeStructure` 任一,duotone)
- `App.tsx` lazy 先例:`React.lazy(() => import('./views/WorkflowView').then(m => ({ default: m.WorkflowView })))`
- WorkflowView 内复用 `TabRunPanel tabId="workflow"`;模板卡用 `Card variant` + `Badge`(source 标内置/自建);发起按钮/删除确认用现有 Dialog 模式

## Don't Hand-Roll

| 问题 | 不要自建 | 用现有 |
|------|----------|--------|
| run 进度/取消/事件流 | 新面板 | TabRunPanel + tabRunStore(kind 无关) |
| HITL 确认卡 | 新确认机制 | confirmations.rs 候选管线 + pm_write kind |
| 候选去重 | 新去重 | params_hash(confirmations.rs) |
| 多步编排 | 工作流引擎(GraphFlow 已否决) | 单 run 多步 prompt 拼装 |
| 表 CRUD SQL | 新 SQL 层 | pm_store.rs `update_row`/`query_rows` 泛型 helper 直接抄 |
| 日期/相对时间 | 模板里写死 | build_system_prompt 已注入当前日期(loop_runner.rs:99) |

## Common Pitfalls

### 1. catalog 双源漂移(最高风险)
**What:** 数据化后 Rust 保留硬编码 SLOT_BY_CODE、只把 TS 换成 JSON——双源从 TS/Rust 挪到 JSON/Rust,26-04 parity 测试锁不住 JSON。
**Avoid:** Rust `include_str!` 同一 JSON 文件 + LazyLock 解析替换 const;tools.rs 的 code enum 与 `slot_for_code` 都从解析结果生成。加一个 Rust 单测断言 JSON codes == TS 侧 import 的 codes(parity fixture 双侧 glob 先例,29-03 命名前缀约定)。
**Warning signs:** generate_deliverable 对新 JSON 条目报 "code must be prd or DEL-*"。

### 2. defaultContent 函数装不进 JSON
catalog 类型里 `defaultContent: (product)=>string` 是函数。**先验证消费方**:mock fabrication 已在 26 persist wipe 中删除,若 grep 确认无消费方则连字段一起退役;若有(如空态展示),降级为 JSON 内含 `${productName}` 占位符的字符串模板 + 一个 10 行替换函数。

### 3. 用户自定义交付物种类的 code 冲突
用户层种类 code 若与内置 DEL-* 撞名或格式不一,slot 投影 docId 串档。**Avoid:** 用户 code 强制前缀约束(如 `USR-` 或迁移时校验唯一性,内置 ∪ 用户层查重);generate_deliverable 校验改为「内置 JSON ∪ deliverable_catalog_user 查询」。

### 4. 新 confirmation kind 的 migration 成本
candidates 表 kind 是 CHECK 约束(0012 刚重建过一次)。**Avoid:** workflow_delete 复用 `pm_write`(params 区分实体);确需新 kind(如沉淀草稿卡)在 0013 一次加齐,不留 0014 再改。

### 5. 沉淀提取噪音
探查类 tool_call(knowledge_search/fs_list)进步骤会让模板变成调试日志。**Avoid:** 白名单 + 黑名单双列表,白名单为主(只收产物型工具)。另注意:取消/失败的 run 沉淀时 tool_result ok=false 的调用应剔除或标记。

### 6. cap-5 计数是 run 局部(已知 debt,勿扩大依赖)
STATE.md TODO:pm_writes_used 在 run 恢复后归零。模板 run 恢复同受影响——30 不修(用户已裁定记 debt),但 plan 里模板 run 的写步骤设计**不要假设 cap-5 跨恢复连续**。

### 7. 刚性 pipeline 化
模板 prompt 若写成「严格按步骤执行,不得跳过」,违反产品哲学硬约束(用户记忆 2026-09-02)。措辞必须是「参考剧本 + 可按上下文微调 + 每步产物走确认」。SC-1 验收措辞应包含此语义。

### 8. 内置模板的可变性
内置层 JSON 只读——若允许改内置,用户层与内置层 diff 合并是深渊。**Avoid:** 内置只可「复制为用户模板」再改(source='builtin' 行为禁用 update/delete 工具,或内置根本不入 SQLite、仅呈现层合并)。

## Code Examples

### Rust include_str + LazyLock 单源加载
```rust
// tools.rs(先例:lib.rs:28 migrations include_str!)
use std::sync::LazyLock;
static CATALOG: LazyLock<Vec<CatalogEntry>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../src/data/deliverables-catalog.json"))
        .expect("deliverables-catalog.json invalid")
});
pub fn slot_for_code(code: &str) -> Option<&str> {
    CATALOG.iter().find(|e| e.code == code).map(|e| e.code.as_str())
}
// registry() 内 code enum:CATALOG.iter().map(|e| e.code.as_str()).collect()
```

### 多步模板 userMessage(先例:FullDeliverablesTab.tsx:120 + ingestionStore.ts:61)
```ts
const steps = t.steps.map((s, i) => `${i + 1}. ${s.name}:${s.prompt}`).join('\n');
useTabRunStore.getState().startTabRun({
  tabId: 'workflows',
  kind: 'workflow',
  productId,
  userMessage: `执行工作流「${t.name}」。以下为参考剧本,可按上下文微调(顺序/跳过),每步产物走候选确认:\n${steps}\n完成后汇总每步结果。`,
  coreContext,
  sessionTitle: `工作流 · ${t.name}`,
});
```

### 沉淀提取(TS 侧,确定性)
```ts
const DISTILL_KEEP = new Set(['generate_deliverable','knowledge_write','task_create','task_update','task_complete','schedule_create','schedule_update']);
const events = await resolveSessionEvents(sessionId);
const steps = events
  .filter((e) => e.eventType === 'tool_call' && DISTILL_KEEP.has(String(e.payload?.name)))
  .map((e) => ({
    name: String(e.payload?.args?.title ?? e.payload?.name),
    prompt: JSON.stringify(e.payload?.args),   // 草稿原始值,确认卡里人工编辑
    toolHint: String(e.payload?.name),
    expectedSlotCode: e.payload?.args?.code ?? undefined,
  }));
// → 确认卡(Dialog)→ executeTool('workflowCreate', { name, steps, source: 'distilled' })
```
(payload 字段名 plan 时以 event_log.rs 实际 EventInput/payload 结构为准核对——toolCallId 已确认在 payload 上,event_stream_issues 校验依赖它)

### workflow_ 工具触发视图刷新(先例 tabRunStore.ts:253)
```ts
else if (toolName.startsWith('workflow_')) void useWorkflowStore.getState().refreshFromSql();
```

## State of the Art(仓库内演进)

| 旧 | 新(本 phase) | 依据 |
|----|--------------|------|
| SLOT_BY_CODE 双侧硬编码 parity | 单 JSON 双读 | D-01/D-04;include_str 先例 |
| mockRndData.ts catalog(含函数)| JSON 数据层 + 用户层表 | D-02;26 persist wipe 已清 mock 消费 |
| 一键十八份硬编码 instruction | 模板渲染多步 prompt | D-05 |
| 产研六 tab 为生成入口 | 三等价入口(tab/对话/模板)| D-03;前两者已存在 |

## Open Questions

1. **沉淀确认卡走新 kind 还是复用?** 若复用 pm_write,确认卡 UI 需按 params.entity=workflow 分支;若沉淀草稿要独立卡(展示步骤列表可编辑),建议确定性链路(非 agent run)+ Dialog,可能根本不需要进 candidates 表——plan 层定,倾向后者(更少 migration)。
2. **`resolveJsonModule` 是否已开**——tsconfig 需确认(Vite 层面无碍,`npm run lint` tsc 需要它)。Wave 0 一行验证。
3. **catalog JSON 放 `src/data/` 还是 `src-tauri/`**:放 src/data 则 Rust include_str 跨三个 `../`(可行但脆);放 src-tauri 则 TS import 跨界。倾向 src/data(Rust 路径先例:migrations 也是 `../migrations/`)。
4. **对话入口的模板可发现性**:「帮我跑 X」需要 agent 知道有哪些模板——workflow_search 工具 + system prompt 是否注入模板名清单(简短一行列表)由 plan 定(30 条内可注入,超了等 v0.4 FTS5,符合 D-08 推迟)。

## Environment Availability

Step 2.6: 无新增外部依赖——全部复用现有 Tauri/Rust/Node 工具链。Rust 编译与 `npm run tauri:dev` 环境已就绪(Phase 29 刚完成同链路交付)。

## Sources

全部为本仓库代码实证(HIGH):
- `src-tauri/src/engine/tools.rs`(registry、SLOT_BY_CODE:72、generate_deliverable:1108、idempotency)
- `src/stores/tabRunStore.ts`(startTabRun 全链路、candidate 分流、refreshFromSql 钩子)
- `src/components/rnd/TabRunPanel.tsx`(props 接口)
- `src/components/product/FullDeliverablesTab.tsx:110-122`(单 run 多步 prompt 先例)
- `src/stores/ingestionStore.ts:61`(INGESTION_PROMPT 编排先例)
- `src-tauri/migrations/0012_pm_crud.sql` + `src-tauri/src/engine/pm_store.rs`(表设计 + CRUD helper + meta latch)
- `src-tauri/src/engine/loop_runner.rs:99,233`(system prompt 日期注入、cap-5)
- `src-tauri/src/lib.rs:28`(include_str! 打包先例)
- `src/ai/tools/generateDeliverable.ts`(docId 投影、TS SLOT_BY_CODE)
- `src/components/layout/Sidebar.tsx:177`(MENU_ITEMS)
- `src-tauri/src/engine/event_log.rs`(tool_call/tool_result 校验、payload.toolCallId)

## Metadata

**Confidence breakdown:**
- 数据化方案(include_str 单源):HIGH——先例齐备,纯仓库内问题
- 模板 CRUD 工具/风险分级:HIGH——29 模式直接复制,pm_write 复用避免 migration
- 模板 run 链路:HIGH——TabRunPanel/tabRunStore kind 无关,一键十八份先例完整
- 沉淀提取:MEDIUM——事件 payload 字段名需 plan 时核对;确认卡 kind 选择未定
- 内置模板清单内容:LOW(内容创作题,非技术题;plan 时按 PM 高频工作流选 3-5 个)

**Research date:** 2026-09-02
**Valid until:** 2026-10-02(仓库内实证,随 master 演进)
