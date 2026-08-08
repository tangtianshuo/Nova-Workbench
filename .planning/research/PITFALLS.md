# Pitfalls Research

**Domain:** Adding Tauri-native (IPC + SQLite), Zustand persistence, dark mode, and GraphFlow/Rig PoC to an existing React 19 + Tauri v2 PM desktop app.
**Researched:** 2026-08-08
**Confidence:** HIGH for Tauri/SQLite/Zustand/dark-mode; MEDIUM for GraphFlow/Rig (pre-1.0 crate, source: docs.rs + GitHub only — see Critical Pitfall 9).

---

## Critical Pitfalls

These cause rewrites, data loss, security incidents, or undetectable regressions. Each ties to a phase of the v1 milestone.

### Pitfall 1: `prefers-color-scheme` does not fire on Linux (Tauri uses WebKitGTK via wry)

**What goes wrong:**
"System" theme mode silently stays on whatever the app started in. On Linux, `matchMedia('(prefers-color-scheme: dark)')` returns light always, and the `change` event never fires when the user toggles their DE theme. The app appears broken to Linux users; on Windows/macOS the same code works.

**Why it happens:**
WebKitGTK's `prefers-color-scheme` support is incomplete upstream (WebKit bug #196685). Epiphany (also WebKitGTK) happens to work, but `wry` (Tauri's webview crate) does not configure it the same way. Confirmed in tauri#9427 and wry#884 — open as of research date.

**How to avoid:**
Don't rely solely on the CSS media query / `matchMedia`. Layer the detection:
1. Keep `useTheme()` as the source of truth, persisted to localStorage (already done in `src/hooks/useTheme.ts`).
2. On Linux, expose the GTK setting via a Tauri command using `gtk::Settings::default().gkt_application_prefer_dark_theme()` (or read `GTK_THEME` env / `gsettings get org.gnome.desktop.interface color-scheme`) and seed `useTheme` from it on startup. Poll or listen via a Tauri event if live updates matter.
3. Provide the user a manual override (already planned: SettingsView three-way switch). Manual override MUST win over system detection.

**Warning signs:**
- Linux tester reports "theme never changes when I switch system theme."
- `window.matchMedia('(prefers-color-scheme: dark)').matches` always returns `false` in devtools on Linux.

**Phase to address:**
**Phase 1 (Dark mode wiring).** Build the GTK detection shim the same phase that ships "system" mode. Shipping system-mode without this on Linux is shipping a known bug.

---

### Pitfall 2: Tauri SQL plugin migrations silently fail / no down migrations

**What goes wrong:**
Two failure modes, both confirmed in the official plugin repo:
- (a) Migrations sometimes do not run and **no error is thrown** (plugins-workspace#509). The app boots against a stale schema, the first write fails with a confusing column-not-found error.
- (b) The plugin has **no first-class down/rollback migrations** (#1346). Bad migrations cannot be cleanly reverted — you forward-fix in production.

**Why it happens:**
The plugin's migration runner is intentionally minimal. It tracks applied migrations by name in a `__migrations` table but does not surface partial-application state well. Schema versioning is "whatever migrations you list," not a numeric `user_version` PRAGMA you control.

**How to avoid:**
- Pin migrations to one direction: forward-only, always additive. Never edit a shipped migration. New column → new migration `ALTER TABLE ... ADD COLUMN`.
- After every `Database.load('sqlite:...')` call, run a sanity `SELECT` against a known-required column. If it throws, surface a clear "DB schema is corrupted, see logs" error — do not proceed with stale shape.
- For risky schema changes, ship the migration in two phases across releases: (R1) add column + dual-write code, (R2) drop old column. Tauri desktop = users on arbitrary old versions; you cannot assume "everyone is on the latest."
- Track a manual `schema_version` row in a `meta` table inside SQLite so the app can refuse to start on a too-new schema written by a newer app version (prevents downgrade corruption).

**Warning signs:**
- App starts but first AI save throws `no such column`.
- `__migrations` table contains migration names but DB schema doesn't reflect them.
- Two users on the "same" app version have different column counts.

**Phase to address:**
**Phase 2 (SQLite persistence).** Bake the sanity-check + version-table pattern in on day one. Retrofitting is expensive.

---

### Pitfall 3: Zustand `persist` serializes functions / loses class identity, breaks on schema change

**What goes wrong:**
Three sub-failures, all common:
- (a) `partialize` omitted → entire store attempted to JSON.stringify. Any function field, `AbortController`, `Set`, `Map`, or `Date` gets silently mangled (functions vanish, Dates become strings, Sets become `{}`).
- (b) Store shape changes → rehydrated state from a previous version overrides new defaults. App renders with `undefined` where new fields live.
- (c) Async rehydration race: React renders a view before `persist` finishes rehydrating, view reads empty initial state and shows "no products" briefly, then state appears. Users see flicker or, worse, a save beats rehydration and overwrites stored data with empty.

**Why it happens:**
- (a) Default behavior of `persist` is "serialize everything."
- (b) `version` defaults to `0`; bumping it without a `migrate` function silently keeps old state. Zustand v5 made this stricter but the trap remains.
- (c) `persist` rehydrates synchronously from localStorage by default, but if you swap to an async storage (Tauri store plugin, IndexedDB), you must handle the onRehydrateStorage / hydration flag.

**How to avoid:**
For each of the 5 stores, add `persist` with explicit config:
```ts
persist(creator, {
  name: 'nova-product-store',
  version: 1,
  partialize: (s) => ({ products: s.products }), // only serializable data
  migrate: (persisted, version) => {
    if (version < 2) { /* transform old shape */ }
    return persisted as ProductStore;
  },
  onRehydrateStorage: () => (state) => { state?._setHydrated?.() },
})
```
- Add a `_hasHydrated` flag (or use `createJSONStorage` with sync localStorage and skip the flag for now — sync path is fine for MVP).
- **Critically for `rndStore`:** the 7 nested `Record<productId, ...>` maps must be partialized carefully, and the existing `INITIAL.p1` fallback footgun (CONCERNS.md "rndStore — God Store") becomes a *persistence* footgun: if a stale productId is rehydrated, the fallback chain shows the wrong product's data. Fix the accessor first, then persist.

**Warning signs:**
- `JSON.parse` errors in console on startup (corrupt serialized state).
- Buttons / functions missing after a reload (you serialized the whole store).
- After shipping a new store field, existing users see `undefined` but new users see the default.
- "Product list flickers empty for 200ms on launch."

**Phase to address:**
**Phase 2 (Persistence).** Add persist to all 5 stores in one phase; do NOT ship partial persistence (some stores persisted, others not) — user data gets inconsistent.

---

### Pitfall 4: Express → Tauri command migration loses fetch semantics (no AbortController, no streaming, no error types)

**What goes wrong:**
The 5 Gemini endpoints today use `fetch` with implicit semantics: cancellation via AbortController, streaming response bodies, standard HTTP error codes, automatic JSON parsing, network-error fallback. Naive migration to `invoke('generate_project', {...})` loses all of this:
- No built-in cancellation — long Gemini calls cannot be aborted; user clicking "regenerate" stacks requests.
- No streaming — the current server.ts returns the whole JSON blob anyway, so this is OK for now, BUT the architecture doc calls for streaming chat, and once streaming lands, the migration must use `Channel<T>`, not events.
- Errors are opaque `string`s or untyped — `invoke` rejects with whatever the Rust side threw; there is no `Response.status`.
- Dev experience degrades: Rust hot-reload doesn't exist (cargo rebuild on every change), so iteration on prompt logic gets slower.

**Why it happens:**
`invoke` is not a drop-in `fetch` replacement. It's a typed RPC. The primitives map differently:
| fetch semantic | Tauri equivalent |
|---|---|
| `AbortController` | `Channel<T>` ID can be dropped, or pass a cancellation token + have Rust check it |
| `Response.body` stream | `Channel<T>` (recommended per official docs) or events |
| HTTP status | Custom error enum returned as `Result<T, AppError>` |
| Network error | `invoke` rejects — same path as command error, must disambiguate |

**How to avoid:**
- Define one `AppError` enum in Rust (`#[derive(Serialize)]`): `Network`, `Provider(rate_limit)`, `Provider(parse)`, `NoApiKey`, `Cancelled`. Frontend matches on it for retry / fallback UI.
- For streaming (Phase 3+ chat), use `Channel<StreamChunk>` — pass a channel from the frontend, Rust emits tokens, frontend listens. Channels have backpressure and ordering guarantees events lack. Official docs explicitly recommend Channel for streaming.
- Keep `server.ts` alive as the dev fallback (`isTauri()` branch). This preserves hot-reload for prompt iteration. Delete it only when the Rust path has feature parity AND tests.
- Wrap all `invoke` calls in a typed `api.ts` shim so view components stay agnostic.

**Warning signs:**
- Rapid clicks on "generate" stack multiple calls in flight; UI shows stale result.
- Error messages shown to user are raw Rust panic strings.
- "It works in dev (`isTauri() === false`, falls through to Express) but breaks in prod build."

**Phase to address:**
**Phase 3 (Tauri IPC migration).** The `api.ts` shim + `AppError` enum must land together with the first migrated endpoint; don't migrate endpoint-by-endpoint into ad-hoc error handling.

---

### Pitfall 5: Tauri capabilities file under-permissions or missing scope (silent command rejection)

**What goes wrong:**
Tauri v2's ACL silently rejects commands the webview isn't permitted to call. The rejection is a runtime `invoke` rejection — there's no compile error, no build warning. Two flavors:
- (a) Forgot to grant a permission → command "doesn't work" with a vague error.
- (b) Granted the permission but missed the **scope** (e.g., `sql:allow-execute` without a scope pointing at the DB file) → command runs but silently affects nothing, or the SQL plugin ignores it.

This repo currently ships `capabilities/default.json` with `core:default` + window perms + `shell:allow-open`. The moment we add SQL/IPC commands, we must extend it.

**Why it happens:**
Capabilities are a separate file from the Rust code. Adding a command in `lib.rs` does not auto-grant permission to call it. The permission/scope split is non-obvious (confirmed: `fs:allow-exists` without scope does nothing, plugins-workspace#3536).

**How to avoid:**
- One capability file per feature: `capabilities/sql.json`, `capabilities/llm.json`. Each lists exactly the permissions + scopes that feature needs.
- Explicitly scope SQL plugin to the app data dir: use `sql:allow-load` + `sql:allow-execute` + a scope allowing `sqlite://${appData}/nova.db`.
- Add a smoke test in CI that invokes each command from the webview context. Capabilities bugs surface at runtime, so automated runtime tests are required (unit tests in Rust won't catch a missing capability).
- Document the capability model in CLAUDE.md so contributors know: "new command → new capability entry."

**Warning signs:**
- Command returns `command not allowed` rejection in devtools console.
- SQL `execute` returns 0 rows even when the DB has data (scope mismatch).
- Works locally (some devs run with broader dev caps) but fails in production build.

**Phase to address:**
**Phase 3 (Tauri IPC).** Capabilities land alongside commands; never "we'll lock it down later."

---

### Pitfall 6: API key bundled into Rust binary (still leaks), or fallback path produces silent mock experience

**What goes wrong:**
The current Express flow already has this bug (CONCERNS.md): the prod build ships `dist/server.cjs` requiring `GEMINI_API_KEY` at runtime, which end users don't have → all endpoints silently return mock content. Migration to Tauri commands has two new failure modes:
- (a) Embed the key as a Rust string literal / `env!` at build time → key is recoverable from the binary (strings are not encrypted; this is not "security").
- (b) Read from `std::env::var` at runtime → end user has no env var, same silent-mock failure as Express.

**Why it happens:**
A desktop app fundamentally cannot hold a server-side secret — the binary is on the user's machine. There is no "secure" way to ship a provider key in a desktop client.

**How to avoid:**
- Treat API key as a **per-user concern**, not an app-level secret. Settings UI on first run asks for the key, stored via OS keychain (`tauri-plugin-keyring` or `tauri-plugin-stronghold` for encrypted storage) keyed to the OS user account.
- Document the bring-your-own-key model in onboarding. Today's mock fallback should be reframed as "demo mode" with an explicit badge in the UI, not silent.
- For internal/team distribution: ship a `.env` next to the binary for dev builds only; never bake into release builds.

**Warning signs:**
- Strings tool (`strings nova.exe | grep AIza`) reveals the key.
- Bug reports "AI always returns fake data" — that's the silent-mock path.

**Phase to address:**
**Phase 3 (Tauri IPC migration).** Resolve the key-provisioning story BEFORE migrating the first endpoint, or you'll have shipped the same bug in a new language.

---

### Pitfall 7: CSP left at `null` breaks when later tightened (Tailwind/Radix inline styles, motion inline transforms)

**What goes wrong:**
Today `tauri.conf.json` has `"csp": null` (CONCERNS.md). Tightening CSP later sounds easy but is where Tauri production builds break:
- Tailwind v4 + Radix emit inline styles dynamically (CSS-in-JS-like patterns). `style-src 'self'` blocks them.
- `motion/react` sets inline `transform` / `opacity` on every animation frame. Without `'unsafe-inline'` on `style-src`, animations freeze.
- `dangerouslySetInnerHTML` (markdown rendering via react-markdown — currently safe but worth verifying) needs `script-src` default-deny with no `unsafe-inline`.
- Migrating from `null` to a real CSP in a later phase surfaces a wave of broken UI that's hard to attribute.

**Why it happens:**
CSP `null` means "no policy" (everything allowed). When you add a policy, you must enumerate every style source your runtime uses. Tailwind and Framer especially push you toward `'unsafe-inline'`, which weakens the policy.

**How to avoid:**
- Define CSP early (Phase 3, alongside IPC migration). Use nonce-based or hash-based `style-src` where possible; accept `'unsafe-inline'` only on `style-src` (not `script-src`).
- Test in production build (`tauri build`) with the policy on. Dev (`tauri dev`) loads Vite which needs different rules — use a separate dev CSP or a `dev` flag.
- Default-deny `script-src`. Allow only `self`.
- Verify react-markdown output: confirm no `dangerouslySetInnerHTML` paths and no raw HTML passes through.

**Warning signs:**
- Console full of `Refused to apply inline style` after enabling CSP.
- Animations stop working in prod build but work in dev.

**Phase to address:**
**Phase 3 (Tauri IPC).** Land CSP at the same time as commands — both are security-perimeter decisions.

---

### Pitfall 8: HITL state corruption — GraphFlow interrupt + resume across app restarts, multi-window

**What goes wrong:**
HITL is the killer feature of the Pipeline architecture (ADR-006). It is also where state management gets brutal:
- (a) Pipeline paused at `interrupt!()` waiting for user → user closes the app → on next launch, GraphFlow must rehydrate the paused state from `SqliteSaver` and re-surface the approval card. If the saver wasn't checkpointed at the interrupt boundary, the workflow is lost.
- (b) User opens two windows, approves in one, rejects in another — race on the workflow state.
- (c) LLM provider returns different content on resume (non-determinism) → state mismatch with what was checkpointed → panic or invalid transition.

**Why it happens:**
HITL requires durability *at the interrupt point*, not just at workflow completion. GraphFlow's `SqliteSaver` supports this but only if you (1) configure checkpointing at every interrupt and (2) resume through the documented API, not by re-running the graph. Multi-window concurrency is an app-level concern GraphFlow doesn't solve for you.

**How to avoid:**
- One source of truth for "active pipeline." Use a single Tauri command `pipeline_resume(checkpoint_id, decision)` and serialize all resumes through a tokio Mutex in Rust.
- Persist not just GraphFlow's checkpoint but also the *frontend* pending-approval state to Zustand + SQLite mirror. On app launch: rehydrate Zustand, query GraphFlow for open checkpoints, reconcile.
- Lock pipelines to a single window. If multi-window is allowed, enforce via Tauri that only the main window can run pipelines.
- Treat LLM responses as cached at checkpoint time; do not re-invoke on resume. Store the full assistant message in the checkpoint.

**Warning signs:**
- App restart drops pending approvals.
- Two windows both show the same approval card.
- Resume causes a Rust panic (`state mismatch`).

**Phase to address:**
**Phase 4 (GraphFlow PoC).** PoC MUST include the close-app-mid-approval scenario. If PoC skips this, you'll discover the bug when Pipeline ships in a later milestone.

---

### Pitfall 9: GraphFlow API stability — pre-1.0, breaking changes between minor versions

**What goes wrong:**
`graph-flow` is currently 0.6.x with the repo's ROADMAP explicitly stating "API Stability 0.6.0" with a migration guide — meaning **breaking changes are expected before 1.0**. Locking the crate version doesn't help: Cargo resolves transitive deps, and Rig (a dep) is also fast-moving. Migrating to a new minor can rewrite the entire workflow definition API.

ADR-002 in `docs/DECISIONS.md` claims GraphFlow "v1.4.2 达到 99.99% 可用性" (v1.4.2, 99.99% availability). **This claim is fabricated.** The crate is pre-1.0 as of the research date. Acting on the ADR's stability claim would be a serious mistake.

**Why it happens:**
The ADR was written without verifying crate maturity. The "GraphFlow + Rig + Tauri" stack is genuinely promising but new — community on r/rust and HN is small, production usage reports are scarce.

**How to avoid:**
- Treat v1's GraphFlow work as **explicitly a PoC** (PROJECT.md already scopes this correctly — honor it). Do NOT make GraphFlow load-bearing for user data in v1.
- Pin `graph-flow = "=0.6.x"` (exact version) in Cargo.toml. Document the pin in a comment with the rationale.
- Build the PoC behind a feature flag / separate view; do not entangle it with the 5 AI endpoints being migrated from Express.
- Track the upstream ROADMAP. Budget one phase in a future milestone to absorb breaking changes when upgrading.
- Have a fallback: ADR-002 lists Juncture or self-built state machine. Keep this option open by isolating GraphFlow behind a trait in Rust, so swapping engines is bounded.

**Warning signs:**
- `cargo update` breaks the build with no code change.
- A new GraphFlow release changes `interrupt!()` semantics.
- PoC works on the author's machine but breaks on CI.

**Phase to address:**
**Phase 4 (GraphFlow PoC).** Pin version, isolate behind trait, document fallback. **Update DECISIONS.md ADR-002 to remove the fabricated 99.99% claim** before this phase starts.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Serialize entire Zustand store (no `partialize`) | Less code, faster to ship | Functions vanish, rehydrate breaks on shape change, `_hasHydrated` race | Never for v1 stores |
| One migration file with everything | Easy to start | Rewriting shipped migrations = silent corruption for users on old versions | Never — additive-only always |
| Hardcode API key in Rust string | App "just works" | Key leak in binary; recovery is trivial | Internal dev builds only, never release |
| Use Tauri events for streaming | Familiar pattern | No backpressure, ordering not guaranteed, listener leak risk | OK for one-shot broadcast; never for token streams |
| Skip capabilities smoke test | Faster CI | Capability bugs surface at runtime in prod | Never for v1 |
| Ship dark mode without Linux GTK detection | Faster ship | Linux users see "system mode" broken | Never — do it in the same phase |
| Persist `rndStore` without fixing `INITIAL.p1` fallback | Less surface area to touch | Persistence preserves the wrong-product-data footgun | Never — fix accessor first |
| CSP stays at `null` | Nothing breaks | Late CSP tightening breaks Tailwind/Radix/motion at once | Only until Phase 3, not after |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| Tauri SQL plugin (sqlx) | Assuming rusqlite semantics (transactions, explicit conn) | Use `sqlx::Pool` with `max_connections(1)` for SQLite to serialize writes, or migrate to `tauri-plugin-rusqlite2` if transactions are load-bearing |
| Tauri SQL plugin | Forgetting migrations silently fail (#509) | Post-load sanity SELECT + manual `schema_version` row |
| Tauri Channel<T> | Treating it like events (broadcast to many listeners) | Channel is 1:1 with the command invocation. Use for streaming RPC; use events only for broadcast. |
| Tauri capabilities | Adding command without permission entry | New command → new capability entry, in the same PR |
| Zustand persist v5 | Passing `shallow` to `create` for equality | Use `createWithEqualityFn` (v5 dropped equality-fn from `create`) |
| Zustand persist + async storage | Reading state before rehydrate completes | Use `_hasHydrated` flag or stick with sync localStorage |
| GraphFlow SqliteSaver | Assuming default checkpoint frequency is enough | Explicitly checkpoint at every `interrupt!()` and at workflow completion |
| Rig LLM providers | Hardcoding the provider in workflow definition | Inject provider via Rig's trait so swapping Gemini→Claude doesn't change workflow code |
| OS keychain (keyring) | Storing key in plaintext config file on first run | Use `tauri-plugin-keyring` from day one; migration from plaintext is painful |
| Tailwind v4 + Tauri CSP | Forgetting Tailwind injects styles at runtime | Whitelist `style-src 'self' 'unsafe-inline'`; verify in `tauri build`, not just `tauri dev` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| AppContext re-render (existing debt) + persisted Zustand | Every state change re-renders all 30+ consumers | Finish AppContext removal BEFORE adding persistence (persisted state changes trigger the same blast radius) | Already broken at small scale; persistence makes it worse |
| Zustand stores doing synchronous JSON.parse on every store update (persist) | UI jank on large stores | Partialize aggressively; only persist what survives reload. ~MB-scale stores parse fast but block main thread. | rndStore at hundreds of products |
| SQLite writes on main thread (via plugin's `execute`) | UI freezes during save | Batch writes; consider moving heavy writes behind a Tauri command running on a tokio blocking task | Single write OK; batch save (e.g. AI generating 5 deliverables) noticeable |
| Tauri `invoke` per-row insert | Each insert is an IPC round trip | Use a single `execute_batch` or one Tauri command taking a Vec | Bulk import, pipeline artifact saves |
| LLM streaming via events (not Channel) | Event listener leak, missed tokens under load | Use `Channel<StreamChunk>` — backpressure-aware, ordered | High token rate (long generations) |
| Rehydrating ALL stores synchronously on launch | App feels slow to interactive | Sync localStorage is fine for MVP; if it grows, lazy-rehydrate per-view | Several MB of persisted state |
| Mock seed data eagerly imported (existing 1.3k-line `mockRndData.ts`) | Bundled even in prod | Lazy-load seed data | Already in main bundle today |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Bundling `GEMINI_API_KEY` into Rust binary | Key recoverable via `strings`; full provider abuse | Per-user key from OS keychain; never bake in |
| Migrating Express endpoints to Tauri commands without authz | Same prompt-injection risk as today (user input interpolated into system prompt) — but now in Rust, easier to fix structurally | Use Gemini SDK's `systemInstruction` (or Rig equivalent) for instructions; pass user content as separate message |
| Capabilities over-permission (`sql:*` instead of specific perms) | Webview can run arbitrary SQL if compromised | Minimum capability set, scoped to specific DB file |
| CSP left `null` after migration | No backstop if react-markdown / any future raw-HTML path slips in | Explicit CSP in Phase 3 |
| Storing API key in Zustand persist (localStorage) | Any local-process JS can read it | Use keyring; never persist secrets in app state |
| Multi-window capability leakage | All windows get all capabilities by default | Scope capabilities to specific window labels (`"windows": ["main"]`) |
| Trusting LLM output as JSON without schema | Existing bug (CONCERNS.md `JSON.parse` on AI output) — migrate to Rust and the parse failure becomes a Rust panic if `unwrap`'d | Return `Result<_, AppError>`; never `unwrap` LLM output |
| Prompt injection persisted to SQLite then displayed to other windows | Cross-window data exfiltration if a workspace is shared later | Sanitize / fence AI-generated content before persistence |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Theme toggle in Settings only | User has to navigate to switch; no quick override | Quick toggle in Header (planned) |
| "System" theme on Linux appears broken | User thinks the app doesn't respect OS settings | Manual override + GTK detection (Critical Pitfall 1) |
| Silent mock AI when no key configured (existing bug) | User thinks AI is dumb, not unconfigured | "Demo mode" badge in UI; explicit onboarding for key |
| Dark mode shadow visibility | Existing shadows tuned for light may vanish in dark (elevation cues lost) | Audit shadows per palette; `--shadow-*` tokens need dark variants |
| Glass / blur effects in dark mode | `backdrop-blur` over dark surfaces can look muddy or invisible | Test all `variant="glass"` Cards against dark palette; may need different opacity |
| Persisted state hydration flicker | "No products" briefly shown, then list appears | `_hasHydrated` flag → render skeleton until hydrated |
| HITL approval card disappears on app restart | User loses their pending review | Rehydrate pending approvals from SQLite checkpoint on launch (Critical Pitfall 8) |
| Lost work on schema migration | User upgrades, can't open old data | Forward-only additive migrations + version-table guard |

---

## "Looks Done But Isn't" Checklist

- [ ] **Dark mode:** Often missing dark-variant shadows/borders in `tokens.css` (light shadows vanish in dark) — audit every `Card` variant against dark palette
- [ ] **Dark mode system detection:** Often missing Linux GTK detection — `prefers-color-scheme` silently always returns light on Linux
- [ ] **Zustand persist:** Often missing `partialize` — serializes functions, breaks on shape change
- [ ] **Zustand persist:** Often missing `migrate` function when bumping `version` — old users get `undefined` fields
- [ ] **Tauri SQL migrations:** Often missing sanity SELECT after load — silent migration failure looks like "first write crashes"
- [ ] **Tauri commands:** Often missing capabilities entry — command works in Rust tests, fails in webview
- [ ] **Tauri IPC streaming:** Often using events instead of `Channel<T>` — leaks listeners, loses ordering under load
- [ ] **CSP:** Often declared in dev config but not tested against `tauri build` prod artifact — inline-style breakage is prod-only
- [ ] **API key migration:** Often bundled in binary as `env!` — leaks; or read from env at runtime — end users have no key
- [ ] **HITL persistence:** Often only tested in happy path — close-app-mid-approval not covered
- [ ] **GraphFlow PoC:** Often presented as production-ready based on ADR claims — verify crate version independently (it's pre-1.0)
- [ ] **Distribution:** Often `tauri build` succeeds locally but unsigned binaries trigger SmartScreen / "app is damaged" — code signing configured only at release time

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Persisted store includes functions / bad shape | MEDIUM | Bump `version`, write `migrate` to strip functions; existing users get cleaned state on next launch |
| Bad SQLite migration shipped | HIGH | Forward-fix: ship a corrective migration; cannot un-apply. If destructive (dropped a column), data is lost. Restore from app data dir backup if you took one. |
| Capabilities too tight (command rejected) | LOW | Add the missing permission to the capability file, rebuild. No data impact. |
| Capabilities too loose (over-permissioned) | MEDIUM | Tighten scope; requires audit of every command call site to confirm nothing relied on the loose perm |
| API key leaked in shipped binary | HIGH (cannot undo) | Revoke the key at the provider immediately. Migrate to keychain model. All shipped builds remain compromised — they need an auto-update or recall. |
| CSP breaks production UI | MEDIUM | Loosen CSP back to permissive in a hotfix; tighten incrementally in next release with proper testing |
| HITL state lost on restart | MEDIUM | Add checkpoint-on-interrupt; for users already affected, the workflow is unrecoverable — surface as "session expired, please restart pipeline" |
| GraphFlow breaking change on upgrade | MEDIUM | Stay on pinned version; allocate one phase to absorb breaking changes; isolate behind trait so blast radius is bounded |
| Linux theme detection broken | LOW | Manual override already exists; ship GTK detection shim |
| AppContext re-render worsens after persist | MEDIUM | Finish AppContext removal first; don't ship persistence on top of the existing re-render bug |

---

## Pitfall-to-Phase Mapping

Based on the v1 milestone scope (dark mode + Tauri persistence + IPC migration + GraphFlow PoC):

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| Linux GTK theme detection | Phase 1 (Dark mode) | Manual: test on a Linux VM, toggle GNOME dark mode, app follows within 1s |
| Dark-variant shadows/glass audit | Phase 1 (Dark mode) | Visual: screenshot every Card variant in both palettes |
| Zustand `partialize` + `migrate` + `_hasHydrated` | Phase 2 (Persistence) | Unit test: round-trip each store through persist; assert no functions; assert migrate bumps version |
| `rndStore` accessor fix before persist | Phase 2 (Persistence) | Unit test: unknown productId returns empty, not INITIAL.p1 |
| SQLite sanity SELECT + `schema_version` table | Phase 2 (Persistence) | Integration test: load DB, run migration, assert required columns exist |
| Additive-only migration policy | Phase 2 (Persistence) | Code review checklist; CI grep for `DROP TABLE`/`ALTER ... DROP` in migrations |
| `AppError` enum + typed `api.ts` shim | Phase 3 (IPC migration) | Unit test: each error variant maps to a UI state |
| `Channel<T>` for any streaming endpoint | Phase 3 (IPC migration) | Code review: no `emit` for token streams |
| Capabilities per-feature, scoped | Phase 3 (IPC migration) | Smoke test: invoke each command from webview in CI |
| API key in OS keychain, not bundle | Phase 3 (IPC migration) | `strings nova.exe \| grep -i AIza` returns nothing |
| CSP declared and tested against prod build | Phase 3 (IPC migration) | Manual: `tauri build` and exercise all views; console clean of CSP errors |
| Express kept as dev fallback until parity | Phase 3 (IPC migration) | `isTauri()` branch in `api.ts`; both paths tested |
| GraphFlow version pin + trait isolation | Phase 4 (PoC) | `Cargo.toml` exact pin; PoC code compiles without `graph-flow` types leaking past a trait boundary |
| HITL checkpoint-on-interrupt | Phase 4 (PoC) | Manual: close app mid-approval, reopen, approval card reappears |
| Remove fabricated "99.99% uptime" claim from ADR-002 | Before Phase 4 | ADR-002 updated to reflect pre-1.0 status; fallback (Juncture / self-built) documented |
| Code signing for distribution | Phase 5 (Distribution, if in scope) | `tauri build` produces signed artifact; installer runs without SmartScreen warning |
| Auto-updater configured | Phase 5 (Distribution, if in scope) | Updater keys generated; latest.json hosted; test downgrade + upgrade paths |

**Phase ordering rationale:**
1. **Phase 1 (Dark mode)** is the smallest, lowest-risk win and clears existing tech debt. Do it first.
2. **Phase 2 (Persistence)** comes before Phase 3 because persisted bad data through migrated endpoints is worse than persisted data through Express (which we know works). Get the storage layer right while the existing API is still in place.
3. **Phase 3 (IPC migration)** depends on Phase 2's persistence and Phase 1's theme (CSP affects how styles load in both modes).
4. **Phase 4 (GraphFlow PoC)** is explicitly a PoC, gated behind a feature flag, isolated from user-critical paths. Must come last because every other piece (persistence, IPC patterns, error handling) must be stable before introducing a pre-1.0 crate.

---

## Sources

**HIGH confidence (official docs, verified):**
- [Tauri v2: Calling the Frontend from Rust (Channel docs)](https://v2.tauri.app/develop/calling-frontend/) — confirms Channel is recommended for streaming
- [Tauri v2: Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/)
- [Tauri v2: SQL Plugin](https://v2.tauri.app/plugin/sql/) — confirms sqlx-based, migration support
- [Tauri v2: Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri v2: Permissions](https://v2.tauri.app/security/permissions/)
- [Tauri v2: Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)
- [tauri-plugin-sql 2.4.0 docs.rs](https://docs.rs/crate/tauri-plugin-sql/latest)
- [tauri#9427 — Tauri does not detect system theme preference on Linux](https://github.com/tauri-apps/tauri/issues/9427)
- [wry#884 — Tauri color scheme detection in Linux](https://github.com/tauri-apps/wry/issues/884)
- [WebKit bug #196685 — prefers-color-scheme in GTK port](https://bugs.webkit.org/show_bug.cgi?id=196685)
- [plugins-workspace#509 — SQL migrations silently fail](https://github.com/tauri-apps/plugins-workspace/issues/509)
- [plugins-workspace#1346 — No down migrations](https://github.com/tauri-apps/plugins-workspace/issues/1346)
- [plugins-workspace#3536 — Permissions need scopes](https://github.com/tauri-apps/plugins-workspace/issues/3536)
- [tauri#10011 — Multiple webviews white on load](https://github.com/tauri-apps/tauri/issues/10011)
- [Zustand: Migrating to v5](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)
- [Announcing Zustand v5 — Poimandres](https://pmnd.rs/blog/announcing-zustand-v5/)
- [graph-flow on crates.io](https://crates.io/crates/graph-flow)
- [a-agmon/rs-graph-llm on GitHub](https://github.com/a-agmon/rs-graph-llm) — ROADMAP confirms pre-1.0 / breaking changes expected

**MEDIUM confidence (single credible source, community corroboration):**
- [Fixing the Tauri v2 white screen in production](https://dev.to/leo_zhang_0141218398e1788/fixing-the-tauri-v2-white-screen-in-production-and-the-6-release-bugs-right-behind-it-16jk)
- [Discussion: dev.to prod bugs](https://github.com/orgs/tauri-apps/discussions/15565)
- [silvermine/tauri-plugin-sqlite — pooling-focused alternative](https://github.com/silvermine/tauri-plugin-sqlite) — confirms sqlx pooling is suboptimal for SQLite concurrency

**LOW confidence (single source, needs validation):**
- "Tauri v2 Best Practices — LobeHub" (community skill page, not authoritative)
- GraphFlow production usage reports (none found beyond author's posts on r/rust + HN)

**Internal context (verified by reading the codebase):**
- `.planning/codebase/CONCERNS.md` — existing bugs/debt this milestone must not amplify
- `docs/DECISIONS.md` ADR-002 — contains a fabricated stability claim about GraphFlow; flag for correction
- `src-tauri/capabilities/default.json` — current capability surface (window + shell only)
- `src-tauri/tauri.conf.json` — CSP is `null` today
- `src/hooks/useTheme.ts`, `src/styles/tokens.css` — dark mode tokens already defined, not wired

---
*Pitfalls research for: Tauri-native + persistence + GraphFlow/Rig additions to existing Nova PM app*
*Researched: 2026-08-08*
