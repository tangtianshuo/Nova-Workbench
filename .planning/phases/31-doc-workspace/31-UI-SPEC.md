---
phase: 31
slug: doc-workspace
status: draft
shadcn_initialized: false
preset: none
created: 2026-09-03
---

# Phase 31 — UI Design Contract

> 文档工作区：右侧常驻面板（flex aside）+ Milkdown headless 编辑器 + ⌘K 左滑非模态 + 确认卡第三宿主 + MDXEditor 退役。
> 全部视觉走既有 Nova tokens / Radix ui/ 原语 / Phosphor duotone。**本 phase 禁新增 UI 依赖**（Milkdown 除外，非 UI 皮肤）。

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — 项目自有 token 体系（锁定） |
| Preset | not applicable |
| Component library | Radix via `src/components/ui/` barrel（Button/Card/Badge/Tooltip/Dialog/Skeleton…） |
| Icon library | `@phosphor-icons/react`, `weight="duotone"`（12 inline / 14 small / 16 default / 20 header） |
| Font | Geist / Geist Mono（self-hosted） |

**shadcn gate:** `components.json` 不存在，项目设计系统成熟且 CLAUDE.md 锁定 → 跳过初始化。Registry safety: not applicable。

---

## Spacing Scale

既有紧凑桌面密度，无新增刻度（4 的倍数）：

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | 图标-文字间距、列表行内 padding |
| sm | 8px | 面板内紧凑间距、列表行 gap |
| md | 16px | 面板 padding（`p-4`） |
| lg | 24px | 卡片/区块 padding（`p-5`/`p-6`） |
| xl | 32px | 布局间隙 |

Exceptions: 拖宽手柄宽 4px（`w-1`）；toolbar 按钮 `h-7`（sm 按钮既有规格）。

---

## Typography

无新增字号，全部走既有 token：

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body / 编辑器正文 | 14px (`text-base`) | 400 | 1.5 |
| Label / 列表行、状态 | 13px (`text-sm`) | 400/500 | 1.5 |
| Compact meta / 时间戳、保存状态 | 11px (`text-xs`) | 400 | 1.5 |
| Heading / 面板标题、文档标题 | 15px (`text-md`) | 600 | 1.2 |
| 编辑器内 markdown 标题 | H1 20px / H2 17px / H3 15px | 600 | 1.2 |

编辑器正文 14px/1.5，`font-mono`（Geist Mono）仅 code inline/block。

---

## Color

全部语义 token 类，禁 hex/gray：

| Role | Value | Usage |
|----------|-------|-------|
| Dominant (60%) | `--bg-app` | 应用背景 |
| Secondary (30%) | `--bg-primary/secondary/tertiary` | 工作区面板（`bg-bg-primary`+左侧 `border-border-subtle`）、文档列表行（hover `bg-bg-tertiary`）、toolbar 条（`bg-bg-secondary`） |
| Accent (10%) | `--accent` | 见下方保留清单 |
| Destructive | `--danger` | 确认卡「拒绝」按钮仅 |

**Accent 保留清单（本 phase 穷举）：** 当前打开文档在列表中的高亮行、拖宽手柄 hover 态、「新建笔记」主按钮、保存状态指示器的「已保存 ✓」瞬间反馈（`text-success` 也可，见保存状态契约）、确认卡「确认」主按钮。

**保存状态指示器（discretion 落点）：** 编辑器 toolbar 右侧 11px `text-text-tertiary` 文案三态——`编辑中…`（防抖 800ms 未保存）→ `保存中…` → `已保存`（`text-success`，2s 后淡出）。无 toast（编辑是高频操作，toast 即噪音）。

---

## Component Contracts

### 1. 右侧常驻工作区面板（`DocWorkspacePanel`，flex aside 非 Drawer）

- 结构：`MainLayout` 内容区右缘挂 `<aside>`，宽 `docWorkspaceWidth`（默认 420px，clamp 360px–60vw），左侧 4px 拖拽手柄（`w-1 cursor-col-resize hover:bg-accent shrink-0`，mousedown/mousemove ~30 行，无库）。
- 收起：Header 区折叠按钮（CaretRight 14），收起后右缘留 28px 竖条按钮（CaretLeft 14 + NotePencil duotone 16）展开；宽度状态 persist（uiStore partialize）。
- 面板内部三段：顶部工具条（32px）→ 文档列表区（可折叠，默认展开，max-h-64 scroll）→ 编辑器区（flex-1）。
- ⌘K Drawer 开着时面板完全可交互（非模态并存，UAT 验证点）。

### 2. 文档列表信息架构（discretion 落点）

- 顶部 SegmentedControl 三过滤（既有组件，`layoutId` 滑块）：`AI 产出` / `笔记` / `最近`。
  - AI 产出 = doc_kind='document'（槽位 + knowledge_write 双源，复用 DeliverableDocCard 数据源组合）
  - 笔记 = doc_kind='note'
  - 最近 = 按更新时间倒序混合（近 20 条）
- 组内按产品分组（组头 11px `text-text-tertiary` 产品名 + 文档数）；「笔记」组无产品的归入「全局」组。
- 列表行：文档名（13px，truncate）+ 更新时间（11px `text-text-tertiary`）+ doc_kind 徽章（仅笔记：`Badge variant="neutral"` NotePencil 12「笔记」）。
- 「新建笔记」：列表区右上 `Button variant="primary" size="sm"`（Plus 14 + 新建笔记），全局归属（`__global__`），创建即打开编辑器并聚焦标题。

### 3. Milkdown 编辑器 + 自建 toolbar（D-01/D-03）

- 受控契约不变：`value/onChange/readOnly/placeholder/className/minHeight`，lazy 保持（`MarkdownEditor.tsx` 壳零改动）。
- 编辑器排版：Nova tokens 自写 `.milkdown-editor` 样式层（唯一允许的编辑器专属 CSS，替代 MDXEditor 的 200 行覆盖税，预期 <80 行）：正文 `text-base text-text-primary`、标题 600 weight、`pre/code` 用 `bg-bg-tertiary rounded-[var(--radius-md)] p-3 font-mono text-sm`、blockquote `border-l-2 border-border-subtle pl-3 text-text-secondary`、表格 `border-border-subtle` 分隔线、链接 `text-accent`。禁外部主题 CSS（nord/prism）。
- **Toolbar 按钮**（`MarkdownToolbar`，toolbar 条 32px `bg-bg-secondary border-b border-border-subtle`，按钮 `Button variant="ghost" size="sm"` h-7，图标 14 duotone，Tooltip 标注快捷键）：

  | 分组 | 按钮（图标 → 命令） |
  |------|---------------------|
  | 历史 | Undo（ArrowCounterClockwise）/ Redo（ArrowClockwise） |
  | 标题 | H1 / H2 / H3（text 按钮，`turnIntoHeadingCommand` 1/2/3） |
  | 行内 | Bold（TextB）/ Italic（TextItalic）/ Strikethrough（TextStrikethrough）/ Code inline（Code） |
  | 块 | Bullet list（ListBullets）/ Ordered list（ListNumbers）/ Quote（Quotes）/ Code block（CodeBlock） |
  | 插入 | Link（LinkSimple → 默认空 href 弹 inline Input）/ Table（Table → `insertTableCommand` 3×3） |

  组间 `Separator` vertical 8px。命令 key 名以 7.22.1 `.d.ts` 为准（RESEARCH MEDIUM 项）。无 slash menu、无 block 拖拽手柄（v1）。
- 语法高亮：v1 不做（技术债，与 D-08 同批）；code fence 走上述 mono 样式。

### 4. ⌘K Drawer 左滑非模态（D-04）

- `ui/Drawer.tsx` 加 `side?: 'left'|'right'`（默认 right）+ Root 透传 `modal`；ChatPanel 用 `<Drawer side="left" modal={false}>`。
- 非 modal 下：无 overlay、不锁主内容/右栏、外点不关；Esc 仍关（Radix 非 modal 默认，验证）。开合动画沿用既有 `motion` x-slide。
- ⌘K 快捷键行为不变，仅方向与模态性反转。

### 5. 确认卡第三宿主（D-07）

- 面板顶部条件插入 `WorkspaceConfirmCard`（`pendingConfirmation`/KnowledgeWrite 存在时显示，`Card variant="elevated"` + 左缘 `border-l-2` `--warning`），不遮挡编辑器（编辑器下移，非 overlay）。
- 内容：待确认文档名（13px 600）+ 摘要一行（11px truncate）+ 两按钮：确认（`Button variant="primary" size="sm"`）/ 拒绝（`Button variant="secondary" size="sm"`）——动作直调 chatConsoleStore 既有 confirm/reject actions，真相源不动。
- 与当前文档无关的其余 pending kind：折叠一行 `另有 N 项待确认`（`text-warning`，link-style Button）跳转 AI 台。diff 视图不做（D-07 锁定）。

### 6. MDXEditor 退役视觉收口（D-02）

- 三使用点经 `MarkdownEditor` 单一入口零 UI 改动；KnowledgeBaseView / ProductKnowledgeTab / PrdDraftDialog 编辑器视觉由新 `.milkdown-editor` 样式层接管，外观对齐上述排版契约。grep 零 `mdxeditor` 残留。

### 7. 动画

仅既有约定：面板开合 spring `stiffness: 350, damping: 30`；toolbar 按钮 `whileTap={{ scale: 0.97 }}`；保存指示器淡出用 `--duration-fast`。无新 motion 模式。

---

## Copywriting Contract

zh-CN，用户可见字符串全字面量：

| Element | Copy |
|---------|------|
| Primary CTA | 新建笔记 |
| 空态 — 列表（AI 产出） | 还没有 AI 产出文档。在研发中心生成后，可在这里打开修改。 |
| 空态 — 列表（笔记） | 还没有笔记。点击「新建笔记」，随手记录想法。 |
| 空态 — 列表（最近） | 暂无最近打开的文档 |
| 空态 — 编辑器（未打开文档） | 从上方列表选择文档，或新建一篇笔记开始编辑 |
| 加载态 | Skeleton（列表 3 行 + 编辑器块），无文案 |
| 保存状态 | 编辑中… / 保存中… / 已保存 |
| Error — 保存失败 | 保存失败：{原因摘要}。内容仍在编辑器中，可重试；若持续失败请重启应用后重试。重试为 inline link-style Button |
| Error — 文档加载失败 | 文档加载失败：{原因摘要}。请重新打开该文档。 |
| 确认卡 | 确认 AI 写入：{文档名}？ AI 生成了新的文档内容，确认后写入知识库。 [确认] [拒绝] |
| 确认卡折叠行 | 另有 {N} 项待确认 — 打开 AI 台 |
| 拒绝（确认卡） | 无二次确认弹窗；拒绝即生效（队列中可追溯，版本链保底） |
| Tooltip — 收起面板 | 收起文档工作区（右侧按钮展开） |
| Tooltip — 拖宽手柄 | 拖动调整宽度 |

无 destructive 数据丢失路径：保存失败时内容不丢（编辑器内存持有 + 重试）。

---

## Interaction Contract（locked from 31-CONTEXT/RESEARCH）

1. 右侧面板常驻可交互，⌘K 左滑非模态，两侧并存互不遮挡（UAT：⌘K 开着时右栏可打字、Drawer 不关）。
2. 受控契约防回环：外部 value 仅在切文档时 replaceAll（flush:true），用户编辑不回灌（lastEmitted 脏检查）。
3. 自动保存：防抖 800ms + 失焦即存（composition 不触发额外 DOM 操作，IME PoC 前置）。
4. 确认队列唯一真相源 = chatConsoleStore；工作区只是渲染宿主。
5. v1 纯 markdown；非 md 文档（docx 等）列表中显示但打开时置灰提示「预览能力开发中，v1 支持 markdown 文档」。
6. 全局笔记 FTS5 可检索（KnowledgeBaseView 全局搜索自动覆盖，无需新 UI）。

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable（无 shadcn） |
| third-party | none | not applicable — 本 phase 无新 UI 依赖（Milkdown 为编辑器内核非 UI registry） |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
