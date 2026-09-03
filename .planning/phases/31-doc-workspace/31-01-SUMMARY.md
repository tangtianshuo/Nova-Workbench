---
phase: 31-doc-workspace
plan: 01
subsystem: ui
tags: [milkdown, markdown, editor, prosemirror, react]

requires:
  - phase: 30-doc-workspace-research
    provides: Milkdown 7.22.1 PoC findings (IME, round-trip, patterns)
provides:
  - Milkdown 7.22.1 受控 Markdown 编辑器组件(契约兼容旧 MarkdownEditor)
  - tokens+Phosphor toolbar(含 heading 级别替换/回退)
  - 编辑器 ingest HTML 归一化(<br> → hardbreak)
  - live-preview 光标块语法显示(heading/quote/inline marks)
affects: [31-doc-workspace, KnowledgeBaseView, ProductKnowledgeTab, PrdDraftDialog]

tech-stack:
  added: ["@milkdown/kit@7.22.1", "@milkdown/react@7.22.1"]
  patterns: ["Milkdown 受控封装(lastEmitted 防回环 + replaceAll flush)", "ingest 归一化层", "decoration-based live preview"]

key-files:
  created: [src/components/ui/MarkdownToolbar.tsx]
  modified: [src/components/ui/MarkdownEditorInner.tsx, src/index.css, package.json]

key-decisions:
  - "Milkdown html node 保留 raw HTML round-trip,仅 <br> 在 ingest 归一化为 hardbreak"
  - "7.22.1 无 inlineSync,用自写 $prose decoration 插件实现 Obsidian 式光标块语法显示"
  - "heading 切换用直接 setNodeMarkup(保留 sync-heading-id),替代 wrapInHeadingCommand"

requirements-completed: [DOC-05, DOC-06]

duration: ~2 sessions
completed: 2026-09-03
---

# Phase 31 Plan 01: Milkdown 编辑器落地 Summary

**Milkdown 7.22.1 headless 受控编辑器替换 MDXEditor,含 UAT 4 项修复(HTML 归一化/live-preview/heading 替换/焦点边框)**

## Performance

- **Duration:** 跨 2 个 session(Task 1-2 + UAT 修复 session)
- **Completed:** 2026-09-03
- **Tasks:** 3(2 auto + 1 human-verify checkpoint,含 4 项修复)
- **Files modified:** 5

## Accomplishments
- Milkdown 受控编辑器(value/onChange/readOnly/placeholder/className/minHeight 契约不变,3 使用点零改动)
- MDXEditor 依赖 + patch-package + vendored patch 全退役,仓库零残留
- 真机 UAT:IME 四场景、round-trip、toolbar、tokens 外观、undo 隔离全部通过
- UAT 4 项反馈全部修复(见 Deviations)

## Task Commits

1. **Task 1: Milkdown 受控编辑器重写 + toolbar** - `a6f613d` (feat)
2. **Task 2: MDXEditor 全量退役** - `86734fa` (chore)
3. **UAT fix 3: heading 级别替换/回退** - `6f16652` (fix)
4. **UAT fix 1/2/4: HTML 归一化 + live preview + 焦点边框** - `4fc8b46` (fix)

## Files Created/Modified
- `src/components/ui/MarkdownEditorInner.tsx` - Milkdown 受控核心 + ingest 归一化 + live-preview decoration 插件
- `src/components/ui/MarkdownToolbar.tsx` - tokens+Phosphor toolbar,heading 直接 setNodeMarkup
- `src/index.css` - `.milkdown-editor` 唯一编辑器样式层(+syntax/gapcursor/focus-ring)
- `package.json` - +@milkdown/kit/@milkdown/react,-@mdxeditor/editor,-patch-package

## Decisions Made
- HTML 处理:Milkdown html node 本身 round-trip 无损,但显示为字面文本;仅 `<br>` 在 ingest 转 hardbreak(跳过 fenced code),其余 raw HTML 保留不动(不静默破坏)
- 7.22.1 无 inlineSync(全 node_modules 验证),live-preview 用 ~80 行 $prose decoration 插件:光标所在 heading/blockquote 显示 `##`/`>` widget,光标所在 inline mark 前后显示 `**`/`*`/`` ` ``/`~~` 定界符
- heading 切换:直接 `setNodeMarkup`(保留 sync-heading-id attr,同级再点回退 paragraph),绕过 wrapInHeadingCommand 不可重包裹问题
- 焦点黑边:CSS 层显式清除 .ProseMirror focus outline,gapcursor `border-top: black` 改 token

## Deviations from Plan

### UAT checkpoint 修复(user-approved 5 场景后反馈 4 项问题)

**1. [Rule 1 - Bug] 编辑加载出现字面 `<br />` 标签**
- **Found during:** Task 3(真机 UAT)
- **Issue:** AI 生成文档含 raw HTML;Milkdown html node 渲染为字面文本。另外 lastEmitted 初始化为 value 导致首次打开文档不触发 replaceAll(原文不加载的根因)
- **Fix:** ingest 归一化 `<br>` → `\` hardbreak(跳过 fenced code);lastEmitted 初始 `''` 保证首开必加载;replaceAll(flush) 带 addToHistory:false,listener 不回发,无回环
- **Files:** MarkdownEditorInner.tsx
- **Committed:** `4fc8b46`
- **验证:** 打开含 `<br />` 的知识文档点编辑,标签消失、换行生效;保存重开 round-trip 无损

**2. [Rule 2 - Missing Critical] 无 live preview(光标块语法显示)**
- **Issue:** 7.22.1 preset-commonmark 无 inlineSync(已验证 node_modules)
- **Fix:** 自写 decoration 插件:光标进 heading/blockquote 显示 `##`/`>`;光标所在 strong/emphasis/inlineCode/strikethrough 前后显示定界符。Delta vs Obsidian:仅空选区生效、相邻同类 mark 各自显示定界符(不合并)、非空选区不揭示
- **Files:** MarkdownEditorInner.tsx, index.css(.milkdown-syntax)
- **Committed:** `4fc8b46`

**3. [Rule 1 - Bug] heading 级别无法替换(H2→H3 无效)**
- **Fix:** toolbar heading 按钮改为直接 setNodeMarkup:任意级别替换任意级别,同级再点回退 paragraph,保留 heading id
- **Files:** MarkdownToolbar.tsx
- **Committed:** `6f16652`

**4. [Rule 1 - Bug] 编辑区黑色 solid 外边框**
- **Fix:** 清除 .ProseMirror 全部 focus outline;gapcursor 默认 `border-top: 1px solid black` 改 text-tertiary token
- **Files:** index.css
- **Committed:** `4fc8b46`

---

**Total deviations:** 4 auto-fixed(4× Rule 1/2 bug-fix)
**Impact:** 全部为 UAT 反馈的必要修复,无 scope creep。

## Issues Encountered
- None beyond UAT fixes above. lint + build 绿;编辑器 chunk 114.6KB gzip(PoC 预算 300KB 内)。

## User Setup Required
None

## Next Phase Readiness
- Milkdown 编辑器就绪,31-02+ 可在其上构建文档工作台
- live-preview 为最小实现,若需完整 Obsidian parity 需跟进 Milkdown inlineSync 上游

## Self-Check: PASSED
