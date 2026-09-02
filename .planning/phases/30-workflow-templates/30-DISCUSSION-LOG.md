# Phase 30: 参考模板数据化 + 工作流用户自组织 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 30-workflow-templates
**Areas discussed:** 目录数据化落点, 自组织 MVP 形态(产研形态/执行语义/创建路径/视图落位/沉淀), Skill 排期, product 关系化

---

## 目录数据化落点

### Q1: 交付物目录与模板的数据形态?

| Option | Description | Selected |
|--------|-------------|----------|
| 内置 JSON + 用户扩展 | 内置默认只读层(换垂类换文件,999.4 保留)+ 用户层 SQLite 自组织扩展 | ✓ |
| 纯内置 JSON | 999.4 原案,app 内不可改,自组织=零 | |
| 全 SQLite 可管理 | 内置变可删种子数据,升级合并策略复杂 | |

### Q2: 数据化抽离范围(经两轮澄清)

用户澄清问题:「数据驱动 view 时 agent 如何引导自组织」「用户 pipeline 不符合六 tab 能否渲染」→ 解答:tab(内容分类)与 pipeline(行动序列)正交;自组织靠数据层模板+29 写路径,不靠 view 可配;tab 内容特化组件(雷达图/看板/编辑器)不可配置生成。

| Option | Description | Selected |
|--------|-------------|----------|
| 数据层抽离,view 不动 | catalog+模板→JSON;六 tab 只改读数据源 | ✓ |
| view 全数据驱动 | tab 列表+内容均配置化(999.4 完整原案) | 否决 |
| 只抽 catalog | 模板不做,自组织无地基 | |

### Q3: 产研中心灵活化形态

用户自由输入:「抛开当前产研中心 pipeline 不谈,能否让产研中心更灵活,只要能实现这六类 Agent 功能即可」→ 关键事实:六类能力已在引擎工具层(26),tab 只是入口+浏览;灵活性来自解耦。用户要求深谈方案 1。

| Option | Description | Selected |
|--------|-------------|----------|
| tab 保留 + 工作流能力 | 六 tab 不动,新增工作流视图(后改落位为侧边栏顶层) | ✓(经 Q3' 修正落位) |
| 产研中心大改版 | 能力工作区+画布,16 子组件重构 | |
| tab 原样最小改 | 模板入口藏在交付物 tab | |

## 自组织 MVP 形态

### Q3': 模板库与运行入口放哪?

| Option | Description | Selected |
|--------|-------------|----------|
| 产研中心第 7 tab | 与六类能力同地(Claude 推荐) | |
| 侧边栏顶层入口 | 工作流=跨域能力(任务/日程/知识皆可组),与顶层导航平级 | ✓ |
| 无独立视图 | 藏交付物 tab,发现性差 | |

**User's choice:** 侧边栏顶层入口 — 理由:29 写路径后工作流可组任务/日程/知识,不限产研。

### Q4: 模板执行语义?

| Option | Description | Selected |
|--------|-------------|----------|
| 单 run 多步,逐步 HITL | 一键十八份先例;模板=参考剧本可微调 | ✓ |
| 逐步手动触发 | 每步一 run,确认地狱 | 否决 |
| 纯 prompt 注入 | 模板价值稀释,产物可能不落槽 | |

### Q5: 模板创建/修改路径?

| Option | Description | Selected |
|--------|-------------|----------|
| agent 对话创建为主 | 29 写路径落库;库页辅以复制/改名/删(确认卡) | ✓ |
| UI 表单编辑器 | 开发面大,与 agent 定位重叠 | 否决 |
| 只对话无管理页 | 微调也要过对话 | |

### Q6: 沉淀入口是否进 30?

| Option | Description | Selected |
|--------|-------------|----------|
| 进 30:对话沉淀 | 从 run 事件日志提取步骤→草稿→确认→落库 | ✓ |
| 沉淀推 v0.4 | 只做从零创建,飞轮延后 | |

## Skill 系统排期

### Q7: Skill 系统与 30 的关系?

| Option | Description | Selected |
|--------|-------------|----------|
| 模板进 30,自主加载 v0.4 | 格式预留 skill 字段兼容(单 DSL) | ✓ |
| 30 全量(模板即 skill) | 引擎 system prompt+检索链,scope 膨胀 | |
| 不预留兼容 | 两套 DSL,违 999.4 协同原则 | |

## product 关系化

### Q8: product 关系化与 CRUD 工具是否带入 30?

| Option | Description | Selected |
|--------|-------------|----------|
| 继续推迟 v0.4 | 30 体量已足;product 嵌套迁移独立大件 | ✓ |
| 带入 30 | agent 写面完整但体量翻倍 | |
| 只加读工具 | product_search 类,轻量补查询面 | |

## Claude's Discretion

- 内置参考模板清单(建议 3-5 个,质量优先)
- 模板数据结构细节/参数化程度(建议先无参数)
- 模板 run 与 cap-5/三档风险衔接细则
- 工作流视图信息架构细节
- 沉淀提取的实现方式

## Deferred Ideas

- agent 自主检索加载模板(skill 触发)— v0.4
- product 关系化 + CRUD 工具 — v0.4
- 模板表单编辑器 — 否决
- view 全数据驱动 — 否决
- 逐步手动触发 — 否决
- 模板参数化 — 后续按需
