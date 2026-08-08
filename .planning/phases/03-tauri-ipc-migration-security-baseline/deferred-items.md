# Phase 03 — Deferred Items (out of scope)

## PRE-EXISTING: tsc scans src-tauri/target/ generated artifacts

**Found during:** 03-02 Task 2 (`npm run lint`)
**Root cause:** `tsconfig.json` has `"allowJs": true` but no `include`/`exclude` block,
so `tsc --noEmit` walks every `*.js` file under the repo — including the binary
`tauri-codegen-assets/*.js` files written by `cargo build` into `src-tauri/target/`.
These are minified/binary bundled assets Tauri's compiler emits; they are not
hand-authored and not part of the app's TS surface.
**Impact:** `npm run lint` exits non-zero with hundreds of TS1005/TS1127/TS1490
errors that all originate under `src-tauri/target/release/build/`. ZERO errors
originate from `src/lib/api.ts` (verified via `grep -E "src/lib/api\.ts"`,
which returned nothing).
**Why out of scope for 03-02:** Plan 03-02 modifies `src/lib/api.ts` and
`src-tauri/src/{commands,lib}.rs` only. The tsconfig debt predates this plan
(verified: existed at HEAD before this plan's commits). Fixing it touches
`tsconfig.json` which has cross-cutting blast radius for all of Phase 1-6.
**Recommended fix (for a future cleanup phase):** Add to `tsconfig.json`:
```jsonc
{
  "include": ["src/**/*", "server.ts"],
  "exclude": ["node_modules", "dist", "src-tauri"]
}
```
**Workaround used by this plan:** For per-file verification, run
`npx tsc --noEmit --skipLibCheck --allowJs false src/lib/api.ts` (clean exit).

## PRE-EXISTING: dead_code warning in src-tauri/src/error.rs

**Found during:** 03-02 Task 1 (`cargo check`)
**Root cause:** Wave 1 (`03-01`) defined `AppError::RateLimited` and
`AppError::Truncated` variants that are not yet constructed anywhere in the
crate. cargo emits `warning: variants \`RateLimited\` and \`Truncated\` are never
constructed`.
**Why out of scope for 03-02:** Plan 03-02 does not touch `error.rs`. These
variants will be used when Phase 4 (RAG pipeline) wires real error paths from
rig streaming. Adding `#[allow(dead_code)]` to silence them now is the wrong
fix; they're intentionally pre-declared per Wave 1 design.
**Cargo check exit code is 0** (warning, not error).
