// src-tauri/src/engine/tools.rs
// Phase 22 (22-05) — minimal Rust-native tool set (orchestrator ruling:
// NO TS bridge in Phase 22; PM CRUD tools are intentionally NOT registered —
// they disappear from the model schema and return via the Phase 23 bridge).
//
// Tool set: knowledge_search (read-only FTS5) + knowledge_write / memory_write
// (HITL candidates). Every description carries the PORT-01 verify-before-rerun
// suffix (registry.ts:58, 22-01 Task 1 wording); idempotency class travels with
// the tool_call event payload (PORT-01).

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engine::confirmations;
use crate::engine::context_assembler::search_knowledge_hybrid;
use crate::engine::fts_tokens::{fts_match_string, fts_tokens};
use crate::engine::params_hash::params_hash;

pub const MAX_ARTICLES: i64 = 50;
pub const MAX_QUERY_LENGTH: usize = 200;

/// PORT-01 description suffix — byte-identical to registry.ts:58.
pub const PORT_01_SUFFIX: &str = " 若 tool_result 状态为 unknown,先验证(如查看文件/状态)再决定是否重跑;verify_first 类命令禁止未验证直接重跑。";

const KNOWLEDGE_SEARCH_DESCRIPTION: &str = "Search product knowledge via FTS5 hybrid retrieval (keyword MATCH, current doc versions only, source metadata included). Chinese queries are per-char tokenized. No vector, embedding, semantic, or filesystem retrieval is performed.";
const KNOWLEDGE_WRITE_DESCRIPTION: &str = "Stage a product knowledge article for user confirmation. The first call returns a candidate and requires explicit confirmation; only a confirmed matching token can write.";
const MEMORY_WRITE_DESCRIPTION: &str = "Propose a long-term memory about the user. The first call returns a pending candidate that the user must confirm before it is stored.";

const CONFIRMATION_REQUIRED_KNOWLEDGE: &str = "Explicit confirmation is required before writing knowledge.";
const CONFIRMATION_REQUIRED_MEMORY: &str = "Explicit confirmation is required before saving memory.";

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolKind {
    Readonly,
    KnowledgeWrite,
    MemoryWrite,
}

pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
    pub kind: ToolKind,
    /// PORT-01 idempotency class stamped on tool_call events.
    pub idempotency: &'static str,
}

/// Static registry (registry.ts toolsToSchemas shape: name/description/parameters).
pub fn registry() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "knowledge_search",
            description: KNOWLEDGE_SEARCH_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "minLength": 1, "maxLength": MAX_QUERY_LENGTH },
                    "productId": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_ARTICLES }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
            kind: ToolKind::Readonly,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "knowledge_write",
            description: KNOWLEDGE_WRITE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "productId": { "type": "string" },
                    "title": { "type": "string", "minLength": 1 },
                    "category": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "content": { "type": "string", "minLength": 1 },
                    "summary": { "type": "string" }
                },
                "required": ["productId", "title", "content"],
                "additionalProperties": false
            }),
            kind: ToolKind::KnowledgeWrite,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "memory_write",
            description: MEMORY_WRITE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": { "type": "string", "minLength": 1 },
                    "scope": { "type": "string", "enum": ["global", "product"] },
                    "productId": { "type": "string" }
                },
                "required": ["content"],
                "additionalProperties": false
            }),
            kind: ToolKind::MemoryWrite,
            idempotency: "verify_first",
        },
        // ORCHESTRATOR RULING (22-05 plan / ADR-0003): PM CRUD tools
        // (createTask / updateTask / schedule CRUD / ...) are NOT registered in
        // Phase 22 — no TS bridge yet. Phase 23 restores them via the bridge.
    ]
}

/// LLM tools array (registry.ts toolsToSchemas): three keys, PORT-01 suffix appended.
pub fn schemas() -> Vec<Value> {
    registry()
        .into_iter()
        .map(|t| {
            json!({
                "name": t.name,
                "description": format!("{}{}", t.description, PORT_01_SUFFIX),
                "parameters": t.parameters,
            })
        })
        .collect()
}

/// PORT-01 idempotency class for a tool name (unknown → verify_first, the
/// old-event default).
pub fn idempotency(name: &str) -> &'static str {
    registry()
        .into_iter()
        .find(|t| t.name == name)
        .map(|t| t.idempotency)
        .unwrap_or("verify_first")
}

/// Execution outcome. AwaitConfirmation carries the HITL candidate JSON plus
/// the WAIT detail (key/value) the loop embeds in the tool_result payload —
/// key order `{ok, awaitingConfirmation, <key>}` is composed by the loop.
#[derive(Debug)]
pub enum ToolOutcome {
    Executed(Value),
    AwaitConfirmation {
        candidate: Value,
        wait_key: &'static str,
        wait_value: String,
    },
    /// arg_error=true maps to TS ToolArgError (retryAvailable semantics).
    Failed { message: String, arg_error: bool },
}

/// Execute context — the session the tool runs for (candidate stamping).
pub struct ToolCtx<'a> {
    pub session_id: &'a str,
    pub product_id: Option<&'a str>,
}

pub fn execute(conn: &Connection, name: &str, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    match name {
        "knowledge_search" => execute_knowledge_search(conn, args),
        "knowledge_write" => execute_knowledge_write(conn, args, ctx),
        "memory_write" => execute_memory_write(conn, args, ctx),
        _ => ToolOutcome::Failed {
            message: format!("Unknown tool: {name}"),
            arg_error: false,
        },
    }
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

fn execute_knowledge_search(conn: &Connection, args: &Value) -> ToolOutcome {
    let Some(query) = str_arg(args, "query") else {
        return ToolOutcome::Failed {
            message: "Tool \"knowledge_search\" arg validation failed: query must be a non-empty string".into(),
            arg_error: true,
        };
    };
    if query.chars().count() > MAX_QUERY_LENGTH {
        return ToolOutcome::Failed {
            message: format!("Tool \"knowledge_search\" arg validation failed: query longer than {MAX_QUERY_LENGTH} chars"),
            arg_error: true,
        };
    }
    let product_id = str_arg(args, "productId");
    let limit = match args.get("limit").and_then(|v| v.as_i64()) {
        None => MAX_ARTICLES,
        Some(n) if (1..=MAX_ARTICLES).contains(&n) => n,
        Some(n) => {
            return ToolOutcome::Failed {
                message: format!("Tool \"knowledge_search\" arg validation failed: limit {n} out of range 1..={MAX_ARTICLES}"),
                arg_error: true,
            }
        }
    };

    let tokens = fts_tokens(query);
    let matches = if tokens.is_empty() {
        Vec::new()
    } else {
        match search_knowledge_hybrid(conn, &fts_match_string(&tokens), product_id, limit as usize) {
            Ok(hits) => hits
                .into_iter()
                .map(|h| {
                    json!({
                        "title": h.title, "version": h.version, "updatedAt": h.updated_at,
                        "summary": h.summary, "productId": h.product_id,
                    })
                })
                .collect::<Vec<_>>(),
            Err(e) => return ToolOutcome::Failed { message: e.to_string(), arg_error: false },
        }
    };
    ToolOutcome::Executed(json!({
        "query": query,
        "productId": product_id,
        "matches": matches,
        "retrieval": "fts5-hybrid",
    }))
}

fn execute_knowledge_write(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    for key in ["productId", "title", "content"] {
        if str_arg(args, key).is_none() {
            return ToolOutcome::Failed {
                message: format!("Tool \"knowledge_write\" arg validation failed: {key} must be a non-empty string"),
                arg_error: true,
            };
        }
    }
    let summary = str_arg(args, "summary")
        .map(|s| s.to_string())
        .or_else(|| str_arg(args, "title").map(|s| s.to_string()))
        .unwrap_or_default();
    match confirmations::create_candidate(conn, "knowledge_write", args, Some(&summary), Some(ctx.session_id)) {
        Ok(candidate) => ToolOutcome::AwaitConfirmation {
            candidate: json!({
                "kind": "knowledge_write",
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
                "args": args,
            }),
            wait_key: "error",
            wait_value: CONFIRMATION_REQUIRED_KNOWLEDGE.into(),
        },
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn execute_memory_write(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(content) = str_arg(args, "content") else {
        return ToolOutcome::Failed {
            message: "Tool \"memory_write\" arg validation failed: content must be a non-empty string".into(),
            arg_error: true,
        };
    };
    let scope = str_arg(args, "scope").unwrap_or("global");
    let product_id = str_arg(args, "productId").or(ctx.product_id);
    let hash = params_hash(&json!({"content": content, "scope": scope, "productId": product_id}));
    let token = uuid::Uuid::new_v4().to_string();
    if let Err(e) = confirmations::insert_memory_candidate(
        conn, &token, content, &hash, "model_inferred", scope, product_id, Some(ctx.session_id),
    ) {
        return ToolOutcome::Failed { message: e.to_string(), arg_error: false };
    }
    ToolOutcome::AwaitConfirmation {
        candidate: json!({
            "kind": "memory_write",
            "confirmationToken": token,
            "content": content,
            "scope": scope,
            "productId": product_id,
        }),
        wait_key: "error",
        wait_value: CONFIRMATION_REQUIRED_MEMORY.into(),
    }
}

/* === Tests === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use crate::engine::event_log::now_iso;

    fn seed_knowledge(conn: &Connection) {
        conn.execute(
            "INSERT INTO knowledge_docs (doc_rowid, doc_id, version, product_id, title, category,
                 tags_json, summary, content, author, source_type, created_at, updated_at)
             VALUES (1, 'd1', 1, 'p1', '需求流程', '架构设计', '[]', '流程摘要', '正文', 'AI 助手', 'seed', ?1, ?1)",
            rusqlite::params![now_iso()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO knowledge_fts (title, content, summary, tags, doc_rowid) VALUES (?1, '正文', ?2, '', 1)",
            rusqlite::params![fts_tokens("需求流程").join(" "), fts_tokens("流程摘要").join(" ")],
        )
        .unwrap();
    }

    #[test]
    fn schemas_three_tools_with_port01_suffix() {
        let schemas = schemas();
        let names: Vec<&str> = schemas.iter().map(|s| s["name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["knowledge_search", "knowledge_write", "memory_write"]);
        for s in &schemas {
            assert!(s["description"].as_str().unwrap().ends_with(PORT_01_SUFFIX));
            assert!(s["parameters"].is_object());
        }
        // idempotency classes: 1 rerunnable + 2 verify_first
        assert_eq!(idempotency("knowledge_search"), "rerunnable");
        assert_eq!(idempotency("knowledge_write"), "verify_first");
        assert_eq!(idempotency("memory_write"), "verify_first");
        assert_eq!(idempotency("createTask"), "verify_first"); // old-event default
    }

    #[test]
    fn knowledge_search_executes_fts() {
        let conn = mem_conn();
        seed_knowledge(&conn);
        let ctx = ToolCtx { session_id: "s1", product_id: None };
        match execute(&conn, "knowledge_search", &json!({"query": "需求"}), &ctx) {
            ToolOutcome::Executed(value) => {
                assert_eq!(value["retrieval"], "fts5-hybrid");
                assert_eq!(value["matches"].as_array().unwrap().len(), 1);
                assert_eq!(value["matches"][0]["title"], "需求流程");
            }
            other => panic!("expected Executed, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_search_arg_error_is_retryable() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None };
        match execute(&conn, "knowledge_search", &json!({}), &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("arg validation failed"));
                assert!(arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_write_creates_candidate_and_waits() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1") };
        let args = json!({"productId": "p1", "title": "T", "content": "C"});
        match execute(&conn, "knowledge_write", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, wait_key, wait_value } => {
                assert_eq!(wait_key, "error");
                assert_eq!(wait_value, "Explicit confirmation is required before writing knowledge.");
                assert_eq!(candidate["kind"], "knowledge_write");
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("candidate row");
                assert_eq!(stored.kind, "knowledge_write");
                assert_eq!(stored.params, args);
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn memory_write_inserts_memory_candidate_and_waits() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None };
        match execute(&conn, "memory_write", &json!({"content": "用户喜欢简短回复"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, wait_value, .. } => {
                assert_eq!(wait_value, "Explicit confirmation is required before saving memory.");
                let token = candidate["confirmationToken"].as_str().unwrap();
                let (status, content): (String, String) = conn
                    .query_row(
                        "SELECT status, content FROM memory_candidates WHERE candidate_token = ?1",
                        rusqlite::params![token],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .unwrap();
                assert_eq!(status, "pending");
                assert_eq!(content, "用户喜欢简短回复");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn unknown_tool_fails_without_arg_error() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None };
        match execute(&conn, "createTask", &json!({"title": "x"}), &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "Unknown tool: createTask");
                assert!(!arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }
}
