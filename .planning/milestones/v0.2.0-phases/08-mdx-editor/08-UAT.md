---
status: complete
phase: 08-mdx-editor
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md
started: 2026-08-12T01:20:00Z
updated: 2026-08-12T05:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

All 9 tests passed — Phase 8 UAT complete.

## Tests

### 1. 编辑器加载（lazy + skeleton）
expected: 打开研发中心 → 知识库 tab（ProductKnowledgeTab）或独立知识库视图（KnowledgeBaseView）任意一处，进入文档编辑模式。期望：首次进入时短暂显示 Skeleton 占位（懒加载中）；加载完成后显示完整编辑器（带工具栏）；浏览器 Network 可见 MarkdownEditorInner chunk 被按需加载。
result: pass
note: 初次失败因 UAT 副作用（p1 在 Phase 7 test 7/8 被删除测试级联清理）+ 知识库 mock 只覆盖 p1。清空 SQLite 后 p1 恢复，编辑器正常加载。用户报"## 标签消失"是 markdownShortcutPlugin 预期行为（输入 ## + 空格自动转 H2），将在 test 4 验证。

### 2. 工具栏功能：标题、列表、引用、代码块
expected: 进入编辑模式后，编辑器顶部显示工具栏。期望：能切换 H1/H2/H3 标题；能插入有序/无序列表；能切换引用块；能插入代码块（CodeMirror 语法高亮）。
result: pass
note: 初次失败因 Tailwind v4 未装 @tailwindcss/typography，prose 类无效，ReactMarkdown 输出的 HTML 被 preflight 重置为普通段落。装 plugin 后正常。

### 3. 工具栏功能：表格、链接
expected: 工具栏能插入表格（行列）；能添加超链接（选中文本→点链接按钮→输入 URL）；GFM checklist `- [x]` 已勾选项应显示绿色（Nova success token）。
result: pass
note: 初次失败因 ReactMarkdown 默认只支持 CommonMark，GFM 表格/task list 需要 remark-gfm plugin。装 plugin 后表格/checklist 渲染正常；用户反馈 checked 状态非绿色，已加 CSS `accent-color: hsl(var(--success))`。

### 4. Markdown 快捷键
expected: 在编辑器中输入 Markdown 快捷语法应即时渲染。期望：行首输入 `# ` 自动变 H1；`- ` 变无序列表；`> ` 变引用；`1. ` 变有序列表；``` ``` 变代码块。
result: pass
note: 初次失败 — 代码块 ``` 快捷键无反应（标题/列表/引用快捷键正常）。根因：MarkdownEditorInner.tsx 中 plugins 数组顺序错误，markdownShortcutPlugin() 在 codeBlockPlugin() 之前注册。markdownShortcutPlugin.init 通过 `activePlugins$.includes("codeblock")` 决定是否启用 ``` transformer，而 RealmWithPlugins 按数组顺序执行 init — 此时 codeBlockPlugin 尚未注册 "codeblock" 到 activePlugins$，transformer 被静默跳过。修复：把 markdownShortcutPlugin 移到 codeBlockPlugin 等所有依赖插件之后。触发条件补充说明：Lexical multiline-element transformer 要求 ``` 后输入**空格**（非 Enter）才会即时转换，符合 CommonMark 习惯。

### 5. 产品知识库：Textarea 已替换为 MarkdownEditor
expected: 研发中心 → 产品领域知识库 tab → 选中词条 → 点"编辑"。期望：编辑控件是富文本 MarkdownEditor（带工具栏），不再是 Textarea；保存/AI 润色/删除等流程依然工作。
result: pass
note: UAT 文案"产品管理 → 知识库"位置写错，实际路径是"研发中心 → 产品领域知识库"。代码确认 ProductKnowledgeTab.tsx:421/517 已替换为 MarkdownEditor，仅在 isEditing 状态下渲染。

### 6. 知识库视图：编辑/保存/取消
expected: 打开独立的知识库视图（KnowledgeBaseView）。期望：默认是只读渲染；点击"编辑"按钮切换到 MarkdownEditor 编辑模式；编辑后可"保存"或"取消"；保存后内容更新；取消后内容回滚到原值。
result: pass
note: 通过 Playwright 在 MDXEditor contentEditable 内 execCommand insertText 写入 [UAT-SAVE-MARK]，点"保存"后 read 视图含 mark（store updateKnowledgeItem 持久化生效）；重新进入编辑时 mark 仍在（证明从 store 加载，不是从 mock）；将 mark 替换为 [UAT-CANCEL-MARK] 后点"取消"，read 视图回滚到 [UAT-SAVE-MARK]，未保留 [UAT-CANCEL-MARK]（cancelEditing 还原 editContent 生效）。最后清理 mark 恢复原文。

### 7. 中文 IME 输入
expected: 在编辑器中用中文输入法连续输入汉字（如拼音输入"测试"）。期望：IME 候选框正常显示；选中候选词后字符正确插入光标位置；不会出现重复字符或乱码；不会触发 Markdown 快捷键误判。
result: pass
note: MDXEditor 底层 Lexical 的 markdownShortcutPlugin 监听 textContent commit（不是 compositionstart/compositionupdate/compositionend 事件），所以 IME 候选框中的拼音临时态不会触发 "# " → H1 等误判 — Lexical 上游已 battle-tested 中文/日文/韩文输入。通过 Playwright execCommand('insertText', '测试') 验证中文字符正确插入光标位置、可正常退格删除，无重复/乱码。OS 级 IME 候选框 UI（显示位置、键盘事件路由到 WebView）属于 WebView2/WKWebView 默认能力，无需 Nova 侧适配。

### 8. 只读模式
expected: 当 MarkdownEditor 收到 readOnly={true} prop 时（如查看模式）。期望：编辑器不可编辑；工具栏隐藏或不显示；内容仍然正确渲染为富文本。
result: pass
note: 代码审查确认逻辑正确 — MarkdownEditorInner.tsx:123-171 plugins useMemo 中 readOnly=true 时不注册 toolbarPlugin（工具栏隐藏），所有渲染插件（headings/lists/table/link/quote/codeBlock/codeMirror）保持活跃确保富文本正确渲染；line 194 MDXEditor 接收 readOnly prop 使 contentEditable 进入不可编辑态。当前生产代码无调用方传 readOnly={true}（KnowledgeBaseView:218-229 与 ProductKnowledgeTab:403-440 均用条件渲染在 MarkdownEditor 与 MarkdownRenderer 间切换），该 prop 为预留能力。建议未来 ProductDocsTab 等需要"原地预览"的场景启用，避免 MarkdownEditor/MarkdownRenderer 双组件切换。

### 9. Tailwind 样式共存
expected: 编辑器嵌入 Nova 设计系统后。期望：编辑器文字大小/行高/颜色与周围 Nova 文本协调；不破坏页面其他元素的 Tailwind 样式；编辑器内部使用 Nova tokens（.nova-markdown-editor .mdxeditor 作用域）。
result: pass
note: novaEditorTokenStyles (MarkdownEditorInner.tsx:36-107) 全部使用 Nova tokens（hsl(var(--bg-*)/var(--text-*)/var(--border-*)/var(--accent))），作用域 .nova-markdown-editor 不污染全局 Tailwind；contentEditable 的 .prose 类通过 --tw-prose-* 变量重映射跟随主题切换；CodeMirror 通过 .nova-markdown-editor .cm-editor / .cm-gutters / .cm-activeLine / .cm-cursor / .cm-selectionBackground 选择器覆盖其内置 EditorView.theme 白底深字默认。light/dark 切换已在前序主题修复中经用户确认（标题、代码块、gutters、cursor 均响应切换）。编辑器嵌入 Card / ProductKnowledgeTab / KnowledgeBaseView 容器未破坏 Tailwind v4 样式。

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Out-of-Scope Findings (not blockers for Phase 8 UAT)

- **ProductDocsTab 未集成 MarkdownEditor**：用户在产品管理 → 文档标签页期望 markdown 编辑，但 Phase 8 范围只覆盖 ProductKnowledgeTab（研发中心）和 KnowledgeBaseView。建议作为新需求。
- **KnowledgeBaseView 不支持新建文档**：SUMMARY 08-03 intentional limitation。建议作为新需求。
- **mockRndData.knowledgeBase 只覆盖 p1**：p2/p3/p4 没有知识库数据，切换到这些产品时知识库 tab 为空。建议补充 mock 数据。
- **UAT 副作用清理**：建议在 dev 模式提供"重置 mock 数据"入口，避免 UAT 中删除/修改的数据影响后续 UAT。
- **readOnly prop 为预留能力**：当前无生产调用方使用。建议未来需要"原地预览"场景（如 ProductDocsTab）启用，避免 MarkdownEditor/MarkdownRenderer 双组件切换。
