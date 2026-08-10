# 产品-研发联动调研报告

**日期**: 2026-08-10
**调研范围**: ProductManagementView ↔ RndCenterView 数据流与联动模式
**结论**: 推荐 **弱关联 + 已有隐式索引增强** 模式。rndStore 已按 productId 索引所有交付物数据，天然具备产品关联基础。v0.2.0 应在现有 `syncDeliverableToDocs` 单向联动基础上，补充里程碑↔交付物状态映射和产品变更级联刷新，其余联动推迟到 v0.3+。

---

## 1. 产品模块数据流

### 1.1 Product 类型结构

```typescript
// src/data/mockProducts.ts
interface Product {
  id: string;                      // 'p1', 'p2', ...
  name: string;                    // 产品全称
  tagline: string;                 // 一句话定位
  description: string;             // 详细描述
  category: 'AI 协同 / SaaS' | '移动端应用' | '品牌数字资产' | '数据中台' | '智能硬件';
  stage: '规划中' | '研发中' | '公测灰度' | '商业化运营' | '已发布';
  status: '进行中' | '按期推进' | '注意风险' | '已上线' | '已延期';
  progress: number;                // 0-100
  health: 'healthy' | 'warning' | 'critical';
  owner: string;                   // 'Brandon (产品负责人)'
  team: ProductTeamMember[];       // [{name, role, avatar, color?}]
  deadline?: string;               // '2025-06-30'
  version: string;                 // 'v3.2.0-rc1'
  releaseDate?: string;
  positioning: string;             // 产品定位详述
  targetAudience: string[];        // 目标用户画像列表
  coreValues: Array<{title, desc, icon}>;  // 核心价值主张
  techStack: string[];             // 技术栈列表
  featureMatrix: ProductFeature[]; // 功能特性矩阵
  documents: ProductDocument[];    // 产品文档列表
  associatedSkills: ProductSkill[];// 关联 Skill 列表
  milestones: ProductMilestone[];  // 里程碑列表
  risksAndBlockers: ProductRisk[]; // 风险与阻塞
  metrics: ProductMetrics;         // 运营指标数据
}

interface ProductMilestone {
  id?: string;
  title: string;
  date: string;
  stage?: string;           // '需求阶段' | '设计阶段' | '开发阶段' | '验收阶段' | '发版阶段'
  status: 'pending' | 'in-progress' | 'completed';
  owner?: string;
  deliverables?: string[];  // ⚠️ 当前是自由字符串, 如 ['PRD v3.0', '架构拓扑说明书']
  description?: string;
}

interface ProductDocument {
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
```

### 1.2 productStore actions 清单

| Action | 签名 | 说明 |
|--------|------|------|
| `addProduct` | `(product: Product) => void` | 新增产品, 去重 |
| `updateProduct` | `(id: string, updates: Partial<Product>) => void` | 局部更新产品字段 |
| `deleteProduct` | `(id: string) => void` | 删除产品(无级联!) |
| `setProducts` | `(products: Product[]) => void` | 全量替换 |
| `addProductDocument` | `(productId: string, doc: ProductDocument) => void` | 添加文档 |
| `toggleSkillStatus` | `(productId: string, skillId: string) => void` | 切换 Skill active/idle |
| `runProductSkill` | `(productId: string, skillId: string) => Promise<{success, timestamp}>` | 模拟执行 Skill |
| `addProductMilestone` | `(productId: string, milestone: ProductMilestone) => void` | 添加里程碑 |
| `updateMilestoneStatus` | `(productId, milestoneId, status) => void` | 更新里程碑状态 |

**持久化**: SQLite storage, key `nova-product`, partialize 只存 `products`。

### 1.3 子组件字段消费矩阵

| 组件 | 消费的 Product 字段 | 额外 store 调用 |
|------|---------------------|-----------------|
| **ProductOverviewTab** | `name`, `positioning`, `techStack`, `targetAudience`, `team`, `coreValues`, `featureMatrix`, `id` | `onNavigateToRnd` |
| **ProductGovernanceTab** | `id`, `name`, `stage`, `status`, `health`, `progress`, `deadline` | `getDeliverablesForProduct`, `updateProduct` |
| **ProductDocsTab** | `id`, `name`, `documents[]` (title, category, version, author, updatedAt, wordCount, summary, content) | — |
| **ProductAnalyticsTab** | `metrics` (全部子字段: dau, mau, retention, traffic, funnel, cohort, aiPerformance) | — |
| **ProductSkillsTab** | `id`, `name`, `associatedSkills[]` (全字段), `id` | `toggleSkillStatus`, `runProductSkill` |
| **ProductMilestonesTab** | `id`, `name`, `milestones[]` (全字段), `risksAndBlockers[]`, `progress`, `status`, `deadline`, `owner` | `updateMilestoneStatus`, `getProjectTaskCount` |
| **CreateProductModal** | 构造新 Product 对象 | `addProduct` |
| **AddDocumentModal** | `id` | `addProductDocument` |
| **AddSkillModal** | `id` | (add to associatedSkills) |

### 1.4 数据流向图

```
productStore (SQLite persist)
    │
    ├── products: Product[]
    │      │
    │      ├──→ ProductManagementView (列表/详情切换)
    │      │      │
    │      │      ├──→ ProductOverviewTab (画像/愿景/功能矩阵)
    │      │      ├──→ ProductGovernanceTab (阶段管控/健康度)  ←→ getDeliverablesForProduct
    │      │      ├──→ ProductDocsTab (文档中心)
    │      │      ├──→ ProductAnalyticsTab (数据指标)
    │      │      ├──→ ProductSkillsTab (Skill 矩阵)
    │      │      └──→ ProductMilestonesTab (里程碑/风险)  ←→ taskStore.getProjectTaskCount
    │      │
    │      └──→ RndCenterView (产品选择器)
    │             │
    │             ├──→ FullDeliverablesTab (18 交付物)
    │             ├──→ AIRequirementsTab (PRD)
    │             ├──→ UIPrototypeTab (原型)
    │             ├──→ CodeManagementTab (代码脚手架)
    │             ├──→ TestManagementTab (测试用例)
    │             ├──→ CompetitorAnalysisTab (竞品分析)
    │             └──→ ProductKnowledgeTab (知识库)
    │
    └── actions: add/update/delete/doc/skill/milestone
```

**关键发现**: ProductManagementView 已经通过 `getDeliverablesForProduct` 读取 rndStore 数据展示 readyCount (产品卡片上的"已就绪 X/18 份 AI 交付物")。这是 **唯一的从产品模块到研发模块的只读联动**。

---

## 2. 研发中心数据流

### 2.1 FullLifecycleDeliverable 类型结构

```typescript
// src/data/mockRndData.ts
interface FullLifecycleDeliverable {
  id: string;           // 'del-p1-DEL-REQ-01'
  productId: string;    // ⚠️ 已有产品ID! 这是天然关联
  phase: 'requirement' | 'design' | 'dev' | 'test' | 'release';
  phaseName: string;
  code: string;         // 'DEL-REQ-01' ... 'DEL-REL-04'
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
}
```

### 2.2 18 项交付物 CATALOG

| # | Code | Phase | Title |
|---|------|-------|-------|
| 1 | DEL-REQ-01 | requirement | 标准产品需求规格说明书 (PRD v1.0) |
| 2 | DEL-REQ-02 | requirement | 用户故事地图与 Gherkin 验收标准 |
| 3 | DEL-REQ-03 | requirement | 业务流转时序图与泳道流向图 |
| 4 | DEL-REQ-04 | requirement | 需求追踪矩阵与版本覆盖度报告 |
| 5 | DEL-DES-01 | design | 高保真原型交互说明书与界面规范 |
| 6 | DEL-DES-02 | design | 统一设计系统规范 (Design Tokens) |
| 7 | DEL-DEV-01 | dev | 系统总体技术架构设计方案 |
| 8 | DEL-DEV-02 | dev | RESTful API 接口契约 (OpenAPI 3.0) |
| 9 | DEL-DEV-03 | dev | 数据库物理建模与 DDL 建表脚本 |
| 10 | DEL-TST-01 | test | 全量功能与边界测试用例集矩阵 |
| 11 | DEL-TST-02 | test | 端到端自动化测试脚本 (Playwright) |
| 12 | DEL-TST-03 | test | 阶段质量验收与发版准入评估报告 |
| 13 | DEL-REL-01 | release | 官方发版说明与更新日志 |
| 14 | DEL-REL-02 | release | 竞品深度对比与市场差异化报告 |
| 15 | DEL-REL-03 | release | 最终用户操作使用手册 |
| 16 | DEL-REL-04 | release | 产品商业化价值白皮书 |

> 注: CATALOG 实际有 16 项, 但 `buildInitialDeliverables` 的 `idx < 6` 逻辑使前 6 项初始化为 ready, 其余为 draft。视图显示"18 份"是 UI 文案, 实际数量取决于 CATALOG 长度。

### 2.3 rndStore 数据结构与 actions

```typescript
interface RndState {
  // 7 个按 productId 索引的数据集合
  requirements:   Record<string, ProductRequirementDesign>;
  prototypes:     Record<string, UIPrototypeScreen>;
  knowledgeBase:  Record<string, ProductKnowledgeItem[]>;
  codeScaffolds:  Record<string, CodeScaffoldItem[]>;
  testCases:      Record<string, TestCaseItem[]>;
  competitorData: Record<string, CompetitorAnalysisData>;
  deliverables:   Record<string, FullLifecycleDeliverable[]>;
}
```

**Actions 清单** (按领域分组):

| 领域 | Action | 说明 |
|------|--------|------|
| 需求 | `getRequirementForProduct(productId)` | 获取/懒初始化 PRD |
| 需求 | `updateRequirement(productId, updates)` | 更新 PRD |
| 需求 | `generateRequirementAI(productId, prompt, template?)` | AI 生成 PRD |
| 原型 | `getPrototypeForProduct(productId)` | 获取/懒初始化原型 |
| 原型 | `updatePrototype(productId, updates)` | 更新原型 |
| 原型 | `generatePrototypeAI(productId, prompt, device?, theme?)` | AI 生成原型 |
| 知识库 | `getKnowledgeForProduct(productId)` | 获取知识库列表 |
| 知识库 | `addKnowledgeItem / update / delete` | CRUD |
| 知识库 | `polishKnowledgeArticleAI(productId, itemId, action)` | AI 润色 |
| 代码 | `getCodeScaffoldsForProduct(productId)` | 获取脚手架 |
| 代码 | `addCodeScaffold(productId, item)` | 新增 |
| 代码 | `generateCodeScaffoldAI(productId, type, prompt?)` | AI 生成 |
| 测试 | `getTestCasesForProduct(productId)` | 获取用例 |
| 测试 | `addTestCase / update / delete` | CRUD |
| 测试 | `generateTestCasesAI(productId, prompt?)` | AI 生成 |
| 测试 | `runTestCase / runAllTestCases` | 执行测试 |
| 竞品 | `getCompetitorDataForProduct(productId)` | 获取竞品数据 |
| 竞品 | `updateCompetitorData(productId, updates)` | 更新 |
| 竞品 | `generateCompetitorAnalysisAI(productId, prompt?)` | AI 生成 |
| 交付物 | `getDeliverablesForProduct(productId)` | 获取/懒初始化 |
| 交付物 | `generateDeliverableAI(productId, code, prompt?)` | 单项生成 |
| 交付物 | `generateAllDeliverablesBatchAI(productId, onProgress?)` | 批量生成 |
| 交付物 | `syncDeliverableToDocs(productId, deliverableId)` | **🔗 同步到产品文档** |
| 初始化 | `initDeliverablesForProduct(product)` | 为新产品初始化 |

**持久化**: SQLite storage, key `nova-rnd`, 存全部 7 个集合。

### 2.4 rndStore 已有的跨 store 访问

```typescript
// rndStore.ts line 139-142
const getProd = (productId: string): Product | null => {
  const products = useProductStore.getState().products;
  return products.find((p) => p.id === productId) ?? null;
};
```

rndStore 的所有 `getXxxForProduct` 方法在数据缺失时会调用 `getProd(productId)` 获取产品信息来构造默认数据。**rndStore → productStore 的单向读取已经存在**。

同时 `syncDeliverableToDocs` 会调用 `useProductStore.getState().addProductDocument()` 将交付物内容写入产品文档库。**rndStore → productStore 的写入也已存在**。

### 2.5 rndStore 数据消费关系

```
RndCenterView
    │
    │  const currentProduct = products.find(p => p.id === selectedProductId)
    │  const deliverables = getDeliverablesForProduct(currentProduct.id)
    │
    ├── FullDeliverablesTab(product)
    │     消费: product.id, product.name
    │     调用: getDeliverablesForProduct, generateDeliverableAI,
    │           generateAllDeliverablesBatchAI, syncDeliverableToDocs
    │
    ├── AIRequirementsTab(product)
    │     消费: product.id, product.name, product.version, product.description,
    │           product.positioning, product.owner, product.featureMatrix
    │     调用: getRequirementForProduct, updateRequirement,
    │           generateRequirementAI, syncDeliverableToDocs, addTask
    │
    ├── UIPrototypeTab(product)
    │     消费: product.id, product.name, product.metrics.dau,
    │           product.health, product.featureMatrix
    │     调用: getPrototypeForProduct, updatePrototype, generatePrototypeAI
    │
    ├── CodeManagementTab(product)
    │     消费: product.id, product.name
    │     调用: getCodeScaffoldsForProduct, generateCodeScaffoldAI, addCodeScaffold
    │
    ├── TestManagementTab(product)
    │     消费: product.id, product.name
    │     调用: getTestCasesForProduct, generateTestCasesAI, runTestCase, etc.
    │
    ├── CompetitorAnalysisTab(product)
    │     消费: product.id, product.name
    │     调用: getCompetitorDataForProduct, updateCompetitorData,
    │           generateCompetitorAnalysisAI
    │
    └── ProductKnowledgeTab(product)
          消费: product.id
          调用: getKnowledgeForProduct, addKnowledgeItem, etc.
```

---

## 3. 天然联动点清单

### 3.1 已实现的联动

| # | 产品侧 | 研发侧 | 联动语义 | 方向 | 实现方式 |
|---|--------|--------|----------|------|----------|
| L0 | `Product.id` | `deliverables[productId]` | 产品→交付物按ID索引 | 隐式 | rndStore Record key |
| L1 | `Product.id` | `requirements[productId]` 等 7 个集合 | 产品→全部Rnd数据按ID索引 | 隐式 | rndStore Record key |
| L2 | `Product.documents` | `FullLifecycleDeliverable` | 交付物归档为文档 | R→P | `syncDeliverableToDocs()` |
| L3 | `Product.*` | 所有 rndStore getter | 产品属性驱动默认交付物生成 | P→R | `getProd()` + `buildInitialDeliverables()` |
| L4 | `Product (卡片)` | `readyCount/total` | 产品列表展示交付物就绪数 | R→P | `getDeliverablesForProduct()` in view |

### 3.2 待实现的联动点 (按优先级排序)

#### P0 - 高价值/高频 (v0.2.0 推荐实施)

| # | 产品侧字段 | 研发侧字段 | 联动语义 | 方向 | 说明 |
|---|-----------|-----------|----------|------|------|
| **L5** | `ProductMilestone.deliverables: string[]` | `FullLifecycleDeliverable.code/title` | 里程碑声明的交付物 ↔ 实际交付物状态 | 双向 | 当前 `deliverables` 是自由字符串。应改为 code 引用, 并在里程碑面板展示对应交付物的 ready/generating/draft 状态 |
| **L6** | `Product.stage` | `FullLifecycleDeliverable.phase` | 产品阶段 ↔ 交付物阶段的就绪进度 | P→R | 当产品推进 stage (规划→研发→公测→运营), 对应 phase 的交付物应有视觉提示 (如该阶段 4/4 就绪) |
| **L7** | `deleteProduct` | `rndStore[productId]` | 删除产品时清理研发数据 | P→R | 当前 `deleteProduct` 不级联, rndStore 残留孤儿数据。至少应清理 rndStore 中该 productId 的所有数据 |

#### P1 - 中等价值 (v0.2.0 可选 / v0.3 早期)

| # | 产品侧字段 | 研发侧字段 | 联动语义 | 方向 | 说明 |
|---|-----------|-----------|----------|------|------|
| **L8** | `Product.name/tagline/description` | `ProductRequirementDesign.title/businessGoal/coreSummary` | 产品信息变更 → PRD 自动更新? | P→R | rndStore 的 `getRequirementForProduct` 已在懒初始化时读取产品信息, 但已持久化的 PRD 不会自动同步。需要 "重新从产品同步" 操作 |
| **L9** | `Product.featureMatrix` | `RequirementUserStory[]` | 功能特性 → 用户故事映射 | P→R | `getRequirementForProduct` 已将 featureMatrix 转 userStories (懒初始化), 但已持久化后不同步 |
| **L10** | `ProductMilestone` | `TestCaseItem` | 里程碑验收 → 测试通过率 | R→P | ProductMilestonesTab 可展示该阶段关联测试用例的通过率 |
| **L11** | `Product.documents` | `ProductKnowledgeItem` | 产品文档 → 知识库条目 | 双向 | 文档中心与知识库内容重叠, 可建立引用关系 |

#### P2 - 低价值 / 低频 (v0.3+)

| # | 产品侧字段 | 研发侧字段 | 联动语义 | 方向 | 说明 |
|---|-----------|-----------|----------|------|------|
| **L12** | `Product.metrics` | `CompetitorAnalysisData.radarData` | 运营指标 → 竞品对比联动 | 展示层 | 在产品指标面板叠加竞品维度 |
| **L13** | `Product.associatedSkills` | `rndStore` AI 生成 | Skill 执行 → 研发数据生成 | P→R | Skill 的 sampleResult 可触发 PRD/测试用例生成 |
| **L14** | `Task.project` (string name) | `Product.name` | 任务关联产品 | 弱关联 | 当前 Task.project 用产品名字符串匹配, 应改为 productId 可选外键 |

---

## 4. 联动模式对比

### 模式 A: 弱关联 (可选外键, 不级联)

**原理**: 各 store 独立持有数据, 通过 ID 引用建立关联。删除时清空关联字段或删除孤儿数据。

**适用场景**:
- 两个模块可独立使用, 不依赖对方存在
- 数据可最终一致性, 不需要强同步
- 模块各自有独立的 CRUD 生命周期

**优点**:
- 完全解耦, 各 store 可独立演进
- 删除安全, 不会因误删产品导致研发数据丢失
- 符合 Nova v0.2.0 已确立的弱关联范式 (task.projectId?, scheduleEvent.projectId?)

**缺点**:
- 需要手动维护关联一致性
- 可能出现孤儿数据 (rndStore 中 productId 对应的产品已删除)
- UI 层需要额外的 fallback 逻辑

**Nova 适用度**: ★★★★★ (5/5)
- 与现有架构完全吻合
- rndStore 已按 productId 索引, 天然支持
- 已有多处弱关联先例

### 模式 B: 强关联 (共享 store / 直接引用)

**原理**: rndStore 直接持有 Product 引用, 或 productStore 持有 Deliverable 引用。

**适用场景**:
- 两个模块有强绑定关系, 一个不存在则另一个无意义
- 需要强一致性保证

**优点**:
- 数据强一致, 无需手动同步
- 查询简单, 不需要跨 store lookup

**缺点**:
- 循环依赖: productStore ↔ rndStore 互相引用
- store 膨胀: 每个 store 职责模糊化
- 违反单一职责原则
- Zustand persist 序列化复杂度增加

**Nova 适用度**: ★★☆☆☆ (2/5)
- rndStore 已有 `getProd()` 读取 productStore, 但这是只读的 getState() 调用, 不是强引用
- 共享 store 会导致 persist 配置复杂化
- 与现有 6 store 分立架构冲突

### 模式 C: 事件驱动 (Zustand subscribe / pub-sub)

**原理**: 模块 A 数据变更时发布事件, 模块 B 订阅并响应。可通过 Zustand `subscribe` 或自定义 EventEmitter。

**适用场景**:
- 完全解耦, 模块间互不知道对方存在
- 变更需要触发跨模块副作用

**优点**:
- 松耦合, 模块可独立部署
- 可扩展, 新模块可订阅已有事件

**缺点**:
- 调试困难: 数据流不可预测
- 事件风暴: 级联更新可能导致循环
- 无类型安全: 事件 payload 难以约束
- 增加心智负担: 开发者需理解隐式事件链

**Nova 适用度**: ★★★☆☆ (3/5)
- Zustand 的 `subscribe` 可实现, 但增加调试复杂度
- 对于桌面端单进程应用, 事件驱动收益有限
- 适合 v0.3+ 的复杂场景 (如 AI Pipeline 联动)

### 推荐: 混合模式 (A 为主 + 少量 C)

**核心采用模式 A (弱关联)**:
- 保持 rndStore 按 productId 索引的现有设计
- 新增字段用可选 ID 引用 (如 `milestone.deliverableCodes?: string[]`)
- 删除产品时清理 rndStore 孤儿数据

**少量使用模式 C (事件驱动)**:
- 仅在 `updateProduct` 的 `stage` 变更时, 通过 subscribe 触发 rndStore 的阶段进度提示更新
- 用于 ProductGovernanceTab 的阶段推进 → 研发中心视觉提示

---

## 5. 实施建议

### 5.1 v0.2.0 快速见效 (推荐实施)

| 联动 | 工作量 | 风险 | 价值 | 说明 |
|------|--------|------|------|------|
| **L5: 里程碑 ↔ 交付物状态** | 小 | 低 | 高 | `ProductMilestone.deliverables` 改为 `deliverableCodes: string[]`, 引用 `FullLifecycleDeliverable.code`。ProductMilestonesTab 展示每个交付物的 ready/draft 状态 |
| **L6: 产品阶段 ↔ 交付物阶段进度** | 小 | 低 | 高 | ProductGovernanceTab 和 RndCenterView 都展示当前阶段的交付物就绪率 (如 "研发阶段 3/3 就绪") |
| **L7: 删除产品级联清理** | 小 | 低 | 中 | `deleteProduct` 时同步清理 rndStore 中该 productId 的所有数据。可新增 `rndStore.cleanupProduct(productId)` |

**具体接口设计**:

```typescript
// L5: ProductMilestone 增加 deliverableCodes
interface ProductMilestone {
  // ...existing fields
  deliverableCodes?: string[];  // 替代 deliverables: string[]
  // 兼容期: deliverables 保留, 新增 deliverableCodes
}

// L7: rndStore 新增 action
cleanupProduct: (productId: string) => void;
// 清理 requirements[productId], prototypes[productId], deliverables[productId], etc.

// productStore.deleteProduct 增强
deleteProduct: (id: string) => {
  useRndStore.getState().cleanupProduct(id);  // 先清理 rndStore
  set((state) => ({ products: state.products.filter(p => p.id !== id) }));
}
```

### 5.2 v0.3+ 推迟实施

| 联动 | 原因 | 依赖 |
|------|------|------|
| L8: PRD 自动同步产品信息 | 需要 "重新同步" 操作, 涉及 AI 生成内容覆盖 | 用户确认 UX |
| L9: featureMatrix → userStories | 同上, 需要合并策略 | AI 合并引擎 |
| L10: 里程碑 → 测试通过率 | 需要 Task ↔ TestCase 关联 | Task-CRUD 完成 |
| L11: 文档 ↔ 知识库 | 需要内容去重策略 | 知识库 CRUD 完成 |
| L12-L14: 展示层/事件联动 | 低优先级, 不影响核心数据流 | v0.3 规划 |

### 5.3 迁移路径

```
当前 (v0.1.0)
  │
  │ rndStore 按 productId 索引 (隐式关联)
  │ syncDeliverableToDocs 单向写入
  │ ProductManagementView 只读展示 readyCount
  │
  ▼ v0.2.0 Phase 5-7
  │
  │ + L5: milestone.deliverableCodes (弱关联)
  │ + L6: stage → phase 进度映射 (展示层)
  │ + L7: deleteProduct 级联清理 rndStore
  │
  ▼ v0.3.0
  │
  │ + L8: PRD 同步产品信息 (手动触发)
  │ + L10: milestone → test pass rate
  │ + L11: document ↔ knowledge 引用
  │
  ▼ v0.4.0+
  │
  │ + L12-L14: 事件驱动联动
  │ + AI Pipeline 自动联动
```

---

## 6. 接口设计草案

### 6.1 新增字段

```typescript
// ProductMilestone 增强 (mockProducts.ts)
interface ProductMilestone {
  id?: string;
  title: string;
  date: string;
  stage?: string;
  status: 'pending' | 'in-progress' | 'completed';
  owner?: string;
  deliverables?: string[];        // 保留向后兼容
  deliverableCodes?: string[];    // 🆕 关联 FullLifecycleDeliverable.code
  description?: string;
}
```

### 6.2 新增 actions

```typescript
// rndStore 新增
interface RndState {
  // ...existing
  cleanupProduct: (productId: string) => void;
  getDeliverableStatusForPhase: (productId: string, phase: string) => {
    total: number;
    ready: number;
    generating: number;
    draft: number;
  };
}

// productStore 增强 (无需新 action, 增强 deleteProduct 即可)
```

### 6.3 新增组件 props

```typescript
// ProductMilestonesTab 增强
interface Props {
  product: Product;
  onAddMilestone: () => void;
  deliverableStatusMap?: Record<string, FullLifecycleDeliverable['status']>;  // 🆕
}

// ProductGovernanceTab 增强 (已通过 getDeliverablesForProduct 读取)
// 无需新 props, 只需新增 phase 维度统计
```

---

## 7. 数据流图 (联动后)

```
┌─────────────────────────────────────────────────────────────────┐
│                     productStore (SQLite)                        │
│  products: Product[]                                            │
│    ├─ milestones[].deliverableCodes ──────────────────────┐     │
│    ├─ documents[] ◄──────────────────────────────────┐    │     │
│    └─ stage/progress/health                          │    │     │
└──────────────┬───────────────────────────────────────│────│─────┘
               │                                       │    │
               │ getProd() [只读]                       │    │
               │                                       │    │
┌──────────────▼───────────────────────────────────────│────│─────┐
│                      rndStore (SQLite)                │    │     │
│  requirements[productId]   ← 懒初始化读 Product.*    │    │     │
│  prototypes[productId]     ← 懒初始化读 Product.*    │    │     │
│  knowledgeBase[productId]                             │    │     │
│  codeScaffolds[productId]                             │    │     │
│  testCases[productId]                                │    │     │
│  competitorData[productId]                           │    │     │
│  deliverables[productId] ────────────────────────────┘    │     │
│    ├─ getDeliverableStatusForPhase() ──→ GovernanceTab     │     │
│    └─ syncDeliverableToDocs() ────→ addProductDocument()──┘     │
│                                                                  │
│  cleanupProduct(productId) ◄── deleteProduct() 调用              │
└──────────────────────────────────────────────────────────────────┘
```

**联动方向总结**:
- **P→R (产品→研发)**: 产品信息作为 rndStore 懒初始化的上下文源 (已有)
- **R→P (研发→产品)**: `syncDeliverableToDocs` 将交付物归档为文档 (已有)
- **P→R (新增)**: `milestone.deliverableCodes` 引用交付物 code (L5)
- **P→R (新增)**: `deleteProduct` 级联调用 `cleanupProduct` (L7)
- **双向展示 (新增)**: `getDeliverableStatusForPhase` 在两个视图展示阶段进度 (L6)

---

## 附录 A: 16 个子组件分类

### 产品模块专属 (ProductManagementView 下)
1. **ProductOverviewTab** - 产品画像/愿景/功能矩阵
2. **ProductGovernanceTab** - 阶段管控/健康度/交付物进度
3. **ProductDocsTab** - 文档中心 (ProductDocument[])
4. **ProductAnalyticsTab** - 数据指标 (metrics)
5. **ProductSkillsTab** - Skill 矩阵 (associatedSkills[])
6. **ProductMilestonesTab** - 里程碑/风险 (milestones[], risksAndBlockers[])

### 研发中心专属 (RndCenterView 下)
7. **FullDeliverablesTab** - 18 交付物工坊
8. **AIRequirementsTab** - PRD/需求设计
9. **UIPrototypeTab** - 交互原型沙箱
10. **CodeManagementTab** - 代码脚手架
11. **TestManagementTab** - 测试用例管理
12. **CompetitorAnalysisTab** - 竞品分析雷达
13. **ProductKnowledgeTab** - 产品知识库

### 共享 (两个视图都使用)
14. **CreateProductModal** - 新建产品
15. **AddDocumentModal** - 新建文档
16. **AddSkillModal** - 新建 Skill

## 附录 B: 现有跨模块引用汇总

| 源 | 目标 | 引用方式 | 说明 |
|----|------|----------|------|
| `rndStore.getProd()` | `productStore.products` | `useProductStore.getState().products` | 只读, 用于懒初始化 |
| `rndStore.syncDeliverableToDocs()` | `productStore.addProductDocument()` | `useProductStore.getState().addProductDocument()` | 写入, 交付物→文档 |
| `ProductManagementView` | `rndStore.getDeliverablesForProduct()` | `useApp().getDeliverablesForProduct()` | 只读, 展示 readyCount |
| `ProductGovernanceTab` | `rndStore.getDeliverablesForProduct()` | `useApp().getDeliverablesForProduct()` | 只读, 展示进度 |
| `ProductMilestonesTab` | `taskStore.getProjectTaskCount()` | `useApp().getProjectTaskCount()` | 只读, 展示任务数 |
| `Task.project` | `Product.name` | 字符串匹配 | 弱关联, 用名字而非 ID |
| `ScheduleEvent` | 无 | 无 | 日程无产品关联 |
