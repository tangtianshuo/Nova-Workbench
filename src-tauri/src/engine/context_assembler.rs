// src-tauri/src/engine/context_assembler.rs
// Phase 22 (22-05) — port of src/ai/contextAssembler.ts (MEM-08, Phase 15 Plan 02).
// Five-segment priority context assembly [core 600 / pending 200 / memories 500
// / fts_topk 400 / recent_dialog 300], RECENT_DIALOG_RESERVED=1200, overflow
// drops the OLDEST entries, every segment audited as {name, items, tokens,
// truncated}. Read-only FTS5/memory SQL is ported verbatim from
// memoryStore.ts / knowledgeRepo.ts; writes stay in confirmations.rs.
//
// Divergence accepted (plan-sanctioned): clamp_to_tokens operates on char
// boundaries (TS slices UTF-16 code units). Locked by the CJK+emoji fixture.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::engine::event_log::now_iso;
use crate::engine::fts_tokens::{fts_match_string, fts_tokens};
use crate::engine::token_estimate::estimate_tokens;

pub const RECENT_DIALOG_RESERVED: i64 = 1200;
pub const FTS_TOP_K: usize = 5;
pub const REJECTED_LIMIT: usize = 5;

/// 32-05 (ENGINE-01): research-first contract injected into the system prompt
/// when the workspace has a bound repo root (coding toolset available).
/// Four steps: 侦察 → 定位 → 修改 → 验证.
pub const CODE_CONTRACT_PROMPT: &str = "## 代码工作契约\n\n你拥有代码工作能力。遵循先研究后行动:先用 code_read/code_grep 侦察理解现状,再定位修改点,然后用 code_write/code_edit 提出修改并等待确认,最后用 exec 验证。研究类工具(code_read/code_grep)零确认自由调用;行动类工具(code_write/code_edit/exec)每步过审批。未绑定仓库或路径越界会被拒绝,按错误提示调整。";

/// Append the ENGINE-01 contract to the system prompt iff the workspace has
/// a bound repo root; unbound workspaces get no coding prompt at all.
pub fn append_code_contract(prompt: String, repo_root: Option<&std::path::Path>) -> String {
    match repo_root {
        Some(_) => format!("{prompt}\n\n{CODE_CONTRACT_PROMPT}"),
        None => prompt,
    }
}

const QUOTA_CORE: i64 = 600;
const QUOTA_PENDING: i64 = 200;
const QUOTA_MEMORIES: i64 = 500;
const QUOTA_FTS_TOPK: i64 = 400;
const QUOTA_RECENT_DIALOG: i64 = 300;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

/* === clamps (contextAssembler.ts:51-75) === */

/// Longest prefix fitting `quota` tokens (binary search on char boundaries).
pub fn clamp_to_tokens(text: &str, quota: i64) -> (String, bool) {
    if estimate_tokens(text) <= quota {
        return (text.to_string(), false);
    }
    let chars: Vec<char> = text.chars().collect();
    let mut lo: usize = 0;
    let mut hi: usize = chars.len();
    while lo < hi {
        let mid = (lo + hi + 1) / 2; // TS Math.ceil((lo+hi)/2)
        let prefix: String = chars[..mid].iter().collect();
        if estimate_tokens(&prefix) <= quota {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    (chars[..lo].iter().collect(), true)
}

/// Keep the head of `lines` (keep-first order) within `quota`; drop the tail.
/// The first line is always kept even when over quota (TS `kept.length > 0` guard).
pub fn clamp_lines(lines: &[String], quota: i64) -> (String, usize, bool) {
    let mut kept: Vec<&String> = Vec::new();
    let mut used: i64 = 0;
    for line in lines {
        let cost = estimate_tokens(line);
        if !kept.is_empty() && used + cost > quota {
            break;
        }
        kept.push(line);
        used += cost;
    }
    let truncated = lines.len() > kept.len();
    (kept.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("\n"), kept.len(), truncated)
}

/* === read-only retrieval (SQL verbatim from the TS spec sources) === */

/// knowledgeRepo.ts:331-341 — FTS5 MATCH + structural filters in one WHERE.
/// Callers pass the fts_match_string form; only current doc versions.
pub fn search_knowledge_hybrid(
    conn: &Connection,
    query_match: &str,
    product_id: Option<&str>,
    limit: usize,
) -> Result<Vec<KnowledgeHit>> {
    let mut stmt = conn.prepare(
        "SELECT d.title, d.version, d.updated_at, d.summary, d.product_id
           FROM knowledge_fts f
           JOIN knowledge_docs d ON d.doc_rowid = f.doc_rowid
          WHERE knowledge_fts MATCH $1
            AND d.superseded_at IS NULL
            AND ($2 IS NULL OR d.product_id = $2)
          ORDER BY f.rank
          LIMIT $3",
    )?;
    let hits = stmt
        .query_map(params![query_match, product_id, limit as i64], |row| {
            Ok(KnowledgeHit {
                title: row.get(0)?,
                version: row.get(1)?,
                updated_at: row.get(2)?,
                summary: row.get(3)?,
                product_id: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(hits)
}

/// memoryStore.ts:736-746 — newest-first active memories, overflow drops the tail.
fn list_active_memories(conn: &Connection, product_id: Option<&str>) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT content FROM memories
          WHERE superseded_at IS NULL AND deleted_at IS NULL
            AND (scope = 'global' OR ($1 IS NOT NULL AND product_id = $1))
          ORDER BY confirmed_at DESC",
    )?;
    let rows = stmt
        .query_map(params![product_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// memoryStore.ts:642-652 — pending candidates (assembler passes no sessionId filter).
fn list_pending_memory_candidates(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT content FROM memory_candidates
          WHERE status = 'pending' AND expires_at > $1
          ORDER BY created_at ASC",
    )?;
    let rows = stmt
        .query_map(params![now_iso()], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// memoryStore.ts:654-664 — rejected do-not-repropose list, newest rejection first.
fn list_rejected_memory_candidates(conn: &Connection, limit: usize) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT content FROM memory_candidates
          WHERE status = 'rejected'
          ORDER BY rejected_at DESC
          LIMIT $1",
    )?;
    let rows = stmt
        .query_map(params![limit as i64], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/* === assemble (contextAssembler.ts:77-160) === */

#[derive(Clone, Debug)]
pub struct KnowledgeHit {
    pub title: String,
    pub version: i64,
    pub updated_at: String,
    pub summary: String,
    pub product_id: String,
}

/// Five-segment assembly. Returns the full assembled shape; the loop appends
/// `payload["audit"]` as the context_injected event payload (TS parity:
/// only the audit lands in the event, coreContext feeds the system prompt).
pub fn assemble_context(
    conn: &Connection,
    core_text: &str,
    product_id: Option<&str>,
    user_message: &str,
) -> Value {
    let mut sections: Vec<String> = Vec::new();
    let mut segments: Vec<Value> = Vec::new();

    // 1. core — business facts (locked: stays the coreContext seed)
    let (core_clamped, core_truncated) = clamp_to_tokens(core_text, QUOTA_CORE);
    sections.push(core_clamped.clone());
    segments.push(json!({
        "name": "core", "items": 1,
        "tokens": estimate_tokens(&core_clamped), "truncated": core_truncated,
    }));

    // 2. pending candidates + rejected do-not-repropose list (MEM-02) plus the
    // deliverable-draft equivalents (Phase 16, same shape). Deliverable queries
    // degrade to empty on failure — never block injection.
    let rejected = list_rejected_memory_candidates(conn, REJECTED_LIMIT).unwrap_or_default();
    let pending = list_pending_memory_candidates(conn).unwrap_or_default();
    let deliverable_pending = crate::engine::confirmations::list_pending(conn, "deliverable_draft")
        .unwrap_or_default();
    let deliverable_rejected = crate::engine::confirmations::list_rejected(conn, "deliverable_draft", REJECTED_LIMIT)
        .unwrap_or_default();

    let mut pending_lines: Vec<String> = Vec::new();
    if !rejected.is_empty() {
        pending_lines.push(format!("不要再提出以下记忆（用户已拒绝）: {}", rejected.join("；")));
    }
    if !deliverable_rejected.is_empty() {
        let items = deliverable_rejected
            .iter()
            .filter_map(|c| {
                let code = c.params.get("code").and_then(|v| v.as_str())?;
                let title = c.params.get("title").and_then(|v| v.as_str())?;
                Some(format!("{}《{}》", code.to_uppercase(), title))
            })
            .collect::<Vec<_>>()
            .join("；");
        pending_lines.push(format!("不要再生成以下交付物草稿（用户已忽略）: {items}"));
    }
    for content in &pending {
        pending_lines.push(format!("- （待用户确认）{content}"));
    }
    for c in &deliverable_pending {
        let code = c.params.get("code").and_then(|v| v.as_str()).unwrap_or("");
        let title = c.params.get("title").and_then(|v| v.as_str()).unwrap_or("");
        pending_lines.push(format!("- （待用户确认）{} 草稿《{}》", code.to_uppercase(), title));
    }
    if !pending_lines.is_empty() {
        let (text, _, truncated) = clamp_lines(&pending_lines, QUOTA_PENDING);
        sections.push(format!("## 待确认记忆候选\n{text}"));
        segments.push(json!({
            "name": "pending", "items": pending.len() + deliverable_pending.len(),
            "tokens": estimate_tokens(&text), "truncated": truncated,
        }));
    } else {
        segments.push(json!({"name": "pending", "items": 0, "tokens": 0, "truncated": false}));
    }

    // 3. confirmed memories — newest-first, overflow drops the tail (locked)
    let memories = list_active_memories(conn, product_id).unwrap_or_default();
    if !memories.is_empty() {
        let lines = memories.iter().map(|m| format!("- {m}")).collect::<Vec<_>>();
        let (text, _, truncated) = clamp_lines(&lines, QUOTA_MEMORIES);
        sections.push(format!("## 已确认长期记忆\n{text}"));
        segments.push(json!({
            "name": "memories", "items": memories.len(),
            "tokens": estimate_tokens(&text), "truncated": truncated,
        }));
    } else {
        segments.push(json!({"name": "memories", "items": 0, "tokens": 0, "truncated": false}));
    }

    // 4. fts_topk — knowledge hybrid retrieval; symbol-only input skips;
    // failure degrades to empty hits (toolLoop's searchKnowledgeLazy catch → [])
    let tokens = fts_tokens(user_message);
    if tokens.is_empty() {
        segments.push(json!({"name": "fts_topk", "items": 0, "tokens": 0, "truncated": false, "skipped": true}));
    } else {
        let query = fts_match_string(&tokens);
        let hits = search_knowledge_hybrid(conn, &query, None, FTS_TOP_K).unwrap_or_default();
        let lines = hits
            .iter()
            .map(|h| format!("- {}（来源: {} v{} {}）", h.summary, h.title, h.version, h.updated_at))
            .collect::<Vec<_>>();
        let (text, _, truncated) = clamp_lines(&lines, QUOTA_FTS_TOPK);
        if !text.is_empty() {
            sections.push(format!("## 知识库检索 top-{FTS_TOP_K}\n{text}"));
        }
        segments.push(json!({
            "name": "fts_topk", "items": hits.len(),
            "tokens": estimate_tokens(&text), "truncated": truncated, "query": query,
        }));
    }

    // 5. recent_dialog — budget reservation only, no content re-injection (locked)
    segments.push(json!({
        "name": "recent_dialog", "items": 0, "tokens": QUOTA_RECENT_DIALOG,
        "truncated": false, "reservedTokens": RECENT_DIALOG_RESERVED,
    }));

    sections.retain(|s| !s.is_empty());
    json!({
        "coreContext": sections.join("\n\n"),
        "audit": { "segments": segments },
    })
}

/* === Tests (ported structure from phase15 contextAssembler tests + golden locks) === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use crate::engine::event_log::now_iso;

    fn seed_knowledge(conn: &Connection) {
        let insert = |rowid: i64, title: &str, summary: &str, superseded: Option<&str>| {
            conn.execute(
                "INSERT INTO knowledge_docs (doc_rowid, doc_id, version, product_id, title, category,
                     tags_json, summary, content, author, source_type, created_at, updated_at, superseded_at)
                 VALUES (?1, ?2, 1, 'p1', ?3, '架构设计', '[]', ?4, '正文', 'AI 助手', 'seed', ?5, ?5, ?6)",
                params![rowid, format!("doc-{rowid}"), title, summary, now_iso(), superseded],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO knowledge_fts (title, content, summary, tags, doc_rowid) VALUES (?1, '正文', ?2, '', ?3)",
                params![fts_tokens(title).join(" "), fts_tokens(summary).join(" "), rowid],
            )
            .unwrap();
        };
        insert(1, "需求流程", "需求从提出到确认的流程", None);
        insert(2, "旧版需求流程", "已废弃版本", Some("2026-01-01T00:00:00.000Z"));
    }

    fn seed_memory(conn: &Connection) {
        let now = now_iso();
        conn.execute(
            "INSERT INTO memories (memory_id, version, content, content_hash, origin, scope, product_id,
                 source_type, created_at, confirmed_at)
             VALUES ('m1', 1, '用户偏好简洁回复', 'h1', 'user_directed', 'global', NULL, 'seed', ?1, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO memory_candidates (candidate_token, content, content_hash, origin, scope, status,
                 created_at, expires_at, rejected_at)
             VALUES ('c1', '被拒的记忆', 'rh1', 'model_inferred', 'global', 'rejected', ?1, ?1, ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO memory_candidates (candidate_token, content, content_hash, origin, scope, status,
                 created_at, expires_at)
             VALUES ('c2', '待确认的记忆', 'ph1', 'model_inferred', 'global', 'pending', ?1, '2999-01-01T00:00:00.000Z')",
            params![now],
        )
        .unwrap();
    }

    #[test]
    fn five_segments_payload_shape_and_text() {
        let conn = mem_conn();
        seed_knowledge(&conn);
        seed_memory(&conn);
        let assembled = assemble_context(&conn, "核心业务事实", None, "需求流程");
        let core = assembled["coreContext"].as_str().unwrap();

        // segment order + names locked
        let segments = assembled["audit"]["segments"].as_array().unwrap();
        let names: Vec<&str> = segments.iter().map(|s| s["name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["core", "pending", "memories", "fts_topk", "recent_dialog"]);

        // verbatim section titles + line formats
        assert!(core.contains("核心业务事实"));
        assert!(core.contains("## 待确认记忆候选"));
        assert!(core.contains("不要再提出以下记忆（用户已拒绝）: 被拒的记忆"));
        assert!(core.contains("- （待用户确认）待确认的记忆"));
        assert!(core.contains("## 已确认长期记忆"));
        assert!(core.contains("- 用户偏好简洁回复"));
        assert!(core.contains("## 知识库检索 top-5"));

        // fts segment hit the live doc, superseded filtered out
        let fts = &segments[3];
        assert_eq!(fts["items"], json!(1));
        assert!(core.contains("需求从提出到确认的流程"));
        assert!(!core.contains("已废弃版本"));

        // recent_dialog reservation
        let recent = &segments[4];
        assert_eq!(recent["tokens"], json!(300));
        assert_eq!(recent["reservedTokens"], json!(1200));
        assert_eq!(recent["items"], json!(0));
    }

    #[test]
    fn symbol_only_user_message_skips_fts() {
        let conn = mem_conn();
        seed_knowledge(&conn);
        let assembled = assemble_context(&conn, "core", None, "!!! ???");
        let fts = &assembled["audit"]["segments"][3];
        assert_eq!(fts["skipped"], json!(true));
        assert_eq!(fts["items"], json!(0));
        assert!(assembled["coreContext"].as_str().unwrap().find("知识库检索").is_none());
    }

    #[test]
    fn fts_failure_degrades_to_empty_segment() {
        // Drop the fts table to force a query error — must not panic, hits degrade to [].
        let conn = mem_conn();
        seed_knowledge(&conn);
        conn.execute("DROP TABLE knowledge_fts", []).unwrap();
        let assembled = assemble_context(&conn, "core", None, "需求流程");
        let fts = &assembled["audit"]["segments"][3];
        assert_eq!(fts["items"], json!(0));
        assert_eq!(fts["truncated"], json!(false));
    }

    #[test]
    fn empty_state_zero_segments() {
        let conn = mem_conn();
        let assembled = assemble_context(&conn, "core only", None, "hello");
        let segments = assembled["audit"]["segments"].as_array().unwrap();
        assert_eq!(segments[1], json!({"name": "pending", "items": 0, "tokens": 0, "truncated": false}));
        assert_eq!(segments[2], json!({"name": "memories", "items": 0, "tokens": 0, "truncated": false}));
    }

    #[test]
    fn clamp_to_tokens_cjk_and_emoji_char_boundary() {
        // 30 CJK = 30 tokens, quota 10 → 10 chars kept.
        let text = "记".repeat(30);
        let (clamped, truncated) = clamp_to_tokens(&text, 10);
        assert_eq!(clamped.chars().count(), 10);
        assert!(truncated);

        // emoji = 2 surrogate CJK units + spaces/word — char boundary respected.
        let mixed = format!("{} {}", "👑".repeat(10), "word");
        let (clamped, truncated) = clamp_to_tokens(&mixed, 5);
        assert!(truncated);
        assert!(clamped.chars().all(|c| c != '\u{FFFD}'));
        assert!(estimate_tokens(&clamped) <= 5);

        // under quota → unchanged, not truncated
        let (same, truncated) = clamp_to_tokens("短", 100);
        assert_eq!(same, "短");
        assert!(!truncated);
    }

    #[test]
    fn code_contract_gated_on_repo_root() {
        // bound repo → ENGINE-01 contract present
        let bound = append_code_contract("base".into(), Some(std::path::Path::new("/repo")));
        assert!(bound.contains("先研究后行动"));
        assert!(bound.starts_with("base"));
        assert!(bound.contains("code_read/code_grep"));
        // unbound → no coding prompt at all
        let unbound = append_code_contract("base".into(), None);
        assert_eq!(unbound, "base");
        assert!(!unbound.contains("先研究后行动"));
    }

    #[test]
    fn clamp_lines_keeps_first_line_even_over_quota() {
        let lines = vec!["很长的一行".repeat(100), "第二行".to_string()];
        let (text, kept, truncated) = clamp_lines(&lines, 5);
        assert_eq!(kept, 1);
        assert!(truncated);
        assert!(text.contains("很长的一行"));
        // normal keep-first overflow: tail dropped once quota would be exceeded
        let lines = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let (text, kept, truncated) = clamp_lines(&lines, 1);
        assert_eq!(kept, 1);
        assert_eq!(text, "a");
        assert!(truncated);
    }
}
