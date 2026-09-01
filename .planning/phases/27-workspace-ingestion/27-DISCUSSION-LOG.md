# Phase 27: 工作区文档摄取 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 27-workspace-ingestion
**Areas discussed:** 摄取入口与范围, 知识分类体系, 批量确认卡形态, 草稿抽取与写路径

---

## 摄取入口与范围

| Option | Description | Selected |
|--------|-------------|----------|
| FileArchiveView 内嵌 | 研究推荐：工作区文件已在 FileArchiveView 列出，摄取结果同屏展示 | ✓ |
| 专属子面板 | FileArchiveView 加独立「摄取」子区块/抽屉 | |
| 知识库入口 | 入口放 KnowledgeBaseView（产物去向） | |

**User's choice:** FileArchiveView 内嵌

| Option | Description | Selected |
|--------|-------------|----------|
| 全工作区一键扫 | 一键扫全部 docx/pdf，hash 幂等防重 | |
| 勾选文件/文件夹 | 用户圈定范围再发起，大工作区可分批 | ✓ |
| 全扫+排除列表 | 默认全扫，提供排除目录 | |

**User's choice:** 勾选文件/文件夹（CONTEXT D-02 补「全选快捷」）

| Option | Description | Selected |
|--------|-------------|----------|
| 手动+徽章提示 | 常驻按钮 + 新文档徽章计数（轻量探测不提取） | ✓ |
| 纯手动 | 仅按钮，无探测 | |
| 进入自动探测 | 进页面自动扫描高亮新文档 | |

**User's choice:** 手动+徽章提示

| Option | Description | Selected |
|--------|-------------|----------|
| 每次重试 | failed 不进幂等跳过，换新版文件自然被拾起 | ✓ |
| 标记后跳过 | failed 记录入表不再重试，除非手动清除 | |

**User's choice:** 每次重试

---

## 知识分类体系

| Option | Description | Selected |
|--------|-------------|----------|
| 落当前选中产品 | 无选中则提示先选；零 schema 改动；Phase 28 反向创建后自动选中再摄取 | ✓ |
| 暂存待产品 | 产物暂存 ingested_documents 草稿态，建产品后补落库 | |
| workspace 伪锚 | workspaceId 当 product_id 写入（schema hack） | |

**User's choice:** 落当前选中产品

| Option | Description | Selected |
|--------|-------------|----------|
| 扩 PM 类目 | KNOWLEDGE_CATEGORIES 增 PM 味类目，双侧 const 同步 | ✓ |
| 单一专用类 | 只加「工作区文档」一类 | |
| 硬映射 9 类 | LLM 硬选既有 9 类，语义牵强 | |

**User's choice:** 扩 PM 类目

| Option | Description | Selected |
|--------|-------------|----------|
| 推荐四类 | 会议纪要、竞品分析、需求文档、项目周报 | ✓ |
| 更全八类 | 再加调研报告/产品规划/运营数据/复盘总结 | |
| Claude 定 | plan 阶段按 fixture 定 | |

**User's choice:** 推荐四类

| Option | Description | Selected |
|--------|-------------|----------|
| LLM建议+卡内可改 | 预填 + 批量卡逐项改 | ✓ |
| LLM 全自动 | 定了不改 | |
| 用户手选 | 不预填手选，几十份不现实 | |

**User's choice:** LLM建议+卡内可改

| Option | Description | Selected |
|--------|-------------|----------|
| 一文件一条+LLM标题 | 语义标题，源文件名进元数据 | ✓ |
| 一文件一条+文件名 | 忠实但 final_v2.docx 检索体验差 | |
| LLM 可拆分 | 按主题拆多条，质量不可控 | |

**User's choice:** 一文件一条+LLM标题

---

## 批量确认卡形态

| Option | Description | Selected |
|--------|-------------|----------|
| 队列入口+内嵌大卡 | 全局队列精简入口卡，点击跳 FileArchiveView 聚合视图编辑 | ✓ |
| 全卡进队列 | 聚合卡整体在队列内渲染，几十项撑爆队列 | |
| 纯内嵌 | 只在摄取面板，切走会错过（违 D-05） | |

**User's choice:** 队列入口+内嵌大卡

| Option | Description | Selected |
|--------|-------------|----------|
| 按产物类型 | 知识/任务草稿/日程草稿三组，组级全选 | ✓ |
| 按源文档 | 每文件下挂产物，溯源直观但跨文件取舍难 | |

**User's choice:** 按产物类型

| Option | Description | Selected |
|--------|-------------|----------|
| 开关+行内+Dialog | selected + 标题行内 + content 走 MDXEditor Dialog + 草稿字段行内 | ✓ |
| 仅开关+标题 | content 不可编辑，ING-04 打折 | |
| 全行内编辑 | 长文行内排版重 | |

**User's choice:** 开关+行内+Dialog

| Option | Description | Selected |
|--------|-------------|----------|
| toast 汇总+留原地 | toast（N 知识 + M 任务 + K 日程）+ 列表刷新 | ✓ |
| 结果汇总视图 | 逐项落库状态列表，多一次导航 | |
| 跳转知识库 | 验证 FTS 直观但打断工作流 | |

**User's choice:** toast 汇总+留原地

---

## 草稿抽取与写路径

| Option | Description | Selected |
|--------|-------------|----------|
| 保守：明确行动项 | 仅 todo 标记/责任人明确项；漏的靠 FTS 兜底 | ✓ |
| 激进：全日期抽取 | 所有日期/截止成草稿，噪声大 | |
| 中间：仅关联日期 | 日期仅在关联行动项时成字段 | |

**User's choice:** 保守：明确行动项

| Option | Description | Selected |
|--------|-------------|----------|
| 每文档上限 5 | prompt 约束 + Rust 校验 | ✓ |
| 无上限 | 靠 selected 取舍，LLM 失控卡很长 | |
| 双层上限 | 批次总上限 + 每文档上限 | |

**User's choice:** 每文档上限 5

| Option | Description | Selected |
|--------|-------------|----------|
| 混合：23-04 模式 | knowledge Rust 写；task/schedule webview store + Rust 审计 | ✓ |
| 全 Rust 写 | 唯一写者最纯，但需 store 回放同步（999.6 提前） | |
| 全 webview 写 | knowledge 也 webview 写，违 Phase 26 裁定 | |

**User's choice:** 混合：23-04 模式

| Option | Description | Selected |
|--------|-------------|----------|
| 直接生效 | HITL 已确认，落库即正式任务/日程 | ✓ |
| 草稿态持活 | draft 标记待任务页激活，二次工序 | |

**User's choice:** 直接生效

---

## Claude's Discretion

- docx 表格/修订解析细节（研究 Pitfall 4 定式）
- 三态判定阈值（页数 × 50 起步，PoC 校准）
- 徽章探测触发时机
- PM 类目文案微调（≤6 类）
- partial 文档 pages_empty 呈现方式

## Deferred Ideas

None — discussion stayed within phase scope
