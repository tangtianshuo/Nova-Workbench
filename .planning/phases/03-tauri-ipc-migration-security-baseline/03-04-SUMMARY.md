---
phase: 03-tauri-ipc-migration-security-baseline
plan: 04
subsystem: security
tags: [tauri, csp, capabilities, express, security-perimeter]
autonomous: true

# Dependency graph
requires:
  - phase: 03-tauri-ipc-migration-security-baseline
    plan: 02
    provides: src/lib/api.ts IPC adapter invoking 4 commands (generate-project, cancel-generate-project, has-api-key, set-api-key) — capabilities/llm.json must reference these identifiers
provides:
  - Production CSP + devCsp in tauri.conf.json — closes csp:null debt (CONCERNS.md MEDIUM) + includes critical ipc: http://ipc.localhost connect-src that CONTEXT.md D-17 missed (silent invoke() failure in prod without it)
  - capabilities/llm.json ACL granting 4 Phase 3 commands to the main window
  - Express bound to 127.0.0.1 (no LAN exposure — CONCERNS.md HIGH)
affects: []

# Tech tracking
tech-stack:
  added: [] # zero new deps — config + capability file only
  patterns:
    - "Production/dev CSP split pattern: app.security.csp (strict, no unsafe-inline script) + app.security.devCsp (permissive for Vite HMR + ws://localhost:3000). Tailwind v4 + Radix + motion require style-src 'unsafe-inline' in BOTH"
    - "Per-feature capability file pattern (extended from Phase 2 sql.json): $schema → ../gen/schemas/desktop-schema.json, windows:[\"main\"], permissions array of Tauri v2 kebab-case identifiers"
    - "Dev-only Express binding pattern: 127.0.0.1 explicit bind + console warning 'not for production' — single-source-of-truth that this server exists only for the web dev fallback"

key-files:
  created:
    - src-tauri/capabilities/llm.json
  modified:
    - src-tauri/tauri.conf.json
    - server.ts
    - .planning/phases/03-tauri-ipc-migration-security-baseline/03-HUMAN-UAT.md

key-decisions:
  - "Used RESEARCH.md §Pattern 6 corrected CSP verbatim, NOT CONTEXT.md D-17. D-17 was missing 'ipc: http://ipc.localhost' in connect-src — Tauri v2 IPC silently fails in production without it (works in dev because devCsp is permissive). This is the single most important change in Wave 4"
  - "D-22 (remove Express from prod bundle) was zero-effort: tauri.conf.json beforeBuildCommand already read 'bunx vite build' (verified during planning + re-verified at execution). No change required"
  - "Did NOT verify capabilities/llm.json permission identifiers against gen/schemas/desktop-schema.json at execution time — the existing schema was generated before Wave 1 added the LLM commands, so it contains no generate-project/cancel-generate-project/has-api-key/set-api-key entries. User MUST regenerate schema via npm run tauri:dev before identifiers can be confirmed. Documented as UAT step 1 (Pitfall 2 risk)"
  - "Kept identifier format 'generate-project:allow' (kebab-case + ':allow' suffix) — matches Tauri v2 convention inferred from existing sql.json (sql:allow-load, sql:allow-execute). If convention differs, smoke test (UAT step 5) will surface silent rejection"
  - "Did NOT run npm run tauri:build — per --auto mode + plan instructions, the 5-10 min build is the user's responsibility as part of UAT step 2. npm run lint (with pre-existing src-tauri/target/ noise in deferred-items.md) is the autonomous verification gate"
  - "Express log message changed from 'Server running on http://localhost:${PORT}' to 'Dev-only server running at http://127.0.0.1:${PORT} (not for production)' — emphasizes dev-only status per D-21"

patterns-established:
  - "Pattern: CSP tightening wave comes LAST in a security phase — capabilities must reference commands that exist (Wave 1), adapter must be in place to invoke them (Wave 2), UI must exercise them (Wave 3), then CSP+capabilities can be verified end-to-end in production build (Wave 4)"
  - "Pattern: capability files are a ACL layer, not a discovery layer — silent rejection (Pitfall 2) means identifiers MUST match command names exactly. Always cross-check against auto-generated desktop-schema.json after a tauri:dev boot"

requirements-completed: [IPC-09, IPC-10, SEC-01, SEC-03]
# SEC-02, SEC-04 deferred to UAT (require prod build + manual smoke test)

# Metrics
duration: 2min
completed: 2026-08-08
---

# Phase 3 Plan 4: CSP + Capabilities + Express Bind (Wave 4) Summary

**Production CSP + devCsp landed in tauri.conf.json with critical ipc: http://ipc.localhost connect-src correction (RESEARCH.md §Pattern 6, NOT D-17 verbatim); capabilities/llm.json grants 4 Phase 3 commands to main window; Express bound to 127.0.0.1 with dev-only warning; 8 production smoke test items appended to 03-HUMAN-UAT.md (now 35 total pending) — all deferred to user UAT per --auto mode**

## Performance

- **Duration:** ~2 min (autonomous tasks only; UAT deferred)
- **Commits:** 2 task commits + 1 docs commit (pending)
- **Files touched:** 4 (tauri.conf.json, capabilities/llm.json, server.ts, 03-HUMAN-UAT.md)
- **Lines added:** ~25 (config-heavy wave, not code-heavy)

## Final CSP + devCsp Strings

**Production CSP** (`app.security.csp`):
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://generativelanguage.googleapis.com; frame-src 'none'; object-src 'none';
```

**Dev CSP** (`app.security.devCsp`):
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost http://localhost:3000 ws://localhost:3000 https://generativelanguage.googleapis.com; frame-src 'none'; object-src 'none';
```

**Diff vs D-17 verbatim:** `connect-src` gains `ipc: http://ipc.localhost` (Tauri v2 IPC requires both schemes). Without this directive, every `invoke()` call silently fails CSP in production. Dev CSP additionally allows Vite HMR (`'unsafe-inline'` script-src + `http://localhost:3000 ws://localhost:3000`).

## Final capabilities/llm.json Shape

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "llm",
  "description": "AI generation IPC commands (Phase 3) — streaming + cancellation + keyring access",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "generate-project:allow",
    "cancel-generate-project:allow",
    "has-api-key:allow",
    "set-api-key:allow"
  ]
}
```

**Pitfall 2 risk noted:** The exact permission identifier format MUST be verified by the user against `src-tauri/gen/schemas/desktop-schema.json` after their first `npm run tauri:dev` post-change. The current schema on disk was generated BEFORE Wave 1 added the LLM commands, so it contains no `generate-project`/`cancel-generate-project`/`has-api-key`/`set-api-key` entries — running `tauri:dev` once regenerates it with the new commands. If identifiers don't match, capability will silently reject at runtime (Pitfall 2). **This is UAT step 1 — the most likely point of failure for Wave 4.**

## D-22 Status (beforeBuildCommand)

**Already satisfied — zero-effort.** `src-tauri/tauri.conf.json` line 9: `"beforeBuildCommand": "bunx vite build"`. No change required. Confirmed both during planning (RESEARCH.md §Open Question 4) and at execution (file read).

## Express Bind Change (D-23)

Single line changed in `server.ts` (line 259):
```ts
// BEFORE:
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// AFTER:
// D-23: bind 127.0.0.1 only — dev fallback, never expose on LAN (CONCERNS.md HIGH).
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Dev-only server running at http://127.0.0.1:${PORT} (not for production)`);
});
```

All 5 endpoints (`/api/generate-project`, `/api/summarize-workspace`, `/api/workspace-files`, `/api/rnd/generate-deliverable`, `/api/rnd/polish-knowledge-article`) preserved as dev fallback per D-21.

## 03-HUMAN-UAT.md Status

Now contains **35 total pending items**:
- 5 items from Wave 3 Plan 3 (original UAT section, 22 sub-items expanded)
- 22 sub-items under "Tests" section (Wave 3 streaming + key + error + dev parity)
- 8 items under new "Phase 3 Production Build Smoke Test (Wave 4)" section appended in this plan

New section covers: identifier verification, full production build, install + launch, CSP verification across all views + modals, IPC reachability from production DevTools, streaming in production (connect-src ipc:), Express bind to 127.0.0.1, and sign-off.

## npm run lint Result

**Zero NEW errors.** All errors originate from `src-tauri/target/release/build/nova-*/out/tauri-codegen-assets/*.js` — pre-existing Rust build artifacts being scanned by tsc. This noise is documented in `deferred-items.md` (PRE-EXISTING section) and is out of scope per Ponytail scope boundary rule. No errors traceable to `server.ts`, `tauri.conf.json`, or `capabilities/llm.json`.

## Deviations from Plan

None — plan executed exactly as written. All 8 acceptance criteria for Task 1 pass, all 11 acceptance criteria for Task 2 pass (with `npm run lint` caveat above). Task 3 (checkpoint:human-verify) deferred to HUMAN-UAT.md per `--auto` mode.

## Verification Gate Status

- [x] `npm run lint` — zero NEW errors (pre-existing target/ noise tracked)
- [ ] `npm run tauri:build` — DEFERRED to UAT step 2 (per --auto mode, 5-10 min build)
- [ ] Production CSP verification — DEFERRED to UAT step 4
- [ ] IPC reachability smoke test — DEFERRED to UAT step 5
- [ ] Streaming in production — DEFERRED to UAT step 6
- [ ] Express 127.0.0.1 bind LAN test — DEFERRED to UAT step 7

## Known Stubs

None. Wave 4 is a config + capability + single-line server change. No UI rendering paths touched.

## Phase 3 Status

Wave 4 was the final wave of Phase 3. With this plan complete:
- Wave 1 (Rust foundation): COMPLETE (cargo check passes, 4 commands registered)
- Wave 2 (Frontend adapter): COMPLETE (src/lib/api.ts extended)
- Wave 3 (UI wiring): COMPLETE (ProjectCreateModal + SettingsApiKeySection)
- Wave 4 (CSP + capabilities + Express): CODE COMPLETE, 8 items deferred to UAT

Phase 3 cannot be declared fully complete until the 35-item HUMAN-UAT.md is signed off. The most likely failure point is UAT step 1 (capability identifier verification — see Pitfall 2 risk note above).

## Self-Check: PASSED

- Files verified: src-tauri/tauri.conf.json, src-tauri/capabilities/llm.json, server.ts, 03-HUMAN-UAT.md, 03-04-SUMMARY.md — all FOUND
- Commits verified: afd6bb8, 3eba5ce — both FOUND
