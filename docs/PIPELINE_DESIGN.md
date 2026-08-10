# Pipeline 工作流设计文档

> 版本: 1.0  
> 日期: 2026-08-07  
> 状态: 已确认

---

## 1. 概述

PM Pipeline 是 Nova-PM-Workspace 的核心功能，实现 **需求→PRD→原型→代码→测试** 的自动化生成流程，并在关键节点提供 **Human-in-the-Loop (HITL)** 人工确认机制。

### 1.1 设计目标

- **自动化** — 减少产品经理重复性工作
- **可控性** — 关键节点人工审批，确保质量
- **可追溯** — 完整的历史记录和检查点
- **可恢复** — 中断后可从检查点恢复

---

## 2. Pipeline 图结构

### 2.1 流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PM Pipeline (StateGraph)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [START]                                                                │
│      │                                                                  │
│      ▼                                                                  │
│  ┌─────────────────┐                                                    │
│  │   需求分析       │                                                    │
│  │ analyze_        │                                                    │
│  │ requirements    │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           ▼                                                             │
│  🛑 ────────────────────────────────────────────────────────────────    │
│  │  interrupt!("需求确认")                                              │
│  │  - 人工确认需求范围                                                   │
│  │  - 人工修改/补充需求                                                  │
│  │  - 人工标记优先级                                                     │
│  ────────────────────────────────────────────────────────────────────    │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐     否     ┌─────────────────┐                    │
│  │ 需求是否充分？   │ ─────────→ │   需求澄清       │                    │
│  │ (conditional)   │            │ clarify_         │                    │
│  └────────┬────────┘            │ requirements     │                    │
│           │ 是                   └────────┬────────┘                    │
│           ▼                               │                             │
│  ┌─────────────────┐                      │                             │
│  │   PRD 生成       │ ←───────────────────┘                             │
│  │ generate_prd    │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           ▼                                                             │
│  🛑 ────────────────────────────────────────────────────────────────    │
│  │  interrupt!("PRD 审批")                                              │
│  │  - 人工审查 PRD 内容                                                  │
│  │  - 人工批准 / 拒绝 / 要求修改                                         │
│  │  - 记录审批意见                                                       │
│  ────────────────────────────────────────────────────────────────────    │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐     拒绝    ┌─────────────────┐                   │
│  │ PRD 是否批准？   │ ─────────→ │   PRD 修改       │                   │
│  │ (conditional)   │            │ revise_prd       │                   │
│  └────────┬────────┘            └────────┬────────┘                   │
│           │ 批准                          │                            │
│           ▼                               │                            │
│  ┌─────────────────┐                      │                            │
│  │   原型设计       │ ←───────────────────┘                            │
│  │ design_         │                                                   │
│  │ prototype       │                                                   │
│  └────────┬────────┘                                                   │
│           │                                                            │
│           ▼                                                            │
│  🛑 ────────────────────────────────────────────────────────────────   │
│  │  interrupt!("原型评审")                                             │
│  │  - 人工查看交互原型                                                  │
│  │  - 人工提出修改意见                                                  │
│  │  - 人工批准交互设计                                                  │
│  ────────────────────────────────────────────────────────────────────   │
│           │                                                            │
│           ▼                                                            │
│  ┌─────────────────┐     修改    ┌─────────────────┐                  │
│  │ 原型是否批准？   │ ─────────→ │  原型调整        │                  │
│  │ (conditional)   │            │ adjust_prototype │                  │
│  └────────┬────────┘            └────────┬────────┘                  │
│           │ 批准                          │                           │
│           ▼                               │                           │
│  ┌─────────────────┐                      │                           │
│  │   代码生成       │ ←───────────────────┘                           │
│  │ generate_code   │                                                  │
│  └────────┬────────┘                                                  │
│           │                                                           │
│           ▼                                                           │
│  🛑 ────────────────────────────────────────────────────────────────  │
│  │  interrupt!("代码审查")                                            │
│  │  - Code Review                                                    │
│  │  - 人工接受 / 拒绝代码                                              │
│  │  - 人工标注修改点                                                   │
│  ────────────────────────────────────────────────────────────────────  │
│           │                                                           │
│           ▼                                                           │
│  ┌─────────────────┐     修改    ┌─────────────────┐                 │
│  │ 代码是否接受？   │ ─────────→ │  代码调整        │                 │
│  │ (conditional)   │            │ adjust_code      │                 │
│  └────────┬────────┘            └────────┬────────┘                 │
│           │ 接受                          │                          │
│           ▼                               │                          │
│  ┌─────────────────┐                      │                          │
│  │   测试生成       │ ←───────────────────┘                          │
│  │ generate_tests  │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  🛑 ──────────────────────────────────────────────────────────────── │
│  │  interrupt!("测试确认")                                           │
│  │  - 查看测试覆盖度                                                  │
│  │  - 确认测试通过标准                                                 │
│  ──────────────────────────────────────────────────────────────────── │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                 │
│  │   交付物汇总     │                                                 │
│  │ summarize_      │                                                 │
│  │ deliverables    │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  [END: 完成]                                                         │
│      ├── PRD 文档                                                     │
│      ├── 原型规格                                                     │
│      ├── 代码脚手架                                                    │
│      └── 测试用例                                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 节点定义

| 节点 ID | 名称 | 输入 | 输出 | LLM 调用 |
|---------|------|------|------|---------|
| `analyze_requirements` | 需求分析 | 原始需求 | 结构化需求 | ✅ |
| `clarify_requirements` | 需求澄清 | 不明确点 | 补充需求 | ✅ |
| `generate_prd` | PRD 生成 | 结构化需求 | PRD 文档 | ✅ |
| `revise_prd` | PRD 修改 | 审批意见 | 修改后的 PRD | ✅ |
| `design_prototype` | 原型设计 | PRD | 原型规格 | ✅ |
| `adjust_prototype` | 原型调整 | 修改意见 | 调整后的原型 | ✅ |
| `generate_code` | 代码生成 | 原型规格 | 代码结构 | ✅ |
| `adjust_code` | 代码调整 | 修改标注 | 修改后的代码 | ✅ |
| `generate_tests` | 测试生成 | 代码结构 | 测试用例 | ✅ |
| `summarize_deliverables` | 交付物汇总 | 所有产物 | 汇总报告 | ✅ |

---

## 3. 状态定义

### 3.1 Pipeline State

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PmPipelineState {
    // === 基础信息 ===
    pub run_id: String,
    pub product_id: String,
    pub product_name: String,
    
    // === 需求阶段 ===
    pub raw_requirements: String,                    // 原始需求输入
    pub analyzed_requirements: Option<Requirements>, // 分析后的需求
    pub requirement_confirmed: bool,                 // 需求是否已确认
    
    // === PRD 阶段 ===
    pub prd_content: Option<PrdDocument>,            // PRD 内容
    pub prd_review_status: ReviewStatus,             // PRD 审批状态
    pub prd_feedback: Option<String>,                // PRD 审批意见
    
    // === 原型阶段 ===
    pub prototype_spec: Option<PrototypeSpec>,       // 原型规格
    pub prototype_review_status: ReviewStatus,
    pub prototype_feedback: Option<String>,
    
    // === 代码阶段 ===
    pub code_structure: Option<CodeStructure>,       // 代码结构
    pub code_review_status: ReviewStatus,
    pub code_feedback: Option<String>,
    
    // === 测试阶段 ===
    pub test_cases: Option<Vec<TestCase>>,
    pub test_confirmed: bool,
    
    // === 元数据 ===
    pub current_phase: PipelinePhase,
    pub iteration_count: HashMap<String, usize>,     // 各阶段迭代次数
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ReviewStatus {
    Pending,       // 等待审批
    Approved,      // 已批准
    Rejected,      // 已拒绝
    NeedsRevision, // 需要修改
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PipelinePhase {
    RequirementAnalysis,
    PrdGeneration,
    PrototypeDesign,
    CodeGeneration,
    TestGeneration,
    Completed,
}
```

### 3.2 子结构定义

```rust
// 需求结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Requirements {
    pub core_features: Vec<Feature>,
    pub non_functional: Vec<NonFunctionalRequirement>,
    pub risks: Vec<Risk>,
    pub ambiguities: Vec<String>,  // 模糊点，需要澄清
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub name: String,
    pub description: String,
    pub priority: Priority,
    pub user_stories: Vec<UserStory>,
}

// PRD 文档结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrdDocument {
    pub overview: String,
    pub features: Vec<FeatureSpec>,
    pub user_stories: Vec<UserStory>,
    pub acceptance_criteria: Vec<AcceptanceCriterion>,
    pub technical_constraints: Vec<String>,
    pub timeline_estimate: Option<String>,
}

// 原型规格
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrototypeSpec {
    pub screens: Vec<ScreenSpec>,
    pub navigation_flow: Vec<NavigationStep>,
    pub interactions: Vec<InteractionSpec>,
}

// 代码结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeStructure {
    pub architecture: String,           // 如 "MVC", "Clean Architecture"
    pub tech_stack: Vec<String>,
    pub modules: Vec<ModuleSpec>,
    pub apis: Vec<ApiSpec>,
    pub data_models: Vec<DataModelSpec>,
}

// 测试用例
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub test_type: TestType,            // 单元/集成/E2E
    pub steps: Vec<String>,
    pub expected_result: String,
    pub priority: Priority,
}
```

---

## 4. 节点实现示例

### 4.1 需求分析节点

```rust
use graph_flow::prelude::*;
use rig::providers::anthropic;

async fn analyze_requirements(
    state: &mut PmPipelineState,
    context: &PipelineContext,
) -> Result<(), PipelineError> {
    let llm = context.get_llm();
    
    // 构建 prompt
    let prompt = format!(
        r#"请分析以下产品需求，输出结构化的需求文档。

## 原始需求
{}

## 要求输出格式
1. **核心功能点** - 列出所有核心功能，包括：
   - 功能名称
   - 功能描述
   - 优先级（高/中/低）
   - 用户故事

2. **非功能需求** - 性能、安全、可用性等

3. **潜在风险** - 技术风险、业务风险

4. **模糊点** - 需要进一步澄清的问题

请以 JSON 格式输出。"#,
        state.raw_requirements
    );
    
    // 调用 LLM
    let response = llm.chat(&prompt).await?;
    
    // 解析并存储
    let requirements: Requirements = serde_json::from_str(&response)?;
    state.analyzed_requirements = Some(requirements);
    state.current_phase = PipelinePhase::RequirementAnalysis;
    state.updated_at = Utc::now();
    
    Ok(())
}
```

### 4.2 Interrupt 节点（需求确认）

```rust
use graph_flow::interrupt;

async fn requirement_confirmation_node(
    state: &mut PmPipelineState,
    context: &PipelineContext,
) -> Result<(), PipelineError> {
    // 触发 interrupt，暂停执行
    let interrupt_data = InterruptData {
        phase: "requirement_confirmation".to_string(),
        message: "请确认以下需求分析结果".to_string(),
        data: serde_json::to_value(&state.analyzed_requirements)?,
    };
    
    // 暂停执行，等待前端提交审批结果
    interrupt!(context, interrupt_data).await?;
    
    // 恢复后，state 中已包含人工的确认/修改
    // context 中会包含人工提交的审批数据
    
    if let Some(approval) = context.get_approval_data() {
        match approval.action {
            ApprovalAction::Confirm => {
                state.requirement_confirmed = true;
            }
            ApprovalAction::Revise => {
                // 应用人工修改
                if let Some(modified) = approval.modified_data {
                    state.analyzed_requirements = Some(serde_json::from_value(modified)?);
                }
                state.requirement_confirmed = false;
            }
            ApprovalAction::Supplement => {
                // 补充需求
                if let Some(extra) = approval.extra_info {
                    state.raw_requirements.push_str(&format!("\n\n补充：{}", extra));
                }
                state.requirement_confirmed = false;
            }
        }
    }
    
    Ok(())
}
```

### 4.3 条件边

```rust
fn should_proceed_to_prd(state: &PmPipelineState) -> &'static str {
    if state.requirement_confirmed {
        "proceed_to_prd"
    } else {
        "require_clarification"
    }
}

fn should_proceed_to_prototype(state: &PmPipelineState) -> &'static str {
    match state.prd_review_status {
        ReviewStatus::Approved => "proceed_to_prototype",
        ReviewStatus::Rejected | ReviewStatus::NeedsRevision => "revise_prd",
        _ => "wait",
    }
}
```

---

## 5. GraphFlow 图定义

```rust
use graph_flow::{StateGraph, Node, Edge, ConditionalEdge};

pub fn build_pm_pipeline() -> StateGraph<PmPipelineState> {
    let mut graph = StateGraph::new("pm_pipeline");
    
    // === 添加节点 ===
    graph.add_node("analyze_requirements", analyze_requirements);
    graph.add_node("requirement_confirmation", requirement_confirmation_node);
    graph.add_node("clarify_requirements", clarify_requirements);
    graph.add_node("generate_prd", generate_prd);
    graph.add_node("prd_approval", prd_approval_node);
    graph.add_node("revise_prd", revise_prd);
    graph.add_node("design_prototype", design_prototype);
    graph.add_node("prototype_review", prototype_review_node);
    graph.add_node("adjust_prototype", adjust_prototype);
    graph.add_node("generate_code", generate_code);
    graph.add_node("code_review", code_review_node);
    graph.add_node("adjust_code", adjust_code);
    graph.add_node("generate_tests", generate_tests);
    graph.add_node("test_confirmation", test_confirmation_node);
    graph.add_node("summarize_deliverables", summarize_deliverables);
    
    // === 添加边 ===
    graph.add_edge("START", "analyze_requirements");
    graph.add_edge("analyze_requirements", "requirement_confirmation");
    
    // 条件边：需求是否充分
    graph.add_conditional_edge(
        "requirement_confirmation",
        should_proceed_to_prd,
        {
            let mut map = HashMap::new();
            map.insert("proceed_to_prd", "generate_prd");
            map.insert("require_clarification", "clarify_requirements");
            map
        }
    );
    
    graph.add_edge("clarify_requirements", "analyze_requirements"); // 循环
    graph.add_edge("generate_prd", "prd_approval");
    
    // 条件边：PRD 是否批准
    graph.add_conditional_edge(
        "prd_approval",
        should_proceed_to_prototype,
        {
            let mut map = HashMap::new();
            map.insert("proceed_to_prototype", "design_prototype");
            map.insert("revise_prd", "revise_prd");
            map
        }
    );
    
    graph.add_edge("revise_prd", "generate_prd"); // 循环
    graph.add_edge("design_prototype", "prototype_review");
    
    // 条件边：原型是否批准
    graph.add_conditional_edge(
        "prototype_review",
        |state| match state.prototype_review_status {
            ReviewStatus::Approved => "proceed",
            _ => "revise",
        },
        {
            let mut map = HashMap::new();
            map.insert("proceed", "generate_code");
            map.insert("revise", "adjust_prototype");
            map
        }
    );
    
    graph.add_edge("adjust_prototype", "design_prototype"); // 循环
    graph.add_edge("generate_code", "code_review");
    
    // 条件边：代码是否接受
    graph.add_conditional_edge(
        "code_review",
        |state| match state.code_review_status {
            ReviewStatus::Approved => "proceed",
            _ => "revise",
        },
        {
            let mut map = HashMap::new();
            map.insert("proceed", "generate_tests");
            map.insert("revise", "adjust_code");
            map
        }
    );
    
    graph.add_edge("adjust_code", "generate_code"); // 循环
    graph.add_edge("generate_tests", "test_confirmation");
    graph.add_edge("test_confirmation", "summarize_deliverables");
    graph.add_edge("summarize_deliverables", "END");
    
    // === 设置入口和出口 ===
    graph.set_entry_point("analyze_requirements");
    graph.set_finish_point("summarize_deliverables");
    
    graph
}
```

---

## 6. 前端 HITL 交互设计

### 6.1 交互模式

**推荐方案：内嵌式审批卡片 + 侧边通知**

```
┌─────────────────────────────────────────────────────────────────────┐
│  RndCenterView                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Pipeline 进度条                                               │ │
│  │  [需求分析] ✅ ──→ [PRD] 🛑 ──→ [原型] ⬜ ──→ [代码] ⬜ ──→ [测试] ⬜ │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  🛑 PRD 审批待处理                                             │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  📄 PRD 文档预览                                        │ │ │
│  │  │  ───────────────────────────────────────────────────── │ │ │
│  │  │  1. 产品概述                                            │ │ │
│  │  │     本产品旨在为产品经理提供 AI 驱动的工作台...           │ │ │
│  │  │                                                         │ │ │
│  │  │  2. 功能规格                                            │ │ │
│  │  │     2.1 Agent 工作区                                    │ │ │
│  │  │         - 聊天助手                                      │ │ │
│  │  │         - 任务管理                                      │ │ │
│  │  │     2.2 Pipeline 自动化                                 │ │ │
│  │  │         - 需求→PRD→原型→代码                            │ │ │
│  │  │     ...                                                 │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  ┌────────────────────────────────────────────────────────┐  │ │
│  │  │  💬 审批意见 (可选)                                      │  │ │
│  │  │  ┌────────────────────────────────────────────────────┐│  │ │
│  │  │  │  功能规格部分建议补充非功能需求的详细描述...         ││  │ │
│  │  │  └────────────────────────────────────────────────────┘│  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  │                                                                │ │
│  │  [ ✅ 批准 ]   [ ❌ 拒绝 ]   [ ✏️ 编辑修改 ]                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  右侧通知面板 (可折叠)                                              │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  📋 待审批项 (2)                                               │ │
│  │  ├── 🔴 PRD 审批 - 刚刚                                       │ │
│  │  └── 🟡 需求确认 - 5分钟前                                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 前端组件

```typescript
// PipelineProgress.tsx
export function PipelineProgress({ phases, currentPhase }: Props) {
  return (
    <div className="flex items-center gap-2">
      {phases.map((phase, idx) => (
        <Fragment key={phase.id}>
          <PhaseIndicator
            phase={phase}
            status={getPhaseStatus(phase.id, currentPhase)}
          />
          {idx < phases.length - 1 && <Connector />}
        </Fragment>
      ))}
    </div>
  );
}

// ApprovalCard.tsx
export function ApprovalCard({ interruptData, onApprove, onReject, onRevise }: Props) {
  const [feedback, setFeedback] = useState('');
  
  return (
    <Card className="p-6">
      <CardHeader>
        <Badge variant="warning">🛑 待审批</Badge>
        <h3>{interruptData.title}</h3>
      </CardHeader>
      
      <CardContent>
        {/* 预览内容 */}
        <DocumentPreview data={interruptData.data} />
        
        {/* 审批意见 */}
        <Textarea
          placeholder="输入审批意见（可选）..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </CardContent>
      
      <CardFooter>
        <Button variant="primary" onClick={() => onApprove(feedback)}>
          ✅ 批准
        </Button>
        <Button variant="danger" onClick={() => onReject(feedback)}>
          ❌ 拒绝
        </Button>
        <Button variant="secondary" onClick={() => onRevise(feedback)}>
          ✏️ 编辑修改
        </Button>
      </CardFooter>
    </Card>
  );
}
```

---

## 7. 持久化策略

### 7.1 检查点机制

GraphFlow 的 SqliteSaver 会在每个节点执行后自动保存检查点：

```sql
-- 检查点表
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
);
```

### 7.2 恢复机制

```rust
// 从检查点恢复 Pipeline
async fn resume_pipeline(run_id: &str, checkpoint_id: Option<&str>) -> Result<()> {
    let state = if let Some(cp_id) = checkpoint_id {
        // 从特定检查点恢复（时间旅行）
        load_checkpoint(run_id, cp_id).await?
    } else {
        // 从最新检查点恢复
        load_latest_checkpoint(run_id).await?
    };
    
    // 恢复 GraphFlow 执行
    graph.invoke(state).await
}
```

---

## 8. 错误处理

### 8.1 重试策略

```rust
// LLM 调用重试
async fn call_llm_with_retry(prompt: &str, max_retries: usize) -> Result<String> {
    let mut attempts = 0;
    loop {
        match llm.chat(prompt).await {
            Ok(response) => return Ok(response),
            Err(e) if attempts < max_retries => {
                attempts += 1;
                sleep(Duration::from_secs(2u64.pow(attempts))).await;
            }
            Err(e) => return Err(e),
        }
    }
}
```

### 8.2 迭代次数限制

```rust
// 防止无限循环
const MAX_ITERATIONS_PER_PHASE: usize = 5;

fn check_iteration_limit(state: &PmPipelineState, phase: &str) -> Result<()> {
    let count = state.iteration_count.get(phase).copied().unwrap_or(0);
    if count >= MAX_ITERATIONS_PER_PHASE {
        return Err(PipelineError::MaxIterationsExceeded(phase.to_string()));
    }
    Ok(())
}
```

---

## 附录

### 参考资料

- [GraphFlow Documentation](https://docs.rs/graph-flow)
- [LangGraph HITL Patterns](https://docs.langchain.com/langgraph/human-in-the-loop)
- [State Machine Patterns](https://rustcc.cn/article?id=9087abce-e5ec-4abb-a98a-e3cc1eb3e7f0)
