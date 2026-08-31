# Requirements: Nova-PM-Workspace v0.3.3

**Defined:** 2026-08-31
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Milestone:** v0.3.3 产研半落地 + 工作区入驻(RND-ROLLOUT ①层)

## v1 Requirements

Requirements for v0.3.3. Each maps to roadmap phases (26+, numbering continues).

### Tab 真实化(Mock 全清)

- [x] **TAB-01**: 用户在产研中心任一 tab 点击 AI 生成按钮(需求/原型/代码脚手架/测试用例/竞品分析/一键交付物)触发真实 `engine_run`,携带 tab 上下文,不再返回 mock 数据
- [x] **TAB-02**: 用户在 tab 内看到流式进度与事件投影(事件日志可审计),并可取消
- [x] **TAB-03**: 每类生成统一走候选→HITL 确认卡→版本化落槽(knowledge_docs 卡槽 + AI 溯源徽章),与 PRD 生产线同构
- [x] **TAB-04**: 用户在产品页运行 product skill 时走真实 run;`runProductSkill` 及 rndStore 六个 `generate*AI` mock/fabricate 代码全部删除,UI 无死路径
- [x] **TAB-05**: tab 触发的 run 使用独立 sessionId,不污染聊天会话列表与会话投影
- [x] **TAB-06**: 用户在批量生成运行期间发起聊天,交互 run 优先于批量 run(不被 cap-3 队列饿死);一键十八份交付物为单 run 多步而非 18 个 run

### 工作区文档摄取(999.1)

- [ ] **ING-01**: 用户对工作区文档(docx/pdf)发起摄取,系统以纯 Rust 提取文本(零 sidecar、无外部进程)
- [ ] **ING-02**: 无文本层/扫描件 PDF 的摄取结果以显式三态状态呈现(extracted/partial/failed),不静默建档空文档
- [ ] **ING-03**: 用户发起摄取编排后,系统扫描工作区→AI 分类进知识库→抽取任务/日程草稿,全程进度可见
- [ ] **ING-04**: 用户以批量 HITL 聚合卡确认摄取产物(可全选/全不选、逐项编辑、一次提交),确认后才落业务数据
- [ ] **ING-05**: 用户重扫同一工作区时,已摄取文档以内容 hash 识别,不重复建档、不重复索引(重扫=diff)
- [ ] **ING-06**: 摄取完成的文档立即可在知识库 FTS5 中文检索命中

### 反向创建产品(工作区入驻)

- [ ] **REV-01**: 用户可"从工作区创建产品"——以既有工作区文档为起点反向创建产品(复用创建产品向导模式)
- [ ] **REV-02**: 反向创建的产品自动关联源工作区与 productId,后续摄取产物(知识/任务/日程草稿)默认归属该产品

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Coding 工具层(v0.4.0)

- **CODE-01**: 原型/代码/测试 tab 文档级生成升级为真写文件(read/write/edit/grep/exec + diff 审批卡)

### Skill 与垂类数据化(v0.4.0 协同期)

- **SKILL-01**: PM 领域工作流沉淀为可复用 skill(manifest + prompt 模板 + 工具集 + 产出卡槽)(999.2)
- **DATA-01**: 交付物目录与 pipeline 模板数据化(999.4,与 Skill 同模板格式)

### 摄取增强(v0.5+ 池)

- **OCR-01**: 扫描件 PDF OCR 识别(当前三态显式暴露,不静默)
- **MCP-01**: MCP 第三方能力扩展(999.3)
- **ENTRY-01**: IM 入口

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 原型/代码/测试 tab 真写文件 | v0.4.0 coding 工具范围(RND-ROLLOUT §3 边界);本里程碑一律文档级生成 |
| OCR | 纯 Rust 零 sidecar 无法 OCR;扫描件以三态状态显式暴露 |
| subagent / pipeline 编排 / Skill | v0.4.0 范围(D-02/D-07) |
| MCP / IM 入口 | v0.5+(D-08) |
| tab 收敛进 Agent 面板 | D-05 用户决策:tab 保留编辑/管理功能,不废弃 |
| 向量检索(embedding) | 延续 v0.3.0 决策:FTS5 结构过滤优先,P2 留 v0.4+ 评估 |
| 自动摄取(后台 watch) | 摄取一律用户发起,批量 HITL 把关 |
| 业务数据全量关系化迁移 | v0.3.3 按需落点(双真相源裁定归 phase 决策),全量关系化另立项 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAB-01 | Phase 26 | Complete |
| TAB-02 | Phase 26 | Complete |
| TAB-03 | Phase 26 | Complete |
| TAB-04 | Phase 26 | Complete |
| TAB-05 | Phase 26 | Complete |
| TAB-06 | Phase 26 | Complete |
| ING-01 | Phase 27 | Pending |
| ING-02 | Phase 27 | Pending |
| ING-03 | Phase 27 | Pending |
| ING-04 | Phase 27 | Pending |
| ING-05 | Phase 27 | Pending |
| ING-06 | Phase 27 | Pending |
| REV-01 | Phase 28 | Pending |
| REV-02 | Phase 28 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14/14 ✓
- Unmapped: 0

---
*Requirements defined: 2026-08-31*
*Last updated: 2026-08-31 — traceability 回填(roadmap Phases 26-28)*
