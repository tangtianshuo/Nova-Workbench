// src-tauri/src/engine/commands.rs
// Phase 22 (22-06) — the five engine_* Tauri commands + run registry wiring.
// `engine_run` moves the sole-writer Connection onto a blocking thread with a
// current-thread tokio runtime (std MutexGuards cannot cross await points, and
// rusqlite Connection is !Sync) — same shape the loop_runner tests use.

use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::engine::channel::{EngineEvent, EngineRunResult};
use crate::engine::event_log::{self, EventInput};
use crate::engine::chat_session::LlmMessage;
use crate::engine::loop_runner::{self, BoxLlmFuture, EventCallback, Llm, LlmToolCall, LlmTurn, LoopContext, LoopError, TokenSink};
use crate::engine::{confirmations, exec, fs_ops, tools};
use crate::error::AppError;
use crate::llm::{self, ChatMessage, Provider};
use crate::state::AppState;

/// Sole-writer DB handle, managed in lib.rs setup. `None` until the async
/// open+assert completes (or forever if open fails — commands then error).
pub struct EngineDb(pub Mutex<Option<Connection>>);

/* === Production Llm adapter over llm::chat_with_tools (22-05 trait seam) === */

struct EngineLlm {
    provider: Provider,
    api_key: String,
    ollama_model: Option<String>,
    cancel: CancellationToken,
}

impl Llm for EngineLlm {
    fn chat(&mut self, messages: Vec<LlmMessage>, system_prompt: String, on_token: TokenSink) -> BoxLlmFuture {
        let provider = self.provider;
        let api_key = self.api_key.clone();
        let ollama_model = self.ollama_model.clone();
        let cancel = self.cancel.clone();
        Box::pin(async move {
            let chat_messages: Vec<ChatMessage> = messages
                .into_iter()
                .map(|m| ChatMessage { role: m.role.as_str().to_string(), content: m.content })
                .collect();
            // Token forwarding: chat_with_tools streams StreamChunk to a Channel;
            // parse the tagged wire shape and pump the engine TokenSink.
            let sink = on_token.clone();
            let channel: Channel<crate::commands::StreamChunk> = Channel::new(move |body| {
                if let tauri::ipc::InvokeResponseBody::Json(raw) = body {
                    if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                        if v["kind"] == "token" {
                            if let Some(text) = v["data"]["text"].as_str() {
                                sink(text.to_string());
                            }
                        }
                    }
                }
                Ok(())
            });
            let result = llm::chat_with_tools(
                provider,
                &api_key,
                ollama_model,
                chat_messages,
                tools::schemas(),
                system_prompt,
                &channel,
                &cancel,
            )
            .await
            .map_err(|e| e.to_string())?;
            Ok(LlmTurn {
                content: result.content,
                tool_calls: result
                    .tool_calls
                    .into_iter()
                    .map(|c| LlmToolCall { name: c.name, arguments: c.arguments })
                    .collect(),
            })
        })
    }
}

/// Sync compaction summarizer bridged onto a worker thread (CompactionSummarizer
/// is a sync closure; the LLM call is async). Errors fail compaction only.
fn summarizer_bridge(
    provider: Provider,
    api_key: String,
    ollama_model: Option<String>,
    cancel: CancellationToken,
) -> impl FnMut(&str) -> Result<String, String> {
    move |transcript: &str| {
        let (tx, rx) = std::sync::mpsc::channel();
        let prompt = transcript.to_string();
        let (provider, api_key, ollama_model, cancel) = (provider, api_key.clone(), ollama_model.clone(), cancel.clone());
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("summarizer runtime");
            let channel: Channel<crate::commands::StreamChunk> = Channel::new(|_| Ok(()));
            let result = rt.block_on(llm::chat_with_tools(
                provider,
                &api_key,
                ollama_model,
                vec![ChatMessage { role: "user".into(), content: prompt }],
                vec![],
                String::new(),
                &channel,
                &cancel,
            ));
            let _ = tx.send(result.map(|r| r.content).map_err(|e| e.to_string()));
        });
        rx.recv().map_err(|e| e.to_string()).and_then(|r| r)
    }
}

/* === Commands === */

/// Run one full agent turn through the Rust engine. Registers a run_id →
/// CancellationToken in AppState.engine_runs for `engine_cancel`.
#[tauri::command]
pub async fn engine_run(
    run_id: Option<String>,
    user_message: String,
    session_id: String,
    provider: String,
    ollama_model: Option<String>,
    workspace_id: Option<String>,
    product_id: Option<String>,
    // Active workspace folderPath (23-01): fs/exec tool root. Optional —
    // None leaves those tools Failed-safe.
    workspace_root: Option<String>,
    core_context: String,
    on_event: Channel<EngineEvent>,
    state: State<'_, AppState>,
    db: State<'_, EngineDb>,
) -> Result<EngineRunResult, AppError> {
    let provider: Provider = serde_json::from_value(Value::String(provider))
        .map_err(|e| AppError::ParseError(format!("unknown provider: {e}")))?;
    let api_key = if provider.requires_api_key() {
        crate::keychain::get_provider_key(&provider)?
    } else {
        String::new()
    };

    // Sole-writer checkout: one engine run at a time (Mutex<Connection> guard
    // cannot cross an await; move the Connection onto a blocking thread instead).
    let conn = db
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| AppError::InternalError("engine busy: another run holds the DB".into()))?;

    // Webview-supplied run_id (cancel key, chat/cancel_chat requestId pattern);
    // minted here when absent so raw invoke callers still work.
    let run_id = run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let cancel = CancellationToken::new();
    state.engine_runs.lock().unwrap().insert(run_id.clone(), cancel.clone());

    let err_channel = on_event.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("engine runtime");
        let event_channel = on_event.clone();
        let on_event_cb: EventCallback = Arc::new(move |e: EngineEvent| {
            let _ = event_channel.send(e);
        });
        let llm_adapter = EngineLlm {
            provider,
            api_key: api_key.clone(),
            ollama_model: ollama_model.clone(),
            cancel: cancel.clone(),
        };
        let mut summarizer = summarizer_bridge(provider, api_key.clone(), ollama_model.clone(), cancel.clone());
        let ctx = LoopContext {
            conn: &conn,
            session_id,
            user_message,
            workspace_id,
            product_id,
            provider: provider.to_string(),
            ollama_model,
            workspace_root: workspace_root.map(std::path::PathBuf::from),
            core_context,
            llm: Box::new(llm_adapter),
            summarizer: Some(&mut summarizer),
        };
        let result = rt.block_on(loop_runner::run_tool_loop(ctx, cancel, on_event_cb));
        (conn, result)
    });

    let (conn, result) = match handle.await {
        Ok(joined) => joined,
        Err(e) => {
            // Thread panicked before returning the conn — reopen path is the
            // setup task's job; report and leave the slot empty (next app run
            // restores it). Extremely unlikely.
            state.engine_runs.lock().unwrap().remove(&run_id);
            return Err(AppError::InternalError(format!("engine thread failed: {e}")));
        }
    };
    *db.0.lock().unwrap() = Some(conn);
    state.engine_runs.lock().unwrap().remove(&run_id);

    match result {
        Ok(run_result) => Ok(run_result),
        Err(LoopError::Cancelled) => Err(AppError::Cancelled),
        Err(e) => {
            let _ = err_channel.send(EngineEvent::Error { message: e.to_string() });
            Err(AppError::InternalError(e.to_string()))
        }
    }
}

/// Cancel an in-flight engine run. Idempotent — Ok whether or not the run_id
/// is still registered (the run may have ended naturally). Cancelling a
/// confirmation-waiting state is a candidate REJECT (engine_reject_candidate)
/// — the run itself has already ended there.
#[tauri::command]
pub async fn engine_cancel(run_id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    if let Some(token) = state.engine_runs.lock().unwrap().remove(&run_id) {
        token.cancel();
    }
    Ok(())
}

/// Confirm a HITL candidate (atomic conditional UPDATE; idempotent re-confirm).
#[tauri::command]
pub async fn engine_confirm_candidate(
    token: String,
    db: State<'_, EngineDb>,
) -> Result<(), AppError> {
    with_conn(&db, |conn| {
        confirmations::confirm(conn, &token)
            .map(|_| ())
            .map_err(|f| AppError::InternalError(f.to_string()))
    })
}

/// Reject a HITL candidate. Ok(()) even when the token is unknown/already
/// settled — reject is the cancel semantics, and cancelling twice is fine.
#[tauri::command]
pub async fn engine_reject_candidate(
    token: String,
    db: State<'_, EngineDb>,
) -> Result<(), AppError> {
    with_conn(&db, |conn| {
        confirmations::reject(conn, &token);
        Ok(())
    })
}

/// Post-confirmation tool re-execution settlement (the thinnest Phase 22
/// seam): the tool runs in TS (executeTool), the event lands via Rust —
/// sole writer. `payload_json` is the tool result value; `ok` its success.
/// When `tool_call_id` has no tool_call yet (webview minted a fresh UUID),
/// a pairing tool_call is appended first so the stream stays invariant-clean.
#[tauri::command]
pub async fn engine_append_tool_result(
    session_id: String,
    tool_call_id: String,
    tool_name: String,
    ok: bool,
    payload_json: Value,
    args: Option<Value>,
    db: State<'_, EngineDb>,
) -> Result<(), AppError> {
    with_conn(&db, |conn| {
        append_tool_result_inner(conn, &session_id, &tool_call_id, &tool_name, ok, &payload_json, args.as_ref())
            .map_err(AppError::InternalError)
    })
}

fn with_conn<T>(db: &State<'_, EngineDb>, f: impl FnOnce(&Connection) -> Result<T, AppError>) -> Result<T, AppError> {
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or_else(|| AppError::InternalError("engine DB not ready".into()))?;
    f(conn)
}

/// Confirm an exec_approval candidate, optionally learn the command into the
/// whitelist, then RE-EXECUTE in Rust (23-02: no TS executeTool seam for exec)
/// and settle via append_tool_result_inner ([confirmed rerun] pairing).
/// Runs on tauri::async_runtime (multi-thread) — tokio::process spawn is legal.
#[tauri::command]
pub async fn engine_exec_confirmed(
    session_id: String,
    token: String,
    allow_permanently: bool,
    db: State<'_, EngineDb>,
) -> Result<Value, AppError> {
    let conn = db
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| AppError::InternalError("engine busy: another run holds the DB".into()))?;
    // Sync prelude/settle around the await: &Connection is !Send, so it must
    // not live across the subprocess await.
    let prepared = exec_confirmed_prepare(&conn, &token, allow_permanently);
    let result = match prepared {
        Ok((command, args, cwd, params)) => {
            let outcome = exec::execute_core(&command, &args, &cwd, exec::DEFAULT_TIMEOUT_MS, CancellationToken::new(), &|_| {}).await;
            exec_confirmed_settle(&conn, &session_id, &params, outcome)
        }
        Err(e) => Err(e),
    };
    *db.0.lock().unwrap() = Some(conn);
    result
}

/// Sync half 1: confirm+consume the candidate, learn the whitelist entry,
/// extract owned (command, args, cwd, params).
fn exec_confirmed_prepare(
    conn: &Connection,
    token: &str,
    allow_permanently: bool,
) -> Result<(String, Vec<String>, std::path::PathBuf, Value), AppError> {
    let candidate = confirmations::get(conn, token)
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::InternalError("confirmation candidate not found".into()))?;
    if candidate.kind != "exec_approval" {
        return Err(AppError::InternalError(format!(
            "candidate kind {} is not exec_approval",
            candidate.kind
        )));
    }
    confirmations::confirm(conn, token)
        .map_err(|f| AppError::InternalError(f.to_string()))?;
    let consumed = confirmations::consume(conn, token, None)
        .map_err(|f| AppError::InternalError(f.to_string()))?;

    let command = consumed.params["command"].as_str().unwrap_or_default().to_string();
    let args: Vec<String> = consumed
        .params["args"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let cwd = consumed
        .params["cwd"]
        .as_str()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);

    if allow_permanently && !command.is_empty() {
        exec::add_command_to_whitelist(conn, &command)
            .map_err(|e| AppError::InternalError(e.to_string()))?;
    }
    Ok((command, args, cwd, consumed.params))
}

/// Sync half 2: settle the execution via append_tool_result_inner.
fn exec_confirmed_settle(
    conn: &Connection,
    session_id: &str,
    params: &Value,
    outcome: tools::ToolOutcome,
) -> Result<Value, AppError> {
    let (ok, payload) = match outcome {
        tools::ToolOutcome::Executed(v) => (true, v),
        tools::ToolOutcome::Failed { message, .. } => (false, json!({ "error": message })),
        tools::ToolOutcome::AwaitConfirmation { .. } => {
            return Err(AppError::InternalError("exec core cannot await confirmation".into()))
        }
    };
    append_tool_result_inner(
        conn,
        session_id,
        &uuid::Uuid::new_v4().to_string(),
        "exec",
        ok,
        &payload,
        Some(params),
    )
    .map_err(AppError::InternalError)?;
    Ok(payload)
}

/// Testable whole flow (single-thread runtime in tests).
pub async fn exec_confirmed_inner(
    conn: &Connection,
    session_id: &str,
    token: &str,
    allow_permanently: bool,
) -> Result<Value, AppError> {
    let (command, args, cwd, params) = exec_confirmed_prepare(conn, token, allow_permanently)?;
    let outcome = exec::execute_core(&command, &args, &cwd, exec::DEFAULT_TIMEOUT_MS, CancellationToken::new(), &|_| {}).await;
    exec_confirmed_settle(conn, session_id, &params, outcome)
}

/// Standalone whitelist learning (backup path; the main path is
/// engine_exec_confirmed allow_permanently=true).
#[tauri::command]
pub async fn engine_whitelist_add(command: String, db: State<'_, EngineDb>) -> Result<(), AppError> {
    with_conn(&db, |conn| {
        exec::add_command_to_whitelist(conn, &command).map_err(|e| AppError::InternalError(e.to_string()))
    })
}

/// Confirm an fs_write candidate, execute the write in Rust (23-03, TOOL-04:
/// zero webview dependency) and settle via append_tool_result_inner
/// ([confirmed rerun] pairing). Fully sync — fs ops are std::fs, no awaits,
/// so no prepare/settle split is needed (unlike engine_exec_confirmed).
#[tauri::command]
pub async fn engine_fs_apply(
    session_id: String,
    token: String,
    db: State<'_, EngineDb>,
) -> Result<Value, AppError> {
    with_conn(&db, |conn| fs_apply_inner(conn, &session_id, &token))
}

/// Testable core of engine_fs_apply.
pub fn fs_apply_inner(conn: &Connection, session_id: &str, token: &str) -> Result<Value, AppError> {
    let candidate = confirmations::get(conn, token)
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::InternalError("confirmation candidate not found".into()))?;
    if candidate.kind != fs_ops::CANDIDATE_KIND {
        return Err(AppError::InternalError(format!(
            "candidate kind {} is not {}",
            candidate.kind,
            fs_ops::CANDIDATE_KIND
        )));
    }
    confirmations::confirm(conn, token)
        .map_err(|f| AppError::InternalError(f.to_string()))?;
    let consumed = confirmations::consume(conn, token, None)
        .map_err(|f| AppError::InternalError(f.to_string()))?;

    let outcome = fs_ops::apply_operation(&consumed.params);
    let (ok, payload) = match outcome {
        tools::ToolOutcome::Executed(v) => (true, v),
        tools::ToolOutcome::Failed { message, .. } => (false, json!({ "error": message })),
        tools::ToolOutcome::AwaitConfirmation { .. } => {
            return Err(AppError::InternalError("fs apply cannot await confirmation".into()))
        }
    };
    let tool_name = format!("fs_{}", consumed.params["operation"].as_str().unwrap_or("write"));
    append_tool_result_inner(conn, session_id, &uuid::Uuid::new_v4().to_string(), &tool_name, ok, &payload, Some(&consumed.params))
        .map_err(AppError::InternalError)?;
    Ok(payload)
}

/// Testable core of engine_append_tool_result.
pub fn append_tool_result_inner(
    conn: &Connection,
    session_id: &str,
    tool_call_id: &str,
    tool_name: &str,
    ok: bool,
    payload: &Value,
    args: Option<&Value>,
) -> Result<(), String> {
    let events = event_log::list_events(conn, session_id).map_err(|e| e.to_string())?;
    let matches = |event_type: &str| {
        events.iter().any(|e| {
            e.event_type == event_type
                && e.payload.get("toolCallId").and_then(|v| v.as_str()) == Some(tool_call_id)
        })
    };
    let has_call = matches("tool_call");
    let has_result = matches("tool_result");
    if has_result {
        return Err(format!("tool_result already exists for toolCallId {tool_call_id}"));
    }

    // Scope inheritance: a matched tool_call's ids stamp the settlement events.
    let (workspace_id, product_id, correlation_id) = events
        .iter()
        .find(|e| e.event_type == "tool_call" && e.payload.get("toolCallId").and_then(|v| v.as_str()) == Some(tool_call_id))
        .map(|e| (e.workspace_id.clone(), e.product_id.clone(), e.correlation_id.clone()))
        .unwrap_or((None, None, None));

    if !has_call {
        // Confirmed re-execution: mint the pairing tool_call first.
        event_log::append(
            conn,
            &EventInput {
                session_id: session_id.to_string(),
                event_type: "tool_call".into(),
                workspace_id: workspace_id.clone(),
                product_id: product_id.clone(),
                project_id: None,
                correlation_id: correlation_id.clone(),
                payload: json!({
                    "toolCallId": tool_call_id,
                    "toolName": tool_name,
                    "args": args.cloned().unwrap_or(json!({})),
                    "content": "[confirmed rerun]",
                    "idempotency": tools::idempotency(tool_name),
                }),
            },
        )
        .map_err(|e| e.to_string())?;
    }

    let model_text = if ok {
        format!("[tool_result {tool_name}] {{\"ok\":true,\"data\":{payload}}}")
    } else {
        let error = payload.get("error").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| payload.to_string());
        format!("[tool_result {tool_name}] {{\"ok\":false,\"error\":{error:?}}}")
    };
    let mut result_payload = json!({
        "toolCallId": tool_call_id,
        "toolName": tool_name,
        "modelText": model_text,
        "ok": ok,
    });
    if let Some(err) = payload.get("error").and_then(|v| v.as_str()) {
        result_payload["error"] = json!(err);
    }
    event_log::append(
        conn,
        &EventInput {
            session_id: session_id.to_string(),
            event_type: "tool_result".into(),
            workspace_id,
            product_id,
            project_id: None,
            correlation_id,
            payload: result_payload,
        },
    )
    .map_err(|e| e.to_string())?;

    let events = event_log::list_events(conn, session_id).map_err(|e| e.to_string())?;
    event_log::check_event_stream(&events)
}

/* === Tests === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;

    #[test]
    fn append_fresh_id_creates_pairing_tool_call() {
        let conn = mem_conn();
        append_tool_result_inner(&conn, "s1", "t1", "knowledge_write", true, &json!({"docId": "d1"}), Some(&json!({"title": "T"})))
            .unwrap();
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert_eq!(events.iter().map(|e| e.event_type.as_str()).collect::<Vec<_>>(), vec!["tool_call", "tool_result"]);
        let call = &events[0].payload;
        assert_eq!(call["content"], "[confirmed rerun]");
        assert_eq!(call["idempotency"], "verify_first");
        assert_eq!(
            events[1].payload["modelText"].as_str().unwrap(),
            "[tool_result knowledge_write] {\"ok\":true,\"data\":{\"docId\":\"d1\"}}"
        );
    }

    #[test]
    fn append_settles_existing_unpaired_tool_call() {
        let conn = mem_conn();
        event_log::append(&conn, &EventInput {
            session_id: "s1".into(),
            event_type: "tool_call".into(),
            workspace_id: Some("w1".into()),
            product_id: None,
            project_id: None,
            correlation_id: Some("c9".into()),
            payload: json!({"toolCallId": "t1", "toolName": "x"}),
        })
        .unwrap();
        append_tool_result_inner(&conn, "s1", "t1", "x", true, &json!({"done": true}), None).unwrap();
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert_eq!(events.len(), 2); // no duplicate tool_call
        assert_eq!(events[1].workspace_id.as_deref(), Some("w1")); // scope inherited
        assert_eq!(events[1].correlation_id.as_deref(), Some("c9"));
    }

    #[test]
    fn append_twice_for_same_id_errors() {
        let conn = mem_conn();
        append_tool_result_inner(&conn, "s1", "t1", "x", true, &json!(1), None).unwrap();
        let err = append_tool_result_inner(&conn, "s1", "t1", "x", true, &json!(1), None).unwrap_err();
        assert!(err.contains("already exists"), "{err}");
    }

    #[test]
    fn restore_report_reexports() {
        // sanity: restore module reachable through the command layer's imports
        let conn = mem_conn();
        assert!(crate::engine::restore::restore_session(&conn, "none").unwrap().is_none());
    }

    #[test]
    fn exec_confirmed_reruns_in_rust_and_settles() {
        let conn = mem_conn();
        // Off-whitelist exec::run → exec_approval candidate (params carry cwd).
        let cwd = std::env::temp_dir().to_string_lossy().to_string();
        let (command, args): (&str, Vec<String>) = if cfg!(windows) {
            ("cmd", vec!["/c".into(), "echo confirmed".into()])
        } else {
            ("echo", vec!["confirmed".into()])
        };
        let token = {
            use crate::engine::tools::{execute_async, ToolCtx, ToolOutcome};
            let ctx = ToolCtx {
                session_id: "s1",
                product_id: None,
                workspace_root: Some(std::path::PathBuf::from(&cwd)),
            };
            let outcome = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(execute_async(
                    &conn,
                    "exec",
                    &json!({"command": command, "args": args}),
                    &ctx,
                    CancellationToken::new(),
                    &|_| {},
                ));
            match outcome {
                ToolOutcome::AwaitConfirmation { candidate, .. } => {
                    candidate["confirmationToken"].as_str().unwrap().to_string()
                }
                other => panic!("expected candidate, got {other:?}"),
            }
        };

        let payload = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(exec_confirmed_inner(&conn, "s1", &token, true))
            .unwrap();
        assert_eq!(payload["ok"], true);
        assert!(payload["stdout"].as_str().unwrap().contains("confirmed"));

        // Learned permanently into kv_store
        assert!(crate::engine::exec::whitelist_matches(
            &crate::engine::exec::merged_whitelist(&conn),
            command,
            &args,
        ));

        // Events: pairing tool_call ([confirmed rerun]) + tool_result
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert_eq!(events.iter().map(|e| e.event_type.as_str()).collect::<Vec<_>>(), vec!["tool_call", "tool_result"]);
        assert_eq!(events[0].payload["content"], "[confirmed rerun]");
        assert_eq!(events[1].payload["toolName"], "exec");
        assert_eq!(events[1].payload["ok"], true);

        // Second consume → settled
        confirmations::confirm(&conn, &token).ok();
        let err = confirmations::consume(&conn, &token, None).unwrap_err();
        assert_eq!(err.code(), "already_settled");
    }

    #[test]
    fn exec_confirmed_rejects_other_kinds() {
        let conn = mem_conn();
        let c = confirmations::create_candidate(&conn, "knowledge_write", &json!({"title": "t"}), None, None).unwrap();
        let err = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(exec_confirmed_inner(&conn, "s1", &c.confirmation_token, false))
            .unwrap_err();
        assert!(err.to_string().contains("not exec_approval"));
    }

    #[test]
    fn fs_apply_runs_in_rust_and_settles_once() {
        let conn = mem_conn();
        let root = std::env::temp_dir().join(format!("nova-fsapply-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        // fs_write tool → fs_write candidate
        let token = {
            use crate::engine::tools::{execute, ToolCtx, ToolOutcome};
            let ctx = ToolCtx { session_id: "s1", product_id: None, workspace_root: Some(root.clone()) };
            match execute(&conn, "fs_write", &json!({"path": "out.md", "content": "confirmed"}), &ctx) {
                ToolOutcome::AwaitConfirmation { candidate, .. } => {
                    candidate["confirmationToken"].as_str().unwrap().to_string()
                }
                other => panic!("expected candidate, got {other:?}"),
            }
        };

        let payload = fs_apply_inner(&conn, "s1", &token).unwrap();
        assert_eq!(payload["written"], true);
        assert_eq!(std::fs::read_to_string(root.join("out.md")).unwrap(), "confirmed");

        // Events: pairing tool_call ([confirmed rerun]) + tool_result
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert_eq!(events.iter().map(|e| e.event_type.as_str()).collect::<Vec<_>>(), vec!["tool_call", "tool_result"]);
        assert_eq!(events[0].payload["toolName"], "fs_write");
        assert_eq!(events[0].payload["content"], "[confirmed rerun]");
        assert_eq!(events[1].payload["ok"], true);

        // Second consume → already_settled
        confirmations::confirm(&conn, &token).ok();
        let err = fs_apply_inner(&conn, "s1", &token).unwrap_err();
        assert!(err.to_string().contains("already_settled") || err.to_string().contains("not_confirmed"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn fs_apply_rejects_other_kinds() {
        let conn = mem_conn();
        let c = confirmations::create_candidate(&conn, "knowledge_write", &json!({"title": "t"}), None, None).unwrap();
        let err = fs_apply_inner(&conn, "s1", &c.confirmation_token).unwrap_err();
        assert!(err.to_string().contains("not fs_write"));
    }
}
