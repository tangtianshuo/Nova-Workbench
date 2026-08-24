// src-tauri/src/engine/loop_runner.rs
// Phase 22 (22-05) — port of src/ai/toolLoop.ts (Phase 13 Plan 03).
// Single-history event-driven loop: NO second messages array — every LLM
// request re-derives messages from the ChatSession projection over the event
// log. MAX_ITERATIONS=5; four tool_result payload shapes are field-for-field
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
use crate::engine::{compaction, context_assembler, event_log, tools};

pub const MAX_ITERATIONS: u32 = 5;

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
    /// Core business facts (TS buildCoreContext); caller-supplied (22-06 wiring).
    pub core_context: String,
    pub llm: Box<dyn Llm + 'a>,
    /// Compaction summarizer; None disables compaction (pressure never relieved).
    pub summarizer: Option<&'a mut dyn FnMut(&str) -> Result<String, String>>,
}

// prompts.ts PHASE_9_ROLE_AND_TOOL_RULES verbatim. The Phase 10 task/schedule
// guideline block is NOT included: those PM tools are unregistered in Phase 22
// (orchestrator ruling) — Phase 23 re-adds tools and this prompt together.
// Date context is likewise a 22-06 wiring concern.
const ROLE_AND_TOOL_RULES: &str = "You are Nova, an AI assistant for product, task, schedule, and workspace management.\nUse the current workspace context as the source of truth. Use tools for workspace facts and mutations instead of inventing IDs or state.\nAfter a tool call, explain the result briefly and mention any failed or ambiguous items.";

pub fn build_system_prompt(core_context: &str) -> String {
    format!("{ROLE_AND_TOOL_RULES}\n\n## Phase 9 Current Workspace Context\n\n{core_context}")
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
    append_event(ctx.conn, &scope, "user_message", json!({"content": ctx.user_message}), &on_event)?;

    // MEM-08 five-segment injection; only the assembled path emits the audit.
    let assembled = context_assembler::assemble_context(
        ctx.conn,
        &ctx.core_context,
        ctx.product_id.as_deref(),
        &ctx.user_message,
    );
    let core_context = assembled["coreContext"].as_str().unwrap_or_default().to_string();
    let system_prompt = build_system_prompt(&core_context);
    append_event(ctx.conn, &scope, "context_injected", assembled["audit"].clone(), &on_event)?;

    let mut arg_error_count: HashMap<String, u32> = HashMap::new();
    let mut content = String::new();
    let mut tool_calls_executed: u32 = 0;

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
            on_event(EngineEvent::ToolStart { name: call.name.clone() });

            let tool_ctx = tools::ToolCtx {
                session_id: &scope.session_id,
                product_id: ctx.product_id.as_deref(),
            };
            match tools::execute(ctx.conn, &call.name, &call.arguments, &tool_ctx) {
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

    let limited_content = format!(
        "{}{}[tool loop reached the {MAX_ITERATIONS}-iteration limit]",
        content,
        if content.is_empty() { "" } else { "\n\n" }
    );
    append_event(
        ctx.conn,
        &scope,
        "assistant_message",
        json!({"content": limited_content}),
        &on_event,
    )?;
    end_turn(ctx.conn, &scope, "tool_limit", MAX_ITERATIONS, tool_calls_executed, &on_event)?;
    finish(
        EngineRunResult {
            content: limited_content,
            iterations: MAX_ITERATIONS,
            tool_calls_executed,
            truncated: true,
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
    }

    fn ctx<'a>(conn: &'a Connection, llm: FakeLlm) -> LoopContext<'a> {
        LoopContext {
            conn,
            session_id: "s1".into(),
            user_message: "帮我查需求".into(),
            workspace_id: Some("w1".into()),
            product_id: None,
            provider: "deepseek".into(),
            ollama_model: None,
            core_context: "核心事实".into(),
            llm: Box::new(llm),
            summarizer: None,
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
        // Test-only event capture via serialized wire form.
        let log = Arc::new(Mutex::new(Vec::<Value>::new()));
        let on_event: EventCallback = {
            let log = log.clone();
            Arc::new(move |e: EngineEvent| log.lock().unwrap().push(serde_json::to_value(&e).unwrap()))
        };
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let result = rt.block_on(run_tool_loop(ctx(conn, llm), cancel, on_event));
        let wire = log.lock().unwrap().clone();
        (result, wire)
    }

    // EngineEvent deserialization isn't derived; compare wire JSON instead.
    fn kinds(events: &[Value]) -> Vec<&str> {
        events.iter().map(|e| e["kind"].as_str().unwrap()).collect()
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
                arguments: json!({"productId": "p1", "title": "T", "content": "C"}),
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

    #[test]
    fn max_iterations_truncates() {
        let conn = mem_conn();
        let tool_turn = || LlmTurn {
            content: "继续".into(),
            tool_calls: vec![LlmToolCall { name: "knowledge_search".into(), arguments: json!({"query": "x"}) }],
        };
        let llm = FakeLlm::new(vec![tool_turn(); 5]);
        let (result, _) = run(&conn, llm, CancellationToken::new());
        let result = result.unwrap();
        assert!(result.truncated);
        assert_eq!(result.iterations, 5);
        assert_eq!(result.tool_calls_executed, 5);
        assert!(result.content.ends_with("[tool loop reached the 5-iteration limit]"));
        let turn = events_of(&conn).iter().find(|e| e.event_type == "turn_ended").unwrap().payload.clone();
        assert_eq!(turn["outcome"], "tool_limit");
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
}
