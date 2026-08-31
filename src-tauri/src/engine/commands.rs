// src-tauri/src/engine/commands.rs
// Phase 22 (22-06) — the engine_* Tauri commands + run registry wiring.
// Phase 24 (24-01): engine_run queues through the Scheduler (cap 3 + FIFO)
// and opens a per-run Connection (the managed slot stays with non-run
// commands). `engine_run` runs its Connection on a blocking thread with a
// current-thread tokio runtime (std MutexGuards cannot cross await points,
// and rusqlite Connection is !Sync) — same shape the loop_runner tests use.

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
use crate::notify;
use crate::state::AppState;

/// Managed DB state, filled in lib.rs setup. `conn` is the shared managed
/// connection for non-run commands (confirm/append/etc.); `path` lets
/// `engine_run` open a per-run Connection (24-01: no single-slot "engine
/// busy" — WAL + busy_timeout serialize cross-connection writes).
pub struct EngineDb(
    pub Mutex<Option<Connection>>,
    pub Mutex<Option<std::path::PathBuf>>,
);

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

    /// 22-08 wrap-up turn: same path, but NO tool schemas — the provider gets
    /// an empty tools array so it cannot emit tool calls.
    fn chat_no_tools(&mut self, messages: Vec<LlmMessage>, system_prompt: String, on_token: TokenSink) -> BoxLlmFuture {
        let provider = self.provider;
        let api_key = self.api_key.clone();
        let ollama_model = self.ollama_model.clone();
        let cancel = self.cancel.clone();
        Box::pin(async move {
            let chat_messages: Vec<ChatMessage> = messages
                .into_iter()
                .map(|m| ChatMessage { role: m.role.as_str().to_string(), content: m.content })
                .collect();
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
                vec![],
                system_prompt,
                &channel,
                &cancel,
            )
            .await
            .map_err(|e| e.to_string())?;
            Ok(LlmTurn { content: result.content, tool_calls: Vec::new() })
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
    // 24-02 tray display title (session title or first-message prefix).
    session_title: Option<String>,
    core_context: String,
    // 26-02 TAB-06: optional scheduling priority. None/"interactive" = chat
    // semantics (unchanged); "batch" = tab generation runs queue behind chat.
    priority: Option<String>,
    on_event: Channel<EngineEvent>,
    app_handle: tauri::AppHandle,
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

    // Webview-supplied run_id (cancel key, chat/cancel_chat requestId pattern);
    // minted here when absent so raw invoke callers still work.
    let run_id = run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    // 26-02 TAB-06 scheduling priority — validated before any registry insert.
    let priority = match priority.as_deref() {
        None | Some("interactive") => crate::engine::scheduler::Priority::Interactive,
        Some("batch") => crate::engine::scheduler::Priority::Batch,
        Some(other) => return Err(AppError::ParseError(format!("unknown priority: {other}"))),
    };
    let cancel = CancellationToken::new();
    state.engine_runs.lock().unwrap().insert(run_id.clone(), cancel.clone());
    // 24-02 tray metadata: jump target + display title for the run list.
    // 24-03: title/session clones also feed the background notification gate.
    let notify_title = session_title.unwrap_or_default();
    state.scheduler.register(&run_id, session_id.clone(), notify_title.clone());
    let notify_session = session_id.clone();

    // 24-01 scheduler gate: FIFO queue behind MAX_CONCURRENT=3. engine_cancel
    // fires the token — a queued run dequeues from acquire's cancel branch
    // without consuming a slot; a running run unwinds as before (23-02).
    // 26-02: dual-queue — interactive dequeues ahead of batch.
    let queue_channel = on_event.clone();
    let permit = match state
        .scheduler
        .acquire(
            &run_id,
            cancel.clone(),
            priority,
            || {
                let _ = queue_channel.send(EngineEvent::RunStatusChange {
                    run_id: run_id.clone(),
                    status: "queued".into(),
                });
            },
        )
        .await
    {
        Ok(permit) => permit,
        Err(_) => {
            state.engine_runs.lock().unwrap().remove(&run_id);
            state.scheduler.unregister(&run_id);
            return Err(AppError::Cancelled);
        }
    };
    let _ = on_event.send(EngineEvent::RunStatusChange { run_id: run_id.clone(), status: "running".into() });

    // Per-run Connection (24-01): the managed slot stays untouched for
    // non-run commands; WAL + busy_timeout keep concurrent writers safe.
    let conn = open_run_conn(&db)?;
    let _permit = permit; // hold the slot for the whole run

    let err_channel = on_event.clone();
    // Clones taken BEFORE the move closure so the originals stay usable by the
    // completion/error notifications below.
    let notify_app = app_handle.clone();
    let notify_title_cb = notify_title.clone();
    let notify_session_cb = notify_session.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("engine runtime");
        let event_channel = on_event.clone();
        let on_event_cb: EventCallback = Arc::new(move |e: EngineEvent| {
            // 24-03 SCHED-03: HITL wait → background notification (only when
            // the window is hidden; the gate is inside notify_if_background).
            if let EngineEvent::Confirmation { .. } = &e {
                notify::notify_if_background(
                    &notify_app,
                    "Nova",
                    &format!("等待确认: {notify_title_cb}"),
                    &notify_session_cb,
                );
            }
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
        result
    });

    let result = match handle.await {
        Ok(joined) => joined,
        Err(e) => {
            // Thread panicked — the per-run Connection died with it; the
            // managed slot was never touched. Extremely unlikely.
            state.engine_runs.lock().unwrap().remove(&run_id);
            state.scheduler.unregister(&run_id);
            return Err(AppError::InternalError(format!("engine thread failed: {e}")));
        }
    };
    drop(_permit);
    state.engine_runs.lock().unwrap().remove(&run_id);
    state.scheduler.unregister(&run_id);

    match result {
        Ok(run_result) => {
            // 24-03 SCHED-03: background notification on run completion.
            // Cancel does NOT notify (the user clicked cancel themselves).
            notify::notify_if_background(
                &app_handle,
                "Nova",
                &format!("run 完成: {notify_title}"),
                &notify_session,
            );
            Ok(run_result)
        }
        Err(LoopError::Cancelled) => Err(AppError::Cancelled),
        Err(e) => {
            notify::notify_if_background(
                &app_handle,
                "Nova",
                &format!("run 失败: {notify_title}"),
                &notify_session,
            );
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
    engine_cancel_inner(&state, &run_id)
}

/// Testable core (24-04): remove the token and fire it. The token reaches BOTH
/// cancel halves — the running run's loop (23-02 tree-kill unwind) and the
/// queued run's acquire cancel branch (24-01 immediate dequeue, no slot).
/// Idempotent: an unknown/already-removed run_id is Ok.
pub fn engine_cancel_inner(state: &AppState, run_id: &str) -> Result<(), AppError> {
    if let Some(token) = state.engine_runs.lock().unwrap().remove(run_id) {
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

/// Per-run Connection from the stored DB path (24-01). The managed slot
/// stays with the quick non-await commands via `with_conn`.
fn open_run_conn(db: &State<'_, EngineDb>) -> Result<Connection, AppError> {
    let path = db
        .1
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| AppError::InternalError("engine DB not ready".into()))?;
    crate::engine::db::open(&path).map_err(|e| AppError::InternalError(format!("open engine DB: {e}")))
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
    // 24-01: per-run Connection from the stored path (the managed slot is no
    // longer taken — runs don't contend with confirm commands anymore).
    let conn = open_run_conn(&db)?;
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

/// Seam ① migration (23-04): commit the confirmed deliverable draft's audit
/// event from Rust — sole writer of agent_events. The webview keeps the
/// user-action half (TS executeTool: consume + knowledgeRepo upsert + rndStore
/// slot projection, transition-period legal), then lands the
/// deliverable_committed event via this command instead of appendAuxEvent.
/// Fully sync (no awaits). Order is consume → append, never inverted.
#[tauri::command]
pub async fn engine_commit_deliverable(
    session_id: String,
    token: String,
    code: String,
    title: String,
    edited_draft: String,
    product_id: String,
    doc_id: String,
    version: i64,
    fts_hit_count: i64,
    fts_immediate_hit: bool,
    db: State<'_, EngineDb>,
) -> Result<(), AppError> {
    let _ = edited_draft; // user-edited draft only reaches rndStore/knowledgeRepo (TS)
    with_conn(&db, |conn| {
        commit_deliverable_inner(
            conn, &session_id, &token, &code, &title, &product_id,
            &doc_id, version, fts_hit_count, fts_immediate_hit,
        )
    })
}

/// Testable core of engine_commit_deliverable.
pub fn commit_deliverable_inner(
    conn: &Connection,
    session_id: &str,
    token: &str,
    code: &str,
    title: &str,
    product_id: &str,
    doc_id: &str,
    version: i64,
    fts_hit_count: i64,
    fts_immediate_hit: bool,
) -> Result<(), AppError> {
    let candidate = confirmations::get(conn, token)
        .map_err(|e| AppError::InternalError(e.to_string()))?
        .ok_or_else(|| AppError::InternalError("confirmation candidate not found".into()))?;
    if candidate.kind != "deliverable_draft" {
        return Err(AppError::InternalError(format!(
            "candidate kind {} is not deliverable_draft",
            candidate.kind
        )));
    }
    // Identity guard (TS generateDeliverable.ts:45-47 parity): only
    // code/title identify the candidate — the draft is user-edited on purpose.
    if candidate.params["code"].as_str() != Some(code) || candidate.params["title"].as_str() != Some(title) {
        return Err(AppError::InternalError("confirmed draft does not match the candidate".into()));
    }
    let Some(slot_code) = tools::slot_by_code(code) else {
        return Err(AppError::InternalError(format!("unknown deliverable code {code}")));
    };
    // Scope inheritance: the event lands in the candidate's own session.
    let event_session = candidate.session_id.clone().unwrap_or_else(|| session_id.to_string());

    // Consume of record (deliverable locked decision: expected_params=None):
    // confirm → consume, order locked. The TS executeTool call in the SAME user
    // action already confirm+consumed the row on the shared nova.db —
    // AlreadySettled is tolerated only because the docId+version idempotency
    // check below keeps the event exactly-once.
    // ponytail: tolerance assumes one logical commit per token; per-event
    // unique constraint if double-commit abuse ever shows up.
    let is_consumed = |conn: &Connection| -> Result<bool, AppError> {
        Ok(confirmations::get(conn, token)
            .map_err(|e| AppError::InternalError(e.to_string()))?
            .map(|c| c.status == "consumed")
            .unwrap_or(false))
    };
    if let Err(f) = confirmations::confirm(conn, token) {
        if !matches!(f, confirmations::ConfirmationFailure::AlreadySettled) || !is_consumed(conn)? {
            return Err(AppError::InternalError(f.to_string()));
        }
    }
    if let Err(f) = confirmations::consume(conn, token, None) {
        if !matches!(f, confirmations::ConfirmationFailure::AlreadySettled) || !is_consumed(conn)? {
            return Err(AppError::InternalError(f.to_string()));
        }
    }

    // Exactly-once event: same docId+version already committed → idempotent Ok.
    let events = event_log::list_events(conn, &event_session).map_err(|e| AppError::InternalError(e.to_string()))?;
    if events.iter().any(|e| {
        e.event_type == "deliverable_committed"
            && e.payload.get("docId").and_then(|v| v.as_str()) == Some(doc_id)
            && e.payload.get("version").and_then(|v| v.as_i64()) == Some(version)
    }) {
        return Ok(());
    }

    let session_param = candidate.params["sessionId"].as_str().unwrap_or_default();
    let event_id = candidate.params["eventId"].clone();
    event_log::append(
        conn,
        &EventInput {
            session_id: event_session.clone(),
            event_type: "deliverable_committed".into(),
            workspace_id: None,
            product_id: Some(product_id.to_string()),
            project_id: None,
            correlation_id: None,
            payload: json!({
                "docId": doc_id,
                "version": version,
                "slotCode": slot_code,
                "code": code,
                "ftsImmediateHit": fts_immediate_hit,
                "ftsHitCount": fts_hit_count,
                "sessionId": session_param,
                "eventId": event_id,
            }),
        },
    )
    .map_err(|e| AppError::InternalError(e.to_string()))?;
    let events = event_log::list_events(conn, &event_session).map_err(|e| AppError::InternalError(e.to_string()))?;
    event_log::check_event_stream(&events).map_err(AppError::InternalError)
}

/// Seam ② migration (23-05): confirm + consume a memory candidate and land the
/// memories row, all in Rust — one user action (the 已记住 click) is one
/// command. Returns the camelCase MemoryRecord for the TS toast.
#[tauri::command]
pub async fn engine_consume_memory(token: String, db: State<'_, EngineDb>) -> Result<Value, AppError> {
    with_conn(&db, |conn| consume_memory_inner(conn, &token))
}

/// Testable core of engine_consume_memory.
pub fn consume_memory_inner(conn: &Connection, token: &str) -> Result<Value, AppError> {
    confirmations::memory_confirm(conn, token)
        .map_err(|f| AppError::InternalError(f.to_string()))?;
    confirmations::consume_memory(conn, token)
        .map_err(|f| AppError::InternalError(f.to_string()))
}

/// Reject a memory candidate (忽略 click). Rust sole writer of the reject path.
#[tauri::command]
pub async fn engine_reject_memory(token: String, db: State<'_, EngineDb>) -> Result<(), AppError> {
    with_conn(&db, |conn| {
        confirmations::memory_reject(conn, &token);
        Ok(())
    })
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
    use crate::engine::db::testing::{file_conn, mem_conn};

    // 24-04 SCHED-04: engine_cancel idempotency (unknown + double cancel).
    #[test]
    fn engine_cancel_unknown_and_double_cancel_are_ok() {
        let state = crate::state::AppState::new();
        // Unknown run_id → Ok (run already ended naturally).
        engine_cancel_inner(&state, "no-such-run").unwrap();
        let token = CancellationToken::new();
        state.engine_runs.lock().unwrap().insert("r1".into(), token.clone());
        engine_cancel_inner(&state, "r1").unwrap();
        assert!(token.is_cancelled(), "registered token fired");
        engine_cancel_inner(&state, "r1").unwrap(); // second cancel: Ok no-op
        assert!(state.engine_runs.lock().unwrap().is_empty(), "registry entry removed");
    }

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

    /// Queue a deliverable_draft candidate via the native tool (product p1).
    fn queue_deliverable(conn: &Connection) -> String {
        use crate::engine::tools::{execute, ToolCtx, ToolOutcome};
        let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
        match execute(conn, "generate_deliverable", &json!({"code": "prd", "title": "PRD v1", "draft": "D"}), &ctx) {
            ToolOutcome::AwaitConfirmation { candidate, .. } => {
                candidate["confirmationToken"].as_str().unwrap().to_string()
            }
            other => panic!("expected candidate, got {other:?}"),
        }
    }

    #[test]
    fn commit_deliverable_after_ts_consume_lands_event_once() {
        let conn = mem_conn();
        let token = queue_deliverable(&conn);
        // Webview half of the user action: TS executeTool confirm+consume.
        confirmations::confirm(&conn, &token).unwrap();
        confirmations::consume(&conn, &token, None).unwrap();

        commit_deliverable_inner(&conn, "s1", &token, "prd", "PRD v1", "p1", "deliverable-p1-DEL-REQ-01", 2, 3, true).unwrap();
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert_eq!(events.len(), 1);
        let payload = &events[0].payload;
        assert_eq!(events[0].event_type, "deliverable_committed");
        assert_eq!(payload["docId"], "deliverable-p1-DEL-REQ-01");
        assert_eq!(payload["version"], 2);
        assert_eq!(payload["slotCode"], "DEL-REQ-01");
        assert_eq!(payload["code"], "prd");
        assert_eq!(payload["ftsImmediateHit"], true);
        assert_eq!(payload["ftsHitCount"], 3);
        assert_eq!(payload["sessionId"], "s1");
        assert!(payload["eventId"].is_null());
        assert_eq!(events[0].product_id.as_deref(), Some("p1"));

        // Idempotent re-invoke (same docId+version): Ok, still exactly one event.
        commit_deliverable_inner(&conn, "s1", &token, "prd", "PRD v1", "p1", "deliverable-p1-DEL-REQ-01", 2, 3, true).unwrap();
        assert_eq!(event_log::list_events(&conn, "s1").unwrap().len(), 1);
    }

    #[test]
    fn commit_deliverable_consumes_unconsumed_candidate() {
        let conn = mem_conn();
        let token = queue_deliverable(&conn);
        // Only confirmed (not yet consumed): the command is the consume of record.
        confirmations::confirm(&conn, &token).unwrap();
        commit_deliverable_inner(&conn, "s1", &token, "prd", "PRD v1", "p1", "d", 1, 0, false).unwrap();
        assert_eq!(event_log::list_events(&conn, "s1").unwrap().len(), 1);
        // The command's own confirm step settles a still-pending candidate (the
        // user's commit click IS the confirmation). (Different title: the first
        // candidate is still active and would dedup the queue call.)
        let token2 = {
            use crate::engine::tools::{execute, ToolCtx, ToolOutcome};
            let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
            match execute(&conn, "generate_deliverable", &json!({"code": "prd", "title": "PRD v2", "draft": "D"}), &ctx) {
                ToolOutcome::AwaitConfirmation { candidate, .. } => candidate["confirmationToken"].as_str().unwrap().to_string(),
                other => panic!("expected candidate, got {other:?}"),
            }
        };
        commit_deliverable_inner(&conn, "s1", &token2, "prd", "PRD v2", "p1", "d2", 1, 0, false).unwrap();
        // Rejected candidate → confirm fails non-AlreadySettled → error, no event.
        let token3 = {
            use crate::engine::tools::{execute, ToolCtx, ToolOutcome};
            let ctx = ToolCtx { session_id: "s1", product_id: Some("p1"), workspace_root: None };
            match execute(&conn, "generate_deliverable", &json!({"code": "prd", "title": "PRD v3", "draft": "D"}), &ctx) {
                ToolOutcome::AwaitConfirmation { candidate, .. } => candidate["confirmationToken"].as_str().unwrap().to_string(),
                other => panic!("expected candidate, got {other:?}"),
            }
        };
        confirmations::reject(&conn, &token3);
        let err = commit_deliverable_inner(&conn, "s1", &token3, "prd", "PRD v3", "p1", "d3", 1, 0, false).unwrap_err();
        assert!(err.to_string().contains("already_settled") || err.to_string().contains("not_confirmed"), "{err}");
        assert_eq!(event_log::list_events(&conn, "s1").unwrap().len(), 2);
    }

    #[test]
    fn commit_deliverable_guards_kind_and_identity() {
        let conn = mem_conn();
        // Wrong kind.
        let c = confirmations::create_candidate(&conn, "knowledge_write", &json!({"title": "t"}), None, None).unwrap();
        let err = commit_deliverable_inner(&conn, "s1", &c.confirmation_token, "prd", "t", "p1", "d", 1, 0, false).unwrap_err();
        assert!(err.to_string().contains("not deliverable_draft"));
        // Identity mismatch (title edited between queue and commit).
        let token = queue_deliverable(&conn);
        confirmations::confirm(&conn, &token).unwrap();
        let err = commit_deliverable_inner(&conn, "s1", &token, "prd", "别的标题", "p1", "d", 1, 0, false).unwrap_err();
        assert!(err.to_string().contains("does not match"));
    }

    /* === 23-05 seam ②: memory consume/reject === */

    fn queue_memory_candidate(conn: &Connection, content: &str) -> String {
        let hash = crate::engine::params_hash::params_hash(&json!({"content": content, "scope": "global"}));
        let token = uuid::Uuid::new_v4().to_string();
        confirmations::insert_memory_candidate(conn, &token, content, &hash, "model_inferred", "global", None, Some("s1")).unwrap();
        token
    }

    #[test]
    fn memory_consume_lands_record_and_exactly_once() {
        let conn = mem_conn();
        let token = queue_memory_candidate(&conn, "评审安排在周三");
        let record = consume_memory_inner(&conn, &token).unwrap();
        assert_eq!(record["content"], "评审安排在周三");
        assert_eq!(record["origin"], "model_inferred");
        assert_eq!(record["scope"], "global");
        assert_eq!(record["version"], 1);
        assert_eq!(record["sourceCandidateToken"], token);
        assert_eq!(record["sourceSessionId"], "s1");
        assert_eq!(record["sourceType"], "agent_confirmation");
        assert!(record["memoryId"].is_string());

        // Second consume → already_settled, no second memories row.
        let err = consume_memory_inner(&conn, &token).unwrap_err();
        assert!(err.to_string().contains("already_settled"), "{err}");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        // Reject after consume is a no-op false (settled).
        assert!(!confirmations::memory_reject(&conn, &token));
    }

    #[test]
    fn memory_reject_blocks_consume() {
        let conn = mem_conn();
        let token = queue_memory_candidate(&conn, "别记");
        assert!(confirmations::memory_reject(&conn, &token));
        let err = consume_memory_inner(&conn, &token).unwrap_err();
        assert!(err.to_string().contains("already_settled"), "{err}");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn memory_concurrent_consume_exactly_one_wins() {
        // Two threads, two connections to one WAL file DB (23-04 pattern).
        let path = file_conn("memory_concurrent");
        let token = queue_memory_candidate(&path, "并发记忆");
        confirmations::memory_confirm(&path, &token).unwrap();
        let path_str = std::path::PathBuf::from(path.path().expect("file-backed").to_string());
        let t1 = std::thread::spawn({
            let (p, token) = (path_str.clone(), token.clone());
            move || {
                let conn = crate::engine::db::testing::open_file(&p);
                consume_memory_inner(&conn, &token).is_ok()
            }
        });
        let t2 = std::thread::spawn({
            let (p, token) = (path_str.clone(), token.clone());
            move || {
                let conn = crate::engine::db::testing::open_file(&p);
                consume_memory_inner(&conn, &token).is_ok()
            }
        });
        let (r1, r2) = (t1.join().unwrap(), t2.join().unwrap());
        assert!(r1 ^ r2, "exactly one concurrent consume wins (got {r1}, {r2})");
        let status: String = path
            .query_row("SELECT status FROM memory_candidates WHERE candidate_token = ?1", rusqlite::params![token], |r| r.get(0))
            .unwrap();
        assert_eq!(status, "consumed");
        let n: i64 = path.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1, "winner inserted exactly one memories row");
    }

    #[test]
    fn memory_supersede_chain() {
        let conn = mem_conn();
        let token = queue_memory_candidate(&conn, "周二评审");
        let v1 = consume_memory_inner(&conn, &token).unwrap();
        // Same memoryId + supersedesRowid → version 2, v1 superseded (MEM-05).
        let v2 = confirmations::insert_memory(
            &conn,
            Some(v1["memoryId"].as_str().unwrap()),
            "周三评审",
            "user_directed",
            "global",
            None,
            None,
            None,
            Some(v1["memoryRowid"].as_i64().unwrap()),
        )
        .unwrap();
        assert_eq!(v2["version"], 2);
        assert_eq!(v2["supersedesRowid"], v1["memoryRowid"]);
        let superseded_at: Option<String> = conn
            .query_row(
                "SELECT superseded_at FROM memories WHERE memory_rowid = ?1",
                rusqlite::params![v1["memoryRowid"].as_i64().unwrap()],
                |r| r.get(0),
            )
            .unwrap();
        assert!(superseded_at.is_some(), "old row superseded, kept for audit");
    }
}
