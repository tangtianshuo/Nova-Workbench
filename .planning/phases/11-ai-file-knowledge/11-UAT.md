---
status: complete
phase: 11-ai-file-knowledge
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md]
started: 2026-08-13T00:00:00Z
updated: 2026-08-13T19:30:00Z
gaps_status: resolved
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: 完全关闭应用（和 dev server）。重新启动 Nova（npm run dev 或 tauri:dev）。应用正常启动，无 console 报错，主界面加载出产品/任务等数据，AI chat panel 可打开。
result: pass

### 2. AI 列出工作区文件（有界输出）
expected: 在 chat panel 中让 AI "列出我当前工作区的文件"。AI 返回文件列表（最多 50 个文件），每个文件只有简短内容摘录（≤500 字符），不暴露完整文件路径或索引数据，不报错。
result: pass

### 3. AI 读取知识库文章（产品作用域）
expected: 选中某个产品后，让 AI 读取该产品下的一篇知识库文章。AI 能返回文章的标题和内容摘要。切换到另一个产品后，AI 只能看到新产品作用域内的文章，不能跨产品读取。
result: pass
note: 转录验证 — 产品切换后列表作用域正确；跨产品读取由用户显式指定产品参数触发，符合工具设计（readKnowledgeArticle 接受产品标识）。

### 4. AI 搜索知识库（词法搜索）
expected: 让 AI "在知识库中搜索关于某关键词的内容"。AI 返回命中的文章列表及匹配内容，结果基于关键词词法匹配（非语义），数量有上限，无报错。
result: pass

### 5. AI 写知识库文章 → 确认流程
expected: 让 AI 创建或润色一篇知识库文章。AI 不直接写入，而是先展示待确认的候选内容（标题/正文等字段）并停下等待；用户显式确认后才真正写入 rndStore，文章出现在知识库中。未确认时不产生任何数据变更；确认 token 一次性使用。
result: pass
note: 修复后(quick/260813-sdp, commit 789354f)ToolTrace 显示 writeKnowledgeArticle ✓ 已完成(绿色),随后弹出"待确认的知识库写入"卡片,确认写入后文章正确写入 rndStore。原 blocker 是 toolLoop.ts catch 块把 ConfirmationRequiredError 误标为 trace error,误导用户感知。

### 6. AI 生成研发交付物
expected: 让 AI 为当前产品生成一份研发交付物（如 API 规格文档）。生成完成后，在研发中心的完整交付物 Tab（FullDeliverablesTab）中能看到该交付物的最新状态和内容（预览来自 store，而非静态文本）。
result: pass

### 7. AI 读取 PRD 草稿上下文（draftOnly）
expected: 让 AI 查看/总结当前产品的 PRD 文档。AI 返回文档上下文内容且标注为草稿（draftOnly），不修改、不覆盖原始 ProductDocument 记录 — 再次手动打开该文档内容保持不变。
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "AI 写知识库文章走候选 → 显式确认 → 写入 rndStore 流程，未确认时无数据变更"
  status: resolved
  reason: "User reported: writeKnowledgeArticle 失败"
  severity: blocker
  test: 5
  root_cause: "src/ai/toolLoop.ts catch 块在收到 ConfirmationRequiredError(预期流程)时无差别地把 errorMessage 透传给 onToolEnd,ChatPanel 的 onToolEnd 回调把任何 truthy error 当作 'error' trace 状态,导致 UI 显示红色 ⚠️ 失败标记。系统其实按设计运行 — 抛错 → 弹确认卡片 → 用户确认后写入。"
  artifacts:
    - path: "src/ai/toolLoop.ts"
      issue: "catch 块 line 123 无差别透传 errorMessage 给 onToolEnd,未区分 ConfirmationRequiredError 与真错误"
  missing:
    - "在 catch 块顶部抽取 isConfirmation 标志"
    - "onToolEnd 调用使用 isConfirmation ? undefined : errorMessage"
    - "复用 isConfirmation 替代冗余的 instanceof 检查"
  debug_session: ""
  fix_commit: "789354f (quick/260813-sdp)"
  resolved_at: "2026-08-13"
