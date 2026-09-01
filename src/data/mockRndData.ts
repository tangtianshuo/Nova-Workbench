/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RequirementUserStory {
  id: string;
  epic: string;
  role: string;
  feature: string;
  benefit: string;
  priority: 'P0' | 'P1' | 'P2';
  acceptanceCriteria: string[];
}

export interface RequirementUseCase {
  id: string;
  title: string;
  actor: string;
  preCondition: string;
  mainFlow: string[];
  altFlow: string[];
  postCondition: string;
}

export interface RequirementBoundaryCheck {
  scenario: string;
  riskLevel: 'high' | 'medium' | 'low';
  impact: string;
  handlingStrategy: string;
}

export interface ProductRequirementDesign {
  id: string;
  productId: string;
  title: string;
  version: string;
  updatedAt: string;
  status: '草稿' | '已评审' | '开发中' | '已归档';
  author: string;
  businessGoal: string;
  targetAudience: string[];
  coreSummary: string;
  userStories: RequirementUserStory[];
  useCases: RequirementUseCase[];
  boundaryChecks: RequirementBoundaryCheck[];
  flowchartNodes: Array<{ id: string; label: string; type: 'start' | 'process' | 'decision' | 'agent' | 'end'; desc: string }>;
  prdMarkdown: string;
}

export interface UIPrototypeScreen {
  id: string;
  title: string;
  device: 'desktop' | 'mobile' | 'tablet';
  theme: 'indigo' | 'dark' | 'mint' | 'sunset';
  route: string;
  description: string;
  sections: Array<{
    title: string;
    type: 'stats' | 'kanban' | 'chat' | 'table' | 'form' | 'chart';
    data: any;
  }>;
  reactCode: string;
  designTokens: {
    primaryColor: string;
    fontFamily: string;
    borderRadius: string;
    spacingScale: string;
  };
}

export interface ProductKnowledgeItem {
  id: string;
  productId: string;
  title: string;
  category:
    | '架构设计'
    | '领域字典'
    | '技术协议'
    | 'FAQ与排障'
    | '最佳实践'
    | '经验沉淀'
    | '业务规则'
    | '架构约束'
    | '踩坑指南'
    | '会议纪要'
    | '竞品分析'
    | '需求文档'
    | '项目周报';
  tags: string[];
  author: string;
  updatedAt: string;
  readTime: string;
  summary: string;
  content: string;
  isPinned?: boolean;
}

export interface CodeScaffoldItem {
  id: string;
  productId: string;
  name: string;
  type: 'api' | 'types' | 'component' | 'schema' | 'docker' | 'commit';
  language: string;
  filename: string;
  description: string;
  code: string;
}

export interface TestCaseItem {
  id: string;
  productId: string;
  module: string;
  title: string;
  type: '功能测试' | '边界条件' | '性能并发' | '安全合规' | 'UI兼容性';
  priority: 'P0' | 'P1' | 'P2';
  preconditions: string;
  steps: string[];
  expectedResult: string;
  status: 'passed' | 'failed' | 'pending' | 'blocked';
  automated: boolean;
  scriptSnippet?: string;
}

export interface CompetitorRadarDimension {
  dimension: string;
  ourProduct: number;
  compA: number;
  compB: number;
  compC: number;
}

export interface CompetitorProfile {
  name: string;
  tag: string;
  logoColor: string;
  marketShare: string;
  pricing: string;
  overallScore: number;
  features: {
    aiAutomation: string;
    collaboration: string;
    workspaceIntegration: string;
    extensibility: string;
    dataSecurity: string;
  };
  pros: string[];
  cons: string[];
}

export interface CompetitorAnalysisData {
  productId: string;
  productName: string;
  updatedAt: string;
  radarData: CompetitorRadarDimension[];
  competitors: CompetitorProfile[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  differentiationStrategy: string;
  gapAnalysis: Array<{
    feature: string;
    ourStatus: '领先' | '持平' | '追赶中' | '规划中';
    industryStandard: string;
    actionPlan: string;
  }>;
}

export interface FullLifecycleDeliverable {
  id: string;
  productId: string;
  phase: 'requirement' | 'design' | 'dev' | 'test' | 'release';
  phaseName: string;
  code: string;
  title: string;
  category: string;
  format: 'markdown' | 'json' | 'sql' | 'typescript' | 'table';
  icon: string;
  summary: string;
  status: 'ready' | 'generating' | 'draft';
  generatedAt: string;
  wordCount: string;
  tags: string[];
  content: string;
  /** Phase 16 (DELIV-03): explicit pointer to the truth-source doc (卡槽只存指针 + 当前版本投影). */
  aiSource?: { sessionId: string; eventId: string; generatedAt: string; docId: string; version: number };
}

export const INITIAL_KNOWLEDGE_BASE: Record<string, ProductKnowledgeItem[]> = {
  p1: [
    {
      id: 'kb-p1-1',
      productId: 'p1',
      title: 'WenXiBuddy 系统技术架构全景与微服务拓扑',
      category: '架构设计',
      tags: ['系统架构', '微服务', 'WebSocket', '高可用'],
      author: 'Alex (Tech Lead)',
      updatedAt: '2025-05-28',
      readTime: '6 分钟',
      isPinned: true,
      summary: '梳理了前端 React 19 单页框架、Node.js BFF 网关、AI 智能体调度路由与本地文件索引器的分层架构。',
      content: `## 1. 总体架构拓扑

WenXiBuddy 采用现代化前后端一体化与轻量化 BFF 架构：
- **前端表现层**：React 19 + TypeScript + Tailwind CSS 4 + Motion 动画库；
- **BFF 接入层**：Express 路由网关，负责 API 请求鉴权、限流与上下文装配；
- **AI 调度引擎**：基于 @google/genai SDK 与自定义 Function Calling 机制，实现自然语言到结构化操作的自动映射；
- **本地资产引擎**：异步文件遍历与本地向量缓存，实现秒级毫秒级本地文件索引与智能总结。

## 2. 状态管理与数据流
- 全局状态通过 AppContext 统一驱动；
- 支持持久化本地 LocalStorage 缓存与服务端多副本备份；
- 采用乐观更新机制确保毫秒级用户交互响应。`
    },
    {
      id: 'kb-p1-2',
      productId: 'p1',
      title: '产品领域核心术语词典 (Glossary & Taxonomy)',
      category: '领域字典',
      tags: ['领域字典', '名词定义', '产研对齐'],
      author: 'Brandon (PM)',
      updatedAt: '2025-05-25',
      readTime: '4 分钟',
      isPinned: true,
      summary: '统一团队内部关于 Agent、Workspace、Skill、Milestone、Deliverable 的精确定义，避免认知偏差。',
      content: `## 核心术语标准对照

| 术语名称 | 英文对应 | 定义与职责 |
| :--- | :--- | :--- |
| **智能体工作区** | Agent Workspace | 挂载了特定上下文、工具集与模型提示词的独立协同操作环境。 |
| **产品成果物** | Product Deliverable | 在产品设计与管理生命周期中产出的标准化文档、代码契约、测试用例或报告。 |
| **技能矩阵** | Skill Matrix | 为特定业务领域定制的 Agent 自动化扩展能力单元（如 PRD 扩写、用例生成）。 |
| **验收标准** | Acceptance Criteria | 基于 Gherkin (Given-When-Then) 语法描述的用例准入准出条件。 |
| **健康度评分** | Product Health | 综合进度燃尽、风险项、缺陷数与指标达标率计算的量化健康指数 (healthy/warning/critical)。 |`
    },
    {
      id: 'kb-p1-3',
      productId: 'p1',
      title: '多 Agent 工具函数挂载与 REST API 协议规范',
      category: '技术协议',
      tags: ['API规范', 'JSON-Schema', 'OpenAPI'],
      author: 'Alex (Tech Lead)',
      updatedAt: '2025-05-20',
      readTime: '5 分钟',
      summary: '详细阐述 Agent Function Calling 协议、工具入参校验 Schema 与标准 JSON 响应结构。',
      content: `## API 交互协议规范

所有 BFF 接口统一遵循 RESTful 规范与 JSON-RPC 风格扩展：
- 响应根字段必须包含 \`status\` ('success' | 'error') 与 \`data\`；
- 错误返回必须携带标准 \`errorCode\` 与面向用户的可读 \`message\`。

\`\`\`json
{
  "status": "success",
  "data": {
    "deliverableId": "del-prd-01",
    "phase": "requirement",
    "wordCount": 3500
  },
  "timestamp": 1748800000000
}
\`\`\``
    },
    {
      id: 'kb-p1-4',
      productId: 'p1',
      title: '高并发场景下的 AI 断流与降级最佳实践',
      category: '最佳实践',
      tags: ['降级方案', '容灾', 'SLA'],
      author: 'David (AI Lead)',
      updatedAt: '2025-05-18',
      readTime: '8 分钟',
      summary: '当大模型服务出现限流 (429) 或网络波动时的多级熔断、本地模板合成与断点续传策略。',
      content: `## 容灾降级三级防御机制

1. **一级防御 (客户端缓存)**：优先使用本地预热模板与缓存 Schema，实现首字 0 延迟渲染；
2. **二级防御 (指数退避重试)**：遇到网络抖动，按 500ms -> 1500ms -> 3000ms 自动重试；
3. **三级防御 (离线规则引擎)**：若网络完全断开，自动激活内置轻量级规则合成器，确保用户随时能导出交付物。`
    }
  ],
  p2: [
    {
      id: 'kb-p2-1',
      productId: 'p2',
      title: '语音输入快速转记链路 Spec 草案',
      category: '业务规则',
      tags: ['语音转记', 'spec', '移动端'],
      author: 'Nova Agent (PRD Skill)',
      updatedAt: '2025-05-12',
      readTime: '4 分钟',
      isPinned: true,
      summary: 'NovaAgent 语音输入到结构化笔记的转记链路规格草案，含端点静音检测与分段策略。',
      content: `## 转记链路 Spec (Draft v0.3)

1. **采集层**：流式录音，端点静音检测 800ms 触发分段；
2. **识别层**：ASR 流式输出 + 顺滑后处理（去语气词、标点恢复）；
3. **结构化层**：LLM 抽取要点、待办与日程实体，输出 markdown 笔记。

> 待确认：后台录音时长上限（当前 5 分钟）与弱网断点续传策略。`
    },
    {
      id: 'kb-p2-2',
      productId: 'p2',
      title: '公测灰度期崩溃归因 Agent 报告',
      category: '经验沉淀',
      tags: ['灰度', '崩溃归因', '稳定性'],
      author: 'Nova Agent (QA Skill)',
      updatedAt: '2025-05-06',
      readTime: '5 分钟',
      summary: '灰度 10% 期间崩溃率 0.83% 的 Top 3 堆栈归因与修复建议，由 agent 自动聚合崩溃平台数据生成。',
      content: `## 崩溃归因报告 (灰度 Day 7)

| 崩溃簇 | 占比 | 归因 | 建议 |
| :-- | :-- | :-- | :-- |
| AudioSession 竞态 | 46% | 后台回前台未释放采集会话 | 会话生命周期加互斥锁 |
| JSON 反序列化 | 31% | 服务端字段类型变更未兼容 | 客户端加宽容解析 |
| OOM | 23% | 长录音波形缓存未清理 | 分段落盘 |

结论：修复前两项可将崩溃率压至 0.4% 以下，建议不阻塞下一轮放量。`
    },
    {
      id: 'kb-p2-3',
      productId: 'p2',
      title: '日程提醒与移动协同需求评审纪要',
      category: '经验沉淀',
      tags: ['需求评审', '日程提醒', '协同'],
      author: 'Nova Agent',
      updatedAt: '2025-04-22',
      readTime: '3 分钟',
      summary: 'V1.2 需求评审自动纪要：智能提醒时机、多端同步冲突策略两项结论待 PM 确认。',
      content: `## 需求评审纪要 (自动生成)

- **智能提醒时机**：默认提前 15 分钟，基于用户历史响应时间自适应（P1）；
- **多端冲突**：采用 last-write-wins + 冲突提示，不引入 CRDT（P2，留待 V2）；
- 待办：PM 确认提醒上限频率，避免打扰敏感用户。`
    }
  ],
  p3: [
    {
      id: 'kb-p3-1',
      productId: 'p3',
      title: '自然语言 SQL 查询准确率评审纪要',
      category: '经验沉淀',
      tags: ['NL2SQL', '准确率', '评测'],
      author: 'Nova Agent',
      updatedAt: '2025-05-15',
      readTime: '4 分钟',
      isPinned: true,
      summary: 'DataSense NL2SQL 内部评测集准确率从 78% 提升至 89% 的评审结论与 badcase 分类。',
      content: `## NL2SQL 准确率评审纪要

- 内部评测集 (320 条) 端到端准确率 89%（上轮 78%）；
- Badcase 分布：多表 JOIN 错 41%、时间边界错 33%、聚合粒度错 26%；
- 结论：引入 schema 链接预检 +few-shot 示例召回，下一轮目标 92%。`
    },
    {
      id: 'kb-p3-2',
      productId: 'p3',
      title: '指标异常归因引擎 ADR-007',
      category: '架构约束',
      tags: ['ADR', '异常归因', '指标'],
      author: 'Nova Agent (Architect Skill)',
      updatedAt: '2025-05-02',
      readTime: '5 分钟',
      summary: '决策：异常归因采用规则剪枝 + LLM 生成解释的两段式，而非端到端 LLM 归因。',
      content: `## ADR-007: 指标异常归因两段式架构

- **背景**：端到端 LLM 归因延迟高 (>8s) 且不可复现；
- **决策**：先规则剪枝（同环比 + 维度下钻显著性检验）收敛候选因子，再 LLM 生成自然语言解释；
- **代价**：新增规则引擎维护成本；解释质量依赖候选集质量；
- **状态**：已接受。`
    }
  ],
  p4: [
    {
      id: 'kb-p4-1',
      productId: 'p4',
      title: '官网视觉资产归档提取纪要',
      category: '经验沉淀',
      tags: ['视觉资产', '归档', '官网'],
      author: 'Nova Agent',
      updatedAt: '2025-04-28',
      readTime: '3 分钟',
      isPinned: true,
      summary: 'BrandPortal 发布后 agent 对全站视觉资产（色板/字体/图片）的归档提取与命名规范纪要。',
      content: `## 视觉资产归档纪要

- 提取色板 12 项（主色 #1A1A2E 系）、字体 2 套、切图 86 张；
- 命名规范：\`{页面}-{元素}-{状态}@{倍率}\`，已入库品牌资产库；
- 遗留：3 张 hero 图缺 3x 倍率，已通知设计补齐。`
    },
    {
      id: 'kb-p4-2',
      productId: 'p4',
      title: '客户案例页内容 Agent 生成报告',
      category: '经验沉淀',
      tags: ['内容生成', '客户案例', '官网'],
      author: 'Nova Agent (Content Skill)',
      updatedAt: '2025-04-15',
      readTime: '4 分钟',
      summary: '首批 6 个客户案例文案由 agent 从访谈录音稿生成，含人工修订比例统计。',
      content: `## 客户案例内容生成报告

- 输入：6 份客户访谈转写稿（共 4.2 万字）；
- 输出：案例页结构化文案（挑战/方案/成效三段式），平均人工修订比例 18%；
- 结论：成效数据段必须回源校验，agent 生成数值存在夸大风险（2 处已纠正）。`
    }
  ]
};

export const FULL_LIFECYCLE_DELIVERABLES_CATALOG: Array<{
  code: string;
  phase: 'requirement' | 'design' | 'dev' | 'test' | 'release';
  phaseName: string;
  title: string;
  category: string;
  format: 'markdown' | 'json' | 'sql' | 'typescript' | 'table';
  icon: string;
  summary: string;
  defaultContent: (product: any) => string;
}> = [
  // 1. 需求规划阶段
  {
    code: 'DEL-REQ-01',
    phase: 'requirement',
    phaseName: '需求规划阶段',
    title: '标准产品需求规格说明书 (PRD v1.0)',
    category: '需求文档',
    format: 'markdown',
    icon: 'FileText',
    summary: '包含项目背景、业务目标、目标用户画像、核心功能规格清单及非功能性指标完整说明。',
    defaultContent: (p) => `# 【${p.name}】产品需求规格说明书 (PRD)

## 1. 文档概述
- **产品名称**：${p.name}
- **产品定位**：${p.tagline}
- **文档版本**：v1.0.0
- **编制责任人**：${p.owner}
- **当前阶段**：${p.stage}

## 2. 项目背景与业务价值
${p.description}

### 核心价值主张 (Core Values)
${p.coreValues?.map((v: any) => `- **${v.title}**：${v.desc}`).join('\n') || '- 提升团队协同流转效能'}

## 3. 目标用户与使用场景
${p.targetAudience?.map((t: string, i: number) => `${i + 1}. **${t}**`).join('\n') || '互联网数字化产研团队'}

## 4. 核心功能规格清单
${p.featureMatrix?.map((f: any) => `### 4.${f.name} (${f.priority})
- **所属模块**：${f.module}
- **功能描述**：${f.desc}
- **当前状态**：${f.status}
- **验收要点**：必须通过核心业务流转与异常状态拦截。`).join('\n\n') || '核心业务流转规格'}

## 5. 非功能性需求 (NFR)
1. **性能**：首屏加载时间 <= 800ms，API 响应平均延迟 <= 200ms；
2. **高可用**：系统 SLA 达 99.9%，支持网络波动时的降级保护；
3. **安全性**：敏感数据传输采用 TLS 1.3，接口具备严格鉴权机制。`
  },
  {
    code: 'DEL-REQ-02',
    phase: 'requirement',
    phaseName: '需求规划阶段',
    title: '用户故事地图与 Gherkin 验收标准 (User Stories & AC)',
    category: '需求敏捷',
    format: 'markdown',
    icon: 'CheckSquare',
    summary: '按史诗 (Epic) 拆解的用户故事清单，附带 Given-When-Then 标准验收条件。',
    defaultContent: (p) => `# 【${p.name}】用户故事地图与验收标准清单

## 史诗 1: 核心业务与智能协同
### US-01: 智能任务与意图识别
- **As a** 产品经理 (PM)
- **I want to** 通过自然语言直接触发多任务分发与日程关联
- **So that** 能够免去手动填写数十个字段的繁琐操作

**验收标准 (Acceptance Criteria)**:
\`\`\`gherkin
Scenario: PM 输入会议与任务需求
  Given 用户位于对话窗口并输入“明天下午2点评审 PRD 并分配任务给 Alex”
  When 点击发送指令
  Then 系统自动提取时间、事项与负责人，生成对应的日程事件与任务卡片
  And 在确认弹窗中展示提取结果供用户微调
\`\`\`

### US-02: 全流程成果物一键矩阵导出
- **As a** 技术负责人 (Tech Lead)
- **I want to** 一键生成与 PRD 完全对齐的 API 契约与建表脚本
- **So that** 杜绝前后端开发过程中的接口认知断层

**验收标准 (Acceptance Criteria)**:
\`\`\`gherkin
Scenario: 导出 OpenAPI 与 DDL
  Given PRD 处于“已评审”状态
  When 用户在成果物中心点击“生成全套开发资产”
  Then 5秒内生成 openapi.json 与 schema.sql 文件并支持即时下载
\`\`\``
  },
  {
    code: 'DEL-REQ-03',
    phase: 'requirement',
    phaseName: '需求规划阶段',
    title: '业务流转时序图与泳道流向图 (Flowchart & Sequence)',
    category: '流程架构',
    format: 'markdown',
    icon: 'Layers',
    summary: '涵盖用户、前端界面、BFF 网关、AI 智能体及数据层的全流程时序交互泳道图。',
    defaultContent: (p) => `# 【${p.name}】业务交互时序图与泳道流程

## 1. 核心业务流转时序 (Mermaid Sequence)
\`\`\`mermaid
sequenceDiagram
  autonumber
  actor User as 用户 (PM/Dev)
  participant Client as Web 前端 (React 19)
  participant BFF as Node.js BFF 网关
  participant AI as AI Agent 调度中枢
  participant DB as 资产数据库 / 本地工作区

  User->>Client: 1. 提交业务指令 / 选择产品成果物生成
  Client->>BFF: 2. POST /api/generate-deliverable (带产品上下文)
  BFF->>AI: 3. 装配领域 Schema 与提示词工程
  AI-->>BFF: 4. 返回结构化成果物内容 (Markdown/JSON)
  BFF->>DB: 5. 自动归档至项目资产库并更新索引
  BFF-->>Client: 6. 响应 200 OK + 完整交付物实体
  Client-->>User: 7. 高亮渲染成果物预览，支持一键下载与同步
\`\`\`

## 2. 异常与回退策略泳道
- **网络中断**：前端捕获错误 -> 切换本地规则合成引擎 -> 输出离线交付物并标记为草稿；
- **校验不通过**：AI 自检引擎发现逻辑漏洞 -> 弹出提示卡片并标明修补建议。`
  },
  {
    code: 'DEL-REQ-04',
    phase: 'requirement',
    phaseName: '需求规划阶段',
    title: '需求追踪矩阵与版本覆盖度报告 (RTM Matrix)',
    category: '需求管控',
    format: 'markdown',
    icon: 'Target',
    summary: '建立从业务目标 -> PRD 功能项 -> 代码模块 -> 测试用例的端到端双向可追溯矩阵。',
    defaultContent: (p) => `# 【${p.name}】需求可追溯性矩阵 (Traceability Matrix)

| 需求 ID | 业务功能项 | 优先级 | 关联代码模块 | 关联测试用例 | 当前交付状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-01** | 多 Agent 智能协同工作区 | P0 | \`/src/views/AgentWorkspaceView.tsx\` | TC-001 (功能测试) | ✅ 已就绪 |
| **REQ-02** | 全流程成果物生成工厂 | P0 | \`/src/components/product/DeliverablesTab.tsx\` | TC-003 (性能测试) | ✅ 已就绪 |
| **REQ-03** | 高保真响应式原型沙箱 | P0 | \`/src/components/product/UIPrototypeTab.tsx\` | TC-002 (UI走查) | ✅ 已就绪 |
| **REQ-04** | 测试用例与自动化脚本生成 | P1 | \`/src/components/product/TestManagementTab.tsx\` | TC-004 (自动化) | ✅ 已就绪 |
| **REQ-05** | 竞品分析与 SWOT 洞察中心 | P1 | \`/src/components/product/CompetitorAnalysisTab.tsx\` | TC-005 (数据校验) | ✅ 已就绪 |`
  },

  // 2. 界面设计阶段
  {
    code: 'DEL-DES-01',
    phase: 'design',
    phaseName: '界面设计阶段',
    title: '高保真原型交互说明书与界面规范 (UI/UX Specs)',
    category: '原型设计',
    format: 'markdown',
    icon: 'Sparkles',
    summary: '涵盖页面布局信息架构、主交互状态流转、微动效规范与响应式断点适配规则。',
    defaultContent: (p) => `# 【${p.name}】UI/UX 交互设计规范与原型说明书

## 1. 设计核心理念
遵循 **“以信息效率为先、空间呼吸感与克制的高对比度”** 设计哲学。严禁廉价无意义的发光特效，采用精致微阴影与优雅的圆角层次。

## 2. 视口与响应式断点规范
- **桌面端 (Desktop)**: 宽度 1440px (基准), 最小适配 1024px;
- **平板端 (Tablet)**: 宽度 820px, 自动折叠侧边栏至图标模式;
- **移动端 (Mobile)**: 宽度 390px (iPhone 16 Pro 基准), 采用抽屉式底部导航。

## 3. 关键交互状态定义
1. **加载状态 (Loading)**: 骨架屏微光渐变 (Skeleton Shimmer)，严禁使用全屏突兀 Spinner;
2. **空状态 (Empty State)**: 居中精致矢量图标 + 1 句清晰文案 + 1 个主行动按钮 (CTA);
3. **操作反馈 (Feedback)**: 底部轻量 Toast 提示，成功状态停留 2s 自动滑出。`
  },
  {
    code: 'DEL-DES-02',
    phase: 'design',
    phaseName: '界面设计阶段',
    title: '统一设计系统规范 (Design System Tokens)',
    category: '设计资产',
    format: 'json',
    icon: 'Layers',
    summary: '色彩系统、文字阶梯、间距尺度、圆角与阴影规范的标准 Design Tokens (JSON 格式)。',
    defaultContent: (p) => JSON.stringify({
      product: p.name,
      version: '1.0.0',
      colorPalette: {
        primary: { 50: '#EEF2FF', 100: '#E0E7FF', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA', 900: '#312E81' },
        slate: { 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 600: '#475569', 800: '#1E293B', 900: '#0F172A' },
        accent: { emerald: '#10B981', amber: '#F59E0B', rose: '#F43F5E', purple: '#8B5CF6' }
      },
      typography: {
        fontFamilyDisplay: 'Plus Jakarta Sans, system-ui, sans-serif',
        fontFamilyBody: 'Plus Jakarta Sans, system-ui, sans-serif',
        scale: {
          display: { size: '32px', lineHeight: '40px', weight: '800' },
          h1: { size: '24px', lineHeight: '32px', weight: '700' },
          h2: { size: '18px', lineHeight: '26px', weight: '600' },
          body: { size: '14px', lineHeight: '20px', weight: '400' },
          caption: { size: '12px', lineHeight: '16px', weight: '500' }
        }
      },
      radii: { sm: '8px', md: '12px', lg: '16px', xl: '24px', full: '9999px' },
      spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', xxl: '48px' }
    }, null, 2)
  },

  // 3. 技术研发阶段
  {
    code: 'DEL-DEV-01',
    phase: 'dev',
    phaseName: '技术研发阶段',
    title: '系统总体技术架构设计方案 (Architecture Blueprint)',
    category: '技术方案',
    format: 'markdown',
    icon: 'Code2',
    summary: '微服务分层拓扑、前后端通信协议、高可用容灾与数据流转架构方案。',
    defaultContent: (p) => `# 【${p.name}】系统总体技术架构方案

## 1. 选型技术栈
- **前端核心**：React 19 + TypeScript + Tailwind CSS 4 + Vite
- **后端 BFF**：Node.js + Express + TypeScript
- **AI 智能中枢**：@google/genai SDK (Gemini 2.5 / DeepSeek-V3 引擎)
- **图表与可视化**：Recharts + Lucide Icons + Motion 动画库

## 2. 系统分层架构
\`\`\`text
┌─────────────────────────────────────────────────────────┐
│                    Web Client (React 19)                │
│  [Product Hub]   [AI Requirements]   [Prototype Sandbox]│
└────────────────────────────┬────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────▼────────────────────────────┐
│                  Node.js BFF Gateway                    │
│  - JWT 鉴权 / 请求限流     - 领域业务控制器 (Controllers)  │
│  - 成果物流水线引擎        - 本地文件资产索引器 (Indexer) │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
┌──────────────▼──────────┐ ┌──────────────▼──────────────┐
│    AI Model Gateway     │ │      Database & Storage     │
│ (Gemini / DeepSeek API) │ │ (PostgreSQL / LocalStorage) │
└─────────────────────────┘ └─────────────────────────────┘
\`\`\`

## 3. 核心设计原则
1. **轻量自愈**：客户端与 BFF 均具备离线降级与故障自愈策略；
2. **严格类型安全**：前后端共享 TypeScript 契约，避免运行时类型错误。`
  },
  {
    code: 'DEL-DEV-02',
    phase: 'dev',
    phaseName: '技术研发阶段',
    title: 'RESTful API 接口契约标准文档 (OpenAPI 3.0)',
    category: '接口契约',
    format: 'json',
    icon: 'Code2',
    summary: '符合 OpenAPI 3.0 规范的 RESTful API 接口清单，包含请求 Payload 与响应 Mock。',
    defaultContent: (p) => JSON.stringify({
      openapi: '3.0.0',
      info: {
        title: `${p.name} OpenAPI Specifications`,
        version: p.version || '1.0.0',
        description: `Full API endpoints contract for ${p.name}`
      },
      servers: [{ url: 'https://api.rnd.internal', description: 'Production BFF Server' }],
      paths: {
        '/api/products/{id}/deliverables': {
          get: {
            summary: '获取产品关联全量成果物列表',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { 200: { description: '返回成果物数组' } }
          }
        },
        '/api/products/{id}/generate': {
          post: {
            summary: '一键生成指定产研交付物',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { deliverableCode: { type: 'string' } },
                    required: ['deliverableCode']
                  }
                }
              }
            },
            responses: { 200: { description: '生成成功' } }
          }
        }
      }
    }, null, 2)
  },
  {
    code: 'DEL-DEV-03',
    phase: 'dev',
    phaseName: '技术研发阶段',
    title: '数据库物理建模与 DDL 建表脚本 (Database Schema)',
    category: '数据建模',
    format: 'sql',
    icon: 'Layers',
    summary: '针对核心业务实体、交付物档案、测试用例与操作日志的 PostgreSQL DDL 语句。',
    defaultContent: (p) => `-- 【${p.name}】核心数据表物理建模 DDL
-- 数据库方言: PostgreSQL 15+

CREATE TABLE IF NOT EXISTS tbl_product_meta (
    id VARCHAR(64) PRIMARY KEY,
    product_name VARCHAR(128) NOT NULL,
    tagline VARCHAR(255),
    stage VARCHAR(32) NOT NULL DEFAULT '规划中',
    version VARCHAR(32) NOT NULL DEFAULT 'v1.0.0',
    progress INTEGER NOT NULL DEFAULT 0,
    health VARCHAR(16) NOT NULL DEFAULT 'healthy',
    owner VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tbl_deliverable_assets (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES tbl_product_meta(id) ON DELETE CASCADE,
    phase VARCHAR(32) NOT NULL,
    code VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    format VARCHAR(16) NOT NULL DEFAULT 'markdown',
    content TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_prod_phase ON tbl_deliverable_assets(product_id, phase);`
  },

  // 4. 质量测试阶段
  {
    code: 'DEL-TST-01',
    phase: 'test',
    phaseName: '质量测试阶段',
    title: '全量功能与边界测试用例集矩阵 (Test Cases Suite)',
    category: '测试用例',
    format: 'table',
    icon: 'CheckCircle2',
    summary: '覆盖正常流、逆向边界条件、权限越权与高并发压测的 100% 覆盖率用例清单。',
    defaultContent: (p) => `# 【${p.name}】功能与边界测试用例矩阵

| 用例 ID | 所属模块 | 测试场景与意图 | 优先级 | 前置条件 | 测试步骤概要 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | AI 需求生成 | 正常输入一句话业务目标生成 PRD | P0 | 登录且选定产品 | 输入目标 -> 点击生成 | 3s 内产出完整 Markdown 规格说明 |
| **TC-02** | 原型沙箱 | 移动端与平板端视口无缝切换 | P0 | 原型加载完毕 | 点击设备切换按钮 | 容器响应式变换，无文本溢出 |
| **TC-03** | 成果物工厂 | 一键极速批量生成 18 项全量成果物 | P0 | 产品已创建 | 点击一键批量生成 | 流水线依次完成，状态转为 ready |
| **TC-04** | 异常容灾 | 服务端断网时的离线自愈与降级 | P1 | 模拟断网 | 触发生成操作 | 本地规则引擎接管，输出离线成果物 |
| **TC-05** | 竞品分析 | 雷达图多维度打分与 SWOT 矩阵推导 | P1 | 竞品数据加载 | 查看雷达对比 | 5 维度雷达正确渲染，差异化分析就绪 |`
  },
  {
    code: 'DEL-TST-02',
    phase: 'test',
    phaseName: '质量测试阶段',
    title: '端到端自动化测试脚本套件 (Playwright / Jest)',
    category: '自动化测试',
    format: 'typescript',
    icon: 'Code2',
    summary: '基于 Playwright 编写的端到端 (E2E) 自动化测试脚本，可直接纳入 CI/CD 流水线。',
    defaultContent: (p) => `import { test, expect } from '@playwright/test';

test.describe('【${p.name}】E2E 自动化测试流水线', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('01. 验证产品研发中心核心导航与总览看板', async ({ page }) => {
    await expect(page.locator('text=${p.name}')).toBeVisible();
    await page.click('button:has-text("AI需求设计")');
    await expect(page.locator('text=AI 需求全自动设计')).toBeVisible();
  });

  test('02. 验证一键成果物生成与导出流程', async ({ page }) => {
    await page.click('button:has-text("成果物生成")');
    const generateBtn = page.locator('button:has-text("一键极速批量生成")');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();
    await expect(page.locator('text=已就绪')).toHaveCount(18, { timeout: 10000 });
  });
});`
  },
  {
    code: 'DEL-TST-03',
    phase: 'test',
    phaseName: '质量测试阶段',
    title: '阶段质量验收与发版准入评估报告 (QA Sign-Off)',
    category: '质量报告',
    format: 'markdown',
    icon: 'ShieldCheck',
    summary: '包含用例通过率、缺陷分布统计、性能压测指标与最终上线准入结论。',
    defaultContent: (p) => `# 【${p.name}】发版前质量验收评估与准入报告

## 1. 测试执行概览
- **测试执行周期**：Sprint 12 (2025-05-20 ~ 2025-06-01)
- **测试负责人**：QA Lead
- **用例总数**：42 条
- **执行通过率**：**100% (42/42 Passed)**
- **遗留阻塞缺陷 (Blocker)**：**0 个**

## 2. 缺陷分布统计 (Defect Metrics)
- P0 致命缺陷：0 (已归零)
- P1 严重缺陷：0 (已修复并回归通过)
- P2 一般体验优化：2 (已移入下一迭代排期)

## 3. 性能与压测结论
- **首屏渲染时间**：420ms (优于 800ms 目标)
- **高并发响应**：500 QPS 压测下平均延迟 185ms，错误率 0.00%

## 4. 最终发版准入结论
✅ **准予发布 (PASSED FOR PRODUCTION)**
产品在功能完整度、跨端兼容性、异常容灾降级与性能指标上均完全达到上线发布标准。`
  },

  // 5. 发版与运营阶段
  {
    code: 'DEL-REL-01',
    phase: 'release',
    phaseName: '发版与运营阶段',
    title: '官方发版说明与更新日志 (Release Notes v1.0)',
    category: '发版公告',
    format: 'markdown',
    icon: 'Flag',
    summary: '面向内部团队与外部客户的官方发版日志，总结核心新增特性与优化项。',
    defaultContent: (p) => `# 【${p.name}】v${p.version || '1.0.0'} 正式发版公告

🎉 我们非常高兴地宣布，**${p.name}** 正式发布！

## 🚀 核心新特性概览
${p.featureMatrix?.map((f: any) => `### ✨ ${f.name}
- ${f.desc} (模块: ${f.module})`).join('\n') || '- 全生命周期 AI 赋能产研流转'}

## 🛠️ 体验与性能优化
- ⚡ 优化全流程成果物生成引擎，批量推导速度提升 300%；
- 🎨 引入高保真多端交互原型沙箱与 Design Tokens 规范；
- 🛡️ 完善网络异常状态下的本地离线自愈与降级机制。

## 👥 感谢团队
感谢产研团队全体成员的卓越贡献与精心打磨！`
  },
  {
    code: 'DEL-REL-02',
    phase: 'release',
    phaseName: '发版与运营阶段',
    title: '竞品深度对比与市场差异化破局报告 (Competitor Intel)',
    category: '市场洞察',
    format: 'markdown',
    icon: 'LineChart',
    summary: '包含 5 维度竞品雷达对比、SWOT 态势分析与差异化护城河建设策略。',
    defaultContent: (p) => `# 【${p.name}】竞品深度对比与市场破局战略报告

## 1. 核心竞品态势对比
对比竞品包括 Notion AI、Linear 及 Coze/Dify 平台。
**核心差异化亮点**：本产品是唯一打通“自然语言需求 -> 高保真交互原型 -> 工程代码脚手架 -> 自动化测试用例 -> 发版成果物”的端到端产研操作系统。

## 2. SWOT 态势分析
- **优势 (Strengths)**：全流程成果物一键推导、本地工作区资产深度索引、多 Agent 开箱即用；
- **劣势 (Weaknesses)**：新产品品牌影响力需持续通过标杆落地扩大；
- **机会 (Opportunities)**：企业对 AI 提效工具需求由“单点问答”转向“全流程自动化交付”；
- **威胁 (Threats)**：海外巨头在现有通用协同工具上叠加轻量 AI 插件。

## 3. 破局行动路径
1. 聚焦研发效能高敏群体，以“全流程成果物一键交付”建立不可替代的效率口碑；
2. 持续强化私有化资产安全与本地代码深度绑定能力。`
  },
  {
    code: 'DEL-REL-03',
    phase: 'release',
    phaseName: '发版与运营阶段',
    title: '最终用户操作使用手册与帮助指南 (User Manual)',
    category: '用户指南',
    format: 'markdown',
    icon: 'BookOpen',
    summary: '详尽的用户使用教程，覆盖从快速入门、核心操作指引到常见问题解答 (FAQ)。',
    defaultContent: (p) => `# 【${p.name}】官方操作使用指南与帮助手册

## 1. 快速入门 (Quick Start)
1. **第一步**：在左侧导航选择【产品研发中心】；
2. **第二步**：选定您正在推进的目标产品（如 ${p.name}）；
3. **第三步**：点击【⚡ 一键极速批量生成全套成果物】，系统将自动为您推导 PRD、原型、API 契约与测试用例。

## 2. 核心功能操作指引
- **需求全自动设计**：在输入框输入一句话构想，即可自动生成包含用户故事、泳道图与边界自检的 PRD；
- **UI 原型体验**：在原型沙箱中切换 iPhone / Desktop 视图并体验交互；
- **知识库编辑**：在知识库中撰写文档，支持点击【AI智能润色】进行扩写与优化。

## 3. 常见问题 (FAQ)
- **Q: 生成的交付物支持导出为本地文件吗？**
  A: 完全支持！点击交付物卡片上的“复制”或“下载”，即可导出为 Markdown / JSON / SQL 格式。`
  },
  {
    code: 'DEL-REL-04',
    phase: 'release',
    phaseName: '发版与运营阶段',
    title: '产品商业化价值白皮书与战略规划 (Product Whitepaper)',
    category: '商业方案',
    format: 'markdown',
    icon: 'Zap',
    summary: '面向企业决策层与投资人的商业化价值白皮书，阐述 ROI 投资回报率与商业模式。',
    defaultContent: (p) => `# 【${p.name}】产品商业化价值与战略白皮书

## 1. 行业痛点与市场机遇
现代企业产研团队在文档撰写、接口对齐与测试用例编写上耗费超过 **45%** 的宝贵工程时间。
传统协作工具导致“需求与代码脱节、测试覆盖不全、交付文档滞后”。

## 2. ${p.name} 核心经济价值 (ROI)
- **研发交付周期缩短**：从需求评审到首版上线周期缩短 **60%**；
- **沟通返工率降低**：通过高保真原型与 OpenAPI 自动对齐，减少 **75%** 的需求理解偏差；
- **测试覆盖率提升**：用例自动生成实现 **100%** 核心路径覆盖。

## 3. 商业模式与落地规划
采用轻量 SaaS 订阅与私有化企业专享版双轮驱动模式，未来将持续拓展行业专属 Agent 技能市场。`
  }
];
