// src-tauri/src/engine/pm_store.rs
// Phase 29 (29-01) — task/schedule 关系表 SQL 层 + kv→关系表一次性幂等搬移。
// 29-02 的 9 个 PM 工具与启动搬移共用这一层。日期/时间全 TEXT 零转换。

use rusqlite::{params, Connection};
use serde_json::Value;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

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
