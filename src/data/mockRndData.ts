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
