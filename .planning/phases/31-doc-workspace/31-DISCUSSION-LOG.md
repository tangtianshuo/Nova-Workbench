# Phase 31 Discussion Log

**Date:** 2026-09-03
**Mode:** discuss (interactive)
**Participants:** User, Claude (orchestrator)

## 背景

Phase 30 收口（UAT 8/8 + verifier 13/13）后，用户连续三轮 quick task（e4l 槽位投影 / exg toast 提醒 / gh0 双源投影）修补产研 tab 文档可见性，随后提出文档工作区设想并立项 Phase 31。

### 讨论前对话（非正式，同一会话）

1. 用户提出：客户端右侧新增 markdown 编辑器工作区，疑虑与 ⌘K 侧滑 AI 助手同屏观感。
2. Claude 分析：AI Drawer 与工作区功能正交（对话 vs 文档），左右分侧可解。
3. 用户澄清场景：markdown 编辑为主、未来 docx/excel；三业务场景 = 修改 AI 产出、日常笔记、阅读审批 AI 文档；无老用户包袱。
4. 用户发起 `/gsd:discuss-phase 31` 并指令调研 Milkdown vs 现编辑器，「不要有历史包袱，确实优于当前设计可不计代价重构」。

## 调研结论（Claude，2026-09-03）

### 当前 MDXEditor 包包袋（代码实锤）
- `patches/@mdxeditor+editor+4.2.0.patch`：vendored patch 修 code-block 快捷键 bug（match[1]→match[2]），升级即重养
- `MarkdownEditorInner.tsx` ~70 行 CSS：对抗内置样式 + CodeMirror 白底主题，dark mode 全靠手补
- Lexical 底层 markdown round-trip 有边界损耗（表格/嵌套列表）
- 使用点仅 3 处：KnowledgeBaseView / ProductKnowledgeTab / PrdDraftDialog

### Milkdown 复核（推翻 2026-08-10 ATOMIC-EDITOR.md 的否决）
- v7.21.3（2026-07-12 发布）、MIT、活跃维护；`@milkdown/react` 官方一等支持
- ProseMirror + Remark：markdown in/out 架构级保真，契合「markdown 是存储真相源」
- 旧否决理由「React 19 已知问题（CSDN 文章）」现查无实据
- 已知摩擦：imperative API（useEditor/getInstance().action()），需自包受控层；MilkdownProvider 边界限制（useInstance 须在其内）
- 形态二选一：core（headless 自建 UI）vs Crepe（成品 preset，自带设计语言）

**判断：Milkdown core 确实优于当前设计。**

## 裁定记录

| # | 灰区 | 裁定 | 备注 |
|---|------|------|------|
| D-01 | 编辑器选型 | Milkdown core（headless） | 不用 Crepe；UI 全 Nova tokens 自建 |
| D-02 | MDXEditor 退役范围 | 全量退役 | 3 使用点同期迁移，删依赖+patch，grep 零残留 |
| D-03 | 受控契约 | 保持 value/onChange props 契约 | listener markdownUpdated 驱动 onChange |
| D-04 | 布局形态 | 右侧常驻面板 + ⌘K Drawer 改左滑 | 可收起、可拖宽 |
| D-05 | 业务场景 | 修改 AI 产出 / 日常笔记 / 阅读审批 | 验收锚点 |
| D-06 | 数据模型 | knowledge_docs 扩展 doc_kind='note' | 复用 FTS5/版本化；不建新表 |
| D-07 | 审批集成深度 | v1 含确认卡嵌入工作区 | 全局队列仍是唯一真相源；diff 不做 |
| D-08 | docx/pdf/excel/ppt | 技术债，v1 纯 markdown | 用户原话明确记债 |

## 里程碑归属

Phase 31 挂 v0.3.3（「工作区入驻」主题契合）；v0.3.3 原 27（挂起）/28（顺延）状态不受影响，里程碑收口决策另行裁定。

## 下一步

1. `/gsd:plan-phase 31`（research 建议：Milkdown PoC —— 中文 IME/round-trip/受控同步/bundle）
2. 里程碑决策点仍开放：27 UAT 回归 / 28 顺延确认 / complete-milestone
