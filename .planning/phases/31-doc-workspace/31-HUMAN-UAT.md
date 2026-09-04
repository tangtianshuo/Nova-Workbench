---
status: complete
phase: 31-doc-workspace
source: [31-HUMAN-UAT.md checklist (31-05 Task 1), 31-07-SUMMARY.md]
started: 2026-09-03T16:00:00+08:00
updated: 2026-09-04T11:00:00+08:00
---

运行方式:`npm run tauri:dev`,真实 Tauri 应用逐项执行。

## 预检(自动化,executor 执行于 2026-09-03)

| 项 | 命令 | 结果 |
| -- | ---- | ---- |
| TypeScript | `npm run lint` | ✅ 零错误 |
| 生产构建 | `npm run build` | ✅ 23.92s;编辑器 chunk gzip 114.61 KB(预算 300KB 内) |
| MDXEditor 残留 | `grep -ri mdxeditor src/ package.json patches/` | ✅ 零残留 |

## Current Test

[testing complete 2026-09-04] 9/9 测毕:7 pass / 2 issue(5 gaps);诊断进行中

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
  status: failed
  reason: "User reported: 笔记命中，但没有打开文档编辑区"
  severity: major
  test: 3
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis

- truth: "编辑器:对已加样式(粗体等)的文本按回车换行,不应出现多余斜杠字符"
  status: failed
  reason: "User reported: 在样式后 输入回车换行，会异常出现 斜杠字符"
  severity: major
  test: 8
  artifacts: []
  missing: []

- truth: "代码块/行内代码:点击后应出现语法/格式控制,可修改代码语言与关键词高亮"
  status: failed
  reason: "User reported: 代码块，行内代码，点击后没有出现原语，无法修改代码格式 以及高亮关键词"
  severity: major
  test: 8
  artifacts: []
  missing: []

- truth: "面板宽度自适应:窗口最大化下拉宽编辑区后缩小客户端窗口,编辑区应等比例缩小而非固定宽度"
  status: failed
  reason: "User reported: 面板交互 在最大化的时候，拉宽编辑区，缩小外层客户端， 编辑区没有等比例缩小。还是固定宽度"
  severity: major
  test: 8
  artifacts: []
  missing: []

- truth: "表格编辑:应支持插入行/插入列操作"
  status: failed
  reason: "User reported: 表格没有办法插入一行或者一列"
  severity: major
  test: 8
  artifacts: []
  missing: []
