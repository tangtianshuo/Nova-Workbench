# 技术选型决策文档

> 版本: 1.0  
> 日期: 2026-08-07  
> 状态: 已确认

---

## 1. 技术选型概览

| 层 | 技术选型 | 版本/Crate | 理由 |
|----|---------|-----------|------|
| **工作流引擎** | GraphFlow | `graph-flow` | Rust 原生，HITL 支持，Rig 集成 |
| **LLM 集成** | Rig | `rig` | 多 Provider，GraphFlow 已集成 |
| **持久化** | SQLite | `rusqlite` + `juncture-store` | 本地优先，成熟稳定 |
| **向量检索** | LanceDB | `lancedb` | 嵌入式，零配置 |
| **桌面框架** | Tauri | v2.x | 已有，Rust 后端 |
| **前端** | React | v19 | 已有 |
| **样式** | Tailwind CSS | v4 | 已有 |
| **状态管理** | Zustand | - | 已有 |
| **动画** | Framer Motion | `motion/react` | 已有 |

---

## 2. 选型决策过程

### 2.1 工作流引擎选型

#### 候选方案对比

| 方案 | 优势 | 劣势 | 评估 |
|------|------|------|------|
| **LangGraph (Node.js)** | 生态成熟，HITL 原生 | 需要 sidecar，资源开销 | ❌ 排除 |
| **Claude Agent SDK** | 开箱即用 | 模型绑定，灵活性差 | ❌ 排除 |
| **ZeroClaw** | 极致轻量，Rust 原生 | HITL 能力不明确 | ⚠️ 备选 |
| **Vercel AI SDK** | Provider 无关 | 无 HITL，工作流能力弱 | ❌ 排除 |
| **GraphFlow** | Rust 原生，HITL，Rig 集成 | 相对较新 | ✅ **选中** |
| **Juncture** | LangGraph 完全兼容 | LLM 集成需自行处理 | ⚠️ 备选 |

#### 最终选择：GraphFlow

**核心理由：**
1. **Rust 原生** — 可直接嵌入 Tauri，零 sidecar
2. **HITL 支持** — `interrupt!` 宏，满足人工确认需求
3. **Rig 集成** — 省去 LLM 集成工作
4. **生产验证** — v1.4.2 达到 99.99% 可用性

**关键能力：**
- StateGraph + 状态图执行
- 可中断/恢复执行（HITL）
- 条件边（分支逻辑）
- 并行执行（FanOut/FanIn）
- 类型安全工作流（编译时验证）
- SqliteSaver 持久化

**依赖：**
```toml
# Cargo.toml
[dependencies]
graph-flow = "0.x"
rig = "0.x"
```

---

### 2.2 LLM 集成选型

#### 候选方案对比

| 方案 | 优势 | 劣势 | 评估 |
|------|------|------|------|
| **直接 HTTP 调用** | 完全控制 | 需自行处理流式、重试 | ❌ 排除 |
| **LangChain Rust** | 功能完整 | 较重，学习成本 | ⚠️ 备选 |
| **Rig** | 轻量，多 Provider | 相对较新 | ✅ **选中** |

#### 最终选择：Rig

**核心理由：**
1. **GraphFlow 已集成** — 无缝配合
2. **多 Provider 支持** — Claude、GPT、Gemini、Ollama
3. **流式响应内置** — 聊天体验
4. **类型安全** — Rust 强类型保证
5. **轻量** — 比 LangChain Rust 更简洁

**Provider 支持：**
```rust
use rig::providers::{anthropic, openai, google, ollama};

// Anthropic Claude
let claude = anthropic::Client::new().unwrap();
let model = claude.model("claude-sonnet-4-5");

// OpenAI GPT
let gpt = openai::Client::new().unwrap();
let model = gpt.model("gpt-4-turbo");

// Google Gemini
let gemini = google::Client::new().unwrap();
let model = gemini.model("gemini-pro");

// 本地 Ollama
let ollama = ollama::Client::new();
let model = ollama.model("llama3");
```

---

### 2.3 向量检索选型

#### 候选方案对比

| 方案 | 优势 | 劣势 | 评估 |
|------|------|------|------|
| **ChromaDB (HTTP)** | 功能完整 | 需要 Python sidecar | ❌ 排除 |
| **Qdrant** | 高性能 | 需要独立服务 | ❌ 排除 |
| **SQLite-vec** | 轻量 | 功能受限 | ⚠️ 备选 |
| **LanceDB** | 嵌入式，零配置 | 生态较新 | ✅ **选中** |

#### 最终选择：LanceDB

**核心理由：**
1. **嵌入式** — 无需独立服务，直接集成
2. **零配置** — 开箱即用
3. **磁盘持久化** — 数据存储在本地
4. **TypeScript/Rust 双支持** — 灵活
5. **性能足够** — 个人知识库规模（几万到几十万文档）

**集成方式：**
```rust
use lancedb::connect;
use lancedb::index::Index;

// 连接数据库（自动创建）
let db = connect("~/.nova-agents/lancedb").execute().await?;

// 创建表
let table = db.create_table("knowledge", data).execute().await?;

// 向量检索
let results = table
    .search(&query_vector)
    .limit(10)
    .execute()
    .await?;
```

---

### 2.4 持久化选型

#### 最终选择：SQLite

**理由：**
- GraphFlow 内置 SqliteSaver
- 成熟稳定
- 零配置
- 本地优先

**Schema 设计（Pipeline 状态）：**
```sql
-- Pipeline 执行记录
CREATE TABLE pipeline_runs (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    state_json TEXT NOT NULL,  -- JSON 序列化的状态
    checkpoint_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 检查点历史
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
);
```

---

## 3. 架构约束

### 3.1 已确认约束

| 约束 | 说明 |
|------|------|
| **零 Sidecar** | 不使用 Node.js 或其他语言的独立进程 |
| **本地优先** | 敏感数据存储在用户本地 |
| **混合架构** | LLM 调用走云端 API，其他本地 |
| **HITL 必需** | Pipeline 关键节点必须支持人工确认 |

### 3.2 技术债务风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| GraphFlow 相对较新 | 社区较小，文档可能不完善 | 保持关注更新，必要时可自行扩展 |
| LanceDB 生态较新 | 高级功能可能缺失 | 预留切换到其他向量库的接口 |
| 全 Rust 栈 | 前端开发者可能需要适应 | 提供清晰的 IPC 接口文档 |

---

## 4. 依赖清单

### 4.1 Rust (Tauri 后端)

```toml
[dependencies]
# 工作流引擎
graph-flow = "0.x"

# LLM 集成
rig = "0.x"

# 向量检索
lancedb = "0.x"

# 持久化
rusqlite = { version = "0.x", features = ["bundled"] }

# 序列化
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 异步
tokio = { version = "1.0", features = ["full"] }

# 时间
chrono = { version = "0.4", features = ["serde"] }

# Tauri
tauri = { version = "2.x", features = [...] }
```

### 4.2 TypeScript (前端)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "zustand": "^4.x",
    "motion": "^11.x",
    "@phosphor-icons/react": "^2.x",
    "@tauri-apps/api": "^2.x"
  }
}
```

---

## 5. 未来扩展考虑

### 5.1 可替换组件

| 组件 | 替换候选 | 触发条件 |
|------|---------|---------|
| GraphFlow | Juncture, 自研 | 功能不满足需求 |
| Rig | 自研 HTTP 层 | Provider 支持不足 |
| LanceDB | Qdrant, ChromaDB | 规模超出嵌入式能力 |
| SQLite | PostgreSQL | 多用户/云同步需求 |

### 5.2 接口抽象

为可替换组件设计接口抽象层：

```rust
// LLM Provider 抽象
pub trait LlmProvider {
    async fn chat(&self, messages: &[Message]) -> Result<Response>;
    async fn stream(&self, messages: &[Message]) -> Result<impl Stream<Item = Chunk>>;
}

// 向量存储抽象
pub trait VectorStore {
    async fn insert(&self, items: Vec<VectorItem>) -> Result<()>;
    async fn search(&self, query: &[f32], limit: usize) -> Result<Vec<SearchResult>>;
}

// 持久化抽象
pub trait StateStore {
    async fn save(&self, state: &PipelineState) -> Result<()>;
    async fn load(&self, id: &str) -> Result<PipelineState>;
}
```

---

## 附录

### 参考资源

- [GraphFlow GitHub](https://github.com/a-agmon/rs-graph-llm)
- [GraphFlow Crate](https://crates.io/crates/graph-flow)
- [Rig Crate](https://crates.io/crates/rig)
- [LanceDB Docs](https://lancedb.github.io/lancedb/)
- [Tauri Docs](https://tauri.app/)
