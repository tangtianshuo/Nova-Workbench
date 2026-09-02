// src-tauri/src/engine/pm_store.rs
// Phase 29 (29-01) — task/schedule 关系表 SQL 层 + kv→关系表一次性幂等搬移。
// 29-02 的 9 个 PM 工具与启动搬移共用这一层。日期/时间全 TEXT 零转换。

use rusqlite::{params, Connection};
use serde_json::Value;

use crate::engine::event_log::now_iso;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

const TASK_COLUMNS: &[&str] = &[
    "title", "status", "priority", "deadline", "description", "project",
    "project_id", "assignee", "assignee_avatar", "time", "category_id", "scheduled_event_id",
];

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(String::from)
}

/* === tasks === */

pub fn insert_task(conn: &Connection, t: &Value) -> Result<String> {
    let id = s(t, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = now_iso();
    conn.execute(
        "INSERT OR IGNORE INTO tasks (id, title, status, priority, deadline, description, project, project_id, assignee, assignee_avatar, time, category_id, scheduled_event_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)",
        params![
            id,
            s(t, "title").unwrap_or_default(),
            s(t, "status").unwrap_or_else(|| "未开始".into()),
            s(t, "priority").unwrap_or_else(|| "medium".into()),
            s(t, "deadline").unwrap_or_default(),
            s(t, "description").unwrap_or_default(),
            s(t, "project").unwrap_or_default(),
            s(t, "projectId"),
            s(t, "assignee").unwrap_or_default(),
            s(t, "assigneeAvatar").unwrap_or_default(),
            s(t, "time").unwrap_or_default(),
            s(t, "categoryId").unwrap_or_default(),
            s(t, "scheduledEventId"),
            now,
        ],
    )?;
    Ok(id)
}

pub fn update_task(conn: &Connection, id: &str, updates: &Value) -> Result<bool> {
    update_row(conn, "tasks", "id", id, updates, TASK_COLUMNS)
}

pub fn delete_task(conn: &Connection, id: &str) -> Result<bool> {
    // clear reverse weak link (taskStore.deleteTask clearTaskLink semantics)
    conn.execute("UPDATE schedules SET task_id = NULL WHERE task_id = ?1", params![id])?;
    Ok(conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])? > 0)
}

pub fn list_tasks(conn: &Connection, filters: &Value) -> Result<Vec<Value>> {
    let mut sql = String::from(
        "SELECT id, title, status, priority, deadline, description, project, project_id, assignee, assignee_avatar, time, category_id, scheduled_event_id FROM tasks WHERE 1=1",
    );
    let mut args: Vec<String> = Vec::new();
    for (f, col) in [("status", "status"), ("projectId", "project_id"), ("deadline", "deadline")] {
        if let Some(v) = s(filters, f) {
            args.push(v);
            sql.push_str(&format!(" AND {col} = ?{}", args.len()));
        }
    }
    let limit = filters.get("limit").and_then(|x| x.as_i64()).unwrap_or(50).clamp(1, 200);
    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {limit}"));
    query_rows(conn, &sql, &args, task_row_to_json)
}

fn task_row_to_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(serde_json::json!({
        "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?,
        "status": r.get::<_, String>(2)?, "priority": r.get::<_, String>(3)?,
        "deadline": r.get::<_, String>(4)?, "description": r.get::<_, String>(5)?,
        "project": r.get::<_, String>(6)?, "projectId": r.get::<_, Option<String>>(7)?,
        "assignee": r.get::<_, String>(8)?, "assigneeAvatar": r.get::<_, String>(9)?,
        "time": r.get::<_, String>(10)?, "categoryId": r.get::<_, String>(11)?,
        "scheduledEventId": r.get::<_, Option<String>>(12)?,
    }))
}

/* === schedules === */

pub fn upsert_schedule_from_json(conn: &Connection, e: &Value) -> Result<String> {
    let id = s(e, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = now_iso();
    conn.execute(
        "INSERT INTO schedules (id, title, time, date, type, location, project_id, task_id, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, time=excluded.time, date=excluded.date,
           type=excluded.type, location=excluded.location, project_id=excluded.project_id,
           task_id=excluded.task_id, status=excluded.status, updated_at=excluded.updated_at",
        params![
            id,
            s(e, "title").unwrap_or_default(),
            s(e, "time").unwrap_or_default(),
            s(e, "date").unwrap_or_default(),
            s(e, "type").unwrap_or_else(|| "reminder".into()),
            s(e, "location").unwrap_or_default(),
            s(e, "projectId"),
            s(e, "taskId"),
            s(e, "status").unwrap_or_else(|| "未开始".into()),
            now,
        ],
    )?;
    Ok(id)
}

pub fn update_schedule(conn: &Connection, id: &str, updates: &Value) -> Result<bool> {
    update_row(conn, "schedules", "id", id, updates, &["title", "time", "date", "type", "location", "project_id", "task_id", "status"])
}

pub fn delete_schedule(conn: &Connection, id: &str) -> Result<bool> {
    Ok(conn.execute("DELETE FROM schedules WHERE id = ?1", params![id])? > 0)
}

pub fn list_schedules(conn: &Connection, filters: &Value) -> Result<Vec<Value>> {
    let mut sql = String::from(
        "SELECT id, title, time, date, type, location, project_id, task_id, status FROM schedules WHERE 1=1",
    );
    let mut args: Vec<String> = Vec::new();
    for (f, col) in [("date", "date"), ("projectId", "project_id"), ("taskId", "task_id")] {
        if let Some(v) = s(filters, f) {
            args.push(v);
            sql.push_str(&format!(" AND {col} = ?{}", args.len()));
        }
    }
    let limit = filters.get("limit").and_then(|x| x.as_i64()).unwrap_or(50).clamp(1, 200);
    sql.push_str(&format!(" ORDER BY date DESC, time DESC LIMIT {limit}"));
    query_rows(conn, &sql, &args, |r| {
        Ok(serde_json::json!({
            "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?,
            "time": r.get::<_, String>(2)?, "date": r.get::<_, String>(3)?,
            "type": r.get::<_, String>(4)?, "location": r.get::<_, String>(5)?,
            "projectId": r.get::<_, Option<String>>(6)?, "taskId": r.get::<_, Option<String>>(7)?,
            "status": r.get::<_, String>(8)?,
        }))
    })
}

/* === shared helpers === */

fn update_row(conn: &Connection, table: &str, key_col: &str, id: &str, updates: &Value, allowed: &[&str]) -> Result<bool> {
    let mut sets = Vec::new();
    let mut args: Vec<String> = Vec::new();
    let obj = updates.as_object();
    for col in allowed {
        let camel = match *col {
            "project_id" => "projectId", "assignee_avatar" => "assigneeAvatar",
            "category_id" => "categoryId", "scheduled_event_id" => "scheduledEventId",
            "task_id" => "taskId", _ => col,
        };
        if let Some(v) = obj.and_then(|o| o.get(camel).or_else(|| o.get(*col))) {
            if v.is_null() { continue; }
            args.push(v.as_str().unwrap_or_default().to_string());
            sets.push(format!("{col} = ?{}", args.len()));
        }
    }
    if sets.is_empty() { return Ok(false); }
    sets.push("updated_at = ?_now".replace("_now", &(args.len() + 1).to_string()));
    args.push(now_iso());
    args.push(id.to_string());
    let sql = format!("UPDATE {table} SET {} WHERE {key_col} = ?{}", sets.join(", "), args.len());
    Ok(conn.execute(&sql, rusqlite::params_from_iter(args))? > 0)
}

fn query_rows(
    conn: &Connection,
    sql: &str,
    args: &[String],
    map: fn(&rusqlite::Row) -> rusqlite::Result<Value>,
) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(args), map)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/* === one-shot kv → relational migration === */

pub fn migrate_kv_pm_data(conn: &Connection) -> Result<()> {
    let latched: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key='pm_kv_migrated_v29'", [], |r| r.get(0))
        .ok();
    if latched.as_deref() == Some("true") {
        return Ok(());
    }

    // nova-task: {"state":{"categories":[{...,tasks:[...]}]}}
    if let Ok(v) = conn.query_row("SELECT value FROM kv_store WHERE key='nova-task'", [], |r| r.get::<_, String>(0)) {
        match serde_json::from_str::<Value>(&v) {
            Ok(kv) => {
                if let Some(cats) = kv.pointer("/state/categories").and_then(|c| c.as_array()) {
                    for cat in cats {
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO task_categories (id, name, color, sort) VALUES (?1,?2,?3,?4)",
                            params![
                                s(cat, "id").unwrap_or_default(),
                                s(cat, "name").unwrap_or_default(),
                                s(cat, "color").unwrap_or_else(|| "bg-blue-500".into()),
                                cat.get("sort").and_then(|x| x.as_i64()).unwrap_or(0),
                            ],
                        );
                        if let Some(tasks) = cat.get("tasks").and_then(|t| t.as_array()) {
                            for t in tasks {
                                let mut t = t.clone();
                                if t.get("categoryId").is_none() {
                                    t["categoryId"] = Value::String(s(cat, "id").unwrap_or_default());
                                }
                                let _ = insert_task(conn, &t);
                            }
                        }
                    }
                }
            }
            Err(e) => eprintln!("[pm_store] nova-task kv parse failed, skipped: {e}"),
        }
    }

    // nova-schedule: {"state":{"events":[...]}}
    if let Ok(v) = conn.query_row("SELECT value FROM kv_store WHERE key='nova-schedule'", [], |r| r.get::<_, String>(0)) {
        match serde_json::from_str::<Value>(&v) {
            Ok(kv) => {
                if let Some(events) = kv.pointer("/state/events").and_then(|e| e.as_array()) {
                    for e in events {
                        let _ = upsert_schedule_from_json(conn, e);
                    }
                }
            }
            Err(e) => eprintln!("[pm_store] nova-schedule kv parse failed, skipped: {e}"),
        }
    }

    // kv rows are intentionally preserved (CONTEXT: kv key 备份保留不删)
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('pm_kv_migrated_v29', 'true')",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use serde_json::json;

    const TASK_KV: &str = r#"{"state":{"categories":[{"id":"cat-1","name":"待办","color":"bg-blue-500","tasks":[{"id":"t1","title":"写 PRD","priority":"high","status":"未开始","deadline":"2026-09-03"}]}]},"version":2}"#;
    const SCHEDULE_KV: &str = r#"{"state":{"events":[{"id":"e1","title":"评审","time":"10:00","date":"2026-09-03","type":"meeting","location":"A"}]},"version":3}"#;

    fn seeded_kv_conn() -> Connection {
        let conn = mem_conn();
        conn.execute("INSERT INTO kv_store (key, value) VALUES ('nova-task', ?1)", params![TASK_KV]).unwrap();
        conn.execute("INSERT INTO kv_store (key, value) VALUES ('nova-schedule', ?1)", params![SCHEDULE_KV]).unwrap();
        conn
    }

    #[test]
    fn migrates_kv_tasks_and_schedules() {
        let conn = seeded_kv_conn();
        migrate_kv_pm_data(&conn).unwrap();
        let (prio, deadline, cat): (String, String, String) = conn
            .query_row("SELECT priority, deadline, category_id FROM tasks WHERE id='t1'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap();
        assert_eq!((prio.as_str(), deadline.as_str(), cat.as_str()), ("high", "2026-09-03", "cat-1"));
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM task_categories WHERE id='cat-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        let status: String = conn.query_row("SELECT status FROM schedules WHERE id='e1'", [], |r| r.get(0)).unwrap();
        assert_eq!(status, "未开始");
    }

    #[test]
    fn migration_is_idempotent_and_keeps_new_rows() {
        let conn = seeded_kv_conn();
        migrate_kv_pm_data(&conn).unwrap();
        // reset latch to force re-read
        conn.execute("DELETE FROM meta WHERE key='pm_kv_migrated_v29'", []).unwrap();
        migrate_kv_pm_data(&conn).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        // a row not present in kv survives a re-run
        insert_task(&conn, &json!({"id": "new-t", "title": "后续新增"})).unwrap();
        conn.execute("DELETE FROM meta WHERE key='pm_kv_migrated_v29'", []).unwrap();
        migrate_kv_pm_data(&conn).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn kv_keys_are_preserved() {
        let conn = seeded_kv_conn();
        migrate_kv_pm_data(&conn).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM kv_store WHERE key='nova-task'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn latch_prevents_second_run() {
        let conn = seeded_kv_conn();
        migrate_kv_pm_data(&conn).unwrap();
        let v: String = conn.query_row("SELECT value FROM meta WHERE key='pm_kv_migrated_v29'", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "true");
        // wipe kv data, clear tables — latch set means no re-migration
        conn.execute("DELETE FROM kv_store", []).unwrap();
        migrate_kv_pm_data(&conn).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn bad_json_or_missing_key_is_skipped() {
        let conn = mem_conn();
        conn.execute("INSERT INTO kv_store (key, value) VALUES ('nova-task', 'not json')", []).unwrap();
        migrate_kv_pm_data(&conn).unwrap(); // no panic
        let v: String = conn.query_row("SELECT value FROM meta WHERE key='pm_kv_migrated_v29'", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "true");
    }

    #[test]
    fn task_and_schedule_roundtrip() {
        let conn = mem_conn();
        let id = insert_task(&conn, &json!({"title": "T", "priority": "low", "projectId": "p1"})).unwrap();
        let tasks = list_tasks(&conn, &json!({})).unwrap();
        let t = tasks.iter().find(|t| t["id"] == json!(id)).unwrap();
        assert_eq!(t["title"], "T");
        assert_eq!(t["projectId"], "p1");
        assert_eq!(t["priority"], "low");
        assert!(update_task(&conn, &id, &json!({"status": "已完成"})).unwrap());
        let sid = upsert_schedule_from_json(&conn, &json!({"title": "S", "date": "2026-09-03", "type": "sync", "taskId": id.clone()})).unwrap();
        let scheds = list_schedules(&conn, &json!({"date": "2026-09-03"})).unwrap();
        assert_eq!(scheds.len(), 1);
        assert_eq!(scheds[0]["taskId"], json!(id));
        // delete task clears the schedule backlink
        assert!(delete_task(&conn, &id).unwrap());
        let link: Option<String> = conn.query_row("SELECT task_id FROM schedules WHERE id=?1", params![sid], |r| r.get(0)).unwrap();
        assert_eq!(link, None);
        assert!(delete_schedule(&conn, &sid).unwrap());
        assert!(!delete_task(&conn, "missing").unwrap());
    }
}
