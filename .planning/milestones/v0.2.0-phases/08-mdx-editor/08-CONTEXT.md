# Phase 8: MDXEditor 集成 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — used REQUIREMENTS.md + ROADMAP.md + research as spec)

<domain>
## Phase Boundary

知识库和产品文档拥有真正的 Markdown WYSIWYG 编辑能力,替换原生 Textarea,提供格式化反馈。本 phase 仅交付编辑器集成 + 2 处替换(ProductKnowledgeTab + KnowledgeBaseView),不涉及 AI 辅助生成(留到 Phase 11)。

</domain>

<decisions>
## Implementation Decisions

### 组件选型 (EDITOR-01..05 已调研锁定)
- **D-01:** 使用 `@mdxeditor/editor` 作为 Markdown WYSIWYG 编辑器(前置调研结论已锁)
- **D-02:** React.lazy() 延迟加载 MarkdownEditor 组件,不影响首屏性能
- **D-03:** 按需引入 plugins:toolbar、headings、lists、tables、code-styling、link、image。Bundle 增量控制在 ~250KB gzip
- **D-04:** 纯渲染场景(6 处 react-markdown)保持不变,只替换编辑场景

### 组件封装
- **D-05:** 新增 `src/components/ui/MarkdownEditor.tsx`,API 与 Nova 设计系统对齐:`value: string`、`onChange: (val: string) => void`、`readOnly?: boolean`、`className?: string`、`placeholder?: string`
- **D-06:** 内部 React.lazy() + Suspense fallback(骨架屏)
- **D-07:** Tailwind v4 共存验证:MDXEditor 内部样式不污染设计系统,设计系统 token 不破坏 MDXEditor 渲染

### 替换位置
- **D-08:** ProductKnowledgeTab 的 `<Textarea>` 替换为 `<MarkdownEditor>`,编辑时实时渲染 Markdown 格式
- **D-09:** KnowledgeBaseView 的"编辑"按钮接入 MarkdownEditor,实现完整知识库文章编辑流程(点击编辑 → 切换到编辑模式 → 保存/取消)

### Claude's Discretion
- Toolbar 工具项排列(粗体/斜体/标题/列表/链接/表格/代码块的顺序)
- MarkdownEditor 高度/最小高度
- 编辑/预览模式切换 UI(单独 tab vs 内联切换)

</decisions>

<canonical_refs>
## Canonical References

### 项目级约束
- `.planning/PROJECT.md` — Core Value, Constraints
- `.planning/REQUIREMENTS.md` — EDITOR-01..05 (前置调研结论已输出,不在 phase 序列中)
- `.planning/research/ATOMIC-EDITOR.md` — 编辑器选型调研报告(MUST READ,否决 Atomic Editor / Tiptap / BlockNote 的理由 + MDXEditor 选型细节)

### Phase 5/6/7 参考
- 设计系统 token: `src/styles/tokens.css`
- `src/components/ui/index.ts` — barrel 导出
- Tailwind v4 配置:`src/index.css`(`@theme` directive)

### 架构与代码规范
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`

### ROADMAP
- `.planning/ROADMAP.md` §Phase 8

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/Textarea.tsx` — 被 MarkdownEditor 替换的组件,API 对齐参考
- `src/components/ui/index.ts` — barrel 导出 MarkdownEditor
- 6 处 react-markdown 使用:`src/components/product/ProductKnowledgeTab.tsx`、`src/views/KnowledgeBaseView.tsx` 等(调研结论已记录具体位置)

### Established Patterns
- forwardRef + cn() className 合并
- variant via Record<Variant, string>
- React.lazy() + Suspense 模式(已用于 view 懒加载)

### Integration Points
- 新增 `src/components/ui/MarkdownEditor.tsx`
- `src/components/ui/index.ts` — barrel re-export
- `src/components/product/ProductKnowledgeTab.tsx` — 替换 Textarea
- `src/views/KnowledgeBaseView.tsx` — 加编辑按钮 + 编辑模式
- `package.json` — 加 `@mdxeditor/editor` 依赖

</code_context>

<specifics>
## Specific Ideas

- 编辑器 toolbar 风格参考 Notion / Linear 的极简感
- 默认显示编辑+预览 split view(若 MDXEditor 支持),否则单击切换

</specifics>

<deferred>
## Deferred Ideas

- AI 辅助生成/润色(Phase 11)
- 多人协作编辑(v0.3+)
- 图片上传(本地文件路径,v0.3+)

</deferred>

---

*Phase: 08-mdx-editor*
*Context gathered: 2026-08-10 (autonomous mode)*
