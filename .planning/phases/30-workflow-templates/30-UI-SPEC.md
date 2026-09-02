---
phase: 30
slug: workflow-templates
status: draft
shadcn_initialized: false
preset: none
created: 2026-09-02
---

# Phase 30 — UI Design Contract(工作流视图 / 模板库 / 沉淀确认卡)

> 视觉与交互契约。Consumed by gsd-planner / gsd-executor; validated by gsd-ui-checker.
> 上游真相源:30-CONTEXT.md D-01..D-09、30-RESEARCH.md、tokens.css、TabRunPanel(26-UI-SPEC locked)。

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none(自建设计系统完备,shadcn 初始化不适用——20 个 Radix 原语 + tokens.css 已锁定) |
| Preset | not applicable |
| Component library | Radix(@radix-ui/react-*)via `src/components/ui/` barrel |
| Icon library | @phosphor-icons/react,`weight="duotone"`(active 态 `weight="fill"`) |
| Font | Geist(@fontsource/geist),Geist Mono 代码/事件流 |

**硬规则(CLAUDE.md/项目约束,执行者必守):**
- 语义 token 类,禁 hex/`bg-white`/`text-gray-*`:`bg-bg-primary`、`text-text-secondary`、`border-border-subtle`、`bg-accent`…
- 组件一律从 `@/src/components/ui` barrel import;`cn()` 合并,`className` 永远最后
- 新 store 直接 `useWorkflowStore()`,不新增 `useApp()` 消费
- 动画:`motion/react`,spring `stiffness: 350, damping: 30`(面板)/`400, 30`(hover)

---

## Spacing Scale

沿用全项目既有 scale(Tailwind 默认 4px 基),本 phase 不新增例外:

| Token | Value | 本 phase 用途 |
|-------|-------|--------------|
| xs | 4px | 卡内图标-文字 gap、badge 内距 |
| sm | 8px | 模板卡内元素间距、步骤列表行距 |
| md | 16px | 卡片网格 gap、区块间距 |
| lg | 24px | 视图根 `space-y-6`、卡内边距 `p-6` |
| xl | 32px | 区块分隔 |

Exceptions: none(按钮高度沿用组件默认 h-8/h-7;图标尺寸沿用 14/16/20 惯例)。

---

## Typography

沿用 tokens.css 桌面字号,本 phase 声明使用集:

| Role | Size | Weight | Line Height | 用途 |
|------|------|--------|-------------|------|
| Body | 14px(--text-base) | 400 | 1.5 | 模板描述、步骤文案、沉淀卡正文 |
| Label | 13px(--text-sm) | 400/500 | 1.5 | 徽章、元信息、按钮 |
| Heading | 17px(--text-lg) | 600 | 1.2 | 模板卡名称 |
| Display | 20px(--text-xl) | 600 | 1.2 | 视图标题「工作流」(沿用 Header 模式) |

Weights 只用 400/600 两档。

---

## Color

60/30/10 由现有 token 承担,本 phase 不新增颜色:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg-app`/`--bg-primary` | 视图背景、面板面层 |
| Secondary (30%) | `--bg-secondary`/`--bg-tertiary` | 模板卡、步骤列表背景、侧边栏 |
| Accent (10%) | `--accent`(Apple Blue) | 见下方 reserved 清单 |
| Destructive | `--danger` | 删除模板按钮 + 删除确认卡主操作,别处禁用 |

**Accent reserved for(穷尽清单):**
1. 侧边栏「工作流」激活态图标/文字
2. 「运行工作流」主 CTA 按钮(variant="primary")
3. 运行中 run 的状态图标(TabRunPanel 既有行为)
4. 内置/自建 source 徽章中「内置参考」用 `Badge variant="accent"`(自建用 `variant="neutral"`)
5. 沉淀确认卡「保存模板」主按钮

Progress/HITL 等待态用 `--warning`(TabRunPanel 既有),成功 `--success`。**参考剧本语义不得用红色/警示色渲染步骤**——可微调是特性不是风险。

---

## 视图与组件契约

### 1. 侧边栏入口(D-04)

`Sidebar.tsx` MENU_ITEMS 在 `knowledge` 之后、`settings` 之前插入:

```ts
{ id: 'workflows', icon: Flow, label: '工作流', subtitle: '模板库 / 参考剧本 / 一次发起', isNew: true }
```

- 图标 Phosphor `Flow`,`weight="duotone"`,active 态由 Sidebar 既有逻辑处理
- `App.tsx` lazy:`React.lazy(() => import('./views/WorkflowView').then(m => ({ default: m.WorkflowView })))`

### 2. WorkflowView 布局(信息架构,discretion 裁定)

标准顶层视图模式(`<div className={cn('space-y-6', className)}`>,参考 KnowledgeBaseView):

```
Header:标题「工作流」+ 副标题「参考剧本,按需微调 — Nova 给参考,你来组合」
┌──────────────────────────────────────────┐
│ 运行区(仅当 runsByTab['workflows'] 存在)│  TabRunPanel tabId="workflows"(零改动复用)
├──────────────────────────────────────────┤
│ 模板库                                     │
│ [内置参考] [我的模板] (Tabs 或 SegmentedControl)│
│ ┌────────┐ ┌────────┐ ┌────────┐         │  Card 网格 grid gap-4
│ │ 模板卡  │ │ 模板卡  │ │ 模板卡  │         │
│ └────────┘ └────────┘ └────────┘         │
└──────────────────────────────────────────┘
```

**模板卡(Card variant="default",hover 可用 CardHover 先例 lift -2px):**
- 头行:图标(20px duotone,模板自选)+ Heading 名称 + source Badge(内置参考=accent / 自建=neutral / 沉淀=success)
- 描述两行截断(text-text-secondary)
- 步骤数元信息:「N 步 · 参考剧本」(Label 13px, text-text-tertiary)
- 底部按钮组(gap-2):
  - `<Button variant="primary" size="sm">运行工作流</Button>`(所有模板)
  - 用户模板:`复制` `改名` `删除`(ghost,删除为 danger ghost);内置模板:仅 `复制`(复制后变用户模板)

**点击「运行工作流」交互(摩擦控制硬约束):**
- 直接 `startTabRun`,**不弹参数确认框、不逐步确认发起**(D-05:一句话/一键发起;严禁确认地狱)
- 唯一入口即执行;运行/排队中再点其他模板运行按钮 → 顶部 toast「已有工作流在运行,先等它完成或取消」(1-run-per-tab guard 的 UI 投影)
- 步骤可微调语义靠 prompt 措辞承载(RESEARCH 已锁),UI 卡上以「参考剧本」字样轻提示,不渲染成进度强制清单

### 3. 沉淀确认卡(D-07,倾向确定性链路 = 纯 Dialog,不进 candidates 表)

`Dialog` 组合模式,`max-w-md`:

```
DialogHeader title="沉淀为模板" description="从这次运行的产物步骤提取,可编辑后保存"
├── Input:模板名称(默认「<原 run 标题> 模板」,必填)
├── Textarea:一句话描述(可选)
├── 步骤草稿列表(可编辑):每步一行卡片(bg-bg-secondary rounded-md p-2)
│   序号 + step.name(Input sm)+ toolHint Badge + 删除该步 ghost 按钮
└── DialogFooter:
    <Button variant="secondary">取消</Button>
    <Button variant="primary">保存模板</Button>
```

- 入口:run done 态时 TabRunPanel 区域下方/对话 console 的次级动作「把这次沉淀成模板」(ghost + BookmarkSimple 图标 14px);空步骤(无可提取产物型 tool_call)时按钮 disabled + Tooltip「这次运行没有可沉淀的产物步骤」
- 保存成功 → toast success「模板已保存,可在工作流视图找到」+ workflowStore refreshFromSql

### 4. 删除确认(D-06 确认卡)

复用项目 Dialog 确认模式(轻量确认,非 pm_write HITL——那是 agent 写路径;UI 手动删除走本地 Dialog 即可):

```
title="删除模板" description="「<name>」将被删除,此操作不可撤销。"
DialogFooter:<Button variant="secondary">取消</Button> <Button variant="danger">删除</Button>
```

### 5. 复制/改名

- 复制:直接执行(create source='user'),toast「已复制为「<name> 副本」」,不弹窗
- 改名:小型 Dialog(title="重命名模板",单 Input + 保存/取消)

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | **运行工作流**(verb + noun,明确「跑剧本」非「编辑流程」) |
| Empty state heading | 还没有工作流模板 |
| Empty state body | 让 agent 帮你建一个——在对话框说「建个周末扫描工作流」,或跑完一次任务后点「把这次沉淀成模板」。也可以先复制一个内置参考模板改着用。 |
| Error state | 工作流执行失败:{engine error 前 80 字}。可重试;若持续失败请检查引擎日志后重试。(沿用 TabRunPanel error 措辞契约) |
| Destructive confirmation | 删除模板:「<name>」将被删除,此操作不可撤销。 |
| 参考剧本提示(卡上元信息) | N 步 · 参考剧本(agent 可按上下文微调顺序与取舍) |
| 沉淀空态 | 这次运行没有可沉淀的产物步骤 |
| 运行中重复发起 toast | 已有工作流在运行,先等它完成或取消 |

**措辞红线(产品哲学硬约束,执行者必守):**
- 禁用「严格按流程」「必须完成所有步骤」「Step 1/5 强制进度」类刚性措辞与 UI(勾选强制、锁定步骤、阻止跳过)
- 「参考剧本 / 可微调」措辞必须同时出现在:a) 模板卡元信息 b) run 的 userMessage(RESEARCH 锁定)
- 不得为发起 run 增加参数表单或逐步确认弹窗(确认地狱,999.5 否决项)

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | 全部复用 `src/components/ui/` 既有原语 + TabRunPanel | not applicable(无第三方 registry;零新依赖) |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
