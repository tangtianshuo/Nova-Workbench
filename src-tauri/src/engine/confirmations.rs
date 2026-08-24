// src-tauri/src/engine/confirmations.rs
// Phase 22 (22-03) — port of src/ai/confirmationStore.ts (SQLite branch) +
// src/ai/confirmations.ts (dedup / consume-hash semantics) + the memoryStore.ts
// memory_candidates INSERT. Rust is the sole writer of agent_confirmation_candidates
// and memory_candidates (ENG-02/ENG-04).
//
// The three conditional UPDATE statements (confirm/consume/reject) are copied
// VERBATIM from confirmationStore.ts:283-346 — the atomic-consumption invariant
// (exactly one concurrent caller wins) lives in these WHERE clauses.

use rusqlite::{named_params, params, Connection};
use serde_json::Value;

use crate::engine::event_log::now_iso;
use crate::engine::params_hash::params_hash;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

pub const CONFIRMATION_TTL_MS: i64 = 24 * 60 * 60 * 1000; // 24 hours

/* === Types === */

#[derive(Clone, Debug, PartialEq)]
pub enum ConfirmationFailure {
    NotFound,
    Expired,
    NotConfirmed,
    ParamsMismatch,
    AlreadySettled,
}

impl ConfirmationFailure {
    pub fn code(&self) -> &'static str {
        match self {
            ConfirmationFailure::NotFound => "not_found",
            ConfirmationFailure::Expired => "expired",
            ConfirmationFailure::NotConfirmed => "not_confirmed",
            ConfirmationFailure::ParamsMismatch => "params_mismatch",
            ConfirmationFailure::AlreadySettled => "already_settled",
        }
    }
    fn message(&self) -> &'static str {
        match self {
            ConfirmationFailure::NotFound => "Confirmation candidate not found.",
            ConfirmationFailure::Expired => "Confirmation candidate has expired.",
            ConfirmationFailure::NotConfirmed => "Confirmation candidate has not been confirmed.",
            ConfirmationFailure::ParamsMismatch => "Confirmation params hash does not match.",
            ConfirmationFailure::AlreadySettled => "Confirmation candidate was already settled.",
        }
    }
}

impl std::fmt::Display for ConfirmationFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code(), self.message())
    }
}
impl std::error::Error for ConfirmationFailure {}

#[derive(Clone, Debug)]
pub struct Candidate {
    pub confirmation_token: String,
    pub kind: String,
    pub status: String,
    pub params_hash: String,
    pub params: Value,
    pub summary: Option<String>,
    pub session_id: Option<String>,
    pub created_at: String,
    pub expires_at: String,
    pub confirmed_at: Option<String>,
    pub consumed_at: Option<String>,
    pub rejected_at: Option<String>,
}

/// Row-shaped input for the raw INSERT (shared by create_candidate and
/// event_log::commit_turn so both write identical rows).
#[derive(Clone, Debug)]
pub struct NewCandidate {
    pub kind: String,
    pub params: Value,
    pub params_hash: String,
    pub summary: Option<String>,
    pub session_id: Option<String>,
}

/* === Row mapping === */

fn row_to_candidate(row: &rusqlite::Row<'_>) -> rusqlite::Result<Candidate> {
    let params_json: String = row.get(4)?;
    Ok(Candidate {
        confirmation_token: row.get(0)?,
        kind: row.get(1)?,
        status: row.get(2)?,
        params_hash: row.get(3)?,
        params: serde_json::from_str(&params_json).unwrap_or(Value::Null),
        summary: row.get(5)?,
        session_id: row.get(6)?,
        created_at: row.get(7)?,
        expires_at: row.get(8)?,
        confirmed_at: row.get(9)?,
        consumed_at: row.get(10)?,
        rejected_at: row.get(11)?,
    })
}

const CANDIDATE_COLUMNS: &str = "confirmation_token, kind, status, params_hash, params_json, summary, session_id, created_at, expires_at, confirmed_at, consumed_at, rejected_at";

pub fn get(conn: &Connection, token: &str) -> Result<Option<Candidate>> {
    let found = conn
        .query_row(
            &format!("SELECT {CANDIDATE_COLUMNS} FROM agent_confirmation_candidates WHERE confirmation_token = ?1"),
            params![token],
            row_to_candidate,
        )
        .ok();
    Ok(found)
}

/// failureFor(row, requiredStatus) — confirmationStore.ts:79-91, 1:1.
fn failure_for(row: Option<&Candidate>, required_status: Option<&str>) -> Option<ConfirmationFailure> {
    let row = row?;
    if row.expires_at.as_str() <= now_iso().as_str() {
        return Some(ConfirmationFailure::Expired);
    }
    if row.status == "consumed" || row.status == "rejected" {
        return Some(ConfirmationFailure::AlreadySettled);
    }
    if let Some(required) = required_status {
        if row.status != required {
            return Some(ConfirmationFailure::NotConfirmed);
        }
    }
    None
}

/* === Writes === */

/// Raw INSERT (SqliteConfirmationStore.create SQL, verbatim shape).
/// Token/created_at/expires_at are caller-supplied via return value.
pub fn insert_candidate_raw(conn: &Connection, new: &NewCandidate) -> Result<String> {
    let token = uuid::Uuid::new_v4().to_string();
    let created_at = now_iso();
    let expires_at = (chrono::Utc::now() + chrono::Duration::milliseconds(CONFIRMATION_TTL_MS))
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let params_json = serde_json::to_string(&new.params)?;
    conn.execute(
        "INSERT INTO agent_confirmation_candidates
           (confirmation_token, kind, status, params_hash, params_json, summary, session_id, created_at, expires_at)
         VALUES (?1, ?2, 'pending', ?3, ?4, ?5, ?6, ?7, ?8)",
        params![token, new.kind, new.params_hash, params_json, new.summary, new.session_id, created_at, expires_at],
    )?;
    Ok(token)
}

/// create_candidate with the dedup semantics of confirmations.ts:
/// - destructive_action: dedup by params_hash over active rows
/// - deliverable_draft: dedup by (code, productId, title, draft) — eventId is
///   excluded from the dedup key so re-generation dedups to the original
/// - knowledge_write: no dedup (TS createKnowledgeWriteCandidate never dedups)
pub fn create_candidate(
    conn: &Connection,
    kind: &str,
    params: &Value,
    summary: Option<&str>,
    session_id: Option<&str>,
) -> Result<Candidate> {
    if kind == "destructive_action" || kind == "deliverable_draft" {
        let hash = params_hash(params);
        for row in list_pending(conn, kind)? {
            let dup = if kind == "destructive_action" {
                row.params_hash == hash
            } else {
                let p = |k: &str| row.params.get(k).and_then(|v| v.as_str());
                ["code", "productId", "title", "draft"]
                    .iter()
                    .all(|k| p(k) == params.get(*k).and_then(|v| v.as_str()))
            };
            if dup {
                return Ok(row); // same token, no new row
            }
        }
    }
    let new = NewCandidate {
        kind: kind.to_string(),
        params: params.clone(),
        params_hash: params_hash(params),
        summary: summary.map(|s| s.to_string()),
        session_id: session_id.map(|s| s.to_string()),
    };
    let token = insert_candidate_raw(conn, &new)?;
    Ok(get(conn, &token)?.expect("just inserted"))
}

/// confirm — confirmationStore.ts:283-291, SQL verbatim.
/// Idempotent re-confirm keeps original confirmed_at (COALESCE).
pub fn confirm(conn: &Connection, token: &str) -> std::result::Result<Candidate, ConfirmationFailure> {
    let now = now_iso();
    let affected = conn
        .execute(
            "UPDATE agent_confirmation_candidates
                SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, $2)
              WHERE confirmation_token = $1
                AND status IN ('pending', 'confirmed')
                AND consumed_at IS NULL
                AND rejected_at IS NULL
                AND expires_at > $2",
            named_params! {"$1": token, "$2": now},
        )
        .map_err(|_| ConfirmationFailure::NotFound)? as i64;
    if affected != 1 {
        let row = get(conn, token).ok().flatten();
        return Err(failure_for(row.as_ref(), None)
            .unwrap_or(ConfirmationFailure::AlreadySettled));
    }
    get(conn, token)
        .ok()
        .flatten()
        .ok_or(ConfirmationFailure::NotFound)
}

/// consume — confirmationStore.ts:302-332 semantics. `expected_params`:
/// - Some(v): hash of v must equal stored params_hash (destructive/consume-with-args)
/// - None: hash recomputed from the candidate's ORIGINAL stored params — the
///   deliverable 确认→编辑→落槽 locked decision (hash always matches; protection
///   comes from the atomic UPDATE + caller-side args↔candidate identity check).
pub fn consume(
    conn: &Connection,
    token: &str,
    expected_params: Option<&Value>,
) -> std::result::Result<Candidate, ConfirmationFailure> {
    let row = get(conn, token).ok().flatten().ok_or(ConfirmationFailure::NotFound)?;
    if let Some(f) = failure_for(Some(&row), None) {
        return Err(f);
    }
    if row.status != "confirmed" {
        return Err(ConfirmationFailure::NotConfirmed);
    }
    let expected_hash = match expected_params {
        Some(v) => params_hash(v),
        None => params_hash(&row.params),
    };
    if row.params_hash != expected_hash {
        return Err(ConfirmationFailure::ParamsMismatch);
    }
    let now = now_iso();
    // Atomic conditional UPDATE: exactly one concurrent caller wins.
    let affected = conn
        .execute(
            "UPDATE agent_confirmation_candidates
                SET status = 'consumed', consumed_at = $2
              WHERE confirmation_token = $1
                AND status = 'confirmed'
                AND consumed_at IS NULL
                AND rejected_at IS NULL
                AND expires_at > $2",
            named_params! {"$1": token, "$2": now},
        )
        .map_err(|_| ConfirmationFailure::AlreadySettled)? as i64;
    if affected != 1 {
        return Err(ConfirmationFailure::AlreadySettled);
    }
    get(conn, token).ok().flatten().ok_or(ConfirmationFailure::NotFound)
}

/// reject — confirmationStore.ts:334-347, SQL verbatim. True iff rowsAffected == 1.
pub fn reject(conn: &Connection, token: &str) -> bool {
    let now = now_iso();
    conn.execute(
        "UPDATE agent_confirmation_candidates
            SET status = 'rejected', rejected_at = $2
          WHERE confirmation_token = $1
            AND status IN ('pending', 'confirmed')
            AND consumed_at IS NULL
            AND expires_at > $2",
        named_params! {"$1": token, "$2": now},
    )
    .map(|n| n == 1)
    .unwrap_or(false)
}

/// listActive — confirmationStore.ts:349-363, SQL verbatim.
pub fn list_pending(conn: &Connection, kind: &str) -> Result<Vec<Candidate>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CANDIDATE_COLUMNS} FROM agent_confirmation_candidates
          WHERE kind = $1
            AND status IN ('pending', 'confirmed')
            AND consumed_at IS NULL
            AND rejected_at IS NULL
            AND expires_at > $2
          ORDER BY created_at ASC"
    ))?;
    let rows = stmt
        .query_map(params![kind, now_iso()], row_to_candidate)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/* === memory_candidates writer (memoryStore.ts SQLite branch, INSERT verbatim) === */

pub const MEMORY_CANDIDATE_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000; // memoryStore default TTL (7d)

/// Plain INSERT of a memory candidate row (memoryStore.ts:565-580, columns verbatim).
/// Dedup/evict/revive orchestration stays with the caller (loop layer) — the
/// sole-writer boundary only needs the INSERT shape to match.
pub fn insert_memory_candidate(
    conn: &Connection,
    token: &str,
    content: &str,
    content_hash: &str,
    origin: &str,
    scope: &str,
    product_id: Option<&str>,
    session_id: Option<&str>,
) -> Result<()> {
    let now = now_iso();
    let expires_at = (chrono::Utc::now() + chrono::Duration::milliseconds(MEMORY_CANDIDATE_TTL_MS))
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    conn.execute(
        "INSERT INTO memory_candidates
           (candidate_token, content, content_hash, origin, scope, product_id, status,
            session_id, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)",
        params![token, content, content_hash, origin, scope, product_id, session_id, now, expires_at],
    )?;
    Ok(())
}

/* === Tests === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::{file_conn, mem_conn};
    use serde_json::json;

    #[test]
    fn lifecycle_confirm_consume_then_second_consume_fails() {
        let conn = mem_conn();
        let c = create_candidate(&conn, "knowledge_write", &json!({"title": "t"}), Some("t"), Some("s1")).unwrap();
        assert_eq!(c.status, "pending");

        // consume before confirm → not_confirmed
        let err = consume(&conn, &c.confirmation_token, None).unwrap_err();
        assert_eq!(err.code(), "not_confirmed");

        confirm(&conn, &c.confirmation_token).unwrap();
        let consumed = consume(&conn, &c.confirmation_token, None).unwrap();
        assert_eq!(consumed.status, "consumed");
        assert!(consumed.consumed_at.is_some());

        // second consume → already_settled
        let err = consume(&conn, &c.confirmation_token, None).unwrap_err();
        assert_eq!(err.code(), "already_settled");
    }

    #[test]
    fn consume_params_mismatch() {
        let conn = mem_conn();
        let c = create_candidate(&conn, "destructive_action", &json!({"toolName": "rm", "args": {"path": "a"}}), None, None).unwrap();
        confirm(&conn, &c.confirmation_token).unwrap();
        let err = consume(&conn, &c.confirmation_token, Some(&json!({"toolName": "rm", "args": {"path": "b"}}))).unwrap_err();
        assert_eq!(err.code(), "params_mismatch");
        // matching params consume fine
        consume(&conn, &c.confirmation_token, Some(&json!({"toolName": "rm", "args": {"path": "a"}}))).unwrap();
    }

    #[test]
    fn consume_not_found() {
        let conn = mem_conn();
        assert_eq!(consume(&conn, "nope", None).unwrap_err().code(), "not_found");
    }

    #[test]
    fn dedup_destructive_by_hash_no_new_row() {
        let conn = mem_conn();
        let args = json!({"toolName": "rm", "args": {"path": "a"}});
        let a = create_candidate(&conn, "destructive_action", &args, None, None).unwrap();
        let b = create_candidate(&conn, "destructive_action", &args, None, None).unwrap();
        assert_eq!(a.confirmation_token, b.confirmation_token, "dedup returns same token");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        // different args → new row
        create_candidate(&conn, "destructive_action", &json!({"toolName": "rm", "args": {"path": "b"}}), None, None).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn dedup_deliverable_ignores_event_id() {
        let conn = mem_conn();
        let p1 = json!({"code": "prd", "productId": "p1", "title": "T", "draft": "D", "eventId": "e1"});
        let p2 = json!({"code": "prd", "productId": "p1", "title": "T", "draft": "D", "eventId": "e2"});
        let a = create_candidate(&conn, "deliverable_draft", &p1, None, None).unwrap();
        let b = create_candidate(&conn, "deliverable_draft", &p2, None, None).unwrap();
        assert_eq!(a.confirmation_token, b.confirmation_token);
    }

    #[test]
    fn dedup_not_across_kinds_or_consumed() {
        let conn = mem_conn();
        // same params under knowledge_write: no dedup
        let args = json!({"x": 1});
        create_candidate(&conn, "knowledge_write", &args, None, None).unwrap();
        create_candidate(&conn, "knowledge_write", &args, None, None).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM agent_confirmation_candidates WHERE kind = 'knowledge_write'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2);

        // consumed destructive candidate no longer dedups (not in listActive)
        let d = create_candidate(&conn, "destructive_action", &json!({"k": 1}), None, None).unwrap();
        confirm(&conn, &d.confirmation_token).unwrap();
        consume(&conn, &d.confirmation_token, None).unwrap();
        let d2 = create_candidate(&conn, "destructive_action", &json!({"k": 1}), None, None).unwrap();
        assert_ne!(d.confirmation_token, d2.confirmation_token);
    }

    #[test]
    fn reject_then_consume_fails() {
        let conn = mem_conn();
        let c = create_candidate(&conn, "knowledge_write", &json!({"a": 1}), None, None).unwrap();
        assert!(reject(&conn, &c.confirmation_token));
        assert!(!reject(&conn, &c.confirmation_token), "already settled");
        assert_eq!(consume(&conn, &c.confirmation_token, None).unwrap_err().code(), "already_settled");
    }

    #[test]
    fn confirm_idempotent_keeps_original_confirmed_at() {
        let conn = mem_conn();
        let c = create_candidate(&conn, "knowledge_write", &json!({"a": 1}), None, None).unwrap();
        let first = confirm(&conn, &c.confirmation_token).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let second = confirm(&conn, &c.confirmation_token).unwrap();
        assert_eq!(first.confirmed_at, second.confirmed_at, "COALESCE keeps original confirmed_at");
    }

    #[test]
    fn concurrent_consume_exactly_one_wins() {
        // Two threads, two separate connections to one WAL file DB (plan-mandated shape).
        let path = file_conn("confirmations_concurrent");
        let token = {
            let conn = mem_conn();
            let _ = &conn;
            // create on the file DB
            create_candidate(&path, "destructive_action", &json!({"toolName": "rm", "args": {}}), None, None)
                .unwrap()
                .confirmation_token
        };
        confirm(&path, &token).unwrap();

        let path_str = std::path::PathBuf::from(
            path.path().expect("file-backed connection").to_string(),
        );
        let t1 = std::thread::spawn({
            let p = path_str.clone();
            let token = token.clone();
            move || {
                let conn = crate::engine::db::testing::open_file(&p);
                consume(&conn, &token, None).is_ok()
            }
        });
        let t2 = std::thread::spawn({
            let p = path_str.clone();
            let token = token.clone();
            move || {
                let conn = crate::engine::db::testing::open_file(&p);
                consume(&conn, &token, None).is_ok()
            }
        });
        let (r1, r2) = (t1.join().unwrap(), t2.join().unwrap());
        assert!(
            r1 ^ r2,
            "exactly one concurrent consume succeeds (got {r1}, {r2})"
        );
        let status: String = path
            .query_row(
                "SELECT status FROM agent_confirmation_candidates WHERE confirmation_token = ?1",
                params![token],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "consumed");
    }

    #[test]
    fn memory_candidate_insert_columns_match_ts() {
        let conn = mem_conn();
        let hash = params_hash(&json!({"content": "hello", "scope": "global", "productId": null}));
        insert_memory_candidate(&conn, "tok1", "hello", &hash, "model_inferred", "global", None, Some("s1")).unwrap();
        let (status, origin, scope, session): (String, String, String, Option<String>) = conn
            .query_row(
                "SELECT status, origin, scope, session_id FROM memory_candidates WHERE candidate_token = 'tok1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(status, "pending");
        assert_eq!(origin, "model_inferred");
        assert_eq!(scope, "global");
        assert_eq!(session.as_deref(), Some("s1"));
        // not-nullables all populated
        let expires: String = conn
            .query_row("SELECT expires_at FROM memory_candidates WHERE candidate_token = 'tok1'", [], |r| r.get(0))
            .unwrap();
        assert!(expires.ends_with('Z'));
    }
}
