---
phase: 03-tauri-ipc-migration-security-baseline
plan: 02
subsystem: ipc
tags: [tauri, ipc, channel, cancellation, invoke, frontend-adapter]

# Dependency graph
requires:
  - phase: 03-tauri-ipc-migration-security-baseline
    plan: 01
    provides: StreamChunk enum, AppError (manual Serialize), keychain helpers, AppState { cancellations }, llm::stream_generate verified against rig 0.41
provides:
  - 4 #[tauri::command] fns (generate_project, cancel_generate_project, has_api_key, set_api_key) registered in invoke_handler!
  - generate_project command with Channel<StreamChunk> streaming + tokio::select! cancellation race
  - src/lib/api.ts IPC adapter — single chokepoint with streamGenerateProject / cancelGenerateProject / hasAPIKey / setAPIKey exports, each branching on isTauri() with dev fetch fallback
  - D-14 humanizeAIError message mapping (network/auth/rate/cancel prefixes → 中文 toasts)
affects: [03-03-PLAN, 03-04-PLAN, 04-graphflow-rig-poc]

# Tech tracking
tech-stack:
  added: [] # Wave 2 adds zero new deps; @tauri-apps/api already in package.json from Phase 2
  patterns:
    - "Tauri IPC command shape: pub async fn name(args..., on_token: Channel<StreamChunk>, state: State<'_, AppState>) -> Result<T, AppError>"
    - "Cancellation race: tokio::select! { r = stream_loop => cleanup+return, _ = cancel_token.cancelled() => cleanup+Err(Cancelled) }"
    - "Frontend IPC adapter: isTauri() branch → invoke+Channel (Tauri) OR fetch+AbortController (dev). Single chokepoint in src/lib/api.ts, filename preserved (Ponytail)"
    - "Frontend cancellation: AbortSignal.addEventListener('abort') fires invoke('cancel_generate_project') — bridges React unmount to Rust-side CancellationToken"

key-files:
  created: []
  modified:
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs
    - src/lib/api.ts

key-decisions:
  - "Used tokio_util::sync::CancellationToken (Wave 1 convention) — plan verbatim said tokio::sync:: which does not exist. 03-02 PLAN instructions Deviation 1 explicitly corrected this."
  - "Channel::send is synchronous (returns Result<(), Error>), NOT async. Plan verbatim had on_token.send(...).await. Used `let _ = on_token.send(...)` per 03-02 instructions Deviation 2 + llm.rs Wave 1 line 80 precedent."
  - "Both cleanup branches (stream-completed + cancel-won) remove request_id from the cancellations map. Idempotent cancel_generate_project tolerates late cancels."
  - "Filename src/lib/api.ts kept (NOT renamed to tauri.ts) per Ponytail — Phase 2 imports in TitleBar/sqliteStorage unchanged, file header already announced 'Phase 3 IPC adapter will live here too'."

patterns-established:
  - "Pattern: Tauri command with Channel streaming — generate_project is the canonical shape for all future streaming commands (Phase 4 RAG pipeline, Phase 5 GraphFlow)"
  - "Pattern: Frontend IPC adapter — isTauri()-branched function pair (Tauri invoke + dev fetch) wrapped in single exported async function"
  - "Pattern: AppError → frontend toast — adapter throws Error with humanizeAIError(msg), caller catches and uses useToast() per D-14"

requirements-completed: [IPC-01, IPC-02, IPC-03, IPC-04, IPC-05, IPC-06]

# Metrics
duration: 6min
completed: 2026-08-08
---

# Phase 3 Plan 2: Tauri Commands + Frontend IPC Adapter Summary

**4 Tauri commands (generate_project streams via Channel<StreamChunk> + tokio::select! cancellation race, cancel_generate_project is idempotent, has_api_key + set_api_key wrap keychain) registered in invoke_handler! alongside Phase 1 gnome command; src/lib/api.ts extended (filename preserved) with streamGenerateProject + 3 helpers each branching on isTauri() with dev fetch fallback — all Phase 1/2 plumbing untouched**

## Performance

- **Duration:** ~6 min (cargo check after Wave 1 cache — fast incremental)
- **Started:** 2026-08-08T08:16:45Z
- **Completed:** 2026-08-08T08:22:30Z
- **Tasks:** 2 (Task 1 = commands.rs + lib.rs; Task 2 = src/lib/api.ts adapter)
- **Files modified:** 3 (0 created + 3 modified)

## Final Command Signatures

```rust
#[tauri::command]
pub async fn generate_project(
    prompt: String,
    files_context: String,
    request_id: String,
    on_token: Channel<StreamChunk>,
    state: State<'_, AppState>,
) -> Result<GenerateProjectResult, AppError>

#[tauri::command]
pub async fn cancel_generate_project(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError>

#[tauri::command]
pub async fn has_api_key() -> Result<bool, AppError>

#[tauri::command]
pub async fn set_api_key(key: String) -> Result<(), AppError>
```

## Plan Verbatim Corrections Confirmed

Per 03-02 PLAN execution instructions, two corrections to the plan's verbatim Rust snippets were applied (these were pre-identified by the orchestrator — NOT discoveries during execution):

### Deviation 1: CancellationToken namespace ✓

- **Plan verbatim:** `tokio::sync::CancellationToken::new()`
- **Applied:** `tokio_util::sync::CancellationToken::new()`
- **Reason:** Wave 1 (03-01) established the convention; `tokio::sync::CancellationToken` does not exist in tokio 1.x. `tokio-util = "0.7"` is in Cargo.toml precisely for this.

### Deviation 2: Channel::send is non-async ✓

- **Plan verbatim:** `on_token.send(StreamChunk::Done).await;` and `on_token.send(StreamChunk::Error { ... }).await;`
- **Applied:** `let _ = on_token.send(StreamChunk::Done);` and `let _ = on_token.send(StreamChunk::Error { ... });`
- **Reason:** `Channel::send` returns `Result<(), Error>` synchronously (per Wave 1 llm.rs line 80 precedent). The `.await` would not compile. The Result is discarded with `let _ =` — a disconnected frontend (only failure mode) should not turn a successful stream into an error.

## Deviations from Plan

### Beyond the two pre-noted corrections above:

None. The plan executed exactly as written (with the two documented corrections applied). All Wave 1 Rust code (error.rs, keychain.rs, state.rs, llm.rs, StreamChunk enum, Phase 1 gnome command, Phase 2 sql plugin) preserved verbatim. All Phase 2 isTauri() in src/lib/api.ts preserved verbatim (only appended new exports below).

## Task Commits

1. **Task 1: 4 Tauri commands + invoke_handler registration** - `30c6814` (feat)
2. **Task 2: src/lib/api.ts IPC adapter (streamGenerateProject + 3 helpers)** - `a98c9e7` (feat)

## Files Created/Modified

### Modified

- `src-tauri/src/commands.rs` — added `use` imports + GenerateProjectResult struct + 4 #[tauri::command] fns. Wave 1 StreamChunk enum + tests preserved verbatim. Header doc comment updated from "Wave 1 ships ONLY StreamChunk" to "Wave 2 adds the four #[tauri::command] fns".
- `src-tauri/src/lib.rs` — single line `invoke_handler!` macro extended from 1 entry (get_gnome_color_scheme) to 5 entries (+ commands::generate_project, commands::cancel_generate_project, commands::has_api_key, commands::set_api_key). All other lines (Phase 1 gnome command, Phase 2 sql plugin, AppState .manage call) preserved verbatim.
- `src/lib/api.ts` — appended Phase 3 IPC adapter section (StreamChunk/GenerateProjectResult interfaces, humanizeAIError helper, 4 exported functions: streamGenerateProject, cancelGenerateProject, hasAPIKey, setAPIKey). Phase 2 isTauri() function preserved verbatim with its 5-line header comment.

## Verification Results

### Task 1 (Rust)

- `cd src-tauri && cargo check` → **exit 0** (1 pre-existing dead_code warning in error.rs from Wave 1; see deferred-items.md)
- `grep -c '#\[tauri::command\]' src-tauri/src/commands.rs` → 5 (4 actual attribute markers + 1 doc-comment containing the literal text — acceptance criterion was 4 actual command attributes; met)
- `grep 'pub async fn generate_project' src/commands.rs` ✓
- `grep 'pub async fn cancel_generate_project' src/commands.rs` ✓
- `grep 'pub async fn has_api_key' src/commands.rs` ✓
- `grep 'pub async fn set_api_key' src/commands.rs` ✓
- `grep 'on_token: Channel<StreamChunk>' src/commands.rs` ✓ (D-02 Channel pattern)
- `grep 'tokio::select!' src/commands.rs` ✓ (cancellation race)
- `grep 'cancel_token.cancelled()' src/commands.rs` ✓ (cancel path)
- `grep -c 'state.cancellations.lock().unwrap().remove' src/commands.rs` → 3 (success + error + cancel branches; acceptance was ≥ 2; met)
- `grep 'keychain::get_api_key' src/commands.rs` ✓ (per-call fetch)
- `grep -c 'api_key' src/state.rs` → 0 ✓ (no key caching in AppState — Pitfall 4)
- `grep 'commands::generate_project' src/lib.rs` ✓
- `grep 'commands::cancel_generate_project' src/lib.rs` ✓
- `grep 'commands::has_api_key' src/lib.rs` ✓
- `grep 'commands::set_api_key' src/lib.rs` ✓
- `grep -c 'get_gnome_color_scheme' src/lib.rs` → 3 (Phase 1 preserved)
- `grep 'sql_migrations' src/lib.rs` ✓ (Phase 2 preserved)

### Task 2 (TypeScript)

- `npm run lint` → **does not exit 0**, but ALL errors originate from `src-tauri/target/release/build/.../tauri-codegen-assets/*.js` (pre-existing tsconfig debt; see deferred-items.md). ZERO errors from `src/lib/api.ts`.
- Targeted verification: `npx tsc --noEmit --skipLibCheck --allowJs false src/lib/api.ts` → **clean exit, zero errors**.
- `grep 'export function isTauri' src/lib/api.ts` ✓ (Phase 2 function preserved)
- `grep 'export async function streamGenerateProject' src/lib/api.ts` ✓
- `grep 'export async function cancelGenerateProject' src/lib/api.ts` ✓
- `grep 'export async function hasAPIKey' src/lib/api.ts` ✓
- `grep 'export async function setAPIKey' src/lib/api.ts` ✓
- `grep 'crypto.randomUUID' src/lib/api.ts` ✓ (D-05 requestId generation in frontend)
- `grep 'new Channel' src/lib/api.ts` ✓ (D-02/D-03 Channel pattern)
- `grep "'cancel_generate_project'" src/lib/api.ts` ✓ (cancel IPC wired to AbortSignal)
- `grep "'generate_project'" src/lib/api.ts` ✓ (invoke target)
- `grep 'humanizeAIError' src/lib/api.ts` ✓ (D-14 message mapping)
- `grep "网络连接失败" src/lib/api.ts` ✓ (D-14 NetworkError 中文)
- `grep "API key 无效" src/lib/api.ts` ✓ (D-14 AuthError 中文)
- `grep '@tauri-apps/api/core' src/lib/api.ts` ✓ (uses installed dep, no new dep)
- `grep -c "fetch('/api/generate-project'" src/lib/api.ts` → 1 ✓ (dev fallback present)

## Decisions Made

### Backend cancellation cleanup pattern (defer-like)

Both branches of `tokio::select!` call `state.cancellations.lock().unwrap().remove(&request_id)` before returning. Three cleanup sites total:
1. Stream completed Ok → cleanup → emit StreamChunk::Done → return Ok
2. Stream returned Err → cleanup → emit StreamChunk::Error → return Err
3. Cancel token won the race → cleanup → return Err(Cancelled)

Ponytail: three explicit cleanups over a `defer`-style helper because (a) Rust doesn't have defer and (b) the success branch's cleanup needs to happen BEFORE the final on_token.send which itself must happen BEFORE return — ordering is critical and a helper would obscure it. Each site is 1 line.

### Frontend request_id generation (D-05)

`crypto.randomUUID()` called inside `streamGenerateProject` (frontend), passed to invoke as `requestId` argument. Tauri auto-converts to snake_case for the Rust command's `request_id` parameter. The frontend never knows the requestId unless it captures it — `cancelGenerateProject(requestId)` is exported separately so an external caller (e.g., a Stop button) can cancel using the captured id.

### humanizeAIError (D-14 mapping)

Prefix matching on lowercased error strings. AppError serializes via thiserror's Display which prepends variant names ("network error: ...", "invalid api key", "rate limited", "cancelled", "parse error: ...", "internal error: ..."). The mapping is:
- `network error*` → 网络连接失败,请检查网络
- `*invalid api key*` / `*auth*` → API key 无效,请到 Settings 更新
- `*rate*` → 请求过于频繁,稍后再试
- `cancelled` (exact) → 已取消
- default → AI 调用失败:{message}

Ponytail: prefix matching is enough for 7 variants. Branch-on-variant struct (D-12 alternative) is YAGNI for one migrated endpoint.

## Issues Encountered

### Pre-existing tsc lint failures from src-tauri/target/ (NOT introduced by this plan)

`npm run lint` exits non-zero with hundreds of errors from `src-tauri/target/release/build/.../tauri-codegen-assets/*.js`. Root cause: `tsconfig.json` has `"allowJs": true` but no `include`/`exclude` block, so tsc walks every `.js` file under the repo. This predates Phase 3 (verified by checking the file existed at HEAD before this plan's commits).

**Zero** errors originate from `src/lib/api.ts` (verified by grepping lint output for the file path).

**Out of scope per SCOPE BOUNDARY rule.** Documented in `deferred-items.md` with recommended tsconfig.json fix for a future cleanup phase.

**Workaround for verification:** `npx tsc --noEmit --skipLibCheck --allowJs false src/lib/api.ts` (clean exit) confirmed api.ts is type-correct.

### Pre-existing dead_code warning in error.rs (NOT introduced by this plan)

Wave 1 declared `AppError::RateLimited` and `AppError::Truncated` variants not yet constructed anywhere. Cargo emits a warning (not error). Will be used when Phase 4 RAG pipeline wires real error paths. `cargo check` exits 0. Documented in deferred-items.md.

## User Setup Required

None for this plan — Wave 2 ships only Rust commands + frontend adapter (no UI). Wave 3 (03-03-PLAN) wires the adapter into ProjectCreateModal + SettingsView API key section, where the user first interacts with the IPC pipeline.

## Known Stubs

None. The 4 Tauri commands are fully implemented (no placeholder returns). The frontend adapter functions are fully implemented with both Tauri and dev branches wired. The dev fetch fallback replays tokens via onToken for UX parity but does not stream natively (deferred per CONTEXT.md D-16 + Deferred "WebFallback 完善").

## Self-Check: PENDING

(Self-check appended after creation — see below)

## Self-Check: PASSED

**Files (4/4 found):**
- src-tauri/src/commands.rs ✓
- src-tauri/src/lib.rs ✓
- src/lib/api.ts ✓
- .planning/phases/03-tauri-ipc-migration-security-baseline/03-02-SUMMARY.md ✓

**Commits (2/2 found):**
- 30c6814 feat(03-02): 4 Tauri commands + invoke_handler registration ✓
- a98c9e7 feat(03-02): src/lib/api.ts IPC adapter (streamGenerateProject + 3 helpers) ✓

**Build verification:**
- `cd src-tauri && cargo check` exits 0 (1 pre-existing dead_code warning from Wave 1 error.rs)
- `npx tsc --noEmit --skipLibCheck --allowJs false src/lib/api.ts` exits 0 (zero errors from api.ts; `npm run lint` has pre-existing errors from src-tauri/target/ — see deferred-items.md)
