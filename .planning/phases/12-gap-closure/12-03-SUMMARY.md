---
phase: 12-gap-closure
plan: 03
subsystem: server-security
tags: [security, express, audit-closure, traceability]
dependency_graph:
  requires: []
  provides: [express-body-limit, origin-allowlist, sanitized-error-logging]
  affects: [server.ts, .planning/REQUIREMENTS.md]
tech_stack:
  added: []
  patterns: [body-size-limit, origin-allowlist-middleware, error-redaction]
key_files:
  created: []
  modified:
    - server.ts
    - .planning/REQUIREMENTS.md
decisions:
  - Origin allowlist scope: 6 entries (localhost:3000/5173, 127.0.0.1:3000/5173, tauri://localhost, https://tauri.localhost). Non-browser clients (no Origin header) allowed through — DNS rebinding is a browser-vector attack.
  - Error sanitization: log error.name + truncated (200 chars) + redacted message; client receives generic "Chat proxy error" string.
  - Body limit 1mb per audit spec (chat requests typically <50kb).
metrics:
  duration: ~6m
  completed: 2026-08-11
  tasks: 2
  files: 2
---

# Phase 12 Plan 12-03: Express MEDIUM Security Hardening + Traceability Fix Summary

Closed 3 Express MEDIUM findings from v0.2.0-MILESTONE-AUDIT (body limit, Origin allowlist, error redaction) and corrected stale Pending status on CROSS-04/05/06 traceability rows.

## What Shipped

### Task 1: server.ts 3 MEDIUM hardening (commit 91a188f)

| # | Fix | Implementation |
|---|-----|----------------|
| MEDIUM #1 | `express.json()` body size limit | `app.use(express.json({ limit: '1mb' }))` |
| MEDIUM #2 | Origin allowlist for DNS rebinding defense | 6-entry `ALLOWED_ORIGINS` Set + middleware scoped to `/api/chat` POST only; non-browser clients (no Origin header) bypass; denied origins get HTTP 403 |
| MEDIUM #3 | Error sanitization in `/api/chat` catch block | Use `error.name` + truncate message to 200 chars + regex-redact `AIza[0-9A-Za-z_-]{35}` and `key=...` patterns; client gets generic `"Chat proxy error"` |

**Defense-in-depth rationale:** Server already binds `127.0.0.1` (audit acknowledged at line 171), so Origin allowlist is belt-and-suspenders against browser-driven DNS rebinding.

### Task 2: REQUIREMENTS.md traceability fix (commit 731cbf6)

- `CROSS-04/05/06` checkbox list: `[ ]` → `[x]` (lines 38-40)
- Traceability table rows: `Pending` → `Complete` (lines 134-136)
- `*Last updated*` timestamp → `2026-08-11` with reason referencing audit lines 51-63

Per audit lines 51-63: code was already implemented and verified in Phase 7 (ScheduleView.tsx:114-133, TaskKanban.tsx:596-604) but the traceability table was stale.

## Verification

**Automated:**
- `npm run lint` (tsc --noEmit) → exit 0
- `npm run build` → success (18.27s)

**Grep verification (server.ts):**
- Hits: `limit: '1mb'`, `ALLOWED_ORIGINS`, `tauri://localhost`, `https://tauri.localhost`, `Origin not allowed`, `REDACTED_KEY`, `key=[REDACTED]`, `errName`
- No-residue: old `console.error('Chat proxy error:', message)` call removed

**Grep verification (REQUIREMENTS.md):**
- 3 `^- [x] **CROSS-0X` lines (was `[ ]`)
- 3 `| CROSS-0X | Phase 7 | Complete |` rows (was `Pending`)
- 0 actual Pending residue for CROSS-04/05/06 (only the timestamp line mentions "Pending → Complete" describing the change)
- `2026-08-11` timestamp present

**Manual curl verification (documented, not executed — no running server):**
Per plan `<verification>` block. Defense-in-depth design reviewed; server binds 127.0.0.1 so external attack surface is Web-mode fallback only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] server.ts carried uncommitted Phase 9 simplification**
- **Found during:** Task 1 commit inspection
- **Issue:** The disk state of server.ts (112 lines, Phase 9 chat-proxy-only) differed from the last committed version (281 lines, with /api/generate-project + /api/summarize-workspace + /api/workspace-files + /api/rnd/* endpoints). Phase 9 had simplified the server to a single `/api/chat` endpoint but never committed that simplification. The plan's `<current_server_state>` block showed the simplified file, confirming the intended starting state.
- **Fix:** Committed the combined diff (Phase 9 simplification + Phase 12-03 hardening) as a single Task 1 commit. Final file state matches the plan's `<current_server_state>` + the 3 MEDIUM fixes applied on top.
- **Files modified:** server.ts (net: -249/+80 lines vs last committed, but the actual Phase 12-03 delta is +30 lines of middleware/error-handling on the simplified base)
- **Commit:** 91a188f

**Side effect to flag:** If a future regression pulls the 4 deleted endpoints back, they will need re-implementation. Per Phase 9 design (see STATE.md), Express is only a Web-mode fallback for the chat proxy; desktop uses the Tauri `chat` command and the other AI endpoints are no longer used.

## Audit Gap Closure

This plan closes the following v0.2.0-MILESTONE-AUDIT findings:

| Audit ID | Type | Status |
|----------|------|--------|
| security.medium.1 | express body limit | Closed (commit 91a188f) |
| security.medium.2 | express Origin allowlist | Closed (commit 91a188f) |
| security.medium.3 | express error sanitization | Closed (commit 91a188f) |
| traceability.CROSS-04 | stale Pending status | Closed (commit 731cbf6) |
| traceability.CROSS-05 | stale Pending status | Closed (commit 731cbf6) |
| traceability.CROSS-06 | stale Pending status | Closed (commit 731cbf6) |

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: server.ts
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/phases/12-gap-closure/12-03-SUMMARY.md
- FOUND commit: 91a188f (Task 1)
- FOUND commit: 731cbf6 (Task 2)
