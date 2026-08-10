# Atomic Editor 调研报告

**日期**: 2026-08-10
**调研人**: Claude (WebSearch + 源码审计)
**结论**: **否决 Atomic Editor 作为主编辑器** (项目过于早期、单人维护、无 React 19 保证)。
**推荐**: **MDXEditor** 作为知识库/交付物编辑场景的首选方案；当前 `react-markdown` 纯渲染场景保持不变。

---

## 1. Atomic Editor 评估

### 1.1 项目基本信息

| 维度 | 详情 |
|------|------|
| **GitHub** | [kenforthewin/atomic-editor](https://github.com/kenforthewin/atomic-editor) |
| **npm** | `@atomic-editor/editor` (原版) / `@plannotator/atomic-editor` (fork) |
| **Demo** | [kenforthewin.github.io/atomic-editor](https://kenforthewin.github.io/atomic-editor/) |
| **Stars** | ~122 (截至 2026-08) |
| **License** | MIT |
| **最近提交** | v0.6.2 (约 2 周前, 截至 2026-08) |
| **总提交数** | 73 commits |
| **维护者** | Kenneth Bergquist (kenforthewin) — **单人项目** |
| **HN 曝光** | 2026-06-01 Show HN, 社区反响正面但有限 |
| **父项目** | [kenforthewin/atomic](https://github.com/kenforthewin/atomic) — 自托管知识库 (Rust + CM6), ~1.6k stars |

### 1.2 功能集评估

| 功能 | 支持情况 | 备注 |
|------|----------|------|
| Obsidian-style 实时预览 | **核心卖点** | 格式化随输入渲染, 底层保留纯 markdown |
| 标题 (H1-H6) | 支持 | inline rendering |
| 粗体/斜体 | 支持 | inline rendering |
| 表格 | 支持 | WYSIWYG 表格 |
| 代码块 | 支持 | 语法高亮 |
| 图片嵌入 | 支持 | inline rendering |
| 任务列表 | 支持 | interactive checkboxes |
| 链接编辑 | 支持 | cursor-scoped link editing |
| Diff 视图 | 支持 | `AtomicDiffEditor` 组件 |
| YAML frontmatter | 部分 | fork `@plannotator` 添加 |
| 插件/扩展 API | **不明确** | 导出 CodeMirror extensions, 但无文档化插件系统 |
| 主题定制 | 通过 CM6 | CSS-based, 需直接操作 CM6 theme |
| 协同编辑 | 不支持 | 无 CRDT/OT 集成 |

### 1.3 风险评估 (关键)

| 风险 | 等级 | 说明 |
|------|------|------|
| **单人维护** | **高** | 唯一开发者, 无团队/公司背书, bus factor = 1 |
| **版本 <1.0** | **高** | v0.6.2, API 随时可能 breaking change |
| **无 npm 发布 (原版)** | **中** | 原版 npm 包名为 `@atomic-editor/editor`, 非标准发布流程; fork `@plannotator` 有 1,686 weekly downloads |
| **无 React 19 保证** | **中** | 基于 React 构建但未声明 peer dep 版本; CM6 本身框架无关 |
| **无 bundle size 数据** | **中** | Bundlephobia 未收录, 无法评估对 Tauri WebView 的影响 |
| **无 TypeScript 类型声明** | **低-中** | 源码为 TS, 但未见独立 `.d.ts` 发布 |
| **生态锁定** | **中** | 编辑器与父项目 Atomic (知识库) 深度耦合, 独立使用场景有限 |
| **文档缺失** | **高** | 无 API 文档, 无集成指南, 仅靠 README + demo |

### 1.4 Atomic Editor 结论

**否决。** 理由:

1. **太早期** — v0.6.2, 73 commits, 单人项目, 不适合作为产品级依赖
2. **不是 React 组件库** — 它是 Atomic 知识库的前端组件, 不是为第三方集成设计的通用编辑器
3. **CodeMirror 6 包装** — 底层是 CM6, 如果要用 CM6, 不如直接用 `@uiw/react-codemirror` 或 `easymde` 等成熟方案
4. **Nova 场景不匹配** — Nova 需要的是 **Markdown WYSIWYG 编辑 + 纯渲染**, 而 Atomic Editor 的 "Obsidian-style inline preview" 是一种特殊范式, PM 用户不一定需要
5. **无中文社区/文档** — Nova 是中文 PM 工具, 编辑器需要有中文输入法的充分测试, Atomic Editor 未见相关保证

---

## 2. Tech Stack 兼容性

### 2.1 Nova 现有技术栈约束

| 技术 | 版本 | 编辑器需满足的约束 |
|------|------|-------------------|
| **React** | 19.0.1 | 必须支持 React 19 (Concurrent Features, useSyncExternalStore) |
| **Tauri WebView** | v2 | 系统 WebView2 (Edge Chromium) / WKWebView / WebKitGTK; **无 SSR**, 纯客户端 |
| **Tailwind** | v4 (`@theme`) | CSS custom properties via `@theme`; 编辑器不能覆盖全局样式 |
| **Vite** | 6.2.3 | ESM-only dev, 需兼容 Vite 的 tree-shaking |
| **TypeScript** | ~5.8.2 | 必须有完整的 `.d.ts` 类型声明 |
| **Bundle** | 桌面 app | 对 bundle size 敏感 (首次加载), 但比 Web 宽松 |
| **状态管理** | Zustand 5 | 编辑器内容需与 Zustand store 双向同步 |

### 2.2 各方案兼容性概览

| 编辑器 | React 19 | Tauri WebView | Tailwind v4 共存 | TypeScript | 纯客户端 |
|--------|----------|---------------|-------------------|------------|----------|
| Atomic Editor | 未声明 | CM6 兼容 | CM6 自带样式, 需隔离 | 源码 TS | 是 |
| Milkdown | 已知问题 (CSDN 文章) | ProseMirror 兼容 | 有 scoped CSS | 有 | 是 |
| **Tiptap** | **官方支持** | **ProseMirror 兼容** | **Headless, 无自带样式** | **完整** | **是** |
| **BlockNote** | **支持 (2026 更新)** | **Lexical 底层, 兼容** | **有自带 UI, 需覆盖** | **完整** | **是** |
| **MDXEditor** | **官方支持** | **Lexical 底层, 兼容** | **有自带 UI, 需覆盖** | **完整** | **是** |
| ByteMD | Svelte 编译, React wrapper | Svelte 编译为 vanilla JS | 有 scoped CSS | 有 | 是 |

### 2.3 Tailwind v4 共存策略

所有非 headless 编辑器 (Milkdown, BlockNote, MDXEditor, ByteMD) 都自带样式, 与 Tailwind v4 的 `@theme` 系统可能冲突:

- **Tiptap** (headless): **零冲突** — 无自带样式, 完全用 Tailwind 类构建 UI
- **MDXEditor**: 自带 CSS, 需用 CSS `layer` 或 scoped container 隔离
- **BlockNote**: 自带 CSS (基于 Tailwind CSS 构建!), 与 Nova 的 Tailwind v4 可能版本冲突
- **Milkdown**: 自带主题系统, 需 custom theme 适配 Nova tokens
- **ByteMD**: Svelte 编译产物有 scoped CSS, 冲突最小

---

## 3. Nova Markdown 场景清单

### 3.1 源码审计结果

通过 `grep react-markdown` 扫描 `src/` 目录, 发现 **6 个文件** 使用 `react-markdown`:

| 文件 | 场景 | 当前实现 | 编辑需求 | 优先级 |
|------|------|----------|----------|--------|
| `src/components/product/ProductKnowledgeTab.tsx` | **产品知识库文章** | `<Textarea>` 编辑 + `<ReactMarkdown>` 渲染 | **高 — 有编辑模式, 但用原生 textarea** | **P0** |
| `src/components/product/FullDeliverablesTab.tsx` | **R&D 交付物预览** (18 份) | `<ReactMarkdown>` 只读渲染 | 中 — 按钮标 "查看/编辑" 但实际只读 | P1 |
| `src/components/product/AIRequirementsTab.tsx` | **PRD/需求规格书** | `<ReactMarkdown>` 只读渲染 | 低 — AI 生成内容, 用户不直接编辑 | P2 |
| `src/components/product/ProductDocsTab.tsx` | **产品文档阅读器** | `<ReactMarkdown>` 只读渲染 | 低 — 纯展示, 有 "新建文档" 但未接入编辑器 | P2 |
| `src/components/product/CompetitorAnalysisTab.tsx` | **竞品分析策略** | `<ReactMarkdown>` 只读渲染 | 低 — AI 生成, 纯展示 | P3 |
| `src/components/WorkspaceSummaryModal.tsx` | **工作区 AI 总结** | `<Markdown>` 只读渲染 | 低 — AI 生成, 纯展示 | P3 |

### 3.2 未使用 react-markdown 但需要 Markdown 的场景

| 文件 | 场景 | 当前实现 | 编辑需求 |
|------|------|----------|----------|
| `src/views/KnowledgeBaseView.tsx` | **全局知识库** | `whitespace-pre-wrap` 纯文本渲染 | **高 — 有 "编辑" 按钮但完全未实现** |
| `src/components/TaskKanban.tsx` | **任务描述** | `<p>` 纯文本渲染 | 低 — 任务描述通常短文本 |

### 3.3 场景分类

```
                     编辑需求
                    高 ┃ P0                    P1
                      ┃ ProductKnowledgeTab    FullDeliverablesTab
                      ┃ (Textarea 编辑)        (查看/编辑 modal)
                      ┃
                   中 ┃                        KnowledgeBaseView
                      ┃                        (编辑按钮未实现)
                      ┃
                   低 ┃ AIRequirementsTab      ProductDocsTab
                      ┃ CompetitorAnalysis     WorkspaceSummary
                      ┃ TaskKanban             (纯展示)
                      ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         低                    中              高
                                        内容复杂度/长度
```

### 3.4 核心发现

1. **唯一真正的编辑场景**: `ProductKnowledgeTab.tsx` — 使用原生 `<Textarea>` 编辑 Markdown 原文, 切回预览时用 `<ReactMarkdown>` 渲染。这是 **最大的痛点**: 用户必须看着原始 Markdown 符号编辑, 没有格式化反馈。

2. **伪编辑场景**: `FullDeliverablesTab.tsx` 的 "查看/编辑" 按钮打开的 modal 只有 `<ReactMarkdown>` 渲染 + "复制/导出/归档" 操作, **没有实际编辑能力**。

3. **完全缺失的编辑**: `KnowledgeBaseView.tsx` 有 "编辑" 按钮但点击无任何反应 (仅 UI 展示)。

4. **纯渲染占多数**: 6 个使用 `react-markdown` 的文件中, 5 个是纯渲染场景, 不需要编辑器。`react-markdown` 在这些场景表现良好, **不应替换**。

---

## 4. 替代方案对比表

### 4.1 基本信息对比

| 维度 | Milkdown | Tiptap | BlockNote | MDXEditor | ByteMD |
|------|----------|--------|-----------|-----------|--------|
| **底层引擎** | ProseMirror + Remark | ProseMirror | Lexical (Meta) | Lexical (Meta) | Svelte → vanilla JS |
| **npm 包** | `@milkdown/react` | `@tiptap/react` | `@blocknote/react` | `@mdxeditor/editor` | `@bytemd/react` |
| **GitHub stars** | ~8.6k | ~29k | ~7.5k | ~6k | ~4.5k |
| **License** | MIT | MIT (core) / Pro 付费 | MIT | MIT | MIT |
| **最新版本** | v7.x (2026) | v3.x (2026) | v0.51.x (2026) | v4.2.0 (2026) | v1.22.0 (stable) |
| **维护方** | 社区 (Milkdown org) | Tiptap GmbH (商业公司) | TypeCell (商业公司) | 社区 (mdx-editor org) | 字节跳动 (ByteDance) |

### 4.2 八维度评分 (1-5 分, 5 最优)

| 维度 | Milkdown | Tiptap | BlockNote | MDXEditor | ByteMD |
|------|----------|--------|-----------|-----------|--------|
| **React 19 兼容** | 3 (有已知问题) | **5** (官方支持) | **5** (2026 更新) | **5** (官方支持) | 4 (Svelte 编译, wrapper 可用) |
| **Bundle size (gzip)** | 4 (~200KB) | 3 (~245KB) | 2 (~200KB core + 依赖爆炸) | 2 (~250KB selective / ~560KB full) | 4 (~174KB) |
| **插件/扩展** | **5** (plugin-driven) | **5** (extension system) | 4 (block-based blocks) | 4 (plugin-based) | 3 (plugin system, 较简单) |
| **主题定制** | 4 (theme system) | **5** (headless, 完全自定义) | 3 (有自带 UI, 可覆盖) | 3 (有自带 UI, 可覆盖) | 3 (scoped CSS, 定制有限) |
| **Tauri WebView** | 4 (纯客户端) | **5** (纯客户端, 无 SSR 依赖) | 4 (纯客户端) | 4 (纯客户端) | **5** (Svelte 编译为 vanilla JS) |
| **学习曲线** | 3 (ProseMirror 概念) | 3 (ProseMirror + extension 概念) | **4** (声明式 block schema) | **4** (React 组件 + plugin) | **5** (最简单的 API) |
| **社区活跃度** | 4 (8.6k stars, 活跃) | **5** (29k stars, 商业支持) | 4 (7.5k stars, 活跃) | 3 (6k stars, 社区驱动) | 3 (4.5k stars, 字节维护放缓?) |
| **Headless 程度** | 2 (有自带 UI) | **5** (完全 headless) | 2 (有完整 UI) | 2 (有完整 UI) | 3 (有 UI, 但可自定义) |

### 4.3 Bundle Size 实测数据 (2026)

| 编辑器 | 包名 | Minified (KB) | Gzipped (KB) | 数据来源 |
|--------|------|---------------|--------------|----------|
| **react-markdown** (现状) | `react-markdown` v10.1.0 | 111.0 | **33.3** | Bundlephobia |
| **Milkdown** | `@milkdown/react` v7.21.2 | 1.2 | **0.6** (*仅 wrapper*) | Bundlephobia |
| | + `@milkdown/core` + presets | ~500+ | **~200** (估) | 社区估算 |
| **Tiptap** | `@tiptap/react` + core exts | ~600 | **~245** | Eddyter 2026 |
| **BlockNote** | `@blocknote/core` v0.51.4 | 659.8 | **~199** | Bundlephobia |
| | + Shiki + emoji-mart | 1400+ | **600+** (实际) | GitHub issues |
| **MDXEditor** | `@mdxeditor/editor` v4.2.0 | ~1,700 | **~250** (selective) | Bundlephobia / Eddyter |
| | full (all plugins) | ~1,700 | **~562** | Bundlephobia |
| **ByteMD** | `@flicmd/bytemd-react` v1.21.4 | 575.3 | **~174** | Bundlephobia |

> **注**: Milkdown 的 `@milkdown/react` 仅是 React wrapper, 核心引擎 + preset 需额外引入。实际总 bundle 约 200KB gzip。

### 4.4 与 Nova 设计系统的契合度

| 维度 | Nova 需求 | 最佳匹配 |
|------|-----------|----------|
| **样式** | Tailwind v4 tokens, 无硬编码颜色 | **Tiptap** (headless, 用 Tailwind 构建) |
| **组件模式** | Radix primitives + motion | **Tiptap** (自带 UI 可完全替换) |
| **暗色模式** | tokens 定义但未完全接入 | **Tiptap** / **MDXEditor** (支持 dark mode) |
| **Phosphor Icons** | `weight="duotone"` 约定 | 所有编辑器都可集成 (图标可自定义) |
| **中文输入** | PM 工具, 大量中文输入 | 所有 ProseMirror/Lexical 底层方案都经过中文输入测试 |

---

## 5. 集成方案建议

### 5.1 推荐方案: MDXEditor (首选) + react-markdown (纯渲染保持)

**为什么 MDXEditor 而不是 Tiptap?**

虽然 Tiptap 是 headless 且与 Tailwind 完美契合, 但 Nova 的核心需求是 **Markdown 编辑**, 不是通用富文本:

| 考量 | MDXEditor | Tiptap |
|------|-----------|--------|
| **Markdown 原生** | 输入/输出都是标准 Markdown | 输出 HTML/JSON, 需 remark 转换 Markdown |
| **工具栏** | 开箱即用的 Markdown 工具栏 | 需从零构建所有 UI |
| **代码块** | 内置 Sandpack 实时代码预览 | 需自行集成 |
| **表格** | 内置 Markdown 表格编辑 | 需 ProseMirror table 扩展 |
| **frontmatter** | 内置 YAML frontmatter 编辑 | 需自行开发 |
| **Markdown 源码切换** | 内置 WYSIWYG <-> Markdown toggle | 需自行实现 |
| **开发工作量** | 1-2 天集成 | 5-10 天构建 UI + Markdown 同步 |

**Nova 需要 Markdown 输入 -> Markdown 存储 的闭环, MDXEditor 天然满足; Tiptap 需要额外工程。**

### 5.2 分场景方案

| 场景 | 方案 | 理由 |
|------|------|------|
| **ProductKnowledgeTab 编辑** | **MDXEditor** | 替换 `<Textarea>`, 提供 WYSIWYG Markdown 编辑 |
| **KnowledgeBaseView 编辑** | **MDXEditor** | 实现 "编辑" 按钮功能, 接入 MDXEditor |
| **FullDeliverablesTab "编辑"** | **MDXEditor** (只读模式) | 标记 "查看/编辑" 的 modal 中加编辑能力 |
| **6 个纯渲染场景** | **保持 `react-markdown`** | react-markdown 仅 33KB gzip, 渲染效果好, 无需替换 |
| **TaskKanban 描述** | **保持纯文本** | 任务描述短文本, 不需要 Markdown 编辑器 |

### 5.3 API 接口设计草案

```tsx
// src/components/ui/MarkdownEditor.tsx — Nova 封装层
import { MDXEditor, MDXEditorMethods, MDXEditorProps, toolbarPlugin, markdownShortcutPlugin } from '@mdxeditor/editor';

interface MarkdownEditorProps {
  value: string;                    // Markdown 原文
  onChange: (markdown: string) => void;  // 输出 Markdown 原文
  readOnly?: boolean;               // 只读模式 (用于纯渲染场景)
  placeholder?: string;
  className?: string;               // 与 Nova cn() 约定一致
  minHeight?: string;               // 例如 '320px'
}

export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  className,
  minHeight = '320px',
}: MarkdownEditorProps) {
  const editorRef = React.useRef<MDXEditorMethods>(null);

  return (
    <MDXEditor
      ref={editorRef}
      markdown={value}
      onChange={onChange}
      contentEditableClassName={cn(
        'prose prose-sm max-w-none text-text-primary font-sans leading-relaxed',
        'focus:outline-none',
      )}
      readOnly={readOnly}
      placeholder={placeholder}
      plugins={[
        toolbarPlugin({ toolbarContents: () => <DefaultToolbar /> }),
        markdownShortcutPlugin(),
        // 按需加载: tables, code blocks, frontmatter, etc.
      ]}
      className={cn(
        'border border-border-subtle rounded-[var(--radius-lg)]',
        'bg-bg-primary',
        className,
      )}
    />
  );
}
```

### 5.4 与 Zustand Store 交互模式

```tsx
// 以 ProductKnowledgeTab 为例
const selectedItem = items.find(i => i.id === selectedItemId);

// 编辑模式: MDXEditor 直接绑定 store
<MarkdownEditor
  value={editContent}
  onChange={(md) => setEditContent(md)}
  // Markdown 原文存储在组件 local state, 保存时 flush 到 store
/>

// 保存时
const handleSaveEdit = () => {
  updateKnowledgeItem(product.id, selectedItem.id, {
    ...otherFields,
    content: editContent,  // Markdown 原文
  });
};

// 渲染模式: 保持 react-markdown (不变)
<div className="prose prose-sm max-w-none">
  <ReactMarkdown>{selectedItem.content}</ReactMarkdown>
</div>
```

### 5.5 Bundle Size 影响估算

| 项目 | 当前 | 引入 MDXEditor 后 | 增量 |
|------|------|-------------------|------|
| `react-markdown` (保留) | 33 KB gzip | 33 KB gzip | — |
| MDXEditor (selective plugins) | 0 | ~250 KB gzip | +250 KB |
| **总编辑器相关** | **33 KB** | **~283 KB** | **+250 KB** |
| Nova 整体 (估) | ~800 KB gzip | ~1050 KB gzip | +31% |

**评估**: +250 KB gzip 对桌面 app (Tauri WebView) 影响可接受。首次加载增加约 0.5s (本地 WebView), 后续由浏览器缓存。

**优化策略**:
- 使用 `React.lazy()` + `Suspense` 延迟加载 MDXEditor (仅编辑模式加载)
- 按需引入 plugins (不加不需要的 table/frontmatter/sandpack)
- 纯渲染场景保持 `react-markdown` (不引入 MDXEditor)

### 5.6 迁移路径

```
Phase 1 (快速): 新增 MarkdownEditor 组件
├── 创建 src/components/ui/MarkdownEditor.tsx (封装 MDXEditor)
├── ProductKnowledgeTab: Textarea → MarkdownEditor (编辑模式)
├── 保持所有 ReactMarkdown 渲染不变
└── 验证 Tailwind v4 样式共存

Phase 2 (扩展): 覆盖更多编辑场景
├── KnowledgeBaseView: 实现 "编辑" 按钮 → MarkdownEditor
├── FullDeliverablesTab: "查看/编辑" modal 加编辑能力
└── 暗色模式适配 (如果 P7 已接入)

Phase 3 (优化): 性能与体验
├── React.lazy() 延迟加载 MDXEditor
├── 自定义 toolbar 适配 Nova 设计语言
└── AI 润色结果直接注入编辑器 (替代 Textarea)
```

---

## 6. 最终推荐

### 6.1 推荐方案总结

| 层级 | 方案 | 理由 |
|------|------|------|
| **Markdown 编辑器** | **MDXEditor** (`@mdxeditor/editor`) | React 原生, Markdown-first, 插件化, 开箱即用工具栏, MIT |
| **Markdown 渲染** | **react-markdown** (保持现状) | 33KB gzip, 渲染效果好, 无需替换 |
| **纯文本场景** | **保持原生 HTML** | TaskKanban 等短文本场景不需要编辑器 |
| **否决方案** | Atomic Editor | 太早期 (v0.6.2), 单人维护, 非通用组件库 |

### 6.2 否决其他方案的理由

| 方案 | 否决理由 |
|------|----------|
| **Atomic Editor** | v0.6.2, 单人项目, 122 stars, 无 API 文档, 与父项目强耦合 |
| **Tiptap** | Headless 是优势但 Nova 需要 Markdown 原生支持, Tiptap 输出 HTML/JSON 需额外转换层; 开发量大 (5-10天 vs 1-2天) |
| **BlockNote** | Block-based 范式偏离传统 Markdown; bundle 实际 600KB+ (Shiki + emoji-mart); 与 Tailwind v4 可能版本冲突 (BlockNote 自带 Tailwind) |
| **Milkdown** | React 19 有已知兼容问题 (CSDN 文章记录 5 大难题); 社区规模不如 Tiptap |
| **ByteMD** | 基于 Svelte, React 集成是 wrapper 层; 字节维护力度不确定 (v1 长期未大版本更新); 插件生态较弱 |

### 6.3 MDXEditor 的已知风险

| 风险 | 缓解措施 |
|------|----------|
| Full bundle ~560KB gzip | 按需加载 plugins, React.lazy() 延迟加载 |
| 自带 UI 与 Nova 设计语言不完全一致 | 通过 `contentEditableClassName` + CSS override 适配 |
| Lexical 底层学习成本 | 仅使用 MDXEditor 的高层 API, 不直接操作 Lexical |
| 中文输入法兼容性 | Lexical 经过 Meta 内部中文输入测试; 需在 Tauri WebView 中实际验证 |

### 6.4 决策矩阵

```
                    Markdown 原生
                         高 ┃ MDXEditor    ByteMD
                           ┃
                        中 ┃ Milkdown
                           ┃
                        低 ┃ Tiptap       BlockNote
                           ┗━━━━━━━━━━━━━━━━━━━━━━━━
                              低           中          高
                                    React 集成度
```

**Nova 需要在 "Markdown 原生" 和 "React 集成度" 两个维度都高** — MDXEditor 是唯一同时满足的方案。

---

## 附录 A: 参考链接

### Atomic Editor
- [GitHub: kenforthewin/atomic-editor](https://github.com/kenforthewin/atomic-editor)
- [HN: Show HN - Atomic Editor](https://news.ycombinator.com/item?id=48345201)
- [Demo: kenforthewin.github.io/atomic-editor](https://kenforthewin.github.io/atomic-editor/)
- [npm: @plannotator/atomic-editor](https://www.npmjs.com/package/@plannotator/atomic-editor)

### 替代方案
- [MDXEditor](https://mdxeditor.dev/) | [GitHub](https://github.com/mdx-editor/editor) | [npm](https://www.npmjs.com/package/@mdxeditor/editor)
- [Tiptap](https://tiptap.dev/) | [GitHub](https://github.com/ueberdosis/tiptap) | [React 文档](https://tiptap.dev/docs/editor/getting-started/install/react)
- [BlockNote](https://www.blocknotejs.org/) | [GitHub](https://github.com/TypeCellOS/BlockNote) | [npm](https://www.npmjs.com/package/@blocknote/react)
- [Milkdown](https://milkdown.dev/) | [GitHub](https://github.com/Milkdown/milkdown) | [React 文档](https://milkdown.dev/docs/recipes/react)
- [ByteMD](https://bytemd.js.org/) | [GitHub](https://github.com/pd4d10/bytemd) | [npm](https://www.npmjs.com/package/@bytemd/react)

### Bundle Size 数据源
- [Eddyter: 12 Rich Text Editor Bundle Sizes Compared 2026](https://eddyter.com/blogs/rich-text-editor-bundle-size-comparison-2026)
- [Eddyter: Best React Markdown Editor 2026](https://eddyter.com/blogs/best-markdown-editor-components-react-2026)
- [Bundlephobia: @mdxeditor/editor](https://bundlephobia.com/package/@mdxeditor/editor)
- [Bundlephobia: @blocknote/core](https://bundlephobia.com/result?p=@blocknote/core)
- [Bundlephobia: @milkdown/react](https://bundlephobia.com/package/@milkdown/react)

### 综合对比
- [Strapi: 5 Best Markdown Editors for React](https://strapi.io/blog/top-5-markdown-editors-for-react)
- [Liveblocks: Which Rich Text Editor Framework 2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)
- [Nutrient: Headless vs WYSIWYG Editors 2026](https://www.nutrient.io/blog/headless-vs-wysiwyg/)
