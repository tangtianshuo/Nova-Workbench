// src-tauri/src/engine/workflow_store.rs
// Phase 30 (30-02) — workflow_templates + deliverable_catalog_user SQL layer
// (pm_store 模式: TEXT 全存零转换,steps 整量 JSON 存取)。内置模板不入库
// (D-01: 打包 JSON 只读层,呈现层由 tools.rs include_str! 合并)。

use rusqlite::{params, Connection};
use serde_json::Value;

use crate::engine::event_log::now_iso;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(String::from)
}

/* === workflow_templates === */

pub fn insert_workflow(conn: &Connection, t: &Value, source: &str) -> Result<String> {
    let id = s(t, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = now_iso();
    let steps = t.get("steps").cloned().unwrap_or(Value::Array(vec![]));
    conn.execute(
        "INSERT INTO workflow_templates (id, name, description, steps_json, manifest_version, skill_trigger, skill_tools_json, source, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
        params![
            id,
            s(t, "name").unwrap_or_default(),
            s(t, "description").unwrap_or_default(),
            serde_json::to_string(&steps)?,
            t.get("manifestVersion").and_then(|x| x.as_i64()).unwrap_or(1),
            s(t, "skillTrigger"),
            t.get("skillTools").map(serde_json::to_string).transpose()?,
            source,
            now,
        ],
    )?;
    Ok(id)
}

pub fn update_workflow(conn: &Connection, id: &str, updates: &Value) -> Result<bool> {
    let mut sets = Vec::new();
    let mut args: Vec<String> = Vec::new();
    let obj = updates.as_object();
    // (camel key, column) — steps 整量替换
    for (camel, col) in [
        ("name", "name"),
        ("description", "description"),
        ("skillTrigger", "skill_trigger"),
    ] {
        if let Some(v) = obj.and_then(|o| o.get(camel)) {
            if v.is_null() { continue; }
            args.push(v.as_str().unwrap_or_default().to_string());
            sets.push(format!("{col} = ?{}", args.len()));
        }
    }
    if let Some(steps) = obj.and_then(|o| o.get("steps")) {
        if !steps.is_null() {
            args.push(serde_json::to_string(steps)?);
            sets.push(format!("steps_json = ?{}", args.len()));
        }
    }
    if sets.is_empty() { return Ok(false); }
    sets.push(format!("updated_at = ?{}", args.len() + 1));
    args.push(now_iso());
    args.push(id.to_string());
    let sql = format!("UPDATE workflow_templates SET {} WHERE id = ?{}", sets.join(", "), args.len());
    Ok(conn.execute(&sql, rusqlite::params_from_iter(args))? > 0)
}

pub fn delete_workflow(conn: &Connection, id: &str) -> Result<bool> {
    Ok(conn.execute("DELETE FROM workflow_templates WHERE id = ?1", params![id])? > 0)
}

/// All user/distilled rows, steps_json parsed back to an array.
pub fn list_workflows(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, steps_json, source, updated_at FROM workflow_templates ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(serde_json::json!({
            "id": r.get::<_, String>(0)?,
            "name": r.get::<_, String>(1)?,
            "description": r.get::<_, String>(2)?,
            "steps": serde_json::from_str::<Value>(&r.get::<_, String>(3)?).unwrap_or(Value::Array(vec![])),
            "source": r.get::<_, String>(4)?,
            "updatedAt": r.get::<_, String>(5)?,
        }))
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/* === deliverable_catalog_user (SC-4 read layer this phase) === */

pub fn list_catalog_user(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT code, phase, phase_name, title, category, format, icon, summary FROM deliverable_catalog_user ORDER BY code",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(serde_json::json!({
            "code": r.get::<_, String>(0)?,
            "phase": r.get::<_, String>(1)?,
            "phaseName": r.get::<_, String>(2)?,
            "title": r.get::<_, String>(3)?,
            "category": r.get::<_, String>(4)?,
            "format": r.get::<_, String>(5)?,
            "icon": r.get::<_, String>(6)?,
            "summary": r.get::<_, String>(7)?,
        }))
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Code dedup (Pitfall #3): user extensions must never shadow builtin DEL-*
/// slots or existing user rows — the check runs at insert, not at read.
pub fn insert_catalog_user(conn: &Connection, e: &Value) -> Result<String> {
    let Some(code) = s(e, "code") else {
        return Err("catalog code must be a non-empty string".into());
    };
    if crate::engine::tools::catalog_has_code(&code) {
        return Err(format!("code {code} collides with a builtin catalog slot").into());
    }
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deliverable_catalog_user WHERE code = ?1",
        [&code],
        |r| r.get(0),
    )?;
    if existing > 0 {
        return Err(format!("code {code} already exists in the user catalog").into());
    }
    let now = now_iso();
    conn.execute(
        "INSERT INTO deliverable_catalog_user (code, phase, phase_name, title, category, format, icon, summary, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            code,
            s(e, "phase").unwrap_or_default(),
            s(e, "phaseName").unwrap_or_default(),
            s(e, "title").unwrap_or_default(),
            s(e, "category").unwrap_or_default(),
            s(e, "format").unwrap_or_else(|| "markdown".into()),
            s(e, "icon").unwrap_or_else(|| "FileText".into()),
            s(e, "summary").unwrap_or_default(),
            now,
        ],
    )?;
    Ok(code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use serde_json::json;

    #[test]
    fn workflow_roundtrip() {
        let conn = mem_conn();
        let steps = json!([{ "name": "S1", "prompt": "P1", "expectedSlotCode": "DEL-REL-03" }]);
        let id = insert_workflow(&conn, &json!({"name": "竞品分析", "description": "d", "steps": steps}), "user").unwrap();
        let rows = list_workflows(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], json!(id));
        assert_eq!(rows[0]["name"], "竞品分析");
        assert_eq!(rows[0]["steps"], steps);
        assert_eq!(rows[0]["source"], "user");
        assert!(update_workflow(&conn, &id, &json!({"name": "新名", "steps": [{"name": "S2", "prompt": "P2"}]})).unwrap());
        let rows = list_workflows(&conn).unwrap();
        assert_eq!(rows[0]["name"], "新名");
        assert_eq!(rows[0]["steps"].as_array().unwrap().len(), 1);
        assert!(delete_workflow(&conn, &id).unwrap());
        assert!(!delete_workflow(&conn, &id).unwrap());
        assert!(list_workflows(&conn).unwrap().is_empty());
    }

    #[test]
    fn catalog_user_rejects_builtin_and_duplicate_codes() {
        let conn = mem_conn();
        let e = insert_catalog_user(&conn, &json!({"code": "DEL-REQ-01", "phase": "req", "phaseName": "需求", "title": "T"}));
        assert!(e.is_err(), "builtin DEL-* must not be shadowable");
        insert_catalog_user(&conn, &json!({"code": "DEL-USR-01", "title": "自定义"})).unwrap();
        assert!(insert_catalog_user(&conn, &json!({"code": "DEL-USR-01", "title": "dup"})).is_err());
        let rows = list_catalog_user(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["code"], "DEL-USR-01");
    }
}
