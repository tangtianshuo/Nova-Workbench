---
phase: 01-dark-mode-wiring
plan: 01
subsystem: theme
tags: [theme, dark-mode, zustand, tauri, linux]
requires:
  - tokens.css .dark block (existing, unchanged)
  - useTheme() legacy hook (consumed + replaced)
provides:
  - themeStore (single source of truth for theme state)
  - get_gnome_color_scheme Tauri command (Linux GTK detection)
affects:
  - src/hooks/useTheme.ts (rewritten as thin wrapper)
  - src-tauri/src/lib.rs (first Tauri command registered)
tech-stack:
  added: []
  patterns:
    - Zustand store as single source of truth (fixes Pitfall 6 desync)
    - cfg(target_os = "linux") dual Rust definition pattern
    - Ponytail setInterval polling (switch to dconf notify if perf bites)
key-files:
  created:
    - src/stores/themeStore.ts
  modified:
    - src/hooks/useTheme.ts
    - src-tauri/src/lib.rs
decisions:
  - D-04 manual override priority enforced via early-return in both detection effects
  - D-05 2s setInterval polling on Linux (Ponytail simplification over dconf notify)
  - Rust command path chosen over @tauri-apps/plugin-shell (zero new deps)
metrics:
  duration: ~3 min
  tasks: 2
  files: 3
  completed: 2026-08-08
---

# Phase 01 Plan 01: Theme Store + Linux GTK Detection Summary

Zustand `themeStore` is now the single source of truth for theme state, with `useTheme()` rewritten as a thin wrapper that adds a Linux GTK detection branch (2s polling via `get_gnome_color_scheme` Tauri command). Manual override always wins.

## What Was Built

### 1. `src/stores/themeStore.ts` (new, 47 lines)
- `create<ThemeStore>` Zustand store with `theme`, `setTheme`, `toggle`.
- Exports `Theme` type, `getResolvedTheme`, `applyTheme` helpers (consumed by the hook).
- `STORAGE_KEY = 'nova-theme'` preserved (key name unchanged).
- Fixes Pitfall 6: Header + Settings + future call sites share one subscription.

### 2. `src/hooks/useTheme.ts` (rewritten, 88 lines → 88 lines, API preserved)
- Reads `theme` / `setTheme` / `toggle` from `useThemeStore` selectors.
- `useEffect` applies resolved theme on every change.
- macOS/Windows branch: `matchMedia('(prefers-color-scheme: dark)')` listener (unchanged).
- **New Linux branch**: `invoke<string | null>('get_gnome_color_scheme')` + 2s `setInterval`. `cancelled` flag + `clearInterval` in cleanup (Pitfall 7). Ponytail comment marks the polling simplification.
- `isLinux()` + `detectGtkTheme()` helpers; `__TAURI_INTERNALS__` guard makes it a no-op in web dev mode.
- `.includes('dark')` parse (not strict `===`) handles GVariant single-quotes (Pitfall 8).
- `GTK_THEME` env var fallback (`-dark` suffix → dark).
- **D-04 enforced**: both detection effects early-return when `theme !== 'system'`.
- Returns `{ theme, resolved, setTheme, toggle }` — exact same shape as before.

### 3. `src-tauri/src/lib.rs` (extended from 18 → 44 lines)
- First Tauri command registered in the project.
- `#[cfg(target_os = "linux")]` variant: `std::process::Command::new("gsettings").args(["get", "org.gnome.desktop.interface", "color-scheme"]).output()` → `Some("'prefer-dark'")` / `None`.
- `#[cfg(not(target_os = "linux"))]` stub: returns `None`. Compiles on Windows/macOS.
- `use std::process::Command;` scoped INSIDE the Linux fn body (avoids unused-import warning off-Linux).
- `.invoke_handler(tauri::generate_handler![get_gnome_color_scheme])` registers the command.
- Shell plugin + min window size logic untouched.

## Verification

- `npm run lint` — zero TypeScript errors in touched files (themeStore.ts, useTheme.ts). Pre-existing tsc errors from `src-tauri/target/` build artifacts are out of scope (see Deviations).
- `cargo check` — clean, zero errors. Verified on Windows (non-Linux stub path).
- `Cargo.toml` — unchanged. Zero new crates. `std::process::Command` is stdlib.
- `package.json` — unchanged. Zero new npm deps. `@tauri-apps/api` already present.

## Commits

- `273fa5e`: feat(01-01): migrate theme state to Zustand store + add Linux GTK detection
- `b5ada20`: feat(01-01): add get_gnome_color_scheme Tauri command (Linux-gated)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Out-of-Scope Discoveries (logged to deferred-items.md)

**[Pre-existing] tsc scans `src-tauri/target/` build artifacts**
- Found during Task 1 verification.
- `npm run lint` reports hundreds of TS1127/TS1128/TS1490 errors from Rust build cache JS files because `tsconfig.json` has no `exclude` field.
- Pre-existing (existed before this plan). Does NOT affect Vite build.
- Suggested future fix: `"exclude": ["src-tauri/target", "dist", "node_modules"]` in `tsconfig.json`.
- Not fixed here — out of scope per deviation Rule scope boundary.

## Decisions Made

1. **themeStore as Zustand, not React Context** — keeps project's state-management story consistent with the other 6 stores (task/product/rnd/schedule/workspace/ui). 30 lines of store + thin hook wrapper, vs. context provider + tree re-renders.
2. **Rust command over @tauri-apps/plugin-shell** — zero npm deps, zero capability file changes, 6 lines of Rust. Plugin would need install + shell scope config.
3. **Inline command in lib.rs** — no `commands/` module split yet. Phase 3 (IPC migration) will introduce many commands; that's when extraction pays off. Ponytail: inline until then.
4. **setInterval 2s over dconf notify** — Ponytail simplification marked in source. Switch if perf or battery bites.

## Known Stubs

None — all code paths wired to real data sources.

## Self-Check: PASSED

- [x] `src/stores/themeStore.ts` exists — FOUND
- [x] `src/hooks/useTheme.ts` modified (imports from `@/src/stores/themeStore`) — FOUND
- [x] `src-tauri/src/lib.rs` modified (contains `#[tauri::command]` + `get_gnome_color_scheme`) — FOUND
- [x] Commit `273fa5e` exists — FOUND
- [x] Commit `b5ada20` exists — FOUND
- [x] `Cargo.toml` unchanged — FOUND (git diff empty)
- [x] `package.json` unchanged — FOUND (no new entries)

## Requirements Status

- **DARK-03** (System mode follows OS theme changes live): macOS/Windows via existing matchMedia listener; Linux via new GTK shim — DELIVERED.
- **DARK-04** (Linux GTK detection shim, avoid Tauri#9427): Rust command + JS polling branch wired — DELIVERED.

Manual smoke tests (web dev + Tauri dev) documented in plan verification steps but not executed by autonomous agent.
