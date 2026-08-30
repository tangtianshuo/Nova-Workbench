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
use tokio_util::sync::CancellationToken;

use crate::engine::channel::EngineEvent;
use crate::engine::confirmations;
use crate::engine::context_assembler::search_knowledge_hybrid;
use crate::engine::exec;
use crate::engine::fs_ops;
use crate::engine::fts_tokens::{fts_match_string, fts_tokens};
use crate::engine::params_hash::params_hash;

pub const MAX_ARTICLES: i64 = 50;
pub const MAX_QUERY_LENGTH: usize = 200;

/// PORT-01 description suffix — byte-identical to registry.ts:58.
pub const PORT_01_SUFFIX: &str = " 若 tool_result 状态为 unknown,先验证(如查看文件/状态)再决定是否重跑;verify_first 类命令禁止未验证直接重跑。";

const KNOWLEDGE_SEARCH_DESCRIPTION: &str = "Search product knowledge via FTS5 hybrid retrieval (keyword MATCH, current doc versions only, source metadata included). Chinese queries are per-char tokenized. No vector, embedding, semantic, or filesystem retrieval is performed.";
const KNOWLEDGE_WRITE_DESCRIPTION: &str = "Stage a product knowledge article for user confirmation. The first call returns a candidate and requires explicit confirmation; only a confirmed matching token can write.";
const MEMORY_WRITE_DESCRIPTION: &str = "Propose a long-term memory about the user. The first call returns a pending candidate that the user must confirm before it is stored.";
const EXEC_DESCRIPTION: &str = "Run a read-only shell command in the workspace root. Takes an argv array (command + args) — no shell interpolation. Requires an active workspace; default timeout 120s. Whitelisted read-only commands (e.g. git status/diff/log/show/branch, ls, cat, rg) run directly; anything else returns a confirmation candidate the user must approve.";
const FS_LIST_DESCRIPTION: &str = "List directory entries (name/isDir/size) in the workspace. path is workspace-root-relative (\"\" = root); reads are free, no confirmation.";
const FS_READ_DESCRIPTION: &str = "Read a workspace file (UTF-8, max 1MB). path is workspace-root-relative; reads are free, no confirmation.";
const FS_WRITE_DESCRIPTION: &str = "Write content to a workspace file (workspace-root-relative path). Returns a confirmation candidate — the write only happens after the user approves.";
const FS_MKDIR_DESCRIPTION: &str = "Create a directory (with parents) inside the workspace. Returns a confirmation candidate requiring user approval.";
const FS_DELETE_DESCRIPTION: &str = "Delete a file or directory (recursive) inside the workspace. Returns a confirmation candidate requiring user approval.";
const FS_MOVE_DESCRIPTION: &str = "Move/rename within the workspace; src and dest are workspace-root-relative. Returns a confirmation candidate requiring user approval.";
const GENERATE_DELIVERABLE_DESCRIPTION: &str = "Generate a deliverable draft (currently PRD only) for the currently selected product. You produce the full draft content yourself in the `draft` parameter. The first call only queues a candidate for user confirmation — the user will review and edit it in the chat panel; do not call again for the same deliverable.";

const CONFIRMATION_REQUIRED_KNOWLEDGE: &str = "Explicit confirmation is required before writing knowledge.";
const CONFIRMATION_REQUIRED_MEMORY: &str = "Explicit confirmation is required before saving memory.";
const CONFIRMATION_REQUIRED_DELIVERABLE: &str = "Explicit confirmation is required before committing the deliverable.";

/// deliverable code → R&D slot (generateDeliverable.ts SLOT_BY_CODE parity).
const SLOT_BY_CODE: &[(&str, &str)] = &[("prd", "DEL-REQ-01")];

pub fn slot_by_code(code: &str) -> Option<&'static str> {
    SLOT_BY_CODE.iter().find(|(c, _)| *c == code).map(|(_, s)| *s)
}

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolKind {
    Readonly,
    KnowledgeWrite,
    MemoryWrite,
    Exec,
    Fs,
    Deliverable,
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
                    "productId": { "type": "string", "description": "Optional when a product is selected in the workspace; omit it then." },
                    "title": { "type": "string", "minLength": 1 },
                    "category": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "content": { "type": "string", "minLength": 1 },
                    "summary": { "type": "string" }
                },
                "required": ["title", "content"],
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
        ToolSpec {
            name: "exec",
            description: EXEC_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "minLength": 1 },
                    "args": { "type": "array", "items": { "type": "string" }, "default": [] },
                    "timeoutMs": { "type": "integer", "minimum": 1, "maximum": 600000 }
                },
                "required": ["command"],
                "additionalProperties": false
            }),
            kind: ToolKind::Exec,
            // Commands with side effects must not be blind-rerun (PORT-01).
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "fs_list",
            description: FS_LIST_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "path": { "type": "string", "default": "" } },
                "additionalProperties": false
            }),
            kind: ToolKind::Fs,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "fs_read",
            description: FS_READ_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "path": { "type": "string", "minLength": 1 } },
                "required": ["path"],
                "additionalProperties": false
            }),
            kind: ToolKind::Fs,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "fs_write",
            description: FS_WRITE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "minLength": 1 },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }),
            kind: ToolKind::Fs,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "fs_mkdir",
            description: FS_MKDIR_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "path": { "type": "string", "minLength": 1 } },
                "required": ["path"],
                "additionalProperties": false
            }),
            kind: ToolKind::Fs,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "fs_delete",
            description: FS_DELETE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "path": { "type": "string", "minLength": 1 } },
                "required": ["path"],
                "additionalProperties": false
            }),
            kind: ToolKind::Fs,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "fs_move",
            description: FS_MOVE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "src": { "type": "string", "minLength": 1 },
                    "dest": { "type": "string", "minLength": 1 }
                },
                "required": ["src", "dest"],
                "additionalProperties": false
            }),
            kind: ToolKind::Fs,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "generate_deliverable",
            description: GENERATE_DELIVERABLE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "code": { "type": "string", "enum": ["prd"] },
                    "title": { "type": "string", "minLength": 1 },
                    "draft": { "type": "string", "minLength": 1 },
                    "confirmationToken": { "type": "string", "minLength": 1 }
                },
                "required": ["code", "title", "draft"],
                "additionalProperties": false
            }),
            kind: ToolKind::Deliverable,
            // Pure candidate enqueue — but committing the confirmed draft is a
            // user action (webview), never a model retry (PORT-01).
            idempotency: "verify_first",
        },
        // ORCHESTRATOR RULING (22-05 plan / ADR-0003): PM CRUD tools
        // (createTask / updateTask / schedule CRUD / ...) are NOT registered —
        // no bridge in v0.3.2 (ruling 2026-08-24); Rust-native return in v0.3.3
        // after business-data relationalization.
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

/// Execute context — the session the tool runs for (candidate stamping) plus
/// the workspace root (23-01): fs/exec tools resolve paths against it; None
/// means those tools must return Failed (arg_error=false), never panic.
pub struct ToolCtx<'a> {
    pub session_id: &'a str,
    pub product_id: Option<&'a str>,
    pub workspace_root: Option<std::path::PathBuf>,
}

pub fn execute(conn: &Connection, name: &str, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    match name {
        "knowledge_search" => execute_knowledge_search(conn, args),
        "knowledge_write" => execute_knowledge_write(conn, args, ctx),
        "memory_write" => execute_memory_write(conn, args, ctx),
        "fs_list" => fs_ops::fs_list(args, ctx),
        "fs_read" => fs_ops::fs_read(args, ctx),
        "fs_write" => fs_ops::fs_write(conn, args, ctx),
        "fs_mkdir" => fs_ops::fs_mkdir(conn, args, ctx),
        "fs_delete" => fs_ops::fs_delete(conn, args, ctx),
        "fs_move" => fs_ops::fs_move(conn, args, ctx),
        "generate_deliverable" => execute_generate_deliverable(conn, args, ctx),
        _ => ToolOutcome::Failed {
            message: format!("Unknown tool: {name}"),
            arg_error: false,
        },
    }
}

/// Async dispatch entry (23-01, signature frozen): exec lands here (23-02),
/// sync tools route straight through `execute`.
pub async fn execute_async(
    conn: &Connection,
    name: &str,
    args: &Value,
    ctx: &ToolCtx<'_>,
    cancel: CancellationToken,
    on_event: &(dyn Fn(EngineEvent) + Send + Sync),
) -> ToolOutcome {
    match name {
        "exec" => exec::run(conn, args, ctx, cancel, on_event).await,
        _ => execute(conn, name, args, ctx),
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
    for key in ["title", "content"] {
        if str_arg(args, key).is_none() {
            return ToolOutcome::Failed {
                message: format!("Tool \"knowledge_write\" arg validation failed: {key} must be a non-empty string"),
                arg_error: true,
            };
        }
    }
    // 22-08: ctx.product_id fallback mirrors memory_write — with a product
    // selected the model may omit productId; candidate always carries a
    // concrete id (the webview confirm path reads candidate args).
    let product_id = str_arg(args, "productId").or(ctx.product_id);
    let Some(product_id) = product_id else {
        return ToolOutcome::Failed {
            message: "Tool \"knowledge_write\" arg validation failed: productId must be a non-empty string (no product selected in the current context)".into(),
            arg_error: true,
        };
    };
    let summary = str_arg(args, "summary")
        .map(|s| s.to_string())
        .or_else(|| str_arg(args, "title").map(|s| s.to_string()))
        .unwrap_or_default();
    let mut effective_args = args.clone();
    effective_args["productId"] = json!(product_id);
    match confirmations::create_candidate(conn, "knowledge_write", &effective_args, Some(&summary), Some(ctx.session_id)) {
        Ok(candidate) => ToolOutcome::AwaitConfirmation {
            candidate: json!({
                "kind": "knowledge_write",
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
                "args": effective_args,
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

/// generate_deliverable — pure candidate enqueue (23-04, TS generateDeliverable.ts
/// :81-84 parity): the MODEL writes the full draft in `draft`; this tool makes
/// ZERO LLM calls. Committing the confirmed draft is a webview user action
/// (engine_commit_deliverable), so a model call carrying confirmationToken is
/// an arg_error steering it away from self-committing.
fn execute_generate_deliverable(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if args.get("confirmationToken").is_some() {
        return ToolOutcome::Failed {
            message: "Tool \"generate_deliverable\" arg validation failed: committing is a user action; call once without confirmationToken to queue the draft".into(),
            arg_error: true,
        };
    }
    let Some(code) = str_arg(args, "code") else {
        return ToolOutcome::Failed {
            message: "Tool \"generate_deliverable\" arg validation failed: code must be a non-empty string".into(),
            arg_error: true,
        };
    };
    if slot_by_code(code).is_none() {
        return ToolOutcome::Failed {
            message: "Tool \"generate_deliverable\" arg validation failed: code must be one of \"prd\"".into(),
            arg_error: true,
        };
    }
    for key in ["title", "draft"] {
        if str_arg(args, key).is_none() {
            return ToolOutcome::Failed {
                message: format!("Tool \"generate_deliverable\" arg validation failed: {key} must be a non-empty string"),
                arg_error: true,
            };
        }
    }
    let Some(product_id) = ctx.product_id else {
        return ToolOutcome::Failed {
            message: "Select a product before generating a deliverable.".into(),
            arg_error: false,
        };
    };
    // Params shape mirrors TS deliverableParams (confirmations.ts:336-342);
    // the four-key dedup (code/productId/title/draft) lives in create_candidate.
    let params = json!({
        "code": code,
        "productId": product_id,
        "title": args["title"],
        "draft": args["draft"],
        "sessionId": ctx.session_id,
        "eventId": Value::Null,
    });
    let title = str_arg(args, "title").unwrap_or_default();
    match confirmations::create_candidate(conn, "deliverable_draft", &params, Some(title), Some(ctx.session_id)) {
        Ok(candidate) => ToolOutcome::AwaitConfirmation {
            candidate: json!({
                "kind": "deliverable_draft",
                "confirmationToken": candidate.confirmation_token,
                "code": code,
                "title": title,
                "draft": args["draft"],
                "productId": product_id,
            }),
            wait_key: "error",
            wait_value: CONFIRMATION_REQUIRED_DELIVERABLE.into(),
        },
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
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
        assert_eq!(names, vec![
            "knowledge_search", "knowledge_write", "memory_write", "exec",
            "fs_list", "fs_read", "fs_write", "fs_mkdir", "fs_delete", "fs_move",
            "generate_deliverable"
        ]);
        for s in &schemas {
            assert!(s["description"].as_str().unwrap().ends_with(PORT_01_SUFFIX));
            assert!(s["parameters"].is_object());
        }
        // Single registry invariant (TOOL-04): the model-visible schema set IS
        // the native registry — nothing else can inject or shadow a tool.
        let reg: Vec<&str> = registry().iter().map(|t| t.name).collect();
        assert_eq!(names, reg, "schemas must derive 1:1 from the single registry");
        // idempotency classes: reads rerunnable, writes verify_first
        assert_eq!(idempotency("knowledge_search"), "rerunnable");
        assert_eq!(idempotency("knowledge_write"), "verify_first");
        assert_eq!(idempotency("memory_write"), "verify_first");
        assert_eq!(idempotency("exec"), "verify_first");
        assert_eq!(idempotency("fs_list"), "rerunnable");
        assert_eq!(idempotency("fs_read"), "rerunnable");
        for t in ["fs_write", "fs_mkdir", "fs_delete", "fs_move"] {
            assert_eq!(idempotency(t), "verify_first");
        }
        assert_eq!(idempotency("generate_deliverable"), "verify_first");
        assert_eq!(idempotency("createTask"), "verify_first"); // old-event default
    }

    #[test]
    fn generate_deliverable_queues_candidate_and_dedups() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
        let args = json!({"code": "prd", "title": "PRD v1", "draft": "# 草稿"});
        let token = match execute(&conn, "generate_deliverable", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, wait_key, wait_value } => {
                assert_eq!(wait_key, "error");
                assert_eq!(wait_value, "Explicit confirmation is required before committing the deliverable.");
                assert_eq!(candidate["kind"], "deliverable_draft");
                assert_eq!(candidate["code"], "prd");
                assert_eq!(candidate["title"], "PRD v1");
                candidate["confirmationToken"].as_str().unwrap().to_string()
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        };
        // Stored row: kind + four-key dedup params.
        let stored = confirmations::get(&conn, &token).unwrap().expect("row");
        assert_eq!(stored.kind, "deliverable_draft");
        assert_eq!(stored.params["productId"], "p1");
        assert_eq!(stored.params["draft"], "# 草稿");
        // Same draft again → same token (dedup), no new row.
        let again = match execute(&conn, "generate_deliverable", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                candidate["confirmationToken"].as_str().unwrap().to_string()
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        };
        assert_eq!(token, again);
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates WHERE kind = 'deliverable_draft'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        // Edited draft → different dedup key → new candidate.
        match execute(&conn, "generate_deliverable", &json!({"code": "prd", "title": "PRD v1", "draft": "# 新稿"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_ne!(candidate["confirmationToken"].as_str().unwrap(), token);
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn generate_deliverable_arg_errors_and_no_product() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
        for (args, why) in [
            (json!({}), "no fields"),
            (json!({"code": "prd"}), "missing title/draft"),
            (json!({"code": "roadmap", "title": "T", "draft": "D"}), "bad code enum"),
            (json!({"code": "prd", "title": "T", "draft": "D", "confirmationToken": "tok"}), "self-commit"),
        ] {
            match execute(&conn, "generate_deliverable", &args, &ctx) {
                ToolOutcome::Failed { arg_error: true, .. } => {}
                other => panic!("{why}: expected arg_error Failed, got {other:?}"),
            }
        }
        // No product selected → non-arg failure (precondition, retry can't fix).
        let no_product = ToolCtx { session_id: "s1", product_id: None, workspace_root: None };
        match execute(&conn, "generate_deliverable", &json!({"code": "prd", "title": "T", "draft": "D"}), &no_product) {
            ToolOutcome::Failed { arg_error: false, .. } => {}
            other => panic!("expected precondition Failed, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_search_executes_fts() {
        let conn = mem_conn();
        seed_knowledge(&conn);
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None };
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
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None };
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
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
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

    /* === 22-08 gap closure: knowledge_write productId ctx fallback === */

    #[test]
    fn knowledge_write_uses_ctx_product_id_when_model_omits_it() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
        match execute(&conn, "knowledge_write", &json!({"title": "T", "content": "C"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["args"]["productId"], "p1");
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("candidate row");
                assert_eq!(stored.params["productId"], "p1");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates WHERE kind = 'knowledge_write'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn knowledge_write_without_product_id_and_no_ctx_arg_errors() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None };
        match execute(&conn, "knowledge_write", &json!({"title": "T", "content": "C"}), &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("no product selected"), "{message}");
                assert!(arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_write_explicit_product_id_wins_over_ctx() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
        match execute(&conn, "knowledge_write", &json!({"productId": "p9", "title": "T", "content": "C"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["args"]["productId"], "p9");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn memory_write_inserts_memory_candidate_and_waits() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None };
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
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None };
        match execute(&conn, "createTask", &json!({"title": "x"}), &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "Unknown tool: createTask");
                assert!(!arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }
}
