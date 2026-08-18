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
    | '踩坑指南';
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

export const INITIAL_REQUIREMENTS: Record<string, ProductRequirementDesign> = {
  p1: {
    id: 'req-p1-1',
    productId: 'p1',
    title: 'WenXiBuddy AI 智能全流程研发协同引擎 PRD v3.5',
    version: 'v3.5.0',
    updatedAt: '2025-06-01 16:30',
    status: '已评审',
    author: 'Brandon (PM Lead)',
    businessGoal: '打通自然语言意图识别、智能多任务分发、高保真原型渲染、代码脚手架生成及测试用例全自动生成的端到端产研闭环，缩短 60% 需求到上线的交付周期。',
    targetAudience: ['互联网产研团队 (PM / 架构师 / 研发 / QA)', '高科技数字化转型企业 TPM', '寻求 Agent 效能倍增的技术创新团队'],
    coreSummary: '涵盖大模型驱动的自然语言任务调度、实时交互原型沙箱、全生命周期成果物一键矩阵导出、测试用例自动化生成与竞品态势情报中心。',
    userStories: [
      {
        id: 'US-001',
        epic: '需求智能化工程',
        role: '产品经理 (PM)',
        feature: '输入一句话需求想法，自动生成包含用户故事、泳道时序图与边界自检的完整 PRD',
        benefit: '免去繁琐模板排版，几秒钟内完成高质量需求草案与评审预备',
        priority: 'P0',
        acceptanceCriteria: [
          'Given PM 输入业务目标与核心场景，When 点击“AI全自动生成”，Then 10秒内生成包含背景、目标、用户画像、验收标准的完整 Markdown PRD',
          'Given 生成的 PRD，When 存在未覆盖的异常分支（如网络超时、非法参数），Then 系统自动高亮提示并提供一键修补建议'
        ]
      },
      {
        id: 'US-002',
        epic: '交互原型生成',
        role: 'UI/UX 设计师 & PM',
        feature: '根据需求语义即时渲染多端响应式高保真交互原型与设计 Token',
        benefit: '在需求评审现场即可直接点击体验原型交互，消除沟通理解偏差',
        priority: 'P0',
        acceptanceCriteria: [
          '支持 Web 桌面端、移动端 iPhone、iPad 平板三重视图无缝切换',
          '支持 4 套主流现代主题配色切换，并支持一键导出 React 19 + Tailwind CSS 代码'
        ]
      },
      {
        id: 'US-003',
        epic: '质量与测试自动化',
        role: '测试工程师 (QA) & 研发',
        feature: '基于需求特征矩阵自动推导正向、边界、性能与安全性全量测试用例及自动化脚本',
        benefit: '实现需求到测试用例 100% 覆盖率，并生成 Playwright / Jest 自动化测试脚本',
        priority: 'P1',
        acceptanceCriteria: [
          '用例自动标注优先级 (P0/P1/P2) 与前置条件、执行步骤及预期结果',
          '支持用例执行状态记录与一键导出为 Excel/XLSX 兼容表格'
        ]
      },
      {
        id: 'US-004',
        epic: '全流程成果物工厂',
        role: '项目负责人 & TPM',
        feature: '一键极速批量生成产研 5 大阶段 18 项全部交付物并一键打包归档',
        benefit: '全方位满足大厂交付规范与审计合规要求，实现文档与代码资产双向对齐',
        priority: 'P0',
        acceptanceCriteria: [
          '支持批量一键推导，提供实时流水线进度监控',
          '生成的成果物支持在线预览、即时微调、格式转换与同步至产品文档库'
        ]
      }
    ],
    useCases: [
      {
        id: 'UC-01',
        title: '自然语言需求智能拆解与时序流转推导',
        actor: '产品经理 / 技术负责人',
        preCondition: '已进入产品研发中心并选定当前目标产品',
        mainFlow: [
          '1. 用户在需求生成面板输入业务描述或选择模板（如“B端权限与多Agent调度”）；',
          '2. 触发 AI 需求引擎，解析角色、场景、业务流转节点与数据交互；',
          '3. 生成结构化用户故事地图、时序泳道图与边界异常应对策略；',
          '4. 用户审查生成结果，可选择“AI 逻辑漏洞扫描”进行自动合规自检；',
          '5. 点击“沉淀为正式 PRD”或“一键派发研发任务”。'
        ],
        altFlow: [
          '4a. 若发现缺少鉴权分支，AI 提示“补充 OAuth/JWT 异常回退逻辑”，用户点击“采纳建议”自动增补对应章节。'
        ],
        postCondition: 'PRD 与任务集自动入库，版本号自动递增并同步工作区。'
      }
    ],
    boundaryChecks: [
      {
        scenario: '高并发或网络波动导致 AI 生成中断',
        riskLevel: 'medium',
        impact: '生成内容断流或格式损坏',
        handlingStrategy: '客户端本地具备离线高保真生成引擎降级机制，支持断点自动重连与增量补齐。'
      },
      {
        scenario: '输入需求存在业务逻辑矛盾（如既要求无登录访问又要求严格用户鉴权）',
        riskLevel: 'high',
        impact: 'PRD 逻辑冲突导致后续开发产生重大返工',
        handlingStrategy: '内置 AI 逻辑冲突检测引擎，在生成过程中自动标红冲突规则并给出 2 种调和方案供 PM 选择。'
      },
      {
        scenario: '大容量成果物批量生成导出时的内存溢出',
        riskLevel: 'low',
        impact: '页面卡顿或下载失败',
        handlingStrategy: '采用流式生成与分块 Blob 打包机制，保证大文件即时秒级导出。'
      }
    ],
    flowchartNodes: [
      { id: '1', label: '1. 需求意图输入', type: 'start', desc: '自然语言/场景模板' },
      { id: '2', label: '2. AI 语义拆解引擎', type: 'agent', desc: '提取角色/场景/规则/SLA' },
      { id: '3', label: '3. 用户故事与验收标准推导', type: 'process', desc: 'Given-When-Then 标准化' },
      { id: '4', label: '4. 逻辑闭环度漏洞自检', type: 'decision', desc: '检测异常分支与鉴权冲突' },
      { id: '5', label: '5. 成果物多端派发', type: 'end', desc: '原型/代码/用例/文档沉淀' }
    ],
    prdMarkdown: `# WenXiBuddy AI 智能全流程研发协同引擎 PRD (v3.5)

## 1. 业务背景与愿景
在现代产研协作中，传统模式在“需求拆解 -> 原型设计 -> 技术架构 -> 测试用例 -> 发版交付”各个环节存在严重的工具割裂与信息损耗。
本产品致力于提供全生命周期 AI 赋能的研发协同中心，使团队能够基于自然语言与结构化上下文，快速完成全生命周期的成果物推导。

## 2. 核心模块与功能清单
- **AI 需求全自动设计**：支持用户故事推导、时序流转图生成、边界自检与 PRD 规格书生成；
- **AI 界面高保真原型**：支持多端响应式交互沙箱、色彩主题切换与前端组件代码导出；
- **产品知识库深度整合**：提供领域词典、架构规范、FAQ 与 AI 辅助智能润色编辑器；
- **代码与工程脚手架**：生成 RESTful API 契约、TypeScript 数据接口、SQL DDL 与 Git Commit 记录；
- **测试管理与用例矩阵**：自动化生成功能、边界、并发与安全测试用例集，支持导出与脚本生成；
- **竞品分析与市场洞察**：多维度雷达图对比、SWOT 矩阵分析与破局策略建议；
- **全流程成果物工厂**：支持产研全流程 18 项成果物一键极速推导与批量归档。

## 3. 非功能性需求与性能指标
1. 界面响应时间：首屏加载 <= 500ms，交互切换 <= 50ms；
2. AI 生成延迟：单项成果物推导 <= 2.5s，全套批量生成 <= 8s；
3. 兼容性：适配 Chrome/Safari/Firefox 等主流现代浏览器及移动端 Safari/Chrome。`
  }
};

export const INITIAL_PROTOTYPES: Record<string, UIPrototypeScreen> = {
  p1: {
    id: 'proto-p1-1',
    title: 'WenXiBuddy AI 智能多Agent协同工作台原型',
    device: 'desktop',
    theme: 'indigo',
    route: '/workspace/agent-studio',
    description: '核心工作区高保真交互视图，包含左侧多Agent团队状态、中央智能交互对话流与右侧自动化任务派发面板。',
    sections: [
      {
        title: 'Agent 状态与算力看板',
        type: 'stats',
        data: [
          { label: '活跃智能体', value: '6 个', change: '+2 今日挂载', color: 'text-indigo-600' },
          { label: '任务自动化率', value: '94.2%', change: '+5.4% 环比', color: 'text-emerald-600' },
          { label: '平均响应延迟', value: '180ms', change: '极速稳定', color: 'text-blue-600' },
          { label: '今日生成成果物', value: '48 份', change: '全部校验通过', color: 'text-purple-600' }
        ]
      },
      {
        title: '核心多模态 Agent 对话流',
        type: 'chat',
        data: [
          { sender: 'PM Brandon', avatar: 'BR', time: '14:20', text: '请基于 WenXiBuddy Q3 规划，帮我生成完整的全流程需求规格书与高保真原型。', isUser: true },
          { sender: 'Nova AI Agent', avatar: 'AI', time: '14:21', text: '收到！已识别业务目标为【AI 原生多 Agent 协同工作站】。正在为您调用 PRD 扩写 Agent、UI 原型生成器与测试用例引擎...', isUser: false },
          { sender: 'Nova AI Agent', avatar: 'AI', time: '14:22', text: '✅ 已完成 18 项全流程产研成果物推导！包含 PRD v3.5、OpenAPI 规范、PostgreSQL DDL 建表脚本及 42 条测试用例。', isUser: false, badge: '成果物已就绪' }
        ]
      }
    ],
    designTokens: {
      primaryColor: '#4F46E5',
      fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
      borderRadius: '16px',
      spacingScale: '4px / 8px / 16px / 24px / 32px'
    },
    reactCode: `import React, { useState } from 'react';
import { Bot, Sparkles, CheckCircle2, Send, Layers } from 'lucide-react';

export function AgentStudioPrototype() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'Brandon (PM)', text: '请帮我生成 Q3 需求规格书及测试用例。', isUser: true },
    { sender: 'Nova Agent', text: '已为您生成完整 PRD v3.5、架构拓扑与 42 条测试用例！', isUser: false }
  ]);

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-2xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="font-bold text-base">Nova Agent Studio</h3>
            <p className="text-xs text-slate-400">大模型驱动的全流程产研自动化工作台</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/30">
          Agent 在线就绪
        </span>
      </div>
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={\`p-3.5 rounded-xl text-xs \${m.isUser ? 'bg-indigo-600/20 text-indigo-200 ml-8 border border-indigo-500/30' : 'bg-slate-800 text-slate-200 mr-8 border border-slate-700'}\`}>
            <div className="font-bold mb-1 opacity-70">{m.sender}</div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}`
  }
};

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

export const INITIAL_CODE_SCAFFOLDS: Record<string, CodeScaffoldItem[]> = {
  p1: [
    {
      id: 'scaff-1',
      productId: 'p1',
      name: 'TypeScript 领域契约与数据模型定义',
      type: 'types',
      language: 'typescript',
      filename: 'src/types/productRnd.ts',
      description: '定义全生命周期产品需求、高保真原型、测试用例与交付物的核心接口类型。',
      code: `export interface ProductRndDeliverable {
  id: string;
  productId: string;
  phase: 'requirement' | 'design' | 'dev' | 'test' | 'release';
  title: string;
  format: 'markdown' | 'json' | 'sql' | 'typescript';
  content: string;
  generatedAt: string;
}

export interface UserStoryMapping {
  epicId: string;
  epicName: string;
  stories: Array<{
    id: string;
    role: string;
    action: string;
    value: string;
    acceptanceCriteria: string[];
  }>;
}`
    },
    {
      id: 'scaff-2',
      productId: 'p1',
      name: 'OpenAPI 3.0 REST 接口契约规范',
      type: 'api',
      language: 'json',
      filename: 'docs/openapi_v3.json',
      description: '包含全套产品成果物生成、测试执行与代码脚手架派发接口的 OpenAPI 3.0 定义。',
      code: `{
  "openapi": "3.0.0",
  "info": {
    "title": "WenXiBuddy R&D Center API",
    "version": "3.5.0",
    "description": "API contract for automated PRD, prototype, test case and deliverable generation."
  },
  "paths": {
    "/api/rnd/generate-deliverable": {
      "post": {
        "summary": "一键生成产研成果物",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "productId": { "type": "string" },
                  "code": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "成果物生成成功" }
        }
      }
    }
  }
}`
    },
    {
      id: 'scaff-3',
      productId: 'p1',
      name: 'PostgreSQL 数据库物理建模与 DDL 脚本',
      type: 'schema',
      language: 'sql',
      filename: 'db/schema_v3.5.sql',
      description: '包含产品档案表、需求规格表、交付物资产表与测试用例执行记录表的建表脚本与索引设计。',
      code: `-- 产品研发中心核心资产存储 Schema
CREATE TABLE IF NOT EXISTS rnd_products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tagline TEXT,
  stage VARCHAR(32) NOT NULL DEFAULT '规划中',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rnd_deliverables (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) REFERENCES rnd_products(id) ON DELETE CASCADE,
  phase VARCHAR(32) NOT NULL,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deliverables_product ON rnd_deliverables(product_id);
CREATE INDEX idx_deliverables_phase ON rnd_deliverables(phase);`
    },
    {
      id: 'scaff-4',
      productId: 'p1',
      name: 'Conventional Commits 规范与 PR 自动生成模板',
      type: 'commit',
      language: 'markdown',
      filename: '.github/PULL_REQUEST_TEMPLATE.md',
      description: '自动化团队 Git 提交规范与 Pull Request 变更归纳模板。',
      code: `## 🚀 Pull Request 变更说明

### 关联需求 / 成果物
- 关联产品: \`WenXiBuddy AI 智能协同平台\`
- 关联 PRD: \`PRD_WenXiBuddy_v3.5\`
- 变更类型: \`feat(rnd-center): 新增全生命周期成果物一键生成与代码脚手架工厂\`

### 核心改动清单
1. ✨ 新增 AI 需求自动工程化模块与用户故事时序图；
2. 🎨 新增多端高保真交互原型沙箱与 Design Tokens；
3. 🧪 集成 42 条自动化测试用例矩阵与 Playwright 脚本套件；
4. 📊 上线 5 维度竞品雷达对比与 SWOT 破局策略。

### 验收与测试结论
- [x] 单元测试通过 (通过率 100%)
- [x] UI 走查与响应式断点测试通过
- [x] 无任何破坏性 API 变更`
    }
  ]
};

export const INITIAL_TEST_CASES: Record<string, TestCaseItem[]> = {
  p1: [
    {
      id: 'TC-001',
      productId: 'p1',
      module: 'AI需求设计',
      title: '自然语言输入一键生成完整结构化 PRD 与用户故事',
      type: '功能测试',
      priority: 'P0',
      preconditions: '已登录系统，进入【产品研发中心】且关联目标产品正常',
      steps: [
        '1. 点击进入【AI 需求全自动设计】标签页；',
        '2. 在需求输入框输入：“支持全流程成果物一键生成与测试用例推导”；',
        '3. 点击【AI全自动生成 PRD 方案】；',
        '4. 观察生成状态及各模块输出。'
      ],
      expectedResult: '在 3 秒内正确渲染出包含用户故事、泳道时序图、边界自检及完整 Markdown 规格说明书。',
      status: 'passed',
      automated: true,
      scriptSnippet: `test('TC-001: 应能在 3s 内生成完整 PRD 规格书', async ({ page }) => {
  await page.goto('/rnd/requirements');
  await page.fill('[data-testid="req-input"]', '支持全流程成果物生成');
  await page.click('[data-testid="btn-generate-req"]');
  await expect(page.locator('[data-testid="prd-container"]')).toBeVisible({ timeout: 5000 });
});`
    },
    {
      id: 'TC-002',
      productId: 'p1',
      module: 'UI原型沙箱',
      title: '多端设备视图切换 (Desktop / Mobile / Tablet) 及主题配色即时生效',
      type: 'UI兼容性',
      priority: 'P0',
      preconditions: '原型已生成并处于渲染就绪状态',
      steps: [
        '1. 进入【AI 界面设计与原型】标签；',
        '2. 点击设备切换按钮分别切换至 iPhone 16 Pro 与 iPad 视图；',
        '3. 点击主题切换按钮切换为“极光科技蓝”与“深邃黑夜”；',
        '4. 检查原型容器尺寸与配色样式。'
      ],
      expectedResult: '原型容器以平滑过渡动画自适应切换视口宽度，主题变量即时生效，无任何溢出或布局断裂。',
      status: 'passed',
      automated: true
    },
    {
      id: 'TC-003',
      productId: 'p1',
      module: '成果物工厂',
      title: '全生命周期 18 项成果物一键批量极速生成与流式流水线',
      type: '性能并发',
      priority: 'P0',
      preconditions: '目标产品配置完整',
      steps: [
        '1. 进入【全流程成果物工厂】；',
        '2. 点击【⚡ 一键极速批量生成全套成果物】；',
        '3. 观察流水线进度条与 18 个交付物卡片状态。'
      ],
      expectedResult: '18 项成果物依次呈现生成中并成功转为 ready 状态，生成全流程耗时 <= 8s，各文件支持复制与一键导出。',
      status: 'passed',
      automated: true
    },
    {
      id: 'TC-004',
      productId: 'p1',
      module: '边界与容错',
      title: '无网络或 API 报错时的离线自愈与模板降级测试',
      type: '边界条件',
      priority: 'P1',
      preconditions: '模拟断网或 API 限流 429 异常',
      steps: [
        '1. 阻断服务端网络请求；',
        '2. 触发 AI 需求设计或测试用例生成；',
        '3. 检查系统提示与页面渲染。'
      ],
      expectedResult: '系统平滑切换至本地高级规则引擎，正常产出标准格式成果物，并给予用户友好提示。',
      status: 'passed',
      automated: true
    },
    {
      id: 'TC-005',
      productId: 'p1',
      module: '安全合规',
      title: '敏感 API Key 与 Token 不会在客户端代码中泄露',
      type: '安全合规',
      priority: 'P0',
      preconditions: '生产环境或打包构建包',
      steps: [
        '1. 检查客户端网络请求 Headers 与 LocalStorage；',
        '2. 验证所有 AI API 交互均通过 BFF 服务端中转。'
      ],
      expectedResult: '所有敏感凭证均在 Node BFF 环境变量中受保护，前端绝无敏感秘钥明文。',
      status: 'passed',
      automated: true
    }
  ]
};

export const INITIAL_COMPETITOR_DATA: Record<string, CompetitorAnalysisData> = {
  p1: {
    productId: 'p1',
    productName: 'WenXiBuddy AI 智能协同平台',
    updatedAt: '2025-06-01',
    radarData: [
      { dimension: 'AI 全自动工程化', ourProduct: 95, compA: 60, compB: 50, compC: 40 },
      { dimension: '多 Agent 协同深度', ourProduct: 92, compA: 70, compB: 65, compC: 45 },
      { dimension: '本地资产与文件深度绑定', ourProduct: 90, compA: 40, compB: 30, compC: 80 },
      { dimension: '全流程成果物一键矩阵', ourProduct: 98, compA: 55, compB: 45, compC: 35 },
      { dimension: '产研全链路协同 (PRD->Code->QA)', ourProduct: 94, compA: 65, compB: 85, compC: 50 },
      { dimension: '轻量化易用性与响应速度', ourProduct: 88, compA: 85, compB: 70, compC: 75 },
    ],
    competitors: [
      {
        name: 'Notion AI & Projects',
        tag: '综合型知识与轻量项目管理',
        logoColor: 'bg-slate-800 text-white',
        marketShare: '38% 市场份额',
        pricing: '$10 - $18 / 用户 / 月',
        overallScore: 82,
        features: {
          aiAutomation: '基础文本总结与草稿生成，无深度代码与测试联动',
          collaboration: '极佳的多人实时协作文档',
          workspaceIntegration: '仅支持云端同步，不支持本地工作区代码工程索引',
          extensibility: '插件生态丰富，但非产研专业向',
          dataSecurity: '企业版支持 SOC2，数据存储于公共云'
        },
        pros: ['文档排版与块级编辑器体验极佳', '品牌认知度与用户基数庞大'],
        cons: ['缺乏针对产研全生命周期的专业脚手架与用例自动化', '无法深度感知本地代码与微服务架构']
      },
      {
        name: 'Linear + AI Workflows',
        tag: '极客向产研 Issue 追踪流',
        logoColor: 'bg-indigo-600 text-white',
        marketShare: '22% 市场份额',
        pricing: '$8 - $14 / 用户 / 月',
        overallScore: 85,
        features: {
          aiAutomation: '支持 Issue 自动归类与重复检测',
          collaboration: '极致的键盘操作流与 Issue 流转',
          workspaceIntegration: '深度集成 GitHub/GitLab PR 状态',
          extensibility: 'API 与 Webhook 支持完备',
          dataSecurity: '企业级单点登录与审计日志'
        },
        pros: ['UI 交互极度丝滑，研发团队认可度高', 'Git 分支与 PR 联动紧密'],
        cons: ['缺少从需求到 UI 原型及测试用例全矩阵的自动推导', '知识库与文档沉淀能力较弱']
      },
      {
        name: 'Coze / Dify 智能体工作流',
        tag: 'Agent 工作流编排平台',
        logoColor: 'bg-purple-600 text-white',
        marketShare: '18% 市场份额',
        pricing: '按 Token 或团队席位计费',
        overallScore: 78,
        features: {
          aiAutomation: '强大的可视化节点编排与 RAG',
          collaboration: '多人员配置与 API 发布',
          workspaceIntegration: '支持知识库文件上传，但无项目生命周期管理',
          extensibility: '丰富的第三方插件与工具链',
          dataSecurity: '支持私有化部署'
        },
        pros: ['工作流编排灵活，模型接入自由度高'],
        cons: ['非开箱即用的产研管理系统，需用户自行组装大量工作流', '缺乏看板、排期、测试矩阵与研发交付管理']
      }
    ],
    swot: {
      strengths: [
        '【首创产研全流程闭环】从 PRD -> 原型 -> 代码架构 -> 测试用例 -> 发版成果物的一键串联；',
        '【本地工作区与云端双核驱动】深度索引本地文件代码树，打破传统 SaaS 无法直接联动本地工程的壁垒；',
        '【高定制化 Agent 技能矩阵】开箱即用的 PRD 自检、测试用例推导与竞品洞察 Agent。'
      ],
      weaknesses: [
        '【品牌积淀尚在起步阶段】相比 Notion/Jira，行业知名度需通过标杆客户案例持续建立；',
        '【移动端重度操作体验】当前重点优化桌面端大屏产研体验，移动端偏向查看与审批。'
      ],
      opportunities: [
        '【AI 原生产研工具升级浪潮】全球软件企业正全面拥抱 AI 研发辅助，市场对“全自动化成果物”需求迫切；',
        '【国产化与数据隐私诉求】支持本地工作区索引与私有模型集成，切中企业对代码资产安全的核心痛点。'
      ],
      threats: [
        '【巨头快速跟进】微软 GitHub Copilot Workspace 与 Atlassian 正在加速将 AI 嵌入现有工具链；',
        '【大模型演进带来的架构适配成本】需持续适配最新 DeepSeek / Gemini / Claude 模型接口与上下文特性。'
      ]
    },
    differentiationStrategy: `### 🎯 WenXiBuddy 核心破局与差异化定位策略

1. **以“全生命周期成果物一键工厂”为核心矛头**：
   不与通用文档软件争夺碎片化笔记市场，专注解决“技术团队交付物规范要求高、编写耗时久”的强痛点。通过一键推导 18 项专业产研交付物，建立不可替代的生产力壁垒。

2. **打通“代码-文档-用例”三位一体的活态资产库**：
   传统 PRD 评审后即沦为死文档。WenXiBuddy 实现了 PRD 与 OpenAPI 契约、PostgreSQL 表结构、Playwright 测试用例的双向同步，代码变动自动触发文档与用例自检。

3. **极简操作流，降低大模型使用门槛**：
   无需复杂 Prompt 提示词工程，PM 和研发只需输入一句话目标或点击预设按钮，系统自动组装结构化上下文与大厂标准模板完成输出。`,
    gapAnalysis: [
      {
        feature: '全流程产研成果物一键批量推导',
        ourStatus: '领先',
        industryStandard: '多数工具仅支持单篇文档 AI 润色',
        actionPlan: '保持核心生成引擎迭代，增加更多行业专业模板'
      },
      {
        feature: '需求到测试用例与 Playwright 脚本映射',
        ourStatus: '领先',
        industryStandard: '通常需要研发和 QA 手动编写',
        actionPlan: '持续提升边界用例推导准确率至 98% 以上'
      },
      {
        feature: '多人在线实时协同光标',
        ourStatus: '追赶中',
        industryStandard: 'Notion / Figma 标配实时协同',
        actionPlan: '在 Q4 版本引入基于 WebSocket 的多人协同与评论划词'
      }
    ]
  }
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
