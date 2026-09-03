# Phase 31: 文档工作区 — Milkdown 编辑器 + 右侧常驻面板 - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

## Phase Boundary

右侧常驻文档工作区（Milkdown core 编辑器），承载三大业务场景：**修改 AI 产出的文档、记录日常笔记、阅读/审批 AI 的文档**。工作区可收起、可拖宽；⌘K AI Drawer 改左滑并存。同期 MDXEditor 全量退役（3 使用点迁移 + 删依赖 + 删 vendored patch）。docx/pdf/excel/ppt 预览为技术债，v1 纯 markdown。

## Implementation Decisions

### 编辑器选型与重构

- **D-01:** 编辑器 = **Milkdown core**（`@milkdown/kit` + `@milkdown/react`），headless 模式。**不用 Crepe preset**（成品 UI 会回到 MDXEditor 式 CSS 覆盖税）。toolbar、主题、交互全部用 Nova tokens + Phosphor 自建。
  - 调研依据（2026-09-03 复核）：v7.21.3 活跃维护（16 天前发版）、MIT、React 官方一等支持；ProseMirror + Remark 架构使 markdown round-trip 保真成为架构级保证（markdown 是 Nova 存储真相源）；2026-08-10 ATOMIC-EDITOR.md 否决它的「React 19 已知问题」已查无实据，否决理由失效。
- **D-02:** **MDXEditor 全量退役**：3 个既有使用点（`KnowledgeBaseView` / `ProductKnowledgeTab` / `PrdDraftDialog`）同期迁移 Milkdown；删除 `@mdxeditor/editor` 依赖、`patches/@mdxeditor+editor+4.2.0.patch`、`MarkdownEditorInner.tsx` 的 token 覆盖 CSS 层。收口标准：grep 零 `@mdxeditor`/`mdxeditor` 残留，仓库零双编辑器。
- **D-03:** **受控组件契约保持**：Milkdown 的 imperative API（`useEditor` + listener `markdownUpdated`）包成 `value`/`onChange` 受控组件，沿用现 `MarkdownEditor` props 契约（value/onChange/readOnly/placeholder/className/minHeight），lazy-load 保持，Zustand 同步经 listener 走 `onChange`，不靠 re-render 注入。

### 布局形态

- **D-04:** 右侧**常驻**文档工作区面板：可收起、可拖宽调宽；⌘K AI Drawer **改为从左侧滑出**；两侧并存互不遮挡，保证「AI 产出 → 编辑器」动线顺畅。
- **D-05:** 三大场景为验收锚点：①修改 AI 产出文档（槽位/knowledge_write 双源文档均可在工作区打开编辑并保存回 knowledge_docs）②日常笔记（新建、编辑、FTS5 可检索）③阅读审批 AI 文档（见 D-07）。

### 数据模型

- **D-06:** 笔记/工作区文档落 **knowledge_docs 扩展**：migration 加 `doc_kind='note'`，笔记允许无 productId 归属（全局）；复用既有 FTS5 检索、版本化、knowledge 管线；不建新表。

### 审批集成

- **D-07:** 待确认 AI 文档的**确认卡在工作区内多宿主渲染**：全局确认队列（chatConsoleStore）仍是唯一真相源（D-05 ruling 不动），工作区为第二渲染宿主，用户不离开工作区即可确认/拒绝。**diff 视图（AI 原稿 vs 修改稿）不做 v1**。

### 范围边界

- **D-08:** **docx/pdf/excel/ppt 预览 = 技术债**：v1 纯 markdown；预留预览接口位（未来复用 Phase 27 pdf_oxide 提取链做只读预览）；excel 真编辑明确不做。

### UAT 中段裁定（2026-09-03，D-09..D-13）

- **D-09 入口移交:** 全部文档类预览/编辑移交右侧工作区（知识库视图、产品知识 tab、PRD 草稿对话框）。openDoc/createNote 自带展开面板（docWorkspaceStore 单点）。
- **D-10 面板瘦身:** 移除面板内文档列表/文档名索引，只保留预览与编辑（SC-3 确认卡保留）。DocList.tsx 已删除。
- **D-11 overlay 弹出:** 面板向右滑出不挤压主工作区；保持打开、手动收起；点击主工作区不收起不抢焦点；拖宽（360–60vw）与收起 rail 保留。
- **D-12 禅模式:** 隐藏主工作区内容区（Header + main），左侧导航 Sidebar 保留，编辑区占满主工作区；工具栏按钮进出；收起面板自动退出禅模式。
- **D-13 新建笔记入口:** 知识库视图 header 按钮（非面板内）。

### UAT 收口裁定（2026-09-03，D-14..D-16，驱动 31-07）

- **D-14 SC-1.1 bug 修复:** 知识库点击文档面板弹出但编辑器空白。根因：`DocWorkspaceContent.tsx` 内容采纳 effect 仅依赖 `[currentDocId]`，首次打开时 `loadDocs()`（SQLite 异步）未返回，`docs.find()` 为 undefined → content 置空且后续不重跑。修复：deps 加入 `currentDoc?.version`（编辑中 saveStatus==='editing' 时跳过采纳防覆写）。
- **D-15 多 tab 文档:** 工作区支持 tab 页打开多个文档。store 增 `openDocIds[] + activeDocId`（openDoc 改追加语义）；面板顶部 tab 栏（标题 + 关闭按钮；禅模式下隐藏）；点击已开 tab 激活不重复开。
- **D-16 切换即保存:** 切换/关闭 tab 时 flush 未落盘的防抖编辑（立即 saveDoc，不等 800ms）。同时修复现有潜伏 bug：切换 currentDocId 会 clearTimeout 静默丢弃 ≤800ms 编辑。

### Claude's Discretion

- 工作区文档列表信息架构（分组/过滤：按产品、按 doc_kind、最近打开）
- toolbar 具体按钮集（对齐现 MDXEditor 工具栏能力基线：撤销/标题/粗斜体/列表/链接/表格/代码块）
- 调宽交互实现（拖拽手柄 vs 预设档位 vs 两者）
- Milkdown 插件集选择（commonmark 必选；gfm 表格/删除线、代码块高亮按需）
- 自动保存策略（防抖间隔、失焦即存）

## Specific Ideas

- 用户原话：「不要有历史包袱，如果确实优于当前设计，可以不计代价选择重构」——调研结论为确实优于，故全量退役而非渐进迁移。
- 用户原话：「这个编辑器的主要功能为承载 markdown 的编辑，以及可能会出现的 docx/excel 等文档编辑。实际业务场景为修改 AI 产出的文档，记录日常笔记，阅读 审批 AI 的文档。目前该项目还没有老用户，可以不用考虑用户习惯问题。」
- 编辑器与 ⌘K 同时出现的观感问题由「左右分侧」解决（用户参与裁定）。

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 编辑器选型依据
- `.planning/research/ATOMIC-EDITOR.md` — 2026-08-10 选型调研（MDXEditor 推荐已被本 phase 推翻；其 Milkdown 否决理由「React 19 已知问题」经 2026-09-03 复核失效；场景清单与 bundle 数据仍有效）
- `src/components/ui/MarkdownEditor.tsx` / `src/components/ui/MarkdownEditorInner.tsx` — 受控组件契约参照（迁移目标接口）+ CSS 覆盖税证据（退役对象）
- `patches/@mdxeditor+editor+4.2.0.patch` — vendored patch（退役对象）
- https://milkdown.dev/docs/recipes/react — @milkdown/react 集成模式（useEditor/listener/MilkdownProvider）

### 确认卡多宿主与提醒
- `src/stores/chatConsoleStore.ts` — 全局确认队列唯一真相源（多宿主渲染的数据源）
- `src/ai/pendingCount.ts` + `src/components/ConfirmationToastWatcher.tsx` — 0→N toast 提醒先例（quick-260903-exg）
- `src/components/rnd/DeliverableDocCard.tsx` — 双源投影先例（槽位流 + knowledge_write 归档流）

### 数据管线
- `src/stores/rndStore.ts` — knowledgeBase 投影 / hydrateDeliverableSlots / knowledge_docs 读写先例
- `src-tauri/src/migrations/` — forward-only migration 先例（doc_kind 列加法参照）
- `docs/adr/ADR-0003-rust-run-engine.md` — 引擎边界（编辑器保存为 webview 直写路径，非 agent run）

## Existing Code Insights

### Reusable Assets
- `MarkdownEditor` 受控 props 契约：迁移后继续对外暴露同一接口，3 个使用点迁移成本最小化
- `Skeleton` + `React.lazy` 模式：Milkdown 编辑器组件沿用延迟加载
- `DeliverableDocCard` 双源逻辑：工作区「打开 AI 产出文档」的文档枚举可复用同一数据源组合

### Established Patterns
- 设计令牌语义类 + `cn()` + Phosphor duotone：自建 toolbar/UI 必须走此模式，禁硬编码色值
- migration forward-only、编号续增（现至 0013）：doc_kind 扩展走 0014
- 确认卡渲染宿主模式（Agent Console Drawer / Agent 工作区已有双宿主先例）：工作区为第三宿主

### Integration Points
- MainLayout 布局层：右侧工作区面板挂载点 + ⌘K Drawer 方向反转
- knowledge_docs 表（Rust 侧 schema + TS 侧 rndStore 投影）：doc_kind 列 + note 读写
- chatConsoleStore pending 队列订阅：工作区确认卡渲染数据源

## Deferred Ideas

- docx/pdf/excel/ppt 只读预览 — 技术债（复用 Phase 27 提取链，用户明确记债不进 v1）
- diff 视图（AI 原稿 vs 用户修改稿对比）— 后续按需
- excel 真编辑 — 明确不做
- Milkdown 协同编辑（CRDT/yjs）— 未提出，仅备注架构上 ProseMirror 可扩展

## Research 建议

Milkdown PoC（建议 plan 前或首个 plan 内）：①中文输入法在 Tauri WebView2 实测（IME composition）②表格/代码块/嵌套列表 round-trip 保真验证 ③受控同步（外部 value 变更 → 编辑器替换文档 → 光标行为）④bundle chunk 体积对比（替换后应净减）。

---

*Phase: 31-doc-workspace*
*Context gathered: 2026-09-03*
