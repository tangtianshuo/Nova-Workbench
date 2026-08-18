# Technology Stack — v0.3.1 Multi-Session Chat

**Project:** Nova-PM-Workspace (v0.3.1)
**Researched:** 2026-08-18
**Headline: ZERO new dependencies required.** Every capability in this milestone is covered by the existing migrations pattern, webview platform APIs, and the existing Rust llm.rs + toolLoop. Do not add anything from npm or crates.io for this milestone.

## Recommended Stack (all existing)

### SQL migration — sessions metadata table
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `src-tauri/migrations/0007_sessions.sql` | new file | sessions metadata | Follows the established forward-only, additive, `CREATE TABLE IF NOT EXISTS` + `schema_version` bump pattern (0002–0006 are the reference; 0002 shows the exact idiom including `INSERT OR IGNORE INTO meta`) |

Recommended schema shape (matches existing conventions — TEXT PKs, ISO timestamps, nullable optional FKs, no cascades per project constraints):

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  title TEXT,
  parent_session_id TEXT,
  fork_cut_seq INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title_source TEXT  -- 'llm' | 'fallback' | 'parent'
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions (workspace_id, updated_at DESC);
```

Notes:
- `APP_SCHEMA_VERSION` bump to 7 in `initializeDatabase` (0002 comment documents this contract).
- Backfill on migration: seed `sessions` rows from `agent_events GROUP BY session_id` (the `listSessions()` SQL in eventStore.ts line 206 is the template) so pre-0007 sessions appear in the new list. One `INSERT INTO sessions SELECT ...` statement, idempotent via `WHERE session_id NOT IN (SELECT session_id FROM sessions)`.
- Access: JS-side via `tauri-plugin-sql` + `lazySqlite()` — same as eventStore. Add `createSession / updateSessionTitle / listSessions(workspaceId?)` as a sibling `sessionRepo.ts` with dual (SQLite + in-memory) implementations — the pattern is established in eventStore.ts (lines 60/141). Sibling repo keeps `EventStore` append-only semantics clean.

### Fork — reference-based, event-prefix projection
| Technology | Purpose | Why |
|---------|---------|-----|
| `ChatSession.fromEvents(events.filter(e => e.seq <= forkCutSeq), { sessionId: newId })` | Build child session as pure projection | Already exists (chatSession.ts line 293) — projection-only (`__emitEvents: false`), then call existing `resumeEventEmission()` (line 153) when the fork becomes live so new events append to the child stream. |

No event copying, no new table. The fork cut seq comes from the hovered assistant message's event — keep `seq` on rebuilt ChatMessages (one small addition in `rebuildMessages`) so hover knows the cut point. Then insert a `sessions` row with `parent_session_id`/`fork_cut_seq`.

### Clipboard copy
| Technology | Purpose | Why |
|---------|---------|-----|
| `navigator.clipboard.writeText(text)` | Copy assistant message | Already used in 8 places in this codebase (FileArchiveView.tsx:139, TaskKanban.tsx:572, etc.). Tauri v2 WebView2/WKWebView support it within the app's own origin. No `tauri-plugin-clipboard-manager` needed — that plugin only matters for OS-level clipboard events/read-back, which this feature doesn't require. |

Caveat (MEDIUM, verify in UAT on Windows packaged build): `navigator.clipboard` requires a secure context; Tauri custom protocols qualify. If an edge case appears, fallback is `document.execCommand('copy')` on a temp textarea — do NOT preemptively add the plugin.

### Relative time formatting
| Technology | Purpose | Why |
|---------|---------|-----|
| `Intl.RelativeTimeFormat('zh', { numeric: 'auto' })` | "3 小时前" in session list | Web standard, no dayjs/date-fns. A ~15-line `formatRelativeTime(iso)` helper in `src/lib/` (秒/分/时/天/周 thresholds) is the only new code. Grep confirmed no existing relative-time util in the repo. |

### Workspace + session dropdowns (Ctrl+Shift+K ChatPanel header)
| Technology | Purpose | Why |
|---------|---------|-----|
| Existing `Select` primitive (`src/components/ui/Select.tsx`, Radix) | Dropdowns | Already composed and token-styled. No new UI lib. |
| Existing `workspaceStore` (persisted `activeWorkspaceId`) + `chatConsoleStore.activeSessionId` | Filter/联动 | Workspace switch re-filters session list; session select swaps active session (locked during streaming, per milestone spec). Pure Zustand wiring. |

### LLM auto-titling
| Technology | Purpose | Why |
|---------|---------|-----|
| Existing Rust `llm.rs` provider-agnostic backend + existing Tauri chat IPC path | Title generation call | One-shot prompt after first `turn_ended` (first user message + first assistant reply → ≤12 字标题). Fire-and-forget: success → `UPDATE sessions SET title=..., title_source='llm'`; failure → first user message truncated (`title_source='fallback'`). Guard with conditional `UPDATE ... WHERE title IS NULL` — atomic, same pattern as the Phase 14 confirmation-candidate conditional UPDATE. |

## Alternatives Considered (and rejected)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Clipboard | `navigator.clipboard` | `tauri-plugin-clipboard-manager` | Extra Rust dep + capability grants for what the webview already does; 8 in-repo precedents |
| Relative time | `Intl.RelativeTimeFormat` | dayjs/date-fns | Full lib for one list label |
| Fork model | Reference prefix projection | Copy events to new session_id | Duplicates the immutable audit log; prefix filter at rebuild time is free |
| Session storage | `sessions` metadata table; events stay content truth-source | Move messages into sessions table | Events are already the truth source; metadata table is the minimal addition (milestone decision locked) |
| Session repo | Sibling `sessionRepo.ts` dual impl | Extend `EventStore` interface | EventStore is content-log-only; metadata CRUD is a different concern |

## Installation

```bash
# Nothing. Zero new npm packages, zero new crates.
```

## Sources

- `src-tauri/migrations/0002_agent_events.sql` — migration idiom + schema_version contract (read directly, HIGH)
- `src/ai/events/eventStore.ts` — dual-impl pattern, `listSessions()` SQL backfill template (read directly, HIGH)
- `src/ai/chatSession.ts` — `fromEvents` / `resumeEventEmission` fork primitives already present (read directly, HIGH)
- In-repo `navigator.clipboard.writeText` usage ×8 (grep, HIGH)
- Tauri v2 clipboard behavior in packaged builds: training-data knowledge, flagged for UAT (MEDIUM)

## Confidence

| Area | Level | Note |
|------|-------|------|
| Migration 0007 pattern | HIGH | Six existing migrations to copy |
| Fork via fromEvents | HIGH | Code read directly; primitives exist |
| Clipboard | HIGH dev / MEDIUM packaged | Verify once in Windows UAT |
| Relative time | HIGH | Stdlib |
| LLM titling | HIGH | Reuses existing IPC + conditional-UPDATE pattern |
