// src-tauri/src/engine/tools.rs
// Phase 22 (22-05) — minimal Rust-native tool set.
// Phase 29 (29-02) — 9 PM CRUD tools (task/schedule four-piece ×2 + search)
// registered with three-tier risk: read/light-write run free, delete (and
// cap-5 escalated writes) route through pm_write HITL candidates.
//
// Tool set: knowledge_search (read-only FTS5) + knowledge_write / memory_write
// (HITL candidates). Every description carries the PORT-01 verify-before-rerun
// suffix (registry.ts:58, 22-01 Task 1 wording); idempotency class travels with
// the tool_call event payload (PORT-01).

use std::sync::LazyLock;

use rusqlite::Connection;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::engine::channel::EngineEvent;
use crate::engine::confirmations;
use crate::engine::context_assembler::search_knowledge_hybrid;
use crate::engine::exec;
use crate::engine::fs_ops;
use crate::engine::ingest;
use crate::engine::pm_store;
use crate::engine::workflow_store;
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
const INGEST_SCAN_DESCRIPTION: &str = "Scan a workspace directory for .docx/.pdf files, extract text (Chinese supported), and return per-file three-state results (extracted/partial/failed) with sha256 content hashes. Already-ingested files (same hash) are skipped; failed files (e.g. scanned PDFs without a text layer) are retried on every scan.";
const INGEST_SUBMIT_DESCRIPTION: &str = "Submit extracted workspace documents as one batch for user confirmation. items[] carries knowledge articles (type=knowledge, needs category from the 13-value enum) plus optional task/schedule drafts — at most 5 drafts per source document. Every item id must be `ing-{contentHash8}`. The first call returns a single batch candidate; the user reviews/edits/selects items before anything is written.";
const TASK_CREATE_DESCRIPTION: &str = "Create a task and apply it immediately — no confirmation needed. Field names mirror the Tasks view (title/priority/deadline/description/projectId).";
const TASK_UPDATE_DESCRIPTION: &str = "Update writable fields of an existing task (status/priority/title/deadline/…) and apply immediately — no confirmation needed. Deleting is NOT possible here; use task_delete.";
const TASK_COMPLETE_DESCRIPTION: &str = "Mark a task as 已完成 and apply immediately — no confirmation needed.";
const TASK_DELETE_DESCRIPTION: &str = "Delete a task. Requires user confirmation: the first call returns a candidate card; the deletion only happens after the user approves.";
const TASK_SEARCH_DESCRIPTION: &str = "Search tasks by status/priority/projectId/deadline filters. Read-only, no confirmation.";
const SCHEDULE_CREATE_DESCRIPTION: &str = "Create a schedule event and apply it immediately — no confirmation needed. date is YYYY-MM-DD, time is HH:mm (or 'HH:mm - HH:mm').";
const SCHEDULE_UPDATE_DESCRIPTION: &str = "Update writable fields of an existing schedule event and apply immediately — no confirmation needed. Deleting is NOT possible here; use schedule_delete.";
const SCHEDULE_DELETE_DESCRIPTION: &str = "Delete a schedule event. Requires user confirmation: the first call returns a candidate card; the deletion only happens after the user approves.";
const SCHEDULE_SEARCH_DESCRIPTION: &str = "Search schedule events by date/projectId/type filters. Read-only, no confirmation.";
const GENERATE_DELIVERABLE_DESCRIPTION: &str = "Generate a deliverable draft for the currently selected product. `code` is either \"prd\" or a catalog slot code (DEL-REQ-01 … DEL-REL-04). You produce the full draft content yourself in the `draft` parameter. The first call only queues a candidate for user confirmation — the user will review and edit it in the chat panel; do not call again for the same deliverable.";
const WORKFLOW_SEARCH_DESCRIPTION: &str = "List available workflow templates (builtin reference + user-created), each with name/description/step summaries. Templates are reference playbooks the user runs on demand — search by keyword in name/description. Read-only, no confirmation.";
const WORKFLOW_CREATE_DESCRIPTION: &str = "Create a workflow template and apply it immediately — no confirmation needed. steps is an ordered array of {name, prompt, expectedSlotCode?, toolHint?}. source defaults to 'user'; 'distilled' marks templates distilled from a past run. Never pass 'builtin' — builtins are packaged, not stored.";
const WORKFLOW_UPDATE_DESCRIPTION: &str = "Update name/description/steps (whole-array replace) of an existing workflow template and apply immediately — no confirmation needed. Deleting is NOT possible here; use workflow_delete.";
const WORKFLOW_DELETE_DESCRIPTION: &str = "Delete a workflow template. Requires user confirmation: the first call returns a candidate card; the deletion only happens after the user approves.";
const CODE_READ_DESCRIPTION: &str = "Read a source file inside the bound code repository (repo-root-relative path, UTF-8 text only). Paginated: default head 2000 lines, use offset/limit for more. 研究类工具,先侦察后行动 — read/grep before proposing edits.";
const CODE_GREP_DESCRIPTION: &str = "Regex-search the bound code repository; returns file:line:text matches (.gitignore respected, max 200 results). Narrow with pattern/path when truncated. 研究类工具,先侦察后行动 — read/grep before proposing edits.";
const CODE_WRITE_DESCRIPTION: &str = "Write a whole file (create or overwrite) inside the bound code repository. Returns a confirmation candidate with a unified diff — the write only happens after the user approves (engine_code_apply).";
const CODE_EDIT_DESCRIPTION: &str = "Edit a repo file by exact string replacement: old_string must match exactly once. 0 or 2+ matches fail with line numbers — re-read the file and retry with more context. Returns a confirmation candidate with a unified diff; the edit only happens after the user approves (engine_code_apply).";

const CONFIRMATION_REQUIRED_KNOWLEDGE: &str = "Explicit confirmation is required before writing knowledge.";
const CONFIRMATION_REQUIRED_PM_WRITE: &str = "Explicit confirmation is required before deleting or further writing PM data.";

/// 29-02 cap-5 guardrail (学 ingest INGEST_DRAFT_CAP 先例): per run, after 5
/// confirmation-free PM writes every further light write escalates to a
/// pm_write HITL candidate instead of writing directly.
pub const PM_WRITE_CAP: u32 = 5;

/// scheduleStore.ts ScheduleEventType — enum parity, do not invent values.
pub const SCHEDULE_TYPES: [&str; 6] = ["meeting", "deadline", "task", "reminder", "review", "sync"];
pub const TASK_PRIORITIES: [&str; 3] = ["high", "medium", "low"];
const CONFIRMATION_REQUIRED_MEMORY: &str = "Explicit confirmation is required before saving memory.";
const CONFIRMATION_REQUIRED_DELIVERABLE: &str = "Explicit confirmation is required before committing the deliverable.";

/// Phase 30 (30-01, SC-4): deliverable catalog single source — the SAME JSON
/// file the TS side imports (src/data/deliverableCatalog.ts). No hardcoded
/// DEL-* strings here; switching verticals only swaps the JSON.
#[derive(serde::Deserialize)]
struct CatalogEntry {
    code: String,
}

static CATALOG: LazyLock<Vec<CatalogEntry>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../src/data/deliverables-catalog.json"))
        .expect("deliverables-catalog.json invalid")
});

/// deliverable code → R&D slot ('prd' alias + every catalog code maps to
/// itself; generateDeliverable.ts SLOT_BY_CODE parity).
pub fn slot_by_code(code: &str) -> Option<&'static str> {
    if code == "prd" {
        return Some(CATALOG[0].code.as_str()); // 'prd' alias → first catalog entry (DEL-REQ-01)
    }
    CATALOG.iter().find(|e| e.code == code).map(|e| e.code.as_str())
}

/// 'prd' alias + every catalog code — the generate_deliverable `code` enum.
fn deliverable_codes() -> Vec<&'static str> {
    let mut codes: Vec<&'static str> = vec!["prd"];
    codes.extend(CATALOG.iter().map(|e| e.code.as_str()));
    codes
}

/// 30-02 (Pitfall #3): workflow_store user-catalog inserts check collisions
/// against the builtin catalog codes here.
pub fn catalog_has_code(code: &str) -> bool {
    CATALOG.iter().any(|e| e.code == code)
}

/// Phase 30 (30-02): builtin workflow templates — same single-source pattern
/// as CATALOG (TS imports the same JSON). Never stored in SQLite (D-01).
static BUILTIN_WORKFLOWS: LazyLock<Vec<Value>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../src/data/workflow-templates-builtin.json"))
        .expect("workflow-templates-builtin.json invalid")
});

/// Builtin template names for the system-prompt short list (loop_runner).
pub fn builtin_workflow_names() -> Vec<String> {
    BUILTIN_WORKFLOWS
        .iter()
        .filter_map(|t| t["name"].as_str().map(String::from))
        .collect()
}

/// 30-02 SC-4: user-added catalog codes extend the valid `code` set (builtin
/// ∪ user table). Queried per call — 16+N rows, caching buys nothing.
fn catalog_user_has_code(conn: &Connection, code: &str) -> bool {
    workflow_store::list_catalog_user(conn)
        .map(|rows| rows.iter().any(|r| r["code"].as_str() == Some(code)))
        .unwrap_or(false)
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
    Ingest,
    Pm,
    Code,
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
                    "category": { "type": "string", "enum": KNOWLEDGE_CATEGORIES.to_vec(), "description": "Category must be exactly one of the enum values" },
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
                    "code": { "type": "string", "enum": deliverable_codes() },
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
        ToolSpec {
            name: "ingest_scan",
            description: INGEST_SCAN_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "workspaceRoot": { "type": "string", "minLength": 1, "description": "Directory to scan for .docx/.pdf; defaults to the session workspace root." }
                },
                "additionalProperties": false
            }),
            kind: ToolKind::Readonly,
            // hash-idempotent: same bytes skip, changed bytes re-extract
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "ingest_submit",
            description: INGEST_SUBMIT_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "workspaceId": { "type": "string", "minLength": 1 },
                    "productId": { "type": "string", "description": "Optional when a product is selected in the workspace; omit it then." },
                    "items": {
                        "type": "array", "minItems": 1,
                        "items": { "type": "object" }
                    }
                },
                "required": ["workspaceId", "items"],
                "additionalProperties": false
            }),
            kind: ToolKind::Ingest,
            idempotency: "verify_first",
        },
        // 29-02: PM CRUD — three-tier risk (CONTEXT D-12). ids are server-generated
        // and never accepted from the model.
        ToolSpec {
            name: "task_create",
            description: TASK_CREATE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "minLength": 1 },
                    "priority": { "type": "string", "enum": ["high", "medium", "low"] },
                    "deadline": { "type": "string", "description": "YYYY-MM-DD" },
                    "description": { "type": "string" },
                    "projectId": { "type": "string" }
                },
                "required": ["title"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "task_update",
            description: TASK_UPDATE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "taskId": { "type": "string", "minLength": 1 },
                    "updates": { "type": "object" }
                },
                "required": ["taskId", "updates"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "task_complete",
            description: TASK_COMPLETE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "taskId": { "type": "string", "minLength": 1 } },
                "required": ["taskId"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "task_delete",
            description: TASK_DELETE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "taskId": { "type": "string", "minLength": 1 } },
                "required": ["taskId"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "task_search",
            description: TASK_SEARCH_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "status": { "type": "string" },
                    "priority": { "type": "string", "enum": ["high", "medium", "low"] },
                    "projectId": { "type": "string" },
                    "deadline": { "type": "string", "description": "YYYY-MM-DD" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_ARTICLES }
                },
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "schedule_create",
            description: SCHEDULE_CREATE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "minLength": 1 },
                    "date": { "type": "string", "description": "YYYY-MM-DD" },
                    "time": { "type": "string", "description": "HH:mm or 'HH:mm - HH:mm'" },
                    "type": { "type": "string", "enum": SCHEDULE_TYPES.to_vec() },
                    "location": { "type": "string" },
                    "projectId": { "type": "string" },
                    "taskId": { "type": "string" }
                },
                "required": ["title", "date"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "schedule_update",
            description: SCHEDULE_UPDATE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "eventId": { "type": "string", "minLength": 1 },
                    "updates": { "type": "object" }
                },
                "required": ["eventId", "updates"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "schedule_delete",
            description: SCHEDULE_DELETE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "eventId": { "type": "string", "minLength": 1 } },
                "required": ["eventId"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "schedule_search",
            description: SCHEDULE_SEARCH_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "date": { "type": "string", "description": "YYYY-MM-DD" },
                    "projectId": { "type": "string" },
                    "type": { "type": "string", "enum": SCHEDULE_TYPES.to_vec() },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_ARTICLES }
                },
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "rerunnable",
        },
        // 30-02: workflow templates — same three-tier risk (search read;
        // create/update light-write cap-5; delete pm_write HITL). Templates
        // are reference playbooks, never a rigid pipeline (Phase 30 philosophy).
        ToolSpec {
            name: "workflow_search",
            description: WORKFLOW_SEARCH_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Keyword matched against template name/description" }
                },
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "workflow_create",
            description: WORKFLOW_CREATE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "minLength": 1 },
                    "description": { "type": "string" },
                    "steps": {
                        "type": "array", "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string", "minLength": 1 },
                                "prompt": { "type": "string", "minLength": 1 },
                                "expectedSlotCode": { "type": "string" },
                                "toolHint": { "type": "string" }
                            },
                            "required": ["name", "prompt"]
                        }
                    },
                    "source": { "type": "string", "enum": ["user", "distilled"] }
                },
                "required": ["name", "steps"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "workflow_update",
            description: WORKFLOW_UPDATE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "minLength": 1 },
                    "name": { "type": "string", "minLength": 1 },
                    "description": { "type": "string" },
                    "steps": { "type": "array", "minItems": 1, "items": { "type": "object" } }
                },
                "required": ["id"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "workflow_delete",
            description: WORKFLOW_DELETE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": { "id": { "type": "string", "minLength": 1 } },
                "required": ["id"],
                "additionalProperties": false
            }),
            kind: ToolKind::Pm,
            idempotency: "verify_first",
        },
        // 32-03: coding tools — read/grep are zero-confirmation recon inside
        // the bound repo; write/edit produce code_edit HITL candidates.
        ToolSpec {
            name: "code_read",
            description: CODE_READ_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "minLength": 1 },
                    "offset": { "type": "integer", "minimum": 1, "description": "1-based starting line" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 2000 }
                },
                "required": ["path"],
                "additionalProperties": false
            }),
            kind: ToolKind::Code,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "code_grep",
            description: CODE_GREP_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "minLength": 1, "description": "Rust regex" },
                    "path": { "type": "string", "description": "Optional repo-relative subdirectory to scope the search" },
                    "max_results": { "type": "integer", "minimum": 1, "maximum": 200 }
                },
                "required": ["pattern"],
                "additionalProperties": false
            }),
            kind: ToolKind::Code,
            idempotency: "rerunnable",
        },
        ToolSpec {
            name: "code_write",
            description: CODE_WRITE_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "minLength": 1 },
                    "new_content": { "type": "string" }
                },
                "required": ["path", "new_content"],
                "additionalProperties": false
            }),
            kind: ToolKind::Code,
            idempotency: "verify_first",
        },
        ToolSpec {
            name: "code_edit",
            description: CODE_EDIT_DESCRIPTION,
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "minLength": 1 },
                    "old_string": { "type": "string", "minLength": 1 },
                    "new_string": { "type": "string" }
                },
                "required": ["path", "old_string", "new_string"],
                "additionalProperties": false
            }),
            kind: ToolKind::Code,
            idempotency: "verify_first",
        },
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
    /// Bound git repo root (32-01, workspace_repo_roots table). None = the
    /// workspace has no repo binding; code_* tools fail-safe on it (32-03).
    pub repo_root: Option<std::path::PathBuf>,
    /// Confirmation-free PM writes already landed this run (cap-5 input,
    /// maintained by loop_runner; 0 for one-shot webview actions).
    pub pm_writes_used: u32,
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
        "ingest_scan" => execute_ingest_scan(conn, args, ctx),
        "ingest_submit" => execute_ingest_submit(conn, args, ctx),
        "task_create" => execute_task_create(conn, args, ctx),
        "task_update" => execute_task_update(conn, args, ctx),
        "task_complete" => execute_task_complete(conn, args, ctx),
        "task_delete" => execute_task_delete(conn, args, ctx),
        "task_search" => execute_pm_search(conn, args, ctx, false),
        "schedule_create" => execute_schedule_create(conn, args, ctx),
        "schedule_update" => execute_schedule_update(conn, args, ctx),
        "schedule_delete" => execute_schedule_delete(conn, args, ctx),
        "schedule_search" => execute_pm_search(conn, args, ctx, true),
        "workflow_search" => execute_workflow_search(conn, args),
        "workflow_create" => execute_workflow_create(conn, args, ctx),
        "workflow_update" => execute_workflow_update(conn, args, ctx),
        "workflow_delete" => execute_workflow_delete(conn, args, ctx),
        "code_read" => crate::engine::code_ops::code_read(conn, args, ctx),
        "code_grep" => crate::engine::code_ops::code_grep(conn, args, ctx),
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

/// PAIRED with knowledgeCategories in src/ai/tools/knowledgeWrite.ts:12-22.
/// Keep both lists in sync — post-confirmation replay validates against the TS zod enum.
// 27-02 D-06: +4 PM categories (会议纪要/竞品分析/需求文档/项目周报) → 13.
// Pub: the 27-02 consume path validates against the same enum.
pub const KNOWLEDGE_CATEGORIES: [&str; 13] = [
    "架构设计", "领域字典", "技术协议", "FAQ与排障", "最佳实践",
    "经验沉淀", "业务规则", "架构约束", "踩坑指南",
    "会议纪要", "竞品分析", "需求文档", "项目周报",
];

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

fn execute_ingest_scan(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let root = str_arg(args, "workspaceRoot")
        .map(std::path::PathBuf::from)
        .or_else(|| ctx.workspace_root.clone());
    let Some(root) = root else {
        return ToolOutcome::Failed {
            message: "Tool \"ingest_scan\" arg validation failed: workspaceRoot must be a non-empty string (no workspace root in the current context)".into(),
            arg_error: true,
        };
    };
    match ingest::scan_workspace(&root, conn) {
        Ok(items) => ToolOutcome::Executed(json!({
            "workspaceRoot": root.to_string_lossy(),
            "scanned": items.len(),
            "skipped": items.iter().filter(|i| i["status"] == "skipped").count(),
            "items": items,
        })),
        Err(e) => ToolOutcome::Failed { message: e, arg_error: false },
    }
}

const CONFIRMATION_REQUIRED_INGEST: &str = "Explicit confirmation is required before applying the ingestion batch.";
const INGEST_DRAFT_CAP: usize = 5;

/// ingest_submit (27-02 ING-04): single `ingestion_batch` candidate carrying
/// the full items array. Cap: ≤5 task/schedule drafts per source document
/// (D-14 Rust-side double lock). items[].id convention `ing-{contentHash8}`
/// is prompt-orchestration contract — consume dedups by it (Pitfall 6).
fn execute_ingest_submit(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(workspace_id) = str_arg(args, "workspaceId") else {
        return arg_fail("ingest_submit", "workspaceId must be a non-empty string");
    };
    let Some(items) = args.get("items").and_then(|v| v.as_array()) else {
        return arg_fail("ingest_submit", "items must be an array");
    };
    if items.is_empty() {
        return arg_fail("ingest_submit", "items must contain at least one entry");
    }
    let product_id = str_arg(args, "productId").or(ctx.product_id);
    let Some(product_id) = product_id else {
        return arg_fail("ingest_submit", "productId must be a non-empty string (no product selected in the current context)");
    };
    let mut draft_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for item in items {
        let ty = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if !matches!(ty, "knowledge" | "task_draft" | "schedule_draft") {
            return arg_fail("ingest_submit", "items[].type must be one of [knowledge, task_draft, schedule_draft]");
        }
        if item.get("title").and_then(|v| v.as_str()).map(str::is_empty).unwrap_or(true) {
            return arg_fail("ingest_submit", "items[].title must be a non-empty string");
        }
        if ty == "knowledge" {
            let category = item.get("category").and_then(|v| v.as_str()).unwrap_or("");
            if !KNOWLEDGE_CATEGORIES.contains(&category) {
                return arg_fail(
                    "ingest_submit",
                    &format!("knowledge items must carry a category from [{}]", KNOWLEDGE_CATEGORIES.join(", ")),
                );
            }
            if item.get("content").and_then(|v| v.as_str()).map(str::is_empty).unwrap_or(true) {
                return arg_fail("ingest_submit", "knowledge items must carry non-empty content");
            }
        }
        if ty != "knowledge" {
            let source = item
                .get("sourcePath")
                .and_then(|v| v.as_str())
                .or_else(|| item.get("contentHash").and_then(|v| v.as_str()))
                .unwrap_or("");
            let n = draft_counts.entry(source.to_string()).or_insert(0);
            *n += 1;
            if *n > INGEST_DRAFT_CAP {
                return arg_fail("ingest_submit", "drafts exceed cap 5 per source document — split the batch or drop drafts");
            }
        }
    }
    let params = json!({
        "workspaceId": workspace_id,
        "productId": product_id,
        "items": items,
    });
    let summary = format!("ingestion batch: {} items", items.len());
    match confirmations::create_candidate(conn, "ingestion_batch", &params, Some(&summary), Some(ctx.session_id)) {
        Ok(candidate) => ToolOutcome::AwaitConfirmation {
            candidate: json!({
                "kind": "ingestion_batch",
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
                "workspaceId": workspace_id,
                "productId": product_id,
                "items": items,
            }),
            wait_key: "error",
            wait_value: CONFIRMATION_REQUIRED_INGEST.into(),
        },
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

/* === 29-02: PM CRUD (three-tier risk, CONTEXT D-12) === */

/// Light-write set counted against PM_WRITE_CAP by loop_runner.
pub fn is_pm_light_write(name: &str) -> bool {
    matches!(
        name,
        "task_create" | "task_update" | "task_complete" | "schedule_create" | "schedule_update"
            | "workflow_create" | "workflow_update"
    )
}

/// Shared pm_write escalation (delete tier + cap-5 escalation tier).
/// candidate JSON spreads the stored params keys top-level (action/taskId/title
/// for deletes; action/args/reason for cap escalation) — 29-03 consume reads
/// the stored candidate params.
fn pm_write_escalated(conn: &Connection, ctx: &ToolCtx<'_>, params: &Value, summary: &str) -> ToolOutcome {
    match confirmations::create_candidate(conn, "pm_write", params, Some(summary), Some(ctx.session_id)) {
        Ok(candidate) => {
            let mut payload = json!({
                "kind": "pm_write",
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
            });
            if let (Some(dst), Some(src)) = (payload.as_object_mut(), params.as_object()) {
                for (k, v) in src {
                    dst.insert(k.clone(), v.clone());
                }
            }
            ToolOutcome::AwaitConfirmation {
                candidate: payload,
                wait_key: "error",
                wait_value: CONFIRMATION_REQUIRED_PM_WRITE.into(),
            }
        }
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

/// Cap-5 gate for light writes: at/over the cap, escalate instead of writing.
fn escalate_if_capped(conn: &Connection, ctx: &ToolCtx<'_>, tool: &str, args: &Value) -> Option<ToolOutcome> {
    (ctx.pm_writes_used >= PM_WRITE_CAP).then(|| {
        // Consume replays from these params with no run ctx available — bake
        // the selected-product fallback in now (same rule as the direct path).
        let mut args = args.clone();
        if matches!(tool, "task_create" | "schedule_create") && str_arg(&args, "projectId").is_none() {
            if let Some(pid) = ctx.product_id {
                args["projectId"] = json!(pid);
            }
        }
        pm_write_escalated(
            conn,
            ctx,
            &json!({"action": tool, "args": args, "reason": "cap-5 escalation: per-run confirmation-free write limit reached"}),
            "本 run 免确认写入已超 5 条,需确认",
        )
    })
}

fn task_not_found(tool: &str, id: &str) -> ToolOutcome {
    ToolOutcome::Failed { message: format!("Tool \"{tool}\": task {id} not found"), arg_error: false }
}

fn event_not_found(tool: &str, id: &str) -> ToolOutcome {
    ToolOutcome::Failed { message: format!("Tool \"{tool}\": schedule event {id} not found"), arg_error: false }
}

fn execute_task_create(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "task_create", args) {
        return o;
    }
    let Some(title) = str_arg(args, "title") else {
        return arg_fail("task_create", "title must be a non-empty string");
    };
    let priority = str_arg(args, "priority").unwrap_or("medium");
    if !TASK_PRIORITIES.contains(&priority) {
        return arg_fail("task_create", &format!("priority must be one of [{}]", TASK_PRIORITIES.join(", ")));
    }
    let task = json!({
        "title": title,
        "priority": priority,
        "status": "未开始",
        "deadline": str_arg(args, "deadline").unwrap_or(""),
        "description": str_arg(args, "description").unwrap_or(""),
        // Model often omits projectId; default to the run's selected product
        // (same D-05 ownership rule as ingestion).
        "projectId": str_arg(args, "projectId").or(ctx.product_id),
        "assignee": "AI 助手",
        "assigneeAvatar": "AI",
        "categoryId": "",
    });
    match pm_store::insert_task(conn, &task) {
        Ok(id) => ToolOutcome::Executed(json!({"taskId": id, "created": true, "title": title})),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn execute_task_update(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "task_update", args) {
        return o;
    }
    let Some(task_id) = str_arg(args, "taskId") else {
        return arg_fail("task_update", "taskId must be a non-empty string");
    };
    let Some(updates) = args.get("updates").and_then(|v| v.as_object()) else {
        return arg_fail("task_update", "updates must be an object");
    };
    if updates.is_empty() {
        return arg_fail("task_update", "updates must contain at least one field");
    }
    match pm_store::update_task(conn, task_id, &json!(updates)) {
        Ok(true) => ToolOutcome::Executed(json!({"updated": true, "taskId": task_id})),
        Ok(false) => task_not_found("task_update", task_id),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

/// task_complete = task_update(status=已完成) with its own tool name
/// (CONTEXT 自裁: merged implementation, separate model-facing name).
fn execute_task_complete(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "task_complete", args) {
        return o;
    }
    let Some(task_id) = str_arg(args, "taskId") else {
        return arg_fail("task_complete", "taskId must be a non-empty string");
    };
    match pm_store::update_task(conn, task_id, &json!({"status": "已完成"})) {
        Ok(true) => ToolOutcome::Executed(json!({"completed": true, "taskId": task_id})),
        Ok(false) => task_not_found("task_complete", task_id),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn execute_task_delete(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(task_id) = str_arg(args, "taskId") else {
        return arg_fail("task_delete", "taskId must be a non-empty string");
    };
    let title: Option<String> = conn
        .query_row("SELECT title FROM tasks WHERE id = ?1", [task_id], |r| r.get(0))
        .ok();
    let Some(title) = title else {
        return task_not_found("task_delete", task_id);
    };
    pm_write_escalated(
        conn,
        ctx,
        &json!({"action": "task_delete", "taskId": task_id, "title": title}),
        &format!("删除任务「{title}」"),
    )
}

fn execute_schedule_create(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "schedule_create", args) {
        return o;
    }
    let Some(title) = str_arg(args, "title") else {
        return arg_fail("schedule_create", "title must be a non-empty string");
    };
    let Some(date) = str_arg(args, "date") else {
        return arg_fail("schedule_create", "date must be a non-empty string (YYYY-MM-DD)");
    };
    let ty = str_arg(args, "type").unwrap_or("reminder");
    if !SCHEDULE_TYPES.contains(&ty) {
        return arg_fail("schedule_create", &format!("type must be one of [{}]", SCHEDULE_TYPES.join(", ")));
    }
    let event = json!({
        "title": title,
        "date": date,
        "time": str_arg(args, "time").unwrap_or(""),
        "type": ty,
        "location": str_arg(args, "location").unwrap_or(""),
        "projectId": str_arg(args, "projectId").or(ctx.product_id),
        "taskId": str_arg(args, "taskId"),
        "status": "未开始",
    });
    match pm_store::upsert_schedule_from_json(conn, &event) {
        Ok(id) => ToolOutcome::Executed(json!({"eventId": id, "created": true, "title": title})),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn execute_schedule_update(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "schedule_update", args) {
        return o;
    }
    let Some(event_id) = str_arg(args, "eventId") else {
        return arg_fail("schedule_update", "eventId must be a non-empty string");
    };
    let Some(updates) = args.get("updates").and_then(|v| v.as_object()) else {
        return arg_fail("schedule_update", "updates must be an object");
    };
    if updates.is_empty() {
        return arg_fail("schedule_update", "updates must contain at least one field");
    }
    match pm_store::update_schedule(conn, event_id, &json!(updates)) {
        Ok(true) => ToolOutcome::Executed(json!({"updated": true, "eventId": event_id})),
        Ok(false) => event_not_found("schedule_update", event_id),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn execute_schedule_delete(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(event_id) = str_arg(args, "eventId") else {
        return arg_fail("schedule_delete", "eventId must be a non-empty string");
    };
    let title: Option<String> = conn
        .query_row("SELECT title FROM schedules WHERE id = ?1", [event_id], |r| r.get(0))
        .ok();
    let Some(title) = title else {
        return event_not_found("schedule_delete", event_id);
    };
    pm_write_escalated(
        conn,
        ctx,
        &json!({"action": "schedule_delete", "eventId": event_id, "title": title}),
        &format!("删除日程「{title}」"),
    )
}

/// Shared search body for task_search / schedule_search (read tier).
fn execute_pm_search(conn: &Connection, args: &Value, _ctx: &ToolCtx<'_>, schedule: bool) -> ToolOutcome {
    let tool = if schedule { "schedule_search" } else { "task_search" };
    let limit = match args.get("limit").and_then(|v| v.as_i64()) {
        None => MAX_ARTICLES,
        Some(n) if (1..=MAX_ARTICLES).contains(&n) => n,
        Some(n) => {
            return arg_fail(tool, &format!("limit {n} out of range 1..={MAX_ARTICLES}"));
        }
    };
    let mut filters = json!({"limit": limit});
    const TASK_KEYS: [&str; 4] = ["status", "priority", "projectId", "deadline"];
    const SCHEDULE_KEYS: [&str; 3] = ["date", "projectId", "type"];
    let keys: &[&str] = if schedule { &SCHEDULE_KEYS } else { &TASK_KEYS };
    for key in keys {
        if let Some(v) = str_arg(args, key) {
            filters[key] = json!(v);
        }
    }
    let result = if schedule {
        pm_store::list_schedules(conn, &filters)
    } else {
        pm_store::list_tasks(conn, &filters)
    };
    match result {
        Ok(rows) => ToolOutcome::Executed(json!({"matches": rows, "count": rows.len()})),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

/* === 30-02: workflow template tools (same three-tier risk) === */

fn workflow_summary(t: &Value) -> Value {
    let steps = t["steps"].as_array().cloned().unwrap_or_default();
    json!({
        "id": t["id"],
        "name": t["name"],
        "description": t["description"],
        "source": t["source"],
        "stepCount": steps.len(),
        "steps": steps.iter().map(|s| json!({
            "name": s["name"],
            "prompt": s["prompt"],
            "expectedSlotCode": s["expectedSlotCode"],
            "toolHint": s["toolHint"],
        })).collect::<Vec<_>>(),
    })
}

/// workflow_search (read tier): builtin packaged JSON ∪ SQLite user layer.
fn execute_workflow_search(conn: &Connection, args: &Value) -> ToolOutcome {
    let query = str_arg(args, "query").map(|q| q.to_lowercase());
    let mut all: Vec<Value> = BUILTIN_WORKFLOWS.iter().map(workflow_summary).collect();
    match workflow_store::list_workflows(conn) {
        Ok(rows) => all.extend(rows.iter().map(workflow_summary)),
        Err(e) => return ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
    if let Some(q) = &query {
        all.retain(|t| {
            let name = t["name"].as_str().unwrap_or_default().to_lowercase();
            let desc = t["description"].as_str().unwrap_or_default().to_lowercase();
            name.contains(q.as_str()) || desc.contains(q.as_str())
        });
    }
    ToolOutcome::Executed(json!({"matches": all, "count": all.len()}))
}

fn execute_workflow_create(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "workflow_create", args) {
        return o;
    }
    let Some(name) = str_arg(args, "name") else {
        return arg_fail("workflow_create", "name must be a non-empty string");
    };
    let Some(steps) = args.get("steps").and_then(|v| v.as_array()) else {
        return arg_fail("workflow_create", "steps must be a non-empty array");
    };
    if steps.is_empty() {
        return arg_fail("workflow_create", "steps must contain at least one entry");
    }
    let source = str_arg(args, "source").unwrap_or("user");
    if !matches!(source, "user" | "distilled") {
        return arg_fail("workflow_create", "source must be 'user' or 'distilled' (builtin templates are packaged, never stored)");
    }
    let template = json!({"name": name, "description": str_arg(args, "description").unwrap_or(""), "steps": steps});
    match workflow_store::insert_workflow(conn, &template, source) {
        Ok(id) => ToolOutcome::Executed(json!({"id": id, "created": true, "name": name, "source": source})),
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn execute_workflow_update(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if let Some(o) = escalate_if_capped(conn, ctx, "workflow_update", args) {
        return o;
    }
    let Some(id) = str_arg(args, "id") else {
        return arg_fail("workflow_update", "id must be a non-empty string");
    };
    let mut updates = json!({});
    for key in ["name", "description", "steps"] {
        if let Some(v) = args.get(key) {
            if !v.is_null() { updates[key] = v.clone(); }
        }
    }
    if updates.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return arg_fail("workflow_update", "provide at least one of name/description/steps");
    }
    if let Some(steps) = updates.get("steps").and_then(|v| v.as_array()) {
        if steps.is_empty() {
            return arg_fail("workflow_update", "steps must contain at least one entry");
        }
    }
    match workflow_store::update_workflow(conn, id, &updates) {
        Ok(true) => ToolOutcome::Executed(json!({"updated": true, "id": id})),
        Ok(false) => ToolOutcome::Failed { message: format!("Tool \"workflow_update\": workflow {id} not found"), arg_error: false },
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

/// Delete tier: pm_write candidate (reuse 29's confirmation path — no new kind).
fn execute_workflow_delete(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(id) = str_arg(args, "id") else {
        return arg_fail("workflow_delete", "id must be a non-empty string");
    };
    let name: Option<String> = conn
        .query_row("SELECT name FROM workflow_templates WHERE id = ?1", [id], |r| r.get(0))
        .ok();
    let Some(name) = name else {
        return ToolOutcome::Failed { message: format!("Tool \"workflow_delete\": workflow {id} not found"), arg_error: false };
    };
    pm_write_escalated(
        conn,
        ctx,
        &json!({"action": "workflow_delete", "id": id, "name": name}),
        &format!("删除工作流模板「{name}」"),
    )
}

fn arg_fail(tool: &str, msg: &str) -> ToolOutcome {
    ToolOutcome::Failed {
        message: format!("Tool \"{tool}\" arg validation failed: {msg}"),
        arg_error: true,
    }
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
    // 22-09: category enum parity with TS replay (zod rejects free text AFTER
    // confirm — fail here instead so the model can fix it before the card).
    let category = str_arg(args, "category").unwrap_or("");
    if !KNOWLEDGE_CATEGORIES.contains(&category) {
        return ToolOutcome::Failed {
            message: format!(
                "Tool \"knowledge_write\" arg validation failed: category must be one of [{}]",
                KNOWLEDGE_CATEGORIES.join(", ")
            ),
            arg_error: true,
        };
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
    let content = str_arg(args, "content").expect("validated above").to_string();
    let title = str_arg(args, "title").expect("validated above").to_string();
    let item_id = str_arg(args, "itemId").map(str::to_string);
    // ponytail: update-path operation is computed from Rust SQLite here and from webview
    // rndStore on TS replay — if the two stores disagree the hashes drift; known edge,
    // create-path (no itemId) is parity-locked by the constant test below.
    // Upgrade path: single source of truth for knowledge tables.
    let operation = match &item_id {
        Some(id) => conn
            .query_row("SELECT COUNT(*) FROM knowledge_docs WHERE doc_id = ?1", [id], |r| r.get::<_, i64>(0))
            .map(|n| if n > 0 { "updated" } else { "created" })
            .unwrap_or("created"),
        None => "created",
    };
    // tags: zod array(z.string().min(1)).max(20) would reject AFTER confirm —
    // fail pre-card so the model can fix it before the card.
    let tags = match args.get("tags") {
        Some(Value::Array(list)) => {
            if list.len() > 20 {
                return ToolOutcome::Failed {
                    message: "Tool \"knowledge_write\" arg validation failed: tags must contain at most 20 items".into(),
                    arg_error: true,
                };
            }
            if list.iter().any(|t| t.as_str().map(str::is_empty).unwrap_or(true)) {
                return ToolOutcome::Failed {
                    message: "Tool \"knowledge_write\" arg validation failed: every tag must be a non-empty string".into(),
                    arg_error: true,
                };
            }
            Value::Array(list.clone())
        }
        _ => json!([]), // 22-09: TS zod requires tags; default to empty
    };
    // 22-10: TS parity boundary — must stay field-identical to
    // knowledgeParams(resolveDraft(...)) in src/ai/confirmations.ts:65-78.
    let mut normalized = json!({
        "productId": product_id,
        "operation": operation,
        "title": title,
        "category": category,
        "tags": tags,
        "content": content,
        "summary": str_arg(args, "summary").map(str::to_string)
            .unwrap_or_else(|| str_arg(args, "content").expect("validated above").chars().take(100).collect()),
        // ponytail: JS content.slice(0,100) counts UTF-16 units; chars().take(100) counts
        // Unicode scalars. Identical for BMP (all Chinese); diverges for astral chars (emoji).
        // Upgrade path: UTF-16-aware truncate if emoji-prefixed summaries ever matter.
        "author": str_arg(args, "author").unwrap_or("AI 助手"),
        "readTime": str_arg(args, "readTime").unwrap_or("待阅读"),
    });
    // TS knowledgeParams includes itemId but canonical JSON drops undefined —
    // omit the key entirely when the model did not provide one.
    if let Some(id) = &item_id {
        normalized["itemId"] = json!(id);
    }
    let summary = normalized["summary"].as_str().unwrap_or_default().to_string();
    match confirmations::create_candidate(conn, "knowledge_write", &normalized, Some(&summary), Some(ctx.session_id)) {
        Ok(candidate) => ToolOutcome::AwaitConfirmation {
            candidate: json!({
                "kind": "knowledge_write",
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
                "args": normalized,
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
    if slot_by_code(code).is_none() && !catalog_user_has_code(conn, code) {
        return ToolOutcome::Failed {
            message: "Tool \"generate_deliverable\" arg validation failed: code must be \"prd\" or a DEL-* catalog slot code".into(),
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
            "generate_deliverable", "ingest_scan", "ingest_submit",
            "task_create", "task_update", "task_complete", "task_delete", "task_search",
            "schedule_create", "schedule_update", "schedule_delete", "schedule_search",
            "workflow_search", "workflow_create", "workflow_update", "workflow_delete"
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
        // 29-02: PM reads rerunnable, writes/deletes verify_first
        assert_eq!(idempotency("task_search"), "rerunnable");
        assert_eq!(idempotency("schedule_search"), "rerunnable");
        for t in ["task_create", "task_update", "task_complete", "task_delete",
                  "schedule_create", "schedule_update", "schedule_delete",
                  "workflow_create", "workflow_update", "workflow_delete"] {
            assert_eq!(idempotency(t), "verify_first");
        }
        // 30-02: workflow reads rerunnable; light-write set covers create/update
        assert_eq!(idempotency("workflow_search"), "rerunnable");
        assert!(is_pm_light_write("workflow_create"));
        assert!(is_pm_light_write("workflow_update"));
        assert!(!is_pm_light_write("workflow_delete"));
    }

    /// 30-01: catalog single source — Rust reads the same JSON as TS.
    #[test]
    fn catalog_single_source_shape() {
        assert_eq!(CATALOG.len(), 16, "catalog entry count (plan said 18 — stale)");
        let codes: Vec<&str> = CATALOG.iter().map(|e| e.code.as_str()).collect();
        let mut uniq = codes.clone();
        uniq.sort();
        uniq.dedup();
        assert_eq!(codes.len(), uniq.len(), "codes must be unique");
        assert!(codes.contains(&"DEL-REQ-01"));
        assert!(!codes.contains(&"prd"), "no alias keys in the catalog itself");
        // 'prd' alias + all catalog codes are valid slots; anything else is not.
        assert_eq!(slot_by_code("prd"), Some("DEL-REQ-01"));
        assert!(codes.iter().all(|c| slot_by_code(c).is_some()));
        assert_eq!(slot_by_code("roadmap"), None);
    }

    #[test]
    fn generate_deliverable_queues_candidate_and_dedups() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
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
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
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
        let no_product = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "generate_deliverable", &json!({"code": "prd", "title": "T", "draft": "D"}), &no_product) {
            ToolOutcome::Failed { arg_error: false, .. } => {}
            other => panic!("expected precondition Failed, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_search_executes_fts() {
        let conn = mem_conn();
        seed_knowledge(&conn);
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
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
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
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
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let args = json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践"});
        match execute(&conn, "knowledge_write", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, wait_key, wait_value } => {
                assert_eq!(wait_key, "error");
                assert_eq!(wait_value, "Explicit confirmation is required before writing knowledge.");
                assert_eq!(candidate["kind"], "knowledge_write");
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("candidate row");
                assert_eq!(stored.kind, "knowledge_write");
                // 22-10: candidate params are the TS knowledgeParams(resolveDraft)
                // shape — content "C" < 100 chars so summary == content.
                assert_eq!(stored.params, json!({
                    "productId": "p1", "operation": "created", "title": "T",
                    "category": "最佳实践", "tags": [], "content": "C",
                    "summary": "C", "author": "AI 助手", "readTime": "待阅读",
                }));
                assert_eq!(candidate["args"], stored.params);
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    /* === 22-09 gap closure: knowledge_write category enum parity with TS replay === */

    #[test]
    fn knowledge_write_invalid_category_rejected_pre_candidate() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let args = json!({"productId": "p1", "title": "T", "content": "C", "category": "介绍"});
        match execute(&conn, "knowledge_write", &args, &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("category must be one of"), "{message}");
                // 27-02 D-06 interlock: all 13 categories listed, order-stable.
                assert_eq!(KNOWLEDGE_CATEGORIES.len(), 13);
                for c in KNOWLEDGE_CATEGORIES {
                    assert!(message.contains(c), "missing enum value {c} in: {message}");
                }
                assert!(arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn knowledge_write_valid_category_creates_candidate() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "knowledge_write", &json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["kind"], "knowledge_write");
                assert_eq!(candidate["args"]["category"], "最佳实践");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_write_defaults_tags_to_empty_array() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "knowledge_write", &json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["args"]["tags"], json!([]));
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    /* === 22-08 gap closure: knowledge_write productId ctx fallback === */

    #[test]
    fn knowledge_write_uses_ctx_product_id_when_model_omits_it() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "knowledge_write", &json!({"title": "T", "content": "C", "category": "最佳实践"}), &ctx) {
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
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "knowledge_write", &json!({"title": "T", "content": "C", "category": "最佳实践"}), &ctx) {
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
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "knowledge_write", &json!({"productId": "p9", "title": "T", "content": "C", "category": "最佳实践"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["args"]["productId"], "p9");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    /* === 22-10 gap closure: knowledge_write params_hash TS parity === */

    #[test]
    fn knowledge_write_params_hash_matches_ts_create_path_constant() {
        // Constant computed by the REAL TS code path (computeParamsHash over
        // knowledgeParams(resolveDraft(...))-equivalent object) via npx tsx.
        // Memory-parity precedent: commands.rs:1099.
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let args = json!({"productId": "p1", "title": "T", "content": "C".repeat(120), "category": "最佳实践"});
        match execute(&conn, "knowledge_write", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("candidate row");
                assert_eq!(stored.params_hash, "292fee04f1f110cf2c58fd244a2e1c4435582b9085bb4f6d8b986f1fc792eb4e");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_write_normalizes_to_exact_ts_shape() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let args = json!({"productId": "p1", "title": "T", "content": "X".repeat(150), "category": "最佳实践", "unknownExtra": "junk"});
        match execute(&conn, "knowledge_write", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("candidate row");
                // Exactly the canonical fields — no leftovers from raw model args
                // (itemId absent → key omitted entirely, canonical JSON drops undefined).
                assert_eq!(stored.params.as_object().unwrap().len(), 9);
                assert!(stored.params.get("itemId").is_none());
                assert_eq!(stored.params["operation"], "created");
                assert_eq!(stored.params["summary"], "X".repeat(100));
                assert_eq!(stored.params["author"], "AI 助手");
                assert_eq!(stored.params["readTime"], "待阅读");
                assert_eq!(stored.params["tags"], json!([]));
                assert!(stored.params.get("unknownExtra").is_none());
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_write_preserves_explicit_fields_and_computes_update_operation() {
        let conn = mem_conn();
        seed_knowledge(&conn); // doc_id "d1" exists in knowledge_docs
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let args = json!({"productId": "p1", "itemId": "d1", "title": "T", "content": "C", "category": "最佳实践",
            "tags": ["a", "b"], "summary": "S", "author": "Me", "readTime": "5 min"});
        match execute(&conn, "knowledge_write", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("candidate row");
                assert_eq!(stored.params["itemId"], "d1");
                assert_eq!(stored.params["operation"], "updated");
                assert_eq!(stored.params["tags"], json!(["a", "b"]));
                assert_eq!(stored.params["summary"], "S");
                assert_eq!(stored.params["author"], "Me");
                assert_eq!(stored.params["readTime"], "5 min");
                // unknown itemId → created
                let args2 = json!({"productId": "p1", "itemId": "nope", "title": "T", "content": "C", "category": "最佳实践"});
                match execute(&conn, "knowledge_write", &args2, &ctx) {
                    ToolOutcome::AwaitConfirmation { candidate, .. } => {
                        let t2 = candidate["confirmationToken"].as_str().unwrap();
                        let s2 = confirmations::get(&conn, t2).unwrap().unwrap();
                        assert_eq!(s2.params["operation"], "created");
                    }
                    other => panic!("expected AwaitConfirmation, got {other:?}"),
                }
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn knowledge_write_rejects_bad_tags_pre_card() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        for (args, why) in [
            (json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践", "tags": ["ok", ""]}), "empty string tag"),
            (json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践", "tags": ["ok", 3]}), "non-string tag"),
            (json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践", "tags": (1..=21).map(|i| i.to_string()).collect::<Vec<_>>()}), "21 tags"),
        ] {
            match execute(&conn, "knowledge_write", &args, &ctx) {
                ToolOutcome::Failed { message, arg_error } => {
                    assert!(arg_error, "{why}");
                    assert!(message.contains("tag"), "{why}: {message}");
                }
                other => panic!("{why}: expected Failed, got {other:?}"),
            }
        }
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn memory_write_inserts_memory_candidate_and_waits() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
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
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "createTask", &json!({"title": "x"}), &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "Unknown tool: createTask");
                assert!(!arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    /* === 27-02: ingest_submit (HITL ingestion_batch candidate, D-14 cap) === */

    fn ingest_items() -> Value {
        json!([
            {"id": "ing-aaaa1111", "type": "knowledge", "title": "评审纪要", "content": "正文", "category": "会议纪要", "sourcePath": "docs/a.docx", "contentHash": "aaaa1111ffff"},
            {"id": "ing-bbbb2222", "type": "task_draft", "title": "整理待办", "sourcePath": "docs/a.docx", "contentHash": "aaaa1111ffff"},
            {"id": "ing-cccc3333", "type": "schedule_draft", "title": "周三评审", "sourcePath": "docs/a.docx", "contentHash": "aaaa1111ffff", "selected": false},
        ])
    }

    #[test]
    fn ingest_submit_creates_batch_candidate() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "ingest_submit", &json!({"workspaceId": "w1", "items": ingest_items()}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["kind"], "ingestion_batch");
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("row");
                assert_eq!(stored.kind, "ingestion_batch");
                assert_eq!(stored.params["workspaceId"], "w1");
                assert_eq!(stored.params["productId"], "p1");
                assert_eq!(stored.params["items"].as_array().unwrap().len(), 3);
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn ingest_submit_arg_errors() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let cases = [
            (json!({"items": ingest_items()}), "missing workspaceId"),
            (json!({"workspaceId": "w1", "items": []}), "empty items"),
            (json!({"workspaceId": "w1"}), "missing items"),
            (json!({"workspaceId": "w1", "items": [{"id": "i", "type": "bogus", "title": "t", "sourcePath": "a"}]}), "bad type"),
            (json!({"workspaceId": "w1", "items": [{"id": "i", "type": "knowledge", "title": "t", "content": "c", "category": "介绍", "sourcePath": "a"}]}), "bad category"),
            (json!({"workspaceId": "w1", "items": [{"id": "i", "type": "knowledge", "title": "", "content": "c", "category": "会议纪要", "sourcePath": "a"}]}), "empty title"),
        ];
        for (args, why) in cases {
            match execute(&conn, "ingest_submit", &args, &ctx) {
                ToolOutcome::Failed { arg_error: true, .. } => {}
                other => panic!("{why}: expected arg_error Failed, got {other:?}"),
            }
        }
        // no product in args or ctx → arg_error
        let no_prod = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "ingest_submit", &json!({"workspaceId": "w1", "items": ingest_items()}), &no_prod) {
            ToolOutcome::Failed { arg_error: true, .. } => {}
            other => panic!("no product: expected arg_error Failed, got {other:?}"),
        }
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn ingest_submit_rejects_drafts_over_cap() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        // 6 task_draft on the same sourcePath → D-14 cap 5 exceeded.
        let over: Vec<Value> = (0..6)
            .map(|i| json!({"id": format!("ing-t{i}"), "type": "task_draft", "title": format!("t{i}"), "sourcePath": "docs/same.docx"}))
            .collect();
        match execute(&conn, "ingest_submit", &json!({"workspaceId": "w1", "items": over}), &ctx) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("drafts exceed cap 5"), "{message}");
                assert!(arg_error);
            }
            other => panic!("expected cap Failed, got {other:?}"),
        }
        // 5 on one source + 5 on another → ok (cap is per source document).
        let mixed: Vec<Value> = (0..5)
            .flat_map(|i| [
                json!({"id": format!("ing-a{i}"), "type": "task_draft", "title": "t", "sourcePath": "docs/a.docx"}),
                json!({"id": format!("ing-b{i}"), "type": "schedule_draft", "title": "s", "sourcePath": "docs/b.docx"}),
            ])
            .collect();
        match execute(&conn, "ingest_submit", &json!({"workspaceId": "w1", "items": mixed}), &ctx) {
            ToolOutcome::AwaitConfirmation { .. } => {}
            other => panic!("expected candidate, got {other:?}"),
        }
    }

    /* === 29-02: PM CRUD tools (three-tier risk) === */

    #[test]
    fn task_create_inserts_row_and_returns_id() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "task_create", &json!({"title": "写 PRD", "priority": "high", "deadline": "2026-09-03"}), &ctx) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["created"], true);
                let id = v["taskId"].as_str().unwrap().to_string();
                let (title, prio, status, assignee): (String, String, String, String) = conn
                    .query_row(
                        "SELECT title, priority, status, assignee FROM tasks WHERE id = ?1",
                        rusqlite::params![id],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                    )
                    .unwrap();
                assert_eq!((title.as_str(), prio.as_str(), status.as_str(), assignee.as_str()),
                    ("写 PRD", "high", "未开始", "AI 助手"));
            }
            other => panic!("expected Executed, got {other:?}"),
        }
    }

    #[test]
    fn task_create_arg_errors() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        for (args, why) in [
            (json!({}), "missing title"),
            (json!({"title": "t", "priority": "urgent"}), "bad priority enum"),
        ] {
            match execute(&conn, "task_create", &args, &ctx) {
                ToolOutcome::Failed { message, arg_error: true } => {
                    assert!(message.contains("arg validation failed"), "{why}: {message}");
                }
                other => panic!("{why}: expected arg_error Failed, got {other:?}"),
            }
        }
    }

    #[test]
    fn task_update_and_complete_hit_and_miss() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let id = pm_store::insert_task(&conn, &json!({"title": "T"})).unwrap();
        match execute(&conn, "task_update", &json!({"taskId": id, "updates": {"status": "进行中"}}), &ctx) {
            ToolOutcome::Executed(v) => assert_eq!(v["updated"], true),
            other => panic!("expected Executed, got {other:?}"),
        }
        match execute(&conn, "task_complete", &json!({"taskId": id}), &ctx) {
            ToolOutcome::Executed(v) => assert_eq!(v["completed"], true),
            other => panic!("expected Executed, got {other:?}"),
        }
        let status: String = conn.query_row("SELECT status FROM tasks WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
        assert_eq!(status, "已完成");
        // unknown id → non-arg failure; empty updates → arg_error
        match execute(&conn, "task_update", &json!({"taskId": "nope", "updates": {"status": "进行中"}}), &ctx) {
            ToolOutcome::Failed { arg_error: false, .. } => {}
            other => panic!("expected miss Failed, got {other:?}"),
        }
        match execute(&conn, "task_update", &json!({"taskId": id, "updates": {}}), &ctx) {
            ToolOutcome::Failed { arg_error: true, .. } => {}
            other => panic!("expected arg_error, got {other:?}"),
        }
    }

    #[test]
    fn task_delete_returns_pm_write_candidate_and_dedups() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let id = pm_store::insert_task(&conn, &json!({"title": "要删的任务"})).unwrap();
        let args = json!({"taskId": id});
        let token = match execute(&conn, "task_delete", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, wait_key, wait_value } => {
                assert_eq!(wait_key, "error");
                assert_eq!(wait_value, CONFIRMATION_REQUIRED_PM_WRITE);
                assert_eq!(candidate["kind"], "pm_write");
                assert_eq!(candidate["action"], "task_delete");
                assert_eq!(candidate["title"], "要删的任务");
                candidate["confirmationToken"].as_str().unwrap().to_string()
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        };
        // row still present (delete only happens on confirm)
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        // stored candidate params carry action/taskId/title
        let stored = confirmations::get(&conn, &token).unwrap().expect("row");
        assert_eq!(stored.kind, "pm_write");
        assert_eq!(stored.params, json!({"action": "task_delete", "taskId": id, "title": "要删的任务"}));
        // same args → dedup to same token
        match execute(&conn, "task_delete", &args, &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["confirmationToken"].as_str().unwrap(), token);
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
        // unknown id → non-arg failure
        match execute(&conn, "task_delete", &json!({"taskId": "missing"}), &ctx) {
            ToolOutcome::Failed { arg_error: false, .. } => {}
            other => panic!("expected miss Failed, got {other:?}"),
        }
    }

    #[test]
    fn schedule_crud_roundtrip_via_tools() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        let id = match execute(&conn, "schedule_create",
            &json!({"title": "评审会", "date": "2026-09-03", "time": "10:00", "type": "meeting"}), &ctx) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["created"], true);
                v["eventId"].as_str().unwrap().to_string()
            }
            other => panic!("expected Executed, got {other:?}"),
        };
        match execute(&conn, "schedule_create", &json!({"title": "x", "date": "d", "type": "party"}), &ctx) {
            ToolOutcome::Failed { message, arg_error: true } => assert!(message.contains("type must be one of"), "{message}"),
            other => panic!("expected arg_error, got {other:?}"),
        }
        match execute(&conn, "schedule_update", &json!({"eventId": id, "updates": {"time": "11:00"}}), &ctx) {
            ToolOutcome::Executed(v) => assert_eq!(v["updated"], true),
            other => panic!("expected Executed, got {other:?}"),
        }
        match execute(&conn, "schedule_delete", &json!({"eventId": id}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["kind"], "pm_write");
                assert_eq!(candidate["action"], "schedule_delete");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
        // still present
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM schedules WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        match execute(&conn, "schedule_update", &json!({"eventId": "nope", "updates": {"time": "11:00"}}), &ctx) {
            ToolOutcome::Failed { arg_error: false, .. } => {}
            other => panic!("expected miss Failed, got {other:?}"),
        }
    }

    #[test]
    fn pm_create_defaults_project_id_from_ctx() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        match execute(&conn, "task_create", &json!({"title": "t"}), &ctx) {
            ToolOutcome::Executed(v) => {
                let id = v["taskId"].as_str().unwrap();
                let pid: Option<String> = conn.query_row("SELECT project_id FROM tasks WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
                assert_eq!(pid.as_deref(), Some("p1"));
            }
            other => panic!("expected Executed, got {other:?}"),
        }
        // explicit projectId wins over ctx
        match execute(&conn, "schedule_create", &json!({"title": "s", "date": "2026-09-03", "type": "meeting", "projectId": "p2"}), &ctx) {
            ToolOutcome::Executed(v) => {
                let id = v["eventId"].as_str().unwrap();
                let pid: Option<String> = conn.query_row("SELECT project_id FROM schedules WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
                assert_eq!(pid.as_deref(), Some("p2"));
            }
            other => panic!("expected Executed, got {other:?}"),
        }
        match execute(&conn, "schedule_create", &json!({"title": "s2", "date": "2026-09-03", "type": "meeting"}), &ctx) {
            ToolOutcome::Executed(v) => {
                let id = v["eventId"].as_str().unwrap();
                let pid: Option<String> = conn.query_row("SELECT project_id FROM schedules WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
                assert_eq!(pid.as_deref(), Some("p1"));
            }
            other => panic!("expected Executed, got {other:?}"),
        }
    }

    #[test]
    fn pm_search_filters_and_limit_cap() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        pm_store::insert_task(&conn, &json!({"title": "a", "status": "未开始"})).unwrap();
        pm_store::insert_task(&conn, &json!({"title": "b", "status": "进行中"})).unwrap();
        match execute(&conn, "task_search", &json!({"status": "未开始"}), &ctx) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["count"], 1);
                assert_eq!(v["matches"][0]["title"], "a");
            }
            other => panic!("expected Executed, got {other:?}"),
        }
        pm_store::upsert_schedule_from_json(&conn, &json!({"title": "s", "date": "2026-09-03", "type": "sync"})).unwrap();
        match execute(&conn, "schedule_search", &json!({"date": "2026-09-03", "type": "sync"}), &ctx) {
            ToolOutcome::Executed(v) => assert_eq!(v["count"], 1),
            other => panic!("expected Executed, got {other:?}"),
        }
        // limit over 50 → arg_error
        for tool in ["task_search", "schedule_search"] {
            match execute(&conn, tool, &json!({"limit": 51}), &ctx) {
                ToolOutcome::Failed { message, arg_error: true } => assert!(message.contains("out of range"), "{message}"),
                other => panic!("expected arg_error, got {other:?}"),
            }
        }
    }

    #[test]
    fn pm_light_write_cap_escalates_to_pm_write() {
        let conn = mem_conn();
        let capped = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: PM_WRITE_CAP };
        match execute(&conn, "task_create", &json!({"title": "第6条"}), &capped) {
            ToolOutcome::AwaitConfirmation { candidate, wait_value, .. } => {
                assert_eq!(wait_value, CONFIRMATION_REQUIRED_PM_WRITE);
                assert_eq!(candidate["kind"], "pm_write");
                assert_eq!(candidate["action"], "task_create");
                assert!(candidate["reason"].as_str().unwrap().contains("cap"), "{}", candidate);
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("row");
                assert_eq!(stored.params["action"], "task_create");
                assert_eq!(stored.params["args"]["title"], "第6条");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
        // escalated candidate params carry the ctx product fallback (consume
        // replays them with no run ctx — UAT step 7 gap)
        let capped_pid = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: PM_WRITE_CAP };
        match execute(&conn, "task_create", &json!({"title": "第7条"}), &capped_pid) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("row");
                assert_eq!(stored.params["args"]["projectId"], "p1");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
        // nothing landed
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        // one under the cap writes normally
        let under = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: PM_WRITE_CAP - 1 };
        match execute(&conn, "task_create", &json!({"title": "第5条"}), &under) {
            ToolOutcome::Executed(v) => assert_eq!(v["created"], true),
            other => panic!("expected Executed, got {other:?}"),
        }
    }

    #[test]
    fn is_pm_light_write_set() {
        assert!(is_pm_light_write("task_create"));
        assert!(is_pm_light_write("schedule_update"));
        assert!(!is_pm_light_write("task_delete"));
        assert!(!is_pm_light_write("task_search"));
        assert!(!is_pm_light_write("knowledge_search"));
    }

    /* === 30-02: workflow template tools === */

    #[test]
    fn workflow_crud_via_tools_three_tiers() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: 0 };
        // search: builtin ∪ user, keyword filter
        match execute(&conn, "workflow_search", &json!({}), &ctx) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["count"], BUILTIN_WORKFLOWS.len(), "user layer empty → builtin only");
                assert!(v["matches"].as_array().unwrap().iter().all(|t| t["source"] == json!("builtin")));
            }
            other => panic!("expected Executed, got {other:?}"),
        }
        // create: light write lands immediately
        let id = match execute(&conn, "workflow_create", &json!({
            "name": "周末扫描", "steps": [{"name": "扫描", "prompt": "扫描知识库新增"}]
        }), &ctx) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["created"], true);
                v["id"].as_str().unwrap().to_string()
            }
            other => panic!("expected Executed, got {other:?}"),
        };
        // create: 'builtin' source rejected
        match execute(&conn, "workflow_create", &json!({"name": "x", "steps": [{"name": "s", "prompt": "p"}], "source": "builtin"}), &ctx) {
            ToolOutcome::Failed { message, arg_error: true } => assert!(message.contains("source"), "{message}"),
            other => panic!("expected arg_error, got {other:?}"),
        }
        // search now sees user layer merged with builtin
        match execute(&conn, "workflow_search", &json!({"query": "周末"}), &ctx) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["count"], 1);
                assert_eq!(v["matches"][0]["source"], "user");
                assert_eq!(v["matches"][0]["stepCount"], 1);
            }
            other => panic!("expected Executed, got {other:?}"),
        }
        // update: whole steps replace
        match execute(&conn, "workflow_update", &json!({"id": id, "steps": [{"name": "S1", "prompt": "P1"}, {"name": "S2", "prompt": "P2"}]}), &ctx) {
            ToolOutcome::Executed(v) => assert_eq!(v["updated"], true),
            other => panic!("expected Executed, got {other:?}"),
        }
        // delete: pm_write candidate, row still present
        match execute(&conn, "workflow_delete", &json!({"id": id}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, wait_value, .. } => {
                assert_eq!(wait_value, CONFIRMATION_REQUIRED_PM_WRITE);
                assert_eq!(candidate["kind"], "pm_write");
                assert_eq!(candidate["action"], "workflow_delete");
                assert_eq!(candidate["name"], "周末扫描");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM workflow_templates WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap();
        assert_eq!(n, 1, "delete only happens on confirm");
        // unknown id → non-arg failure
        match execute(&conn, "workflow_delete", &json!({"id": "missing"}), &ctx) {
            ToolOutcome::Failed { arg_error: false, .. } => {}
            other => panic!("expected miss Failed, got {other:?}"),
        }
    }

    #[test]
    fn workflow_light_write_counts_toward_cap5() {
        let conn = mem_conn();
        let capped = ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: None, pm_writes_used: PM_WRITE_CAP };
        match execute(&conn, "workflow_create", &json!({"name": "第6条", "steps": [{"name": "s", "prompt": "p"}]}), &capped) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                assert_eq!(candidate["kind"], "pm_write");
                assert_eq!(candidate["action"], "workflow_create");
            }
            other => panic!("expected cap escalation, got {other:?}"),
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM workflow_templates", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0, "nothing landed past the cap");
    }

    /// SC-4: user catalog codes extend the generate_deliverable code enum.
    #[test]
    fn generate_deliverable_accepts_user_catalog_code() {
        let conn = mem_conn();
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None, repo_root: None, pm_writes_used: 0 };
        workflow_store::insert_catalog_user(&conn, &json!({"code": "DEL-USR-01", "title": "自定义产物"})).unwrap();
        match execute(&conn, "generate_deliverable", &json!({"code": "DEL-USR-01", "title": "T", "draft": "D"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => assert_eq!(candidate["code"], "DEL-USR-01"),
            other => panic!("expected candidate, got {other:?}"),
        }
        match execute(&conn, "generate_deliverable", &json!({"code": "DEL-USR-99", "title": "T", "draft": "D"}), &ctx) {
            ToolOutcome::Failed { arg_error: true, .. } => {}
            other => panic!("expected arg_error, got {other:?}"),
        }
    }
}
