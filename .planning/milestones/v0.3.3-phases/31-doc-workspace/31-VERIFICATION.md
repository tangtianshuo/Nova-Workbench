---
phase: 31-doc-workspace
verified: 2026-09-04T12:00:00+08:00
status: human_needed
score: 7/7 must-haves verified (codebase level)
human_verification:
  - test: "SC-2.3 真机复测:知识库全局搜索命中笔记后点击结果行,右侧文档面板打开该文档"
    expected: "面板滑出且编辑器加载该笔记内容"
    why_human: "点击交互 + 面板动画,静态 grep 只能验证 openDoc(hit.docId) 接线(KnowledgeBaseView.tsx:336 已确认)"
  - test: "SC-7.2 Enter 斜杠复测:对已加样式(粗体等)文本按回车换行"
    expected: "无孤立反斜杠字符,自动保存不落库污染"
    why_human: "真实键盘输入 + IME 交互;repro 脚本 5/5 PASS(d2a22e7 BR_ONLY_RE guard),但需真机确认"
  - test: "SC-7.3 代码块复测:点击代码块,语言下拉 + prismjs 高亮,切换语言生效"
    expected: "出现语言选择控件,关键词高亮,切换后重新高亮"
    why_human: "ProseMirror NodeView 渲染交互;代码存在($view codeBlockView + prismjs 8 语言包,af24585),需视觉确认"
  - test: "SC-7.4 表格复测:光标在表格内点击 toolbar 行↑/行↓/列←/列→"
    expected: "对应方向插入行/列成功"
    why_human: "编辑器选区状态依赖;接线已确认(MarkdownToolbar.tsx:157-166 preset-gfm 命令,b9f9ce9)"
  - test: "SC-7.5 面板宽度复测:最大化下拉宽编辑区,再缩小客户端窗口"
    expected: "编辑区等比例缩小,不超 60vw,不遮挡"
    why_human: "窗口 resize 视觉行为;CSS clamp 已确认(DocWorkspaceShell.tsx:90 maxWidth:'60vw',84d151c)"
---

# Phase 31: 文档工作区 — Milkdown 编辑器 + 右侧常驻面板 Verification Report

**Phase Goal:** 右侧常驻文档工作区(Milkdown core headless 编辑器,可收起/拖宽),承载修改 AI 产出/日常笔记/阅读审批 AI 文档三场景;⌘K AI Drawer 改左滑并存;MDXEditor 全量退役(删 vendored patch);笔记落 knowledge_docs 扩展;待确认文档的确认卡在工作区多宿主渲染
**Verified:** 2026-09-04T12:00:00+08:00
**Status:** human_needed(自动化全通过;5 个 gap 修复待真机复测)
**Re-verification:** No — initial VERIFICATION.md(gap-closure 后首次 goal-backward 验证;UAT 记录在 31-HUMAN-UAT.md)

## Goal Achievement

### Observable Truths(ROADMAP SC-1..7 + gap closure)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | SC-1/1b 工作区打开/编辑/自动保存/版本化持久 + 多 tab flush | ✓ VERIFIED(UAT pass) | docWorkspaceStore openDoc/expandPanel(:11,53);UAT tests 1-2 pass |
| 2 | SC-2 全局笔记 doc_kind=note + FTS5 检索 + **搜索结果打开面板(SC-2.3 gap fix)** | ✓ VERIFIED(code) / ? 真机复测 | migration 0014_doc_kind_note.sql;KnowledgeBaseView.tsx:336 `openDoc(hit.docId)`(c928a67) |
| 3 | SC-3 确认卡第三宿主,队列唯一真相源 | ✓ VERIFIED(UAT pass) | WorkspaceConfirmCard 渲染于 DocWorkspaceContent.tsx:96 |
| 4 | SC-4 ⌘K Drawer 左滑并存 | ✓ VERIFIED(UAT pass) | Drawer.tsx:55 isLeft 分支;ChatPanel.tsx:172 `side="left"` |
| 5 | SC-5 MDXEditor 零残留 | ✓ VERIFIED | `grep -ri mdxeditor src/ package.json patches/` = 0 命中;patches/ 目录已无 |
| 6 | SC-6 编辑器全 Nova tokens(含 31-09 codeBlock/prism 样式) | ✓ VERIFIED | index.css `milkdown` 块 56 处;无 @milkdown/theme-* / components 引入 |
| 7 | SC-7 IME/round-trip/面板交互(5 gaps) | ✓ VERIFIED(code) / ? 真机复测 | 见下 Gap Closure 验证 |

**Score:** 7/7 truths verified at codebase level

### Gap Closure Verification(31-08 / 31-09)

| Gap | Fix | Code Evidence | Commit | 真机复测 |
| --- | --- | --- | --- | --- |
| SC-2.3 搜索不打开面板 | openDoc(hit.docId) | KnowledgeBaseView.tsx:336 | c928a67 | 待用户 |
| SC-7.5 宽度不自适应 | maxWidth:'60vw' | DocWorkspaceShell.tsx:90(非 zen) | 84d151c | 待用户 |
| Enter 斜杠污染 | BR_ONLY_RE guard | MarkdownEditorInner.tsx:67,75 | d2a22e7 | 待用户 |
| 代码块无控件/高亮 | $view NodeView + select + prismjs 8 语言包 | MarkdownEditorInner.tsx(codeBlockView ×2, Prism imports :19-23) | af24585 | 待用户 |
| 表格无行列操作 | 4 toolbar 按钮 preset-gfm 命令 | MarkdownToolbar.tsx:157-166 | b9f9ce9 | 待用户 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript 零错误 | `npm run lint` | clean | ✓ PASS |
| Enter 斜杠回归 | `node .planning/debug/repro-enter-slash.mjs` | 5/5 PASS(无反斜杠文本节点,round-trip 稳定) | ✓ PASS |
| MDXEditor 零残留 | grep src/ package.json patches/ | 0 命中 | ✓ PASS |
| prismjs 依赖落 package.json | grep | prismjs ^1.30.0 + @types/prismjs dev | ✓ PASS |
| gap closure commits 存在 | git log | c928a67/84d151c/d2a22e7/af24585/b9f9ce9/6fe8374 全在 | ✓ PASS |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| KnowledgeBaseView 搜索行 | docWorkspaceStore.openDoc | onClick | ✓ WIRED(:336) |
| MarkdownToolbar | preset-gfm 行列命令 | runCmd | ✓ WIRED(:157-166) |
| MarkdownEditorInner | prismjs + codeBlockSchema.node | $view + setNodeMarkup | ✓ WIRED |
| DocWorkspaceShell | aside style | inline maxWidth | ✓ WIRED(:90) |
| DocWorkspaceContent | WorkspaceConfirmCard | render | ✓ WIRED(:96) |
| ChatPanel | Drawer side=left | prop | ✓ WIRED(:172) |

### Requirements Coverage

REQUIREMENTS.md 中无 DOC-xx、无 SC- anchors、无 Phase 31 映射(grep 0 命中)— 与 executor 报告一致。ROADMAP Requirements 标注「TBD」。**无 orphaned requirements,但也无注册需求**;本次以 ROADMAP success_criteria 为契约验证。建议:后续把 DOC 需求补录进 REQUIREMENTS.md 或在 ROADMAP 移除 TBD(流程债,非阻塞)。

### Anti-Patterns Found

无 blocker。31-09 摘要自报的两处 auto-fix($view 类型、jsdom devDep)已在 commit af24585/6fe8374 落地。行内代码语言标注未做(CommonMark 能力边界,plan 明示不做)— ℹ️ Info。

### Human Verification Required

见 frontmatter `human_verification`(5 项,对应 UAT tests 3 与 8 的 gap 修复;均已在代码层验证接线,仅剩真机交互确认)。31-05(autonomous: false)为人工 UAT wrapper,其 checklist 状态即 31-HUMAN-UAT.md — 待 5 项复测通过后置 pass。

### Gaps Summary

无代码层 gap。全部 7 条 success criteria 在代码库层面成立;5 个 UAT gap 修复均已提交且接线验证通过。剩余唯一事项:用户真机复测 5 个修复(UAT tests 3/8 复测),之后 31-05 可关闭。

---

_Verified: 2026-09-04T12:00:00+08:00_
_Verifier: Claude (gsd-verifier)_
