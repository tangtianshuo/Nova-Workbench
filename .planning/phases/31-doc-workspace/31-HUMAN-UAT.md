---
status: diagnosed
phase: 31-doc-workspace
source: [31-HUMAN-UAT.md checklist (31-05 Task 1), 31-07-SUMMARY.md]
started: 2026-09-03T16:00:00+08:00
updated: 2026-09-04T10:45:00+08:00
---

运行方式:`npm run tauri:dev`,真实 Tauri 应用逐项执行。

## 预检(自动化,executor 执行于 2026-09-03)

| 项 | 命令 | 结果 |
| -- | ---- | ---- |
| TypeScript | `npm run lint` | ✅ 零错误 |
| 生产构建 | `npm run build` | ✅ 23.92s;编辑器 chunk gzip 114.61 KB(预算 300KB 内) |
| MDXEditor 残留 | `grep -ri mdxeditor src/ package.json patches/` | ✅ 零残留 |

## Current Test

[awaiting human retest round-2 2026-09-04] round-1 复测 5 项:1/2/5 签核通过;3(代码块无法输入文本)、4(表格点击后损坏)为 31-09 新引入缺陷,根因已修(57a92a7),待复测:

3. 代码块:点击进入可正常输入文本;语言下拉 + prismjs 高亮仍生效(fix round-2: NodeView 补 contentDOM,高亮改 decoration)
4. 表格:点击 3x3 或插行/插列按钮后表格保持完整(空单元格 round-trip 不再被 normalizeMarkdown 拆断),样式正常

## Tests

### 1. SC-1 打开/编辑/自动保存/重启持久(版本化)
expected: 1.1 点击文档面板滑出+编辑器立即有内容(SC-1.1 两轮修复后复测);1.2 修改正文防抖/失焦自动保存;1.3 重启后内容不丢;1.4 版本号递增
result: pass
note: SC-1.1 round-2 修复(bae50c6)复测通过
note: SC-1.1 历史:D-14 修复不够,round-2(bae50c6)真根因在 Milkdown 编辑器层 value-sync 竞态,加 loading 门控 + 行点击 openDoc

### 2. SC-1b 多 tab + 切换/关闭 flush 保存(31-07 D-15/D-16)
expected: 开 2+ 文档 tab 栏出现;改字后 ≤800ms 内立即切 tab/关 tab,内容不丢(flush);单文档或禅模式 tab 栏隐藏;关闭激活 tab 切左邻,全关面板空
result: pass

### 3. SC-2 全局笔记 + FTS5 检索
expected: 2.1 知识库 header「新建笔记」右侧面板开空白笔记(product_id='__global__');2.2 输入含独特中文关键词内容并保存;2.3 知识库全局搜索该关键词命中且可打开
result: issue
reported: "笔记命中，但没有打开文档编辑区"
severity: major
note: 2.1/2.2 正常(创建+保存+搜索命中);2.3 点击搜索结果未打开右侧编辑面板

### 4. SC-3 确认卡第三宿主
expected: 3.1 触发 agent 产出待确认文档;3.2 确认卡出现在右侧工作区内;3.3 工作区点确认:落库且 AgentConsole 队列同步清空;3.4 工作区点拒绝:队列移除、不落库
result: pass

### 5. SC-4 ⌘K 左滑 + 两侧并存
expected: 4.1 面板开着时 Ctrl+K:AI Drawer 从左侧滑出;4.2 两侧同屏互不遮挡,焦点在编辑器可直接打字;4.3 Drawer 内对话正常,Esc 只关 Drawer
result: pass

### 6. SC-5 MDXEditor 零残留(自动化)
expected: grep 零命中、依赖已移除、vendored patch 已删
result: pass
note: 自动化预检 2026-09-03 通过,见预检表

### 7. SC-6 编辑器视觉全 tokens
expected: 6.1 无外部编辑器默认主题痕迹;6.2 toolbar Phosphor duotone + hover/active 正常;6.3 内联编辑已移除(点击改开面板),PrdDraftDialog 编辑器与工作区一致
result: pass

### 8. SC-7 中文 IME + round-trip + 面板交互
expected: 7.1 IME 四场景(候选上屏/组合不丢字/组合中点 toolbar/中英混排);7.2 表格;7.3 代码块;7.4 嵌套列表 round-trip 无损;7.5 拖宽流畅、收起/展开重启保持
result: issue
reported: "在样式后 输入回车换行，会异常出现 斜杠字符。 2、代码块，行内代码，点击后没有出现原语，无法修改代码格式 以及高亮关键词。3、面板交互 在最大化的时候，拉宽编辑区，缩小外层客户端， 编辑区没有等比例缩小。还是固定宽度。4、表格没有办法插入一行或者一列。"
severity: major
note: 7.1 IME 四场景本身未见报告(未明确失败);四个子问题见 Gaps #2..#5

### 9. SC-8 overlay 联动 + 禅模式 + 入口移交(31-06 D-09..D-13)
expected: 8.1 面板右侧滑出 overlay 主工作区不挤压;8.2 点主工作区面板不抢焦点不收起;8.3 禅模式进出+收起自动退出+重启保持;8.4 面板内无文档列表;8.5 新建笔记/编辑入口全收敛到面板
result: pass

## Summary

total: 9
passed: 7
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "SC-2.3 知识库全局搜索:笔记命中且可打开(点击搜索结果应打开右侧文档编辑面板)"
  status: resolved
  reason: "User reported: 笔记命中，但没有打开文档编辑区"
  severity: major
  test: 3
  root_cause: "搜索结果行 onClick 只调 selectSearchHit(仅切换左侧预览态),未调 docWorkspaceStore.openDoc;31-07 round-2(bae50c6)只给主列表行加了 openDoc。面板开合仅由 openDoc 驱动,故面板永不打开"
  artifacts:
    - path: "src/views/KnowledgeBaseView.tsx"
      issue: ":331-341 搜索结果行 onClick 缺 openDoc(病灶);:379-384 主列表行已正确(参照物)"
    - path: "src/stores/docWorkspaceStore.ts"
      issue: "openDoc 本身无问题(:53-62,唯一 expandPanel 入口)"
  missing:
    - "搜索结果行 onClick 追加 openDoc(hit.docId),与主列表行同款,单行修复"
  debug_session: .planning/debug/kb-search-open-doc.md
  fix: "c928a67 (31-08): 搜索结果行 onClick 追加 openDoc(hit.docId);复测通过 2026-09-04"

- truth: "编辑器:对已加样式(粗体等)的文本按回车换行,不应出现多余斜杠字符"
  status: resolved
  reason: "User reported: 在样式后 输入回车换行，会异常出现 斜杠字符"
  severity: major
  test: 8
  root_cause: "MarkdownEditorInner 的 value-sync effect 中 normalizeMarkdown 把 Milkdown「文档中间空段落」输出的字面 <br /> 占位改写为孤立 \\ 行;replaceAll 重解析后成为字面反斜杠文本节点(可见斜杠),再序列化为 \\\\ 随自动保存落库造成持久污染。真实触发条件是「回车在文档中间产生空段落」(样式后回车恰是此场景),与粗体本身无关"
  artifacts:
    - path: "src/components/ui/MarkdownEditorInner.tsx"
      issue: "normalizeMarkdown(L44-61) 在每次 value-sync 执行 <br>→\\\\n 替换;该归一化本意只针对 ingest 的 AI 文档"
    - path: "node_modules/@milkdown/preset-commonmark paragraph 序列化器"
      issue: "空且非最后块输出字面 <br />(上游行为,非缺陷)"
  missing:
    - "把 <br> 归一化移出 value-sync effect,只在 ingest/AI 入库路径执行一次(或跳过 Milkdown 自产的独立段落 <br /> 占位)"
    - "回归验证:.planning/debug/repro-enter-slash.mjs Case J/K(修复后 Enter 不触发 replaceAll、doc 无 \\ 文本节点)"
  debug_session: .planning/debug/editor-enter-slash.md
  fix: "d2a22e7 (31-08 并行覆盖): value-sync 归一化加 BR_ONLY_RE guard,孤立 <br /> 不再改写为 \\;repro Case J/K 5/5 PASS;复测通过 2026-09-04"

- truth: "代码块/行内代码:点击后应出现语法/格式控制,可修改代码语言与关键词高亮"
  status: failed
  reason: "User reported: 代码块，行内代码，点击后没有出现原语，无法修改代码格式 以及高亮关键词"
  severity: major
  test: 8
  root_cause: "功能未实现(非故障):headless 组装仅 commonmark/gfm/history/listener/clipboard + 自建插件,未 configure @milkdown/kit 的 codeBlockComponent(语言选择/格式控件)与 plugin/prism(高亮),代码块渲染为裸节点。行内代码的 CommonMark inline_code mark 本身无语言属性,官方也无控件,属能力边界需产品决策"
  artifacts:
    - path: "src/components/ui/MarkdownEditorInner.tsx"
      issue: ".use() 链缺 codeBlockComponent 与 prism"
    - path: "src/components/ui/MarkdownToolbar.tsx"
      issue: "仅有创建按钮(toggleInlineCode/createCodeBlock),无语言选择 UI"
  missing:
    - ".use(codeBlockComponent.configure(...))(headless 自定义 render 提供语言下拉,样式 Nova tokens)+ .use(prism) 高亮"
    - "行内代码语言标注:标为可选自定义 mark 升级(标准 markdown 不支持)"
  debug_session: .planning/debug/editor-code-lang-controls.md
  fix: "af24585 (31-09): 自建 codeBlock NodeView($view)+ 语言下拉 + prismjs 高亮(8 语言包);行内代码语言标注按计划边界不做(CommonMark 无语言属性)"
  retest_issue: "round-1 复测(2026-09-04):代码块无法正常输入文本"
  retest_fix: "57a92a7: NodeView 缺 contentDOM(ProseMirror 规则:无 contentDOM 的内容节点不可编辑);补 contentDOM 恢复编辑,高亮改 Prism.tokenize→Decoration.inline(不再重写 innerHTML);待 round-2 复测"

- truth: "面板宽度自适应:窗口最大化下拉宽编辑区后缩小客户端窗口,编辑区应等比例缩小而非固定宽度"
  status: resolved
  reason: "User reported: 面板交互 在最大化的时候，拉宽编辑区，缩小外层客户端， 编辑区没有等比例缩小。还是固定宽度"
  severity: major
  test: 8
  root_cause: "面板宽度是 persist 的绝对 px(uiStore.docWorkspaceWidth),DocWorkspaceShell.tsx:88 直接 style={{width}} 渲染;60vw clamp 只在拖拽 mousemove 期间计算(:29-30),无 CSS max-width、无 window resize 监听,拖拽结束后无任何限制"
  artifacts:
    - path: "src/components/workspace/DocWorkspaceShell.tsx"
      issue: ":88 原始 px 直接渲染无上限;:29-30 clamp 仅拖拽期间生效"
    - path: "src/stores/uiStore.ts"
      issue: ":101,138,158 docWorkspaceWidth 持久化绝对值,无 resize 逻辑"
  missing:
    - "aside 加 maxWidth: '60vw'(纯 CSS 一行,同时覆盖缩窗与重启陈旧值;可选 resize 监听 clamp 存量值)"
  debug_session: .planning/debug/panel-width-not-responsive.md
  fix: "84d151c (31-08): aside maxWidth: '60vw' 纯 CSS 上限,同时覆盖缩窗与重启陈旧 px;复测通过 2026-09-04"

- truth: "表格编辑:应支持插入行/插入列操作"
  status: failed
  reason: "User reported: 表格没有办法插入一行或者一列"
  severity: major
  test: 8
  root_cause: "headless gfm preset 只提供表格 schema/解析与 insertTableCommand(建表),无行列操作 UI:kit 的 component/table-block 未引入,自建 toolbar 只有「表格(3x3)」按钮。但 preset-gfm 已导出 addRowBefore/addRowAfter/addColBefore/addColAfter/deleteSelectedCells 等命令,可直接 callCommand——纯缺 UI 接线,引擎层命令齐全"
  artifacts:
    - path: "src/components/ui/MarkdownToolbar.tsx"
      issue: "L147 仅有 insertTableCommand{3x3},缺行列操作按钮"
    - path: "src/components/ui/MarkdownEditorInner.tsx"
      issue: "L175-181 未 configure tableBlockComponent(备选方案)"
  missing:
    - "首选(改动最小):toolbar 加 4 个行列按钮,import preset-gfm 命令复用 runCmd 模式,光标在表内时生效(可按选区 disable)"
    - "备选:tableBlockComponent 完整体验,但外部组件样式与 D-01 全 tokens 约定冲突需额外覆盖"
  debug_session: .planning/debug/editor-table-insert.md
  fix: "b9f9ce9 (31-09): toolbar 4 个 preset-gfm 命令按钮(addRow/Col Before/After)"
  retest_issue: "round-1 复测(2026-09-04):点击后生成的表格样式加载失败/疑似语法错误。根因:preset-gfm 把空单元格序列化为 | <br /> |(GFM cell-break),normalizeMarkdown 改写为 \\+换行拆断表格行,replaceAll 重解析后 table 节点消失(repro-table-roundtrip.mjs 复现)"
  retest_fix: "57a92a7: normalizeMarkdown 跳过 | 开头表格行的 <br> 改写;repro 4 断言全 PASS(空表/插行列 round-trip 无损,段落 <br> ingest 路径不受影响);待 round-2 复测"
