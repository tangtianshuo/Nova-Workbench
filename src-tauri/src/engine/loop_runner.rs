// src-tauri/src/engine/loop_runner.rs
// Phase 22 (22-05) — port of src/ai/toolLoop.ts (Phase 13 Plan 03).
// Single-history event-driven loop: NO second messages array — every LLM
// request re-derives messages from the ChatSession projection over the event
// log. MAX_ITERATIONS=8 (22-08); four tool_result payload shapes are field-for-field
// from toolLoop.ts (WAIT / error / success + tool_call); turn-end audit runs
// check_event_stream and fails the run on violations (plan-mandated hardening
// over the TS console.error).
//
// LLM access is trait-injected (tests script fake turns; 22-06 wires an
// adapter over llm::chat_with_tools). Compaction summarizer likewise.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::engine::channel::{EngineEvent, EngineRunResult};
use crate::engine::chat_session::{ChatRole, ChatSession, LlmMessage, DEFAULT_TOKEN_BUDGET};
use crate::engine::{code_ops, compaction, context_assembler, event_log, tools};

pub const MAX_ITERATIONS: u32 = 8;

// toolLoop.ts:47
pub type EventCallback = Arc<dyn Fn(EngineEvent) + Send + Sync>;
pub type TokenSink = Arc<dyn Fn(String) + Send + Sync>;
pub type BoxLlmFuture = Pin<Box<dyn Future<Output = Result<LlmTurn, String>> + Send>>;

#[derive(Debug, Clone)]
pub struct LlmToolCall {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone)]
pub struct LlmTurn {
    pub content: String,
    pub tool_calls: Vec<LlmToolCall>,
}

/// Scriptable LLM boundary (production adapter wraps llm::chat_with_tools).
pub trait Llm: Send {
    fn chat(&mut self, messages: Vec<LlmMessage>, system_prompt: String, on_token: TokenSink) -> BoxLlmFuture;
    /// No-tools call for the budget-exhaustion wrap-up turn (22-08): the model
    /// cannot emit tool calls, forcing a direct answer.
    fn chat_no_tools(&mut self, messages: Vec<LlmMessage>, system_prompt: String, on_token: TokenSink) -> BoxLlmFuture;
}

#[derive(Debug)]
pub enum LoopError {
    Cancelled,
    Llm(String),
    Db(String),
    Audit(String),
}

impl std::fmt::Display for LoopError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoopError::Cancelled => write!(f, "cancelled"),
            LoopError::Llm(m) => write!(f, "llm: {m}"),
            LoopError::Db(m) => write!(f, "db: {m}"),
            LoopError::Audit(m) => write!(f, "{m}"),
        }
    }
}
impl std::error::Error for LoopError {}

pub struct LoopContext<'a> {
    pub conn: &'a Connection,
    pub session_id: String,
    pub user_message: String,
    pub workspace_id: Option<String>,
    pub product_id: Option<String>,
    pub provider: String,
    pub ollama_model: Option<String>,
    /// Active workspace root (23-01): webview-supplied folderPath threaded
    /// webview → engine_run → here → ToolCtx. None = no workspace bound.
    pub workspace_root: Option<std::path::PathBuf>,
    /// Core business facts (TS buildCoreContext); caller-supplied (22-06 wiring).
    pub core_context: String,
    pub llm: Box<dyn Llm + 'a>,
    /// Compaction summarizer; None disables compaction (pressure never relieved).
    pub summarizer: Option<&'a mut dyn FnMut(&str) -> Result<String, String>>,
    /// 32-07: resume mode — skip the user_message append and continue the
    /// session from its existing event projection (post-HITL-settle续跑).
    pub resume: bool,
}

// Phase 23 (23-04) adapted guideline block: lists the ACTUAL native tool set
// (exec/fs/knowledge/deliverable) + the PM CRUD degradation note (no-bridge
// ruling: task/schedule CRUD return as Rust-native tools in v0.3.3; until then
// the model guides the user to act manually). NOT the original Phase 10 PM
// guideline text — that returns together with the tools in v0.3.3.
// Date context is a 22-06 wiring concern.
const ROLE_AND_TOOL_RULES: &str = "You are Nova, an AI assistant for product, task, schedule, and workspace management.\nUse the current workspace context as the source of truth. Use tools for workspace facts and mutations instead of inventing IDs or state.\nAvailable native tools: knowledge_search / knowledge_write (product knowledge; writes need user confirmation), memory_write (long-term memory proposals), exec (read-only shell commands in the workspace; others need approval), fs_list / fs_read / fs_write / fs_mkdir / fs_delete / fs_move (workspace files; writes need user confirmation), generate_deliverable (queue a deliverable draft for user confirmation, code \"prd\" or a DEL-* catalog slot — you write the full draft content yourself in the draft parameter), and PM CRUD tools: task_create / task_update / task_complete / task_search, schedule_create / schedule_update / schedule_search apply immediately without confirmation; task_delete / schedule_delete require user confirmation via a candidate card. Act on the user's behalf with the light-write tools instead of telling them to do it manually.\nAfter a tool call, explain the result briefly and mention any failed or ambiguous items.\nKnowledge search is budgeted: perform at most 1-2 knowledge_search calls per question, then STOP searching and answer directly from the results you already have. Never enumerate the whole knowledge base.\nIf a tool call fails, read the error message, fix the arguments ONCE, and move on; if it fails again, tell the user what failed and what you need (e.g. select a product) instead of retrying. Never invent confirmation prompts or numbered-choice menus.\nWorkflow templates: workflow_search / workflow_create / workflow_update apply immediately (counted toward the light-write budget); workflow_delete requires user confirmation. Templates are reference playbooks the user runs on demand.";

pub fn build_system_prompt(core_context: &str) -> String {
    // Local date/weekday: without it the model shells out to `date` for "明天" (UAT-29 step 2),
    // which fails on Windows where date is a shell builtin, not an executable.
    use chrono::Datelike;
    let now = chrono::Local::now();
    format!(
        "{ROLE_AND_TOOL_RULES}\n\n## 当前日期\n\n{} ({})——相对日期(今天/明天/下周X)直接据此换算,禁止用 exec 查询日期。\n\n## Phase 9 Current Workspace Context\n\n{core_context}",
        now.format("%Y-%m-%d"),
        now.weekday()
    )
}

/// 30-02: append the workflow template short list (builtin ∪ user, ≤30) to the
/// system prompt so the user can say 「帮我跑 X」. Truncation note:
// TODO v0.4: FTS5 retrieval (D-08) instead of a truncated name list.
pub fn append_workflow_list(conn: &Connection, prompt: String) -> String {
    let mut names = tools::builtin_workflow_names();
    if let Ok(rows) = crate::engine::workflow_store::list_workflows(conn) {
        names.extend(rows.iter().filter_map(|r| r["name"].as_str().map(String::from)));
    }
    if names.is_empty() {
        return prompt;
    }
    names.truncate(30);
    format!("{prompt}\n\n## 可用工作流模板\n\n- {}", names.join(" / "))
}

/* === helpers === */

struct EventScope {
    session_id: String,
    workspace_id: Option<String>,
    product_id: Option<String>,
    correlation_id: String,
}

fn append_event(
    conn: &Connection,
    scope: &EventScope,
    event_type: &str,
    payload: Value,
    on_event: &EventCallback,
) -> Result<i64, LoopError> {
    let seq = event_log::append(
        conn,
        &event_log::EventInput {
            session_id: scope.session_id.clone(),
            event_type: event_type.to_string(),
            workspace_id: scope.workspace_id.clone(),
            product_id: scope.product_id.clone(),
            project_id: None,
            correlation_id: Some(scope.correlation_id.clone()),
            payload,
        },
    )
    .map_err(|e| LoopError::Db(e.to_string()))?;
    on_event(EngineEvent::EventCommitted { seq, event_type: event_type.to_string() });
    Ok(seq)
}

/// endTurn (toolLoop.ts:149-160): record turn_ended, then a loud audit —
/// invariant violations at turn end fail the run (plan hardening).
fn end_turn(
    conn: &Connection,
    scope: &EventScope,
    outcome: &str,
    iterations: u32,
    tool_calls_executed: u32,
    on_event: &EventCallback,
) -> Result<(), LoopError> {
    append_event(
        conn,
        scope,
        "turn_ended",
        json!({
            "outcome": outcome,
            "iterations": iterations,
            "toolCallsExecuted": tool_calls_executed,
            "correlationId": scope.correlation_id,
        }),
        on_event,
    )?;
    let events = event_log::list_events(conn, &scope.session_id).map_err(|e| LoopError::Db(e.to_string()))?;
    event_log::check_event_stream(&events).map_err(LoopError::Audit)
}

fn finish(
    result: EngineRunResult,
    on_event: &EventCallback,
) -> Result<EngineRunResult, LoopError> {
    on_event(EngineEvent::Done { result: result.clone() });
    Ok(result)
}

/* === run_tool_loop (toolLoop.ts:110-282) === */

pub async fn run_tool_loop(
    mut ctx: LoopContext<'_>,
    cancel: CancellationToken,
    on_event: EventCallback,
) -> Result<EngineRunResult, LoopError> {
    // One turn = one correlation id; every event emitted this run carries it.
    let scope = EventScope {
        session_id: ctx.session_id.clone(),
        workspace_id: ctx.workspace_id.clone(),
        product_id: ctx.product_id.clone(),
        correlation_id: uuid::Uuid::new_v4().to_string(),
    };

    // SESS-05: sessions row at first turn; later turns bump last_active_at.
    // TS fire-and-forget; synchronous here (sole-writer writes must not be lost).
    event_log::upsert_session(
        ctx.conn,
        &scope.session_id,
        ctx.workspace_id.as_deref(),
        None,
        None,
        None,
        None,
    )
    .map_err(|e| LoopError::Db(e.to_string()))?;

    // Lazy session_created: emitted at the FIRST event write, ordered first.
    let existing = event_log::list_events(ctx.conn, &scope.session_id).map_err(|e| LoopError::Db(e.to_string()))?;
    if existing.is_empty() {
        append_event(
            ctx.conn,
            &scope,
            "session_created",
            json!({"sessionId": scope.session_id, "tokenBudget": DEFAULT_TOKEN_BUDGET}),
            &on_event,
        )?;
    }
    // 32-07: resume mode skips the user_message append — the session already
    // carries the settled tool_result; the loop continues from the projection.
    if !ctx.resume {
        append_event(ctx.conn, &scope, "user_message", json!({"content": ctx.user_message}), &on_event)?;
    }

    // MEM-08 five-segment injection; only the assembled path emits the audit.
    let assembled = context_assembler::assemble_context(
        ctx.conn,
        &ctx.core_context,
        ctx.product_id.as_deref(),
        &ctx.user_message,
    );
    let core_context = assembled["coreContext"].as_str().unwrap_or_default().to_string();
    // 32-01: repo binding read once per run (per-workspace row) — also gates
    // the ENGINE-01 research-first contract (32-05).
    let repo_root = scope.workspace_id.as_deref().and_then(|wid| code_ops::get_repo_root(ctx.conn, wid));
    let system_prompt = context_assembler::append_code_contract(
        append_workflow_list(ctx.conn, build_system_prompt(&core_context)),
        repo_root.as_deref(),
    );
    append_event(ctx.conn, &scope, "context_injected", assembled["audit"].clone(), &on_event)?;

    let mut arg_error_count: HashMap<String, u32> = HashMap::new();
    let mut content = String::new();
    let mut tool_calls_executed: u32 = 0;
    // 29-02 cap-5: confirmation-free PM writes this run (per-run local — a new
    // engine_run starts at 0). The 6th light write escalates to pm_write HITL.
    let mut pm_writes_used: u32 = 0;

    for iteration in 1..=MAX_ITERATIONS {
        // CMP-01: compact at a pairing-balanced turn boundary BEFORE the next
        // LLM request when token pressure >= 0.8 x budget.
        if let Some(summarizer) = ctx.summarizer.as_mut() {
            let events =
                event_log::list_events(ctx.conn, &scope.session_id).map_err(|e| LoopError::Db(e.to_string()))?;
            let mut session = ChatSession::from_events(&events, Some(scope.session_id.clone()), None);
            compaction::maybe_compact_session(
                ctx.conn,
                &mut session,
                &ctx.provider,
                ctx.ollama_model.as_deref(),
                false,
                summarizer,
            )
            .map_err(|e| LoopError::Db(e.to_string()))?;
        }

        // Single source of truth: derive messages from the session projection.
        let events =
            event_log::list_events(ctx.conn, &scope.session_id).map_err(|e| LoopError::Db(e.to_string()))?;
        let session = ChatSession::from_events(&events, Some(scope.session_id.clone()), None);
        let messages: Vec<LlmMessage> = session
            .get_messages_for_llm_default()
            .into_iter()
            .map(|m| LlmMessage {
                role: if m.role == ChatRole::Tool { ChatRole::User } else { m.role },
                content: m.content,
            })
            .collect();

        if cancel.is_cancelled() {
            return Err(LoopError::Cancelled);
        }
        let token_sink: TokenSink = {
            let on_event = on_event.clone();
            Arc::new(move |text| on_event(EngineEvent::Token { text }))
        };
        let turn = ctx
            .llm
            .chat(messages, system_prompt.clone(), token_sink)
            .await
            .map_err(LoopError::Llm)?;
        if cancel.is_cancelled() {
            return Err(LoopError::Cancelled);
        }
        content = turn.content;

        if turn.tool_calls.is_empty() {
            append_event(ctx.conn, &scope, "assistant_message", json!({"content": content}), &on_event)?;
            end_turn(ctx.conn, &scope, "completed", iteration, tool_calls_executed, &on_event)?;
            return finish(
                EngineRunResult {
                    content,
                    iterations: iteration,
                    tool_calls_executed,
                    truncated: false,
                    pending_confirmation: None,
                },
                &on_event,
            );
        }

        for call in turn.tool_calls {
            // EVT-06: UUID toolCallId.
            let tool_call_id = uuid::Uuid::new_v4().to_string();
            let call_content = if content.is_empty() { "[requesting tools]".to_string() } else { content.clone() };
            append_event(
                ctx.conn,
                &scope,
                "tool_call",
                json!({
                    "toolCallId": tool_call_id,
                    "toolName": call.name,
                    "args": call.arguments,
                    "content": call_content,
                    "idempotency": tools::idempotency(&call.name),
                }),
                &on_event,
            )?;
            on_event(EngineEvent::ToolStart { name: call.name.clone(), target: tools::tool_target(&call.name, &call.arguments) });

            let tool_ctx = tools::ToolCtx {
                session_id: &scope.session_id,
                product_id: ctx.product_id.as_deref(),
                workspace_root: ctx.workspace_root.clone(),
                // 32-01: repo binding read once per run (outer, shared with the
                // prompt contract above).
                repo_root: repo_root.clone(),
                pm_writes_used,
            };
            match tools::execute_async(ctx.conn, &call.name, &call.arguments, &tool_ctx, cancel.clone(), on_event.as_ref()).await {
                tools::ToolOutcome::AwaitConfirmation { candidate, wait_key, wait_value } => {
                    // WAIT lands as a normal tool_result ({ok:false} semantics)
                    // so tool_call/tool_result pairing stays balanced across the pause.
                    on_event(EngineEvent::ToolEnd { name: call.name.clone(), ok: true });
                    let detail = serde_json::to_string(&wait_value).unwrap_or_default();
                    let wait_text = format!(
                        "[tool_result {}] {{\"ok\":false,\"awaitingConfirmation\":true,\"{wait_key}\":{detail}}}",
                        call.name
                    );
                    let mut payload = json!({
                        "toolCallId": tool_call_id,
                        "toolName": call.name,
                        "modelText": wait_text,
                        "ok": false,
                        "awaitingConfirmation": true,
                    });
                    payload[wait_key] = json!(wait_value);
                    append_event(ctx.conn, &scope, "tool_result", payload, &on_event)?;
                    on_event(EngineEvent::Confirmation { candidate: candidate.clone() });
                    end_turn(ctx.conn, &scope, "awaiting_confirmation", iteration, tool_calls_executed, &on_event)?;
                    return finish(
                        EngineRunResult {
                            content,
                            iterations: iteration,
                            tool_calls_executed,
                            truncated: false,
                            pending_confirmation: Some(candidate),
                        },
                        &on_event,
                    );
                }
                tools::ToolOutcome::Executed(value) => {
                    tool_calls_executed += 1;
                    // Cap-5 input: count confirmation-free PM writes (judged by
                    // tool name after execution — escalation WAITs don't count).
                    if tools::is_pm_light_write(&call.name) {
                        pm_writes_used += 1;
                    }
                    on_event(EngineEvent::ToolEnd { name: call.name.clone(), ok: true });
                    // EVT-08: >4KB results artifact-ized; model keeps summary + head.
                    let prepared = event_log::prepare_tool_result(ctx.conn, &scope.session_id, &call.name, &value)
                        .map_err(|e| LoopError::Db(e.to_string()))?;
                    append_event(
                        ctx.conn,
                        &scope,
                        "tool_result",
                        json!({
                            "toolCallId": tool_call_id,
                            "toolName": call.name,
                            "modelText": prepared.model_text,
                            "ok": true,
                            "artifactId": prepared.artifact_id,
                        }),
                        &on_event,
                    )?;
                }
                tools::ToolOutcome::Failed { message, arg_error } => {
                    on_event(EngineEvent::ToolEnd { name: call.name.clone(), ok: false });
                    let previous_errors = arg_error_count.get(&call.name).copied().unwrap_or(0);
                    let is_retry_available = arg_error && previous_errors < 1;
                    if arg_error {
                        arg_error_count.insert(call.name.clone(), previous_errors + 1);
                    }
                    let error_text = format!(
                        "[tool_error {}] {}. {}",
                        call.name,
                        message,
                        if is_retry_available {
                            "Please correct the arguments and retry once."
                        } else {
                            "No more argument retries are available for this tool call."
                        }
                    );
                    append_event(
                        ctx.conn,
                        &scope,
                        "tool_result",
                        json!({
                            "toolCallId": tool_call_id,
                            "toolName": call.name,
                            "modelText": error_text,
                            "ok": false,
                            "error": message,
                            "retryAvailable": is_retry_available,
                        }),
                        &on_event,
                    )?;
                }
            }
        }
    }

    // Budget exhausted — force a no-tools wrap-up turn instead of dying with
    // an English limit marker (22-08 gap closure: Test 2/Test 4).
    let wrap_prompt = format!("{system_prompt}\n\nTool call budget is now exhausted. Using the tool results above, answer the user directly in Chinese. Do NOT mention tools, limits, or call any more tools.");
    let events = event_log::list_events(ctx.conn, &scope.session_id).map_err(|e| LoopError::Db(e.to_string()))?;
    let session = ChatSession::from_events(&events, Some(scope.session_id.clone()), None);
    let messages: Vec<LlmMessage> = session
        .get_messages_for_llm_default()
        .into_iter()
        .map(|m| LlmMessage {
            role: if m.role == ChatRole::Tool { ChatRole::User } else { m.role },
            content: m.content,
        })
        .collect();
    if cancel.is_cancelled() {
        return Err(LoopError::Cancelled);
    }
    let token_sink: TokenSink = {
        let on_event = on_event.clone();
        Arc::new(move |text| on_event(EngineEvent::Token { text }))
    };
    let final_turn = ctx
        .llm
        .chat_no_tools(messages, wrap_prompt, token_sink)
        .await
        .map_err(LoopError::Llm)?;
    append_event(ctx.conn, &scope, "assistant_message", json!({"content": final_turn.content}), &on_event)?;
    end_turn(ctx.conn, &scope, "tool_limit", MAX_ITERATIONS, tool_calls_executed, &on_event)?;
    finish(
        EngineRunResult {
            content: final_turn.content,
            iterations: MAX_ITERATIONS + 1,
            tool_calls_executed,
            truncated: false,
            pending_confirmation: None,
        },
        &on_event,
    )
}

/* === Tests (mock-LLM ports of the toolLoop turn shapes) === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use crate::engine::event_log::AgentEvent;
    use std::collections::VecDeque;

    struct FakeLlm {
        turns: Mutex<VecDeque<Result<LlmTurn, String>>>,
    }

    impl FakeLlm {
        fn new(turns: Vec<LlmTurn>) -> Self {
            FakeLlm {
                turns: Mutex::new(turns.into_iter().map(Ok).collect()),
            }
        }
    }

    impl Llm for FakeLlm {
        fn chat(&mut self, _messages: Vec<LlmMessage>, _system_prompt: String, on_token: TokenSink) -> BoxLlmFuture {
            let turn = self.turns.lock().unwrap().pop_front().expect("scripted turn");
            Box::pin(async move {
                on_token("流".into());
                turn
            })
        }

        fn chat_no_tools(&mut self, messages: Vec<LlmMessage>, system_prompt: String, on_token: TokenSink) -> BoxLlmFuture {
            self.chat(messages, system_prompt, on_token)
        }
    }

    fn ctx<'a>(conn: &'a Connection, llm: FakeLlm) -> LoopContext<'a> {
        ctx_root(conn, llm, None)
    }

    fn ctx_root<'a>(conn: &'a Connection, llm: FakeLlm, root: Option<std::path::PathBuf>) -> LoopContext<'a> {
        LoopContext {
            conn,
            session_id: "s1".into(),
            user_message: "帮我查需求".into(),
            workspace_id: Some("w1".into()),
            product_id: None,
            provider: "deepseek".into(),
            ollama_model: None,
            workspace_root: root,
            core_context: "核心事实".into(),
            llm: Box::new(llm),
            summarizer: None,
            resume: false,
        }
    }

    fn events_of(conn: &Connection) -> Vec<AgentEvent> {
        event_log::list_events(conn, "s1").unwrap()
    }

    fn run(
        conn: &Connection,
        llm: FakeLlm,
        cancel: CancellationToken,
    ) -> (Result<EngineRunResult, LoopError>, Vec<Value>) {
        run_root(conn, llm, cancel, None)
    }

    fn run_root(
        conn: &Connection,
        llm: FakeLlm,
        cancel: CancellationToken,
        root: Option<std::path::PathBuf>,
    ) -> (Result<EngineRunResult, LoopError>, Vec<Value>) {
        // Test-only event capture via serialized wire form.
        let log = Arc::new(Mutex::new(Vec::<Value>::new()));
        let on_event: EventCallback = {
            let log = log.clone();
            Arc::new(move |e: EngineEvent| log.lock().unwrap().push(serde_json::to_value(&e).unwrap()))
        };
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let result = rt.block_on(run_tool_loop(ctx_root(conn, llm, root), cancel, on_event));
        let wire = log.lock().unwrap().clone();
        (result, wire)
    }

    // EngineEvent deserialization isn't derived; compare wire JSON instead.
    fn kinds(events: &[Value]) -> Vec<&str> {
        events.iter().map(|e| e["kind"].as_str().unwrap()).collect()
    }

    // 23-04 tool guideline; 29-02: PM CRUD tools are live (degradation note removed).
    #[test]
    fn system_prompt_lists_native_and_pm_crud_tools() {
        let prompt = build_system_prompt("核心事实");
        // PM CRUD guidance present, old degradation wording gone...
        assert!(!prompt.contains("not available in this version"));
        assert!(prompt.contains("without confirmation"), "{prompt}");
        assert!(prompt.contains("task_delete / schedule_delete require user confirmation"));
        // UAT-29: local date injected so the model never execs `date` for relative dates.
        assert!(prompt.contains("当前日期"), "{prompt}");
        assert!(prompt.contains("禁止用 exec 查询日期"));
        // ...describing every native tool...
        for name in [
            "knowledge_search", "knowledge_write", "memory_write", "exec",
            "fs_list", "fs_read", "fs_write", "fs_mkdir", "fs_delete", "fs_move",
            "generate_deliverable",
            "task_create", "task_update", "task_complete", "task_delete", "task_search",
            "schedule_create", "schedule_update", "schedule_delete", "schedule_search",
        ] {
            assert!(prompt.contains(name), "prompt missing {name}");
        }
        assert!(prompt.ends_with("核心事实"));
        // 22-08 gap closure: search budget + failure recovery rules locked.
        assert!(prompt.contains("at most 1-2 knowledge_search calls"));
        assert!(prompt.contains("Never invent confirmation prompts"));
        // ...and the model schema carries NO PM CRUD tool (TOOL-03 lock).
        let schemas = tools::schemas();
        let names: Vec<&str> = schemas.iter().map(|s| s["name"].as_str().unwrap()).collect();
        for absent in ["createTask", "updateTask", "deleteTask", "createSchedule", "updateSchedule", "createProject"] {
            assert!(!names.contains(&absent), "schema must not contain {absent}");
        }
        assert_eq!(schemas.len(), 30); // 29-02 +9 PM CRUD; 30-02 +4 workflow; 32-03 +4 code tools
    }

    // 30-02: template short list appended to the system prompt (builtin ∪ user).
    #[test]
    fn workflow_list_appended_to_system_prompt() {
        let conn = mem_conn();
        let prompt = append_workflow_list(&conn, build_system_prompt("核心事实"));
        assert!(prompt.contains("可用工作流模板"), "{prompt}");
        assert!(prompt.contains("竞品深度分析"), "builtin names present");
        crate::engine::workflow_store::insert_workflow(
            &conn,
            &serde_json::json!({"name": "周末扫描", "steps": [{"name": "s", "prompt": "p"}]}),
            "user",
        )
        .unwrap();
        let prompt2 = append_workflow_list(&conn, String::new());
        assert!(prompt2.contains("周末扫描"), "user template names present");
        // ≤30 truncation holds (2 builtin + N user)
        let many: Vec<serde_json::Value> = (0..40)
            .map(|i| serde_json::json!({"name": format!("模板{i}"), "steps": []}))
            .collect();
        for t in &many {
            crate::engine::workflow_store::insert_workflow(&conn, t, "user").unwrap();
        }
        let prompt3 = append_workflow_list(&conn, String::new());
        let listed = prompt3.rsplit("- ").next().unwrap().split(" / ").count();
        assert_eq!(listed, 30, "capped at 30 names");
        // ROLE_AND_TOOL_RULES carries the workflow risk sentence
        assert!(prompt.contains("workflow_delete requires user confirmation"));
        assert!(prompt.contains("Templates are reference playbooks"));
    }

    #[test]
    fn pure_reply_turn() {
        let conn = mem_conn();
        let llm = FakeLlm::new(vec![LlmTurn { content: "好的，已完成".into(), tool_calls: vec![] }]);
        let (result, wire) = run(&conn, llm, CancellationToken::new());
        let result = result.unwrap();
        assert_eq!(result.content, "好的，已完成");
        assert_eq!(result.iterations, 1);
        assert_eq!(result.tool_calls_executed, 0);
        assert!(!result.truncated);
        assert!(result.pending_confirmation.is_none());

        let types: Vec<String> = events_of(&conn).into_iter().map(|e| e.event_type).collect();
        assert_eq!(
            types,
            vec!["session_created", "user_message", "context_injected", "assistant_message", "turn_ended"]
        );
        let turn = events_of(&conn)[4].payload.clone();
        assert_eq!(turn["outcome"], "completed");
        assert_eq!(turn["iterations"], 1);
        assert_eq!(turn["toolCallsExecuted"], 0);
        assert!(turn["correlationId"].is_string());
        // all events stamped with the same correlation id
        assert!(events_of(&conn).iter().all(|e| e.correlation_id == events_of(&conn)[1].correlation_id));

        // channel: token + 5 commits + done
        let ks = kinds(&wire);
        assert!(ks.contains(&"token"));
        assert_eq!(ks.iter().filter(|k| **k == "event").count(), 5);
        assert_eq!(*ks.last().unwrap(), "done");
        assert_eq!(wire.last().unwrap()["data"]["result"]["content"], "好的，已完成");

        // session row upserted
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions WHERE session_id = 's1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn single_readonly_tool_turn() {
        let conn = mem_conn();
        let llm = FakeLlm::new(vec![
            LlmTurn {
                content: String::new(),
                tool_calls: vec![LlmToolCall { name: "knowledge_search".into(), arguments: json!({"query": "需求"}) }],
            },
            LlmTurn { content: "查完了".into(), tool_calls: vec![] },
        ]);
        let (result, _) = run(&conn, llm, CancellationToken::new());
        let result = result.unwrap();
        assert_eq!(result.iterations, 2);
        assert_eq!(result.tool_calls_executed, 1);

        let events = events_of(&conn);
        let tool_call = events.iter().find(|e| e.event_type == "tool_call").unwrap().payload.clone();
        assert!(tool_call["toolCallId"].as_str().unwrap().len() == 36);
        assert_eq!(tool_call["toolName"], "knowledge_search");
        assert_eq!(tool_call["args"], json!({"query": "需求"}));
        assert_eq!(tool_call["content"], "[requesting tools]");
        assert_eq!(tool_call["idempotency"], "rerunnable");

        let tool_result = events.iter().find(|e| e.event_type == "tool_result").unwrap().payload.clone();
        assert_eq!(tool_result["ok"], true);
        assert_eq!(tool_result["artifactId"], Value::Null);
        // serde_json BTreeMap key order inside data (accepted 22-04 divergence:
        // key order differs from TS JSON.stringify — semantics unaffected)
        assert_eq!(
            tool_result["modelText"].as_str().unwrap(),
            "[tool_result knowledge_search] {\"ok\":true,\"data\":{\"matches\":[],\"productId\":null,\"query\":\"需求\",\"retrieval\":\"fts5-hybrid\"}}"
        );
    }

    #[test]
    fn wait_turn_payload_and_pending_confirmation() {
        let conn = mem_conn();
        let llm = FakeLlm::new(vec![LlmTurn {
            content: "我来写入知识库".into(),
            tool_calls: vec![LlmToolCall {
                name: "knowledge_write".into(),
                arguments: json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践"}),
            }],
        }]);
        let (result, wire) = run(&conn, llm, CancellationToken::new());
        let result = result.unwrap();
        assert_eq!(result.content, "我来写入知识库");
        assert_eq!(result.tool_calls_executed, 0); // WAIT does not count
        let pending = result.pending_confirmation.expect("pending candidate");
        assert_eq!(pending["kind"], "knowledge_write");

        let events = events_of(&conn);
        let tool_result = events.iter().find(|e| e.event_type == "tool_result").unwrap().payload.clone();
        assert_eq!(
            tool_result["modelText"].as_str().unwrap(),
            "[tool_result knowledge_write] {\"ok\":false,\"awaitingConfirmation\":true,\"error\":\"Explicit confirmation is required before writing knowledge.\"}"
        );
        assert_eq!(tool_result["ok"], false);
        assert_eq!(tool_result["awaitingConfirmation"], true);
        assert_eq!(
            tool_result["error"],
            "Explicit confirmation is required before writing knowledge."
        );
        let turn = events.iter().find(|e| e.event_type == "turn_ended").unwrap().payload.clone();
        assert_eq!(turn["outcome"], "awaiting_confirmation");

        // channel: confirmation emitted; tool_end ok=true
        let ks = kinds(&wire);
        assert!(ks.contains(&"confirmation"));
        let tool_end = wire.iter().find(|e| e["kind"] == "tool_end").unwrap();
        assert_eq!(tool_end["data"]["ok"], true);

        // candidate row persisted
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM agent_confirmation_candidates WHERE kind = 'knowledge_write'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn arg_error_retry_then_exhausted() {
        let conn = mem_conn();
        let bad = LlmToolCall { name: "knowledge_search".into(), arguments: json!({}) };
        let llm = FakeLlm::new(vec![
            LlmTurn { content: String::new(), tool_calls: vec![bad.clone()] },
            LlmTurn { content: String::new(), tool_calls: vec![bad] },
            LlmTurn { content: "结束".into(), tool_calls: vec![] },
        ]);
        let (result, _) = run(&conn, llm, CancellationToken::new());
        assert_eq!(result.unwrap().iterations, 3);

        let results: Vec<Value> = events_of(&conn)
            .iter()
            .filter(|e| e.event_type == "tool_result")
            .map(|e| e.payload.clone())
            .collect();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["retryAvailable"], true);
        assert_eq!(results[1]["retryAvailable"], false);
        assert!(
            results[0]["modelText"].as_str().unwrap().ends_with("Please correct the arguments and retry once."),
            "{}", results[0]["modelText"]
        );
        assert!(
            results[1]["modelText"].as_str().unwrap().ends_with("No more argument retries are available for this tool call."),
            "{}", results[1]["modelText"]
        );
    }

    // 22-08: budget exhaustion forces a no-tools wrap-up turn (was: English
    // limit marker + truncated=true).
    #[test]
    fn max_iterations_forces_wrapup_turn() {
        let conn = mem_conn();
        let tool_turn = || LlmTurn {
            content: "继续".into(),
            tool_calls: vec![LlmToolCall { name: "knowledge_search".into(), arguments: json!({"query": "x"}) }],
        };
        let mut turns: Vec<_> = (0..MAX_ITERATIONS).map(|_| tool_turn()).collect();
        turns.push(LlmTurn { content: "根据以上检索结果，结论如下。".into(), tool_calls: vec![] });
        let llm = FakeLlm::new(turns);
        let (result, _) = run(&conn, llm, CancellationToken::new());
        let result = result.unwrap();
        assert!(!result.truncated);
        assert_eq!(result.iterations, MAX_ITERATIONS + 1);
        assert_eq!(result.tool_calls_executed, MAX_ITERATIONS);
        assert_eq!(result.content, "根据以上检索结果，结论如下。");
        let events = events_of(&conn);
        let turn = events.iter().find(|e| e.event_type == "turn_ended").unwrap().payload.clone();
        assert_eq!(turn["outcome"], "tool_limit");
        // English limit marker must be gone from every event payload.
        assert!(
            !events.iter().any(|e| e.payload.to_string().contains("iteration limit")),
            "no event payload may contain the old limit marker"
        );
        // Final assistant_message carries the scripted wrap-up text verbatim.
        let last_assistant = events.iter().rev().find(|e| e.event_type == "assistant_message").unwrap().payload.clone();
        assert_eq!(last_assistant["content"], "根据以上检索结果，结论如下。");
    }

    // 22-08 gap closure (Test 5 exact failure shape): model omits productId,
    // ctx has a product selected → HITL card appears instead of arg_error
    // retries + fabricated confirmation text.
    #[test]
    fn knowledge_write_missing_product_id_uses_ctx() {
        let conn = mem_conn();
        let llm = FakeLlm::new(vec![LlmTurn {
            content: "我来写入知识库".into(),
            tool_calls: vec![LlmToolCall {
                name: "knowledge_write".into(),
                arguments: json!({"title": "T", "content": "C", "category": "最佳实践"}),
            }],
        }]);
        let mut context = ctx_root(&conn, llm, None);
        context.product_id = Some("p1".into());
        let on_event: EventCallback = Arc::new(|_| {});
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let result = rt.block_on(run_tool_loop(context, CancellationToken::new(), on_event)).unwrap();
        assert_eq!(result.tool_calls_executed, 0);
        let pending = result.pending_confirmation.expect("pending candidate");
        assert_eq!(pending["kind"], "knowledge_write");
        assert_eq!(pending["args"]["productId"], "p1");
        let turn = events_of(&conn).iter().find(|e| e.event_type == "turn_ended").unwrap().payload.clone();
        assert_eq!(turn["outcome"], "awaiting_confirmation");
    }

    #[test]
    fn audit_failure_fails_the_run() {
        let conn = mem_conn();
        // Pre-existing orphan tool_call → turn-end audit must fail loudly.
        event_log::append(
            &conn,
            &event_log::EventInput {
                session_id: "s1".into(),
                event_type: "tool_call".into(),
                workspace_id: None,
                product_id: None,
                project_id: None,
                correlation_id: None,
                payload: json!({"toolCallId": "orphan", "toolName": "x"}),
            },
        )
        .unwrap();
        let llm = FakeLlm::new(vec![LlmTurn { content: "done".into(), tool_calls: vec![] }]);
        let (result, _) = run(&conn, llm, CancellationToken::new());
        match result.unwrap_err() {
            LoopError::Audit(message) => assert!(message.contains("MISSING_TOOL_RESULT"), "{message}"),
            other => panic!("expected Audit, got {other:?}"),
        }
    }

    #[test]
    fn cancelled_before_first_llm_call() {
        let conn = mem_conn();
        let llm = FakeLlm::new(vec![LlmTurn { content: "never".into(), tool_calls: vec![] }]);
        let cancel = CancellationToken::new();
        cancel.cancel();
        let (result, _) = run(&conn, llm, cancel);
        assert!(matches!(result.unwrap_err(), LoopError::Cancelled));
        // events up to the cancel point stay consistent (pairing balanced)
        assert!(event_log::check_event_stream(&events_of(&conn)).is_ok());
    }

    /* === 23-05: TOOL-04 loop-level integration locks (headless == headed) === */

    #[test]
    fn exec_whitelisted_runs_headless_and_settles() {
        let conn = mem_conn();
        let root = std::env::temp_dir().join(format!("nova-loopexec-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        // Learned whitelist entry for the platform echo (headless run, no
        // webview anywhere on the exec path — TOOL-04).
        let (command, args): (&str, Vec<String>) = if cfg!(windows) {
            ("cmd", vec!["/c".into(), "echo loopok".into()])
        } else {
            ("echo", vec!["loopok".into()])
        };
        // 32-02: session s1 carries workspace w1 → workspace-scoped kv key.
        // Pre-upsert so the key resolution matches the post-upsert loop read.
        event_log::upsert_session(&conn, "s1", Some("w1"), None, None, None, None).unwrap();
        crate::engine::exec::add_command_to_whitelist(
            &conn,
            &crate::engine::exec::whitelist_key_for_session(&conn, "s1"),
            command,
            None,
        )
        .unwrap();
        let llm = FakeLlm::new(vec![
            LlmTurn {
                content: String::new(),
                tool_calls: vec![LlmToolCall {
                    name: "exec".into(),
                    arguments: json!({"command": command, "args": args}),
                }],
            },
            LlmTurn { content: "跑完了".into(), tool_calls: vec![] },
        ]);
        let (result, wire) = run_root(&conn, llm, CancellationToken::new(), Some(root.clone()));
        let result = result.unwrap();
        assert_eq!(result.tool_calls_executed, 1);
        assert!(result.pending_confirmation.is_none());

        // tool_result landed ok with the subprocess's own output + exit code
        // (spawn_core awaited the child — exit means exited).
        let tool_result = events_of(&conn)
            .iter()
            .find(|e| e.event_type == "tool_result")
            .unwrap()
            .payload
            .clone();
        assert_eq!(tool_result["ok"], true);
        assert!(tool_result["modelText"].as_str().unwrap().contains("loopok"), "{}", tool_result["modelText"]);
        assert!(tool_result["modelText"].as_str().unwrap().contains("\"exitCode\":0"), "{}", tool_result["modelText"]);

        // EngineEvent stream carried tool_output (line-streamed stdout)
        assert!(
            wire.iter().any(|e| e["kind"] == "tool_output"),
            "tool_output missing from channel: {:?}",
            kinds(&wire)
        );
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn exec_off_whitelist_waits_with_approval_candidate() {
        let conn = mem_conn();
        let root = std::env::temp_dir().join(format!("nova-loopwait-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let llm = FakeLlm::new(vec![LlmTurn {
            content: "我要跑个命令".into(),
            tool_calls: vec![LlmToolCall {
                name: "exec".into(),
                arguments: json!({"command": "definitely_not_a_command_xyz", "args": []}),
            }],
        }]);
        let (result, _) = run_root(&conn, llm, CancellationToken::new(), Some(root.clone()));
        let result = result.unwrap();
        assert_eq!(result.tool_calls_executed, 0);
        let pending = result.pending_confirmation.expect("WAIT candidate");
        assert_eq!(pending["kind"], "exec_approval");
        assert!(pending["confirmationToken"].is_string());

        // WAIT tool_result + candidate row persisted; nothing executed.
        let tool_result = events_of(&conn)
            .iter()
            .find(|e| e.event_type == "tool_result")
            .unwrap()
            .payload
            .clone();
        assert_eq!(tool_result["awaitingConfirmation"], true);
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM agent_confirmation_candidates WHERE kind = 'exec_approval'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        std::fs::remove_dir_all(&root).ok();
    }

    /* === 29-02: cap-5 per-run escalation (loop-level) === */

    #[test]
    fn sixth_pm_light_write_in_one_run_escalates_to_pm_write() {
        let conn = mem_conn();
        // 6 task_create calls in a single turn: first 5 write, 6th escalates.
        let calls: Vec<LlmToolCall> = (0..6)
            .map(|i| LlmToolCall {
                name: "task_create".into(),
                arguments: json!({"title": format!("任务{i}")}),
            })
            .collect();
        let llm = FakeLlm::new(vec![LlmTurn { content: String::new(), tool_calls: calls }]);
        let (result, _) = run(&conn, llm, CancellationToken::new());
        let result = result.unwrap();
        // 5 landed, run ended awaiting confirmation on the 6th.
        assert_eq!(result.tool_calls_executed, 5);
        let pending = result.pending_confirmation.expect("escalation candidate");
        assert_eq!(pending["kind"], "pm_write");
        assert_eq!(pending["action"], "task_create");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 5);
        let turn = events_of(&conn).iter().find(|e| e.event_type == "turn_ended").unwrap().payload.clone();
        assert_eq!(turn["outcome"], "awaiting_confirmation");
    }

    /* === 32-07: resume mode (HITL settle 续跑) === */

    /// Capture LLM messages (FakeLlm that records every chat() call's input).
    /// Shared via Arc so the test can read the captures after the run.
    type SeenMessages = Arc<Mutex<Vec<Vec<LlmMessage>>>>;
    struct RecordingLlm {
        turns: Mutex<VecDeque<Result<LlmTurn, String>>>,
        seen: SeenMessages,
    }

    impl Llm for RecordingLlm {
        fn chat(&mut self, messages: Vec<LlmMessage>, _system_prompt: String, _on_token: TokenSink) -> BoxLlmFuture {
            self.seen.lock().unwrap().push(messages);
            let turn = self.turns.lock().unwrap().pop_front().expect("scripted turn");
            Box::pin(async { turn })
        }

        fn chat_no_tools(&mut self, messages: Vec<LlmMessage>, system_prompt: String, on_token: TokenSink) -> BoxLlmFuture {
            self.chat(messages, system_prompt, on_token)
        }
    }

    /// Seed a session parked at awaiting_confirmation (run 1 WAITs on
    /// knowledge_write), then settle a [confirmed rerun] tool_call/tool_result
    /// pair the way engine_exec_confirmed does.
    fn seed_awaiting_then_settle(conn: &Connection, marker: &str) {
        let llm = FakeLlm::new(vec![LlmTurn {
            content: "我来写入知识库".into(),
            tool_calls: vec![LlmToolCall {
                name: "knowledge_write".into(),
                arguments: json!({"productId": "p1", "title": "T", "content": "C", "category": "最佳实践"}),
            }],
        }]);
        let (result, _) = run(conn, llm, CancellationToken::new());
        assert!(result.unwrap().pending_confirmation.is_some(), "run 1 parks at WAIT");

        let rerun_id = uuid::Uuid::new_v4().to_string();
        for (event_type, payload) in [
            ("tool_call", json!({
                "toolCallId": rerun_id, "toolName": "knowledge_write",
                "args": {"productId": "p1", "title": "T", "content": "C", "category": "最佳实践"},
                "content": "[confirmed rerun]", "idempotency": "verify_first",
            })),
            ("tool_result", json!({
                "toolCallId": rerun_id, "toolName": "knowledge_write",
                "modelText": format!("[tool_result knowledge_write] {{\"ok\":true,\"data\":{{\"marker\":\"{marker}\"}}}}"),
                "ok": true,
            })),
        ] {
            event_log::append(conn, &event_log::EventInput {
                session_id: "s1".into(),
                event_type: event_type.into(),
                workspace_id: None,
                product_id: None,
                project_id: None,
                correlation_id: None,
                payload,
            })
            .unwrap();
        }
    }

    fn run_resume<L: Llm>(
        conn: &Connection,
        llm: L,
    ) -> Result<EngineRunResult, LoopError> {
        let ctx = LoopContext {
            conn,
            session_id: "s1".into(),
            user_message: String::new(),
            workspace_id: Some("w1".into()),
            product_id: None,
            provider: "deepseek".into(),
            ollama_model: None,
            workspace_root: None,
            core_context: "核心事实".into(),
            llm: Box::new(llm),
            summarizer: None,
            resume: true,
        };
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(run_tool_loop(ctx, CancellationToken::new(), Arc::new(|_| {})))
    }

    // Test 1: resume run adds context_injected + assistant_message +
    // turn_ended(completed) and NEVER a second user_message.
    #[test]
    fn resume_run_continues_without_new_user_message() {
        let conn = mem_conn();
        seed_awaiting_then_settle(&conn, "done");
        let result = run_resume(&conn, FakeLlm::new(vec![LlmTurn { content: "根据结果回答".into(), tool_calls: vec![] }]))
            .unwrap();
        assert_eq!(result.content, "根据结果回答");

        let events = events_of(&conn);
        let user_messages = events.iter().filter(|e| e.event_type == "user_message").count();
        assert_eq!(user_messages, 1, "resume must not append a second user_message");
        // run-2 tail: context_injected → assistant_message → turn_ended(completed)
        let tail: Vec<&str> = events.iter().rev().take(3).map(|e| e.event_type.as_str()).collect();
        assert_eq!(tail, vec!["turn_ended", "assistant_message", "context_injected"]);
        let turn = events.iter().rev().find(|e| e.event_type == "turn_ended").unwrap();
        assert_eq!(turn.payload["outcome"], "completed");
    }

    // Test 2: the first resume LLM request carries the [confirmed rerun]
    // tool_result modelText (the settle landed in the projection).
    #[test]
    fn resume_llm_request_sees_confirmed_rerun_tool_result() {
        let conn = mem_conn();
        seed_awaiting_then_settle(&conn, "CONFIRMED_OUTPUT_MARKER");
        let seen: SeenMessages = Arc::new(Mutex::new(Vec::new()));
        let llm = RecordingLlm {
            turns: Mutex::new(vec![Ok(LlmTurn { content: "收到".into(), tool_calls: vec![] })].into()),
            seen: seen.clone(),
        };
        run_resume(&conn, llm).unwrap();
        let first_request = seen.lock().unwrap().first().cloned().expect("one LLM call");
        assert!(
            first_request.iter().any(|m| m.content.contains("CONFIRMED_OUTPUT_MARKER")),
            "confirmed rerun tool_result must reach the resume LLM request: {first_request:?}"
        );
    }



    #[test]
    fn two_runs_parallel_file_db_streams_isolated() {
        use crate::engine::db::testing::{file_conn, open_file};
        let conn = file_conn("sched_parallel");
        let path = std::path::PathBuf::from(conn.path().expect("file-backed").to_string());

        // Each thread opens its own Connection (24-01 engine_run shape) and
        // runs a full fake-LLM turn against its own session.
        let run_turn = |path: std::path::PathBuf, session: String| {
            std::thread::spawn(move || {
                let conn = open_file(&path);
                let llm = FakeLlm::new(vec![LlmTurn { content: format!("done-{session}"), tool_calls: vec![] }]);
                let ctx = LoopContext {
                    conn: &conn,
                    session_id: session,
                    user_message: "并行run".into(),
                    workspace_id: None,
                    product_id: None,
                    provider: "deepseek".into(),
                    ollama_model: None,
                    workspace_root: None,
                    core_context: "核心事实".into(),
                    llm: Box::new(llm),
                    summarizer: None,
                    resume: false,
                };
                let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
                rt.block_on(run_tool_loop(ctx, CancellationToken::new(), Arc::new(|_| {}))).is_ok()
            })
        };
        let t1 = run_turn(path.clone(), "s1".into());
        let t2 = run_turn(path, "s2".into());
        assert!(t1.join().unwrap(), "run s1 ok");
        assert!(t2.join().unwrap(), "run s2 ok");

        // Each session's events are contiguous 1..=n with no cross-talk —
        // the seq invariant holds under concurrent multi-connection writes.
        for session in ["s1", "s2"] {
            let events = event_log::list_events(&conn, session).unwrap();
            assert!(events.len() >= 2, "{session} has user+assistant events");
            assert_eq!(
                events.iter().map(|e| e.seq).collect::<Vec<_>>(),
                (1..=events.len() as i64).collect::<Vec<_>>(),
                "{session} seq contiguous"
            );
        }
    }
}
