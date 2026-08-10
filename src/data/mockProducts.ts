export interface ProductMilestone {
  id?: string;
  title: string;
  date: string;
  stage?: string;
  status: 'pending' | 'in-progress' | 'completed';
  owner?: string;
  deliverables?: string[];        // legacy: free-text deliverable labels (v0.1.0)
  deliverableCodes?: string[];    // Phase 7 L5: references FullLifecycleDeliverable.code
  description?: string;
}

export interface ProductDocument {
  id: string;
  title: string;
  category: 'PRD需求' | '架构设计' | 'API规范' | '用户调研' | '发版规划';
  version: string;
  author: string;
  updatedAt: string;
  wordCount: string;
  summary: string;
  content: string;
}

export interface ProductSkill {
  id: string;
  name: string;
  code: string;
  category: '需求分析' | '代码审查' | '质量测试' | '用户运营' | '竞品监控';
  description: string;
  triggerType: '自动触发' | '按需调用' | '定时巡检';
  invocations: number;
  successRate: string;
  avgRuntime: string;
  lastInvoked: string;
  status: 'active' | 'idle' | 'running';
  config: {
    model: string;
    temperature: number;
    autoSyncWorkspace: boolean;
  };
  sampleResult?: {
    title: string;
    time: string;
    summary: string;
    details: string[];
  };
}

export interface ProductFeature {
  name: string;
  module: string;
  status: '已上线' | '开发中' | '规划中';
  priority: 'P0' | 'P1' | 'P2';
  desc: string;
}

export interface ProductTeamMember {
  name: string;
  role: string;
  avatar: string;
  color?: string;
}

export interface ProductRisk {
  id: string;
  level: 'high' | 'medium' | 'low';
  title: string;
  impact: string;
  mitigation: string;
  status: 'open' | 'resolved';
}

export interface ProductMetrics {
  dau: string;
  dauGrowth: string;
  mau: string;
  mauGrowth: string;
  retention7d: string;
  retentionTrend: string;
  featureAdoption: string;
  conversionRate: string;
  avgLatency: string;
  csatScore: string;
  trafficTrend: Array<{ date: string; dau: number; mau: number; apiCalls: number }>;
  featureUsageFunnel: Array<{ stage: string; users: number; conversion: string; dropRate: string }>;
  retentionCohort: Array<{ period: string; day1: number; day3: number; day7: number; day14: number; day30: number }>;
  aiPerformance: Array<{ metric: string; score: number; target: number; status: string }>;
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: 'AI 协同 / SaaS' | '移动端应用' | '品牌数字资产' | '数据中台' | '智能硬件';
  stage: '规划中' | '研发中' | '公测灰度' | '商业化运营' | '已发布';
  status: '进行中' | '按期推进' | '注意风险' | '已上线' | '已延期';
  progress: number;
  health: 'healthy' | 'warning' | 'critical';
  owner: string;
  team: ProductTeamMember[];
  deadline?: string;
  version: string;
  releaseDate?: string;
  positioning: string;
  targetAudience: string[];
  coreValues: Array<{ title: string; desc: string; icon: string }>;
  techStack: string[];
  featureMatrix: ProductFeature[];
  documents: ProductDocument[];
  associatedSkills: ProductSkill[];
  milestones: ProductMilestone[];
  risksAndBlockers: ProductRisk[];
  metrics: ProductMetrics;
}

export const INITIAL_PRODUCTS_DATA: Product[] = [
  {
    id: 'p1',
    name: 'WenXiBuddy AI 智能协同平台',
    tagline: '大模型驱动的新一代企业级多Agent团队协同工作站',
    description: '集成多智能体协同、智能任务流转、本地工作区索引与知识库沉淀的综合性产品研发效能平台。',
    category: 'AI 协同 / SaaS',
    stage: '商业化运营',
    status: '按期推进',
    progress: 88,
    health: 'healthy',
    owner: 'Brandon (产品负责人)',
    version: 'v3.2.0-rc1',
    releaseDate: '2025-06-30',
    deadline: '2025-06-30',
    team: [
      { name: 'Brandon', role: 'Lead PM', avatar: 'BR', color: 'bg-indigo-600' },
      { name: 'Alex', role: 'Tech Lead', avatar: 'AL', color: 'bg-blue-600' },
      { name: 'Chloe', role: 'UI/UX', avatar: 'CH', color: 'bg-rose-500' },
      { name: 'David', role: 'AI Algorithm', avatar: 'DA', color: 'bg-emerald-600' },
    ],
    positioning: '专为高复杂度产研团队打造的 AI 原生级协同中枢，打破需求评审、开发走查、任务看板与知识沉淀的割裂状态。',
    targetAudience: [
      '互联网/高科技企业产研团队 (PM、Tech Lead、研发、QA)',
      '需要管理复杂项目多任务矩阵的技术项目管理专家 (TPM)',
      '寻求通过 Agent 自动化提升效能的创新型数字化团队'
    ],
    coreValues: [
      { title: '自然语言即任务', desc: '在对话框输入一句自然语言指令，自动生成多维度拆解任务并调度关联日程。', icon: 'Bot' },
      { title: '全生命周期文档追踪', desc: '从 PRD 评审到 OpenAPI 规范及架构图谱，无缝关联研发代码分支与本地目录。', icon: 'FileText' },
      { title: 'Skill 自动化赋能', desc: '一键挂载需求自检、用例自动生成与合规审查等大模型 Agent 技能。', icon: 'Zap' },
      { title: '精准数据指标度量', desc: '实时监控 DAU、转化漏斗、API 响应延时与效能燃尽度，驱动数据化决策。', icon: 'LineChart' }
    ],
    techStack: ['React 19', 'TypeScript', 'Tailwind CSS', 'Vite', 'Express', 'DeepSeek-V3 / Gemini 2.5', 'Recharts'],
    featureMatrix: [
      { name: '多 Agent 智能工作区', module: 'AI Core', status: '已上线', priority: 'P0', desc: '支持多工作区挂载、自然语言意图识别与任务自动化创建。' },
      { name: '全生命周期产品管理', module: 'Product Hub', status: '已上线', priority: 'P0', desc: '覆盖产品简介、PRD 文档库、数据分析指标与关联 Skill 矩阵。' },
      { name: '任务管理看板 (Kanban)', module: 'Task System', status: '已上线', priority: 'P0', desc: '支持多项目分类、优先级筛选、截止时间预警与拖拽流转。' },
      { name: '本地工作区与文件索引', module: 'File System', status: '已上线', priority: 'P1', desc: '一键建立本地文件夹索引、语义搜索与智能文档总结。' },
      { name: 'AI 自动生成测试用例', module: 'QA Agent', status: '开发中', priority: 'P1', desc: '根据 PRD 文档自动生成高覆盖率的单元与集成测试用例。' },
      { name: '跨团队日程智能协同', module: 'Schedule', status: '规划中', priority: 'P2', desc: '基于成员日历空闲度自动推荐最佳跨时区会议时间。' }
    ],
    documents: [
      {
        id: 'doc-1',
        title: 'PRD_WenXiBuddy_核心业务需求规格说明书_v3.2.docx',
        category: 'PRD需求',
        version: 'v3.2.0',
        author: 'Brandon (PM)',
        updatedAt: '2025-05-18 14:30',
        wordCount: '12,450 字',
        summary: '定义了 Q3 版本的核心业务流转、权限体系重构、智能工作区与多 Agent 协同触发协议。',
        content: `### 1. 项目背景与业务目标
WenXiBuddy 3.0 致力于解决研发团队在日常需求拆解、任务分发与文档沉淀之间的上下文断层。通过引入专属 Agent 工作区，实现“自然语言输入 -> 结构化任务 -> 关联日程预定 -> 本地工作区同步”的端到端自动化。

### 2. 核心功能规格说明
- **Agent 工作区交互**：支持自然语言多轮交互，支持快速挂载工具箱与特定执行 Agent。
- **任务自动化派发**：对话中识别包含“开会”、“需求沟通”、“测试验收”等语义时，自动生成标准化 Task 实体。
- **本地工作区联动**：支持指定本地磁盘路径进行文件树深度遍历，提取文档摘要并建立向量索引。

### 3. 非功能性需求
- 页面首屏渲染时间 < 0.8s
- Agent 响应首字延迟 (TTFT) < 600ms
- 数据持久化采用加密本地缓存与企业云端双重保障`
      },
      {
        id: 'doc-2',
        title: 'System_Architecture_Topology_and_DataFlow.pdf',
        category: '架构设计',
        version: 'v2.1',
        author: 'Alex (Tech Lead)',
        updatedAt: '2025-05-16 11:20',
        wordCount: '6,800 字',
        summary: '系统微服务拓扑结构、Agent 调度引擎架构、WebSocket 实时通信协议与高可用容灾方案。',
        content: `### 1. 系统总体架构设计
采用前后端同构轻量化全栈架构，前端基于 React 19 + TypeScript + TailwindCSS，后端采用 Express + 模块化代理路由。

\`\`\`text
[ Client (Browser) ] 
       │ HTTP / WS
       ▼
[ Node.js BFF Server ] ──► [ Local File Indexer Engine ]
       │                      ▲
       ▼                      │
[ AI Agent Gateway ] ─────────┘
  (DeepSeek / Gemini API)
\`\`\`

### 2. 核心调度与缓存机制
- **上下文感知**：通过 LocalIndexedEngine 实时监控工作区变更，增量更新语义缓存。
- **降级容错**：在网络不可用或 API 限流时，无缝切换至离线模板引擎。`
      },
      {
        id: 'doc-3',
        title: 'openapi_spec_v3.2_endpoints.json',
        category: 'API规范',
        version: 'v3.2',
        author: 'Alex (Tech Lead)',
        updatedAt: '2025-05-15 09:45',
        wordCount: '4,200 字',
        summary: '包含 RESTful API 全量接口规范、请求响应 Payload 格式与错误码对照表。',
        content: `### 核心 API 接口清单

#### 1. POST /api/agent/dispatch
- **描述**：调度 Agent 执行复合指令
- **请求体**：
  \`\`\`json
  {
    "query": "明天上午开会沟通需求",
    "agentId": "nova-core",
    "workspaceId": "ws-1"
  }
  \`\`\`
- **响应体**：
  \`\`\`json
  {
    "status": "success",
    "actions": [
      { "type": "CREATE_TASK", "payload": { "title": "沟通需求", "priority": "high" } },
      { "type": "CREATE_EVENT", "payload": { "title": "沟通需求会议", "date": 16 } }
    ]
  }
  \`\`\`

#### 2. GET /api/products/:id/metrics
- **描述**：拉取指定产品的全量运营与性能度量指标。`
      },
      {
        id: 'doc-4',
        title: 'User_Research_and_Pain_Points_Report.pdf',
        category: '用户调研',
        version: 'v1.4',
        author: 'Chloe (UI/UX)',
        updatedAt: '2025-05-10 16:00',
        wordCount: '8,900 字',
        summary: '覆盖 32 家中大型产研团队的深度访谈结果，总结了 PM 在多工具切换中的 5 大核心痛点。',
        content: `### 核心调研发现与痛点归纳
1. **工具孤岛现象严重**：平均每位 PM 每天在聊天工具、Jira 看板、语雀/Confluence 文档、Excel 之间切换超过 28 次。
2. **需求变更传达滞后**：72% 的研发反馈无法在第一时间内获知 PRD 的局部修订点。
3. **沉淀资产检索困难**：历史产品架构图与接口文档分散在个人电脑各文件夹，新成员熟悉成本高达 2 周以上。`
      }
    ],
    associatedSkills: [
      {
        id: 'sk-1',
        name: 'PRD 智能扩写与规范校验 Agent',
        code: 'skill-prd-synthesizer',
        category: '需求分析',
        description: '自动对齐大厂 PRD 标准模板，智能检测逻辑漏洞、边界异常分支与未闭环流程。',
        triggerType: '按需调用',
        invocations: 1420,
        successRate: '99.4%',
        avgRuntime: '1.2s',
        lastInvoked: '10 分钟前',
        status: 'active',
        config: { model: 'DeepSeek-V3', temperature: 0.3, autoSyncWorkspace: true },
        sampleResult: {
          title: 'PRD 逻辑完整度自检报告',
          time: '2025-05-18 14:35',
          summary: '已通过全部 24 项完整性规则校验，发现 2 处潜在边界分支建议补充。',
          details: [
            '【边界条件】网络断开重连时的局部 Draft 自动保存机制已建议补齐流程图',
            '【权限体系】未登录态访客点击“加入工作区”时的跳转策略已规范化',
            '【效能评估】预计可减少开发阶段需求澄清会议耗时 35%'
          ]
        }
      },
      {
        id: 'sk-2',
        name: '自动化测试用例生成器',
        code: 'skill-qa-generator',
        category: '质量测试',
        description: '解析 PRD 业务逻辑与 OpenAPI 结构，一键生成覆盖 Happy Path 与异常分支的测试用例。',
        triggerType: '按需调用',
        invocations: 856,
        successRate: '98.8%',
        avgRuntime: '2.4s',
        lastInvoked: '2 小时前',
        status: 'active',
        config: { model: 'Gemini 2.5 Pro', temperature: 0.2, autoSyncWorkspace: true },
        sampleResult: {
          title: 'Sprint 12 用例自动生成',
          time: '2025-05-18 12:10',
          summary: '自动生成 48 个功能用例与 12 个性能压测场景，覆盖率达 94.2%。',
          details: [
            '用例集已按模块划分为：工作区鉴权、Task 状态机流转、文档向量提取',
            '支持一键导出为 Excel / XMind 思维导图格式'
          ]
        }
      },
      {
        id: 'sk-3',
        name: '代码架构合规走查助手',
        code: 'skill-arch-linter',
        category: '代码审查',
        description: '扫描代码仓库与架构设计文档的一致性，阻断高危 API 调用与循环依赖。',
        triggerType: '定时巡检',
        invocations: 2190,
        successRate: '99.9%',
        avgRuntime: '0.8s',
        lastInvoked: '今天 04:00',
        status: 'idle',
        config: { model: 'DeepSeek-Coder', temperature: 0.1, autoSyncWorkspace: false }
      },
      {
        id: 'sk-4',
        name: '全网竞品雷达与功能情报 Agent',
        code: 'skill-market-radar',
        category: '竞品监控',
        description: '每周自动监测海外与国内同类协同产品的最新版本日志、新上线功能与定价策略。',
        triggerType: '定时巡检',
        invocations: 340,
        successRate: '97.5%',
        avgRuntime: '4.5s',
        lastInvoked: '昨天 18:00',
        status: 'active',
        config: { model: 'Gemini 2.5 Flash', temperature: 0.4, autoSyncWorkspace: true }
      }
    ],
    milestones: [
      { id: 'm1', title: 'Q3 需求冻结与架构评审', date: '2025-05-01', stage: '需求阶段', status: 'completed', owner: 'Brandon', deliverables: ['PRD v3.0', '架构拓扑说明书'], description: '完成全量业务需求评审，确认技术选型与里程碑节点。' },
      { id: 'm2', title: 'UI/UX 高保真交互系统', date: '2025-05-15', stage: '设计阶段', status: 'completed', owner: 'Chloe', deliverables: ['Design System 2.0', 'Figma 原型'], description: '交付全新暗色与亮色适配主题、响应式栅格系统与核心动效规范。' },
      { id: 'm3', title: '核心多 Agent 协同引擎研发', date: '2025-06-01', stage: '开发阶段', status: 'in-progress', owner: 'Alex', deliverables: ['Agent Engine v3.2', 'OpenAPI v3.2'], description: '完成自然语言意图分发、工作区文件索引与任务双向同步。' },
      { id: 'm4', title: '全链路集成测试与压力验收', date: '2025-06-15', stage: '验收阶段', status: 'pending', owner: 'David', deliverables: ['QA 验收报告', '安全审计清单'], description: '万级并发压力测试与全量用例回归测试。' },
      { id: 'm5', title: '正式商业化版本全球发布', date: '2025-06-30', stage: '发版阶段', status: 'pending', owner: 'Brandon', deliverables: ['Release Note', '产品白皮书'], description: '面向全量企业客户开放升级，上线商业化计费套件。' }
    ],
    risksAndBlockers: [
      { id: 'r1', level: 'medium', title: '大模型并发调用时的 Token 速率限流', impact: '可能导致高频并发下 Agent 响应延迟上升', mitigation: '已引入客户端本地流式限流队列与双模型自动故障转移 (Failover) 机制', status: 'resolved' },
      { id: 'r2', level: 'low', title: '超大本地代码工程（>10万文件）索引耗时', impact: '首次挂载超大工作区时 CPU 占用偏高', mitigation: '已优化为多线程 Worker 分片哈希遍历，并支持自定义 ignore 忽略规则', status: 'open' }
    ],
    metrics: {
      dau: '48.6k',
      dauGrowth: '+18.4%',
      mau: '192.8k',
      mauGrowth: '+24.6%',
      retention7d: '72.4%',
      retentionTrend: '+4.2%',
      featureAdoption: '86.5%',
      conversionRate: '14.8%',
      avgLatency: '240ms',
      csatScore: '4.85 / 5.0',
      trafficTrend: [
        { date: '周一', dau: 38200, mau: 175000, apiCalls: 124000 },
        { date: '周二', dau: 42100, mau: 178000, apiCalls: 142000 },
        { date: '周三', dau: 45600, mau: 182000, apiCalls: 156000 },
        { date: '周四', dau: 47800, mau: 186000, apiCalls: 168000 },
        { date: '周五', dau: 48600, mau: 192800, apiCalls: 182000 },
        { date: '周六', dau: 28400, mau: 192800, apiCalls: 89000 },
        { date: '周日', dau: 29800, mau: 192800, apiCalls: 94000 }
      ],
      featureUsageFunnel: [
        { stage: '工作区访问', users: 48600, conversion: '100%', dropRate: '0%' },
        { stage: 'Agent 意图输入', users: 42100, conversion: '86.6%', dropRate: '13.4%' },
        { stage: '任务/日程自动化生成', users: 37800, conversion: '77.8%', dropRate: '8.8%' },
        { stage: '关联工作区文件索引', users: 31200, conversion: '64.2%', dropRate: '13.6%' },
        { stage: '多成员深度协同', users: 26400, conversion: '54.3%', dropRate: '9.9%' }
      ],
      retentionCohort: [
        { period: '第 1 周', day1: 88, day3: 79, day7: 72, day14: 65, day30: 58 },
        { period: '第 2 周', day1: 90, day3: 81, day7: 74, day14: 68, day30: 60 },
        { period: '第 3 周', day1: 91, day3: 83, day7: 75, day14: 70, day30: 62 },
        { period: '第 4 周', day1: 93, day3: 85, day7: 78, day14: 72, day30: 65 }
      ],
      aiPerformance: [
        { metric: '意图识别准确率', score: 98.6, target: 95.0, status: '达标' },
        { metric: '任务生成采纳率', score: 92.4, target: 88.0, status: '达标' },
        { metric: 'Skill 执行成功率', score: 99.2, target: 99.0, status: '达标' },
        { metric: '端到端响应耗时', score: 94.0, target: 90.0, status: '优秀' }
      ]
    }
  },
  {
    id: 'p2',
    name: 'NovaAgent 移动端智能助手',
    tagline: '随身随时随地的自然语言掌上微决策与任务处理终端',
    description: '轻量化跨端 AI 助手 App，专注于语音输入快速转记、日程冲突实时提醒与移动端协同。',
    category: '移动端应用',
    stage: '公测灰度',
    status: '进行中',
    progress: 68,
    health: 'healthy',
    owner: 'Sarah (产品专家)',
    version: 'v1.4.0-beta',
    releaseDate: '2025-07-15',
    deadline: '2025-07-15',
    team: [
      { name: 'Sarah', role: 'Product Lead', avatar: 'SA', color: 'bg-emerald-600' },
      { name: 'Leo', role: 'iOS/Android Dev', avatar: 'LE', color: 'bg-blue-600' },
      { name: 'Emily', role: 'Interaction', avatar: 'EM', color: 'bg-amber-600' }
    ],
    positioning: '解决商务人士与产品经理在通勤、外出会议场景下无法操作 PC 端的快速指令录入与灵感沉淀。',
    targetAudience: [
      '高频出差、多会议场景的企业管理者与项目负责人',
      '移动办公需求强烈的自由职业者与咨询顾问'
    ],
    coreValues: [
      { title: '秒级语音速记', desc: '基于端侧降噪与流式识别，一句话自动转化为结构化 Action Item。', icon: 'Bot' },
      { title: '跨端实时双向同步', desc: '手机端录入的任务即时推送到桌面端工作区与共享日程表。', icon: 'Zap' },
      { title: '离线语音大模型支持', desc: '无网络状态下支持本地离线轻量化模型执行基础速记与闹钟设置。', icon: 'Layers' }
    ],
    techStack: ['React Native', 'Kotlin', 'Swift', 'WebSocket', 'Whisper Lite'],
    featureMatrix: [
      { name: '流式语音指令识别', module: 'Voice Core', status: '已上线', priority: 'P0', desc: '支持中英文混合自然语音识别并提取核心时间与任务实体。' },
      { name: '离线日程提醒', module: 'Schedule Sync', status: '开发中', priority: 'P0', desc: '与 iOS Reminders 和 Android Calendar 深度双向联动。' },
      { name: '灵感闪念语音备忘录', module: 'Memo', status: '已上线', priority: 'P1', desc: '自动为语音录音提取核心摘要、标签并存入知识库。' }
    ],
    documents: [
      {
        id: 'doc-p2-1',
        title: 'NovaAgent_Mobile_PRD_v1.4.docx',
        category: 'PRD需求',
        version: 'v1.4',
        author: 'Sarah',
        updatedAt: '2025-05-14 10:20',
        wordCount: '9,200 字',
        summary: '移动端手势交互、语音唤醒与离线数据缓存规范。',
        content: `### 移动端核心交互设计原则
1. **单手可达性**：所有关键操作均位于屏幕下方 45% 的拇指热区范围内。
2. **极速唤醒**：锁屏小组件一键点击直接启动录音，长按 0.3s 开始语音输入。`
      }
    ],
    associatedSkills: [
      {
        id: 'sk-p2-1',
        name: '语音实体提取与语义归纳 Skill',
        code: 'skill-voice-extractor',
        category: '需求分析',
        description: '从杂乱无章的语音听写文本中精准提取出行动主体、截止时间与紧急程度。',
        triggerType: '自动触发',
        invocations: 5240,
        successRate: '98.5%',
        avgRuntime: '0.6s',
        lastInvoked: '15 分钟前',
        status: 'active',
        config: { model: 'Gemini 2.5 Flash', temperature: 0.1, autoSyncWorkspace: true }
      }
    ],
    milestones: [
      { id: 'm-p2-1', title: 'iOS/Android 双端架构搭建', date: '2025-04-10', stage: '研发阶段', status: 'completed', owner: 'Leo', deliverables: ['双端基础框架包'] },
      { id: 'm-p2-2', title: '万人封闭测试 (TestFlight)', date: '2025-05-20', stage: '公测阶段', status: 'in-progress', owner: 'Sarah', deliverables: ['灰度用户反馈问卷'] },
      { id: 'm-p2-3', title: 'App Store / 应用市场上架', date: '2025-07-15', stage: '发布阶段', status: 'pending', owner: 'Sarah', deliverables: ['上架合规审核材料'] }
    ],
    risksAndBlockers: [
      { id: 'r-p2-1', level: 'medium', title: '不同品牌 Android 机型后台常驻保活限制', impact: '可能影响部分定时提醒到达率', mitigation: '接入主流手机厂商系统级推送 (APNs / FCM / 华为推送)', status: 'open' }
    ],
    metrics: {
      dau: '12.4k',
      dauGrowth: '+32.1%',
      mau: '54.2k',
      mauGrowth: '+41.5%',
      retention7d: '64.8%',
      retentionTrend: '+6.1%',
      featureAdoption: '78.2%',
      conversionRate: '9.4%',
      avgLatency: '180ms',
      csatScore: '4.72 / 5.0',
      trafficTrend: [
        { date: '周一', dau: 9800, mau: 48000, apiCalls: 45000 },
        { date: '周二', dau: 10600, mau: 49500, apiCalls: 52000 },
        { date: '周三', dau: 11400, mau: 51200, apiCalls: 58000 },
        { date: '周四', dau: 11900, mau: 52800, apiCalls: 62000 },
        { date: '周五', dau: 12400, mau: 54200, apiCalls: 68000 },
        { date: '周六', dau: 8900, mau: 54200, apiCalls: 39000 },
        { date: '周日', dau: 9100, mau: 54200, apiCalls: 41000 }
      ],
      featureUsageFunnel: [
        { stage: 'App 启动', users: 12400, conversion: '100%', dropRate: '0%' },
        { stage: '语音录入唤起', users: 10200, conversion: '82.2%', dropRate: '17.8%' },
        { stage: '指令识别确认', users: 9400, conversion: '75.8%', dropRate: '6.4%' },
        { stage: '多端协同同步', users: 7800, conversion: '62.9%', dropRate: '12.9%' }
      ],
      retentionCohort: [
        { period: '第 1 周', day1: 82, day3: 71, day7: 64, day14: 56, day30: 48 },
        { period: '第 2 周', day1: 84, day3: 74, day7: 66, day14: 59, day30: 51 }
      ],
      aiPerformance: [
        { metric: '语音转写 WER 准确度', score: 97.4, target: 96.0, status: '达标' },
        { metric: '行动项实体提取命中率', score: 94.8, target: 92.0, status: '达标' }
      ]
    }
  },
  {
    id: 'p3',
    name: 'DataSense 商业智能中台',
    tagline: '一站式数据指标定义、自助可视化建模与智能预警平台',
    description: '打通多源异构数据库，支持自然语言 SQL 查询、自动异常指标归因与大盘实时看板。',
    category: '数据中台',
    stage: '研发中',
    status: '注意风险',
    progress: 42,
    health: 'warning',
    owner: 'David (数据技术总监)',
    version: 'v0.9.0-alpha',
    releaseDate: '2025-09-30',
    deadline: '2025-09-30',
    team: [
      { name: 'David', role: 'Data Architect', avatar: 'DA', color: 'bg-indigo-600' },
      { name: 'Victor', role: 'Backend Dev', avatar: 'VI', color: 'bg-slate-700' },
      { name: 'Grace', role: 'BI Analyst', avatar: 'GR', color: 'bg-emerald-600' }
    ],
    positioning: '让业务人员和产品经理无需编写复杂 SQL，用自然语言即可秒级生成多维度交叉报表。',
    targetAudience: ['业务运营人员', '数据分析师', '产品决策层'],
    coreValues: [
      { title: 'ChatBI 智能问数', desc: '“上个月华东区转化率排名前三的渠道”直接生成动态对比折线图。', icon: 'Bot' },
      { title: '多源异构融合', desc: '毫秒级同步 PostgreSQL、MySQL、ClickHouse 与 Elasticsearch。', icon: 'Layers' },
      { title: '自动异常归因', desc: '指标波动超过阈值时，自动定位根因下钻维度并推送飞书/钉钉预警。', icon: 'LineChart' }
    ],
    techStack: ['ClickHouse', 'PostgreSQL', 'DuckDB', 'Python FastAPI', 'ECharts'],
    featureMatrix: [
      { name: 'Chat2SQL 意图解析引擎', module: 'BI Core', status: '开发中', priority: 'P0', desc: '将自然语言问题转化为高度优化的 SQL 查询语句。' },
      { name: '可视化看板拖拽设计器', module: 'Dashboard Designer', status: '开发中', priority: 'P0', desc: '支持 30+ 种图表类型的低代码布局与联动筛选。' },
      { name: '数据血缘追踪', module: 'Data Lineage', status: '规划中', priority: 'P1', desc: '端到端追踪指标计算链路与上游表变更影响面。' }
    ],
    documents: [
      {
        id: 'doc-p3-1',
        title: 'DataSense_Architecture_and_Semantic_Layer.pdf',
        category: '架构设计',
        version: 'v0.9',
        author: 'David',
        updatedAt: '2025-05-11 14:00',
        wordCount: '8,400 字',
        summary: '统一指标语义层定义、SQL 方言转译与缓存加速方案。',
        content: `### 语义层架构定义
通过定义统一的 YAML 指标模型，避免各业务部门对“活跃用户”等核心指标口径不一致的问题。`
      }
    ],
    associatedSkills: [
      {
        id: 'sk-p3-1',
        name: 'Chat2SQL 智能方言转换器',
        code: 'skill-sql-translator',
        category: '需求分析',
        description: '将复杂的业务统计语言转换为高性能执行 SQL，内置索引推荐与慢查询拦截。',
        triggerType: '按需调用',
        invocations: 420,
        successRate: '94.2%',
        avgRuntime: '1.8s',
        lastInvoked: '1 天前',
        status: 'active',
        config: { model: 'DeepSeek-V3', temperature: 0.1, autoSyncWorkspace: false }
      }
    ],
    milestones: [
      { id: 'm-p3-1', title: '核心数据引擎与连接器接入', date: '2025-05-01', stage: '底层搭建', status: 'completed', owner: 'Victor', deliverables: ['ClickHouse 桥接中间件'] },
      { id: 'm-p3-2', title: 'Chat2SQL 语义模型准确率调优', date: '2025-06-30', stage: '算法优化', status: 'in-progress', owner: 'David', deliverables: ['准确率评测集达 92%'] },
      { id: 'm-p3-3', title: '全功能内测发版', date: '2025-09-30', stage: '内测发布', status: 'pending', owner: 'David', deliverables: ['内测安装镜像包'] }
    ],
    risksAndBlockers: [
      { id: 'r-p3-1', level: 'high', title: '复杂多表 JOIN 场景下 SQL 生成准确度有待提升', impact: '业务大表查询可能产生笛卡尔积或性能瓶颈', mitigation: '正在引入 Few-shot 行业语义库与慢查询沙箱预执行校验机制', status: 'open' }
    ],
    metrics: {
      dau: '2.8k',
      dauGrowth: '+8.2%',
      mau: '9.4k',
      mauGrowth: '+12.0%',
      retention7d: '58.0%',
      retentionTrend: '+1.5%',
      featureAdoption: '62.0%',
      conversionRate: '6.2%',
      avgLatency: '680ms',
      csatScore: '4.35 / 5.0',
      trafficTrend: [
        { date: '周一', dau: 2400, mau: 8900, apiCalls: 12000 },
        { date: '周二', dau: 2600, mau: 9100, apiCalls: 14500 },
        { date: '周三', dau: 2800, mau: 9400, apiCalls: 16800 },
        { date: '周四', dau: 2750, mau: 9400, apiCalls: 15400 },
        { date: '周五', dau: 2800, mau: 9400, apiCalls: 16200 },
        { date: '周六', dau: 1200, mau: 9400, apiCalls: 5400 },
        { date: '周日', dau: 1300, mau: 9400, apiCalls: 6200 }
      ],
      featureUsageFunnel: [
        { stage: '查询发起', users: 2800, conversion: '100%', dropRate: '0%' },
        { stage: 'SQL 自动生成', users: 2480, conversion: '88.5%', dropRate: '11.5%' },
        { stage: '图表可视化渲染', users: 2150, conversion: '76.7%', dropRate: '11.8%' },
        { stage: '报表导出/共享', users: 1240, conversion: '44.2%', dropRate: '32.5%' }
      ],
      retentionCohort: [
        { period: '第 1 周', day1: 75, day3: 62, day7: 58, day14: 48, day30: 40 }
      ],
      aiPerformance: [
        { metric: 'Text-to-SQL 准确率', score: 91.2, target: 95.0, status: '需优化' },
        { metric: '平均查询返回耗时', score: 88.0, target: 90.0, status: '达标' }
      ]
    }
  },
  {
    id: 'p4',
    name: 'BrandPortal 品牌交互官网与视觉中心',
    tagline: '全新品牌视觉形象升级与数字化资产沉淀门户',
    description: '面向全球客户的高保真响应式品牌官网，集成了在线 Demo 试用、产品白皮书下载与客户案例中心。',
    category: '品牌数字资产',
    stage: '已发布',
    status: '已上线',
    progress: 100,
    health: 'healthy',
    owner: 'Chloe (品牌设计主管)',
    version: 'v2.0.0',
    releaseDate: '2025-04-01',
    deadline: '2025-04-01',
    team: [
      { name: 'Chloe', role: 'Brand Director', avatar: 'CH', color: 'bg-rose-500' },
      { name: 'Leo', role: 'Frontend Engineer', avatar: 'LE', color: 'bg-blue-600' }
    ],
    positioning: '展示 WenXiBuddy 国际化品牌调性与产品矩阵，承接全球流量转化。',
    targetAudience: ['潜在企业客户采购决策者', '投资人', '开发者生态伙伴'],
    coreValues: [
      { title: '卓越视觉体验', desc: '采用 60fps 硬件加速动效与极简排印体系。', icon: 'Zap' },
      { title: '极速全球访问', desc: '基于 Edge CDN 边缘节点分发，全球首屏加载低于 0.5s。', icon: 'Layers' },
      { title: '无缝销售线索转化', desc: '内置智能客服机器人与一键预约专家 Demo 系统。', icon: 'Bot' }
    ],
    techStack: ['Next.js', 'Tailwind CSS', 'Framer Motion', 'Cloudflare Edge'],
    featureMatrix: [
      { name: '3D 交互首屏 Hero', module: 'Brand Experience', status: '已上线', priority: 'P0', desc: '根据鼠标光标动态渲染粒子光影效果。' },
      { name: '客户案例与白皮书库', module: 'Resource Center', status: '已上线', priority: 'P0', desc: '分类检索标杆案例与行业解决方案 PDF。' },
      { name: '在线预约咨询系统', module: 'Lead Gen', status: '已上线', priority: 'P0', desc: '智能匹配专属行业客户经理日历。' }
    ],
    documents: [
      {
        id: 'doc-p4-1',
        title: 'Brand_Design_System_Guidelines_v2.0.pdf',
        category: '架构设计',
        version: 'v2.0',
        author: 'Chloe',
        updatedAt: '2025-04-01 10:00',
        wordCount: '5,600 字',
        summary: '品牌主色色相梯度、多语言字阶排版与响应式断点栅格规范。',
        content: `### 品牌色彩规范
- Primary Blue: #2563EB (主品牌色，代表严谨与科技)
- Accent Indigo: #4F46E5 (强调辅助色)
- Neutral Canvas: #F4F7FC (明亮开阔的背景底色)`
      }
    ],
    associatedSkills: [
      {
        id: 'sk-p4-1',
        name: '官网访客意图识别与线索评分 Agent',
        code: 'skill-lead-scoring',
        category: '用户运营',
        description: '根据访客浏览路径与停留深度，自动评估采购意向等级并通知销售团队。',
        triggerType: '自动触发',
        invocations: 3890,
        successRate: '99.6%',
        avgRuntime: '0.4s',
        lastInvoked: '5 分钟前',
        status: 'active',
        config: { model: 'Gemini 2.5 Flash', temperature: 0.2, autoSyncWorkspace: false }
      }
    ],
    milestones: [
      { id: 'm-p4-1', title: '视觉概念提案与设计定稿', date: '2025-02-15', stage: '设计阶段', status: 'completed', owner: 'Chloe', deliverables: ['Figma 设计稿'] },
      { id: 'm-p4-2', title: '前端重构与性能调优', date: '2025-03-20', stage: '开发阶段', status: 'completed', owner: 'Leo', deliverables: ['Lighthouse 满分优化'] },
      { id: 'm-p4-3', title: '全球正式上线发布', date: '2025-04-01', stage: '发布阶段', status: 'completed', owner: 'Chloe', deliverables: ['全网解析生效'] }
    ],
    risksAndBlockers: [],
    metrics: {
      dau: '36.2k',
      dauGrowth: '+22.8%',
      mau: '142.0k',
      mauGrowth: '+18.5%',
      retention7d: '52.0%',
      retentionTrend: '+3.4%',
      featureAdoption: '92.0%',
      conversionRate: '18.4%',
      avgLatency: '120ms',
      csatScore: '4.92 / 5.0',
      trafficTrend: [
        { date: '周一', dau: 32000, mau: 135000, apiCalls: 85000 },
        { date: '周二', dau: 34500, mau: 138000, apiCalls: 92000 },
        { date: '周三', dau: 35800, mau: 140000, apiCalls: 96000 },
        { date: '周四', dau: 36200, mau: 142000, apiCalls: 98000 },
        { date: '周五', dau: 35000, mau: 142000, apiCalls: 94000 },
        { date: '周六', dau: 24000, mau: 142000, apiCalls: 62000 },
        { date: '周日', dau: 26000, mau: 142000, apiCalls: 68000 }
      ],
      featureUsageFunnel: [
        { stage: '官网首页曝光', users: 36200, conversion: '100%', dropRate: '0%' },
        { stage: '产品能力页浏览', users: 24800, conversion: '68.5%', dropRate: '31.5%' },
        { stage: '在线 Demo 试用', users: 16500, conversion: '45.6%', dropRate: '22.9%' },
        { stage: '提交线索/预约咨询', users: 6650, conversion: '18.4%', dropRate: '27.2%' }
      ],
      retentionCohort: [
        { period: '第 1 周', day1: 72, day3: 58, day7: 52, day14: 44, day30: 38 }
      ],
      aiPerformance: [
        { metric: '线索评分准确度', score: 96.8, target: 92.0, status: '达标' }
      ]
    }
  }
];
