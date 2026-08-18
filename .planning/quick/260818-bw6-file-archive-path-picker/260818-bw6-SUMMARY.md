---
phase: quick-260818-bw6
plan: 01
subsystem: workspace-ui
tags: [tauri, dialog, file-archive, workspace]
key-files:
  modified:
    - package.json
    - package-lock.json
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
    - src/components/AddWorkspaceModal.tsx
decisions:
  - Browse button rendered only when isTauri() — browsers cannot produce absolute paths
  - Cancel/error from dialog open() leaves input unchanged (silent no-op)
metrics:
  duration: 4m
  completed: 2026-08-18
---

# Quick Task 260818-bw6: File Archive Path Picker Summary

AddWorkspaceModal "本地工作区物理路径" now has a Tauri-gated "浏览" button that opens the native OS folder picker (@tauri-apps/plugin-dialog) and back-fills the path; web mode unchanged.

## What Was Done

1. **Task 1 — tauri-plugin-dialog integration** (commit d5cacac)
   - `npm install @tauri-apps/plugin-dialog`
   - `src-tauri/Cargo.toml`: added `tauri-plugin-dialog = "2"`
   - `src-tauri/src/lib.rs`: registered `.plugin(tauri_plugin_dialog::init())`
   - `src-tauri/capabilities/default.json`: added `"dialog:default"`

2. **Task 2 — Browse button** (commit 366238c)
   - `src/components/AddWorkspaceModal.tsx`: `browseFolder` handler calls `open({ directory: true, multiple: false })`, sets `folderPath` on string result
   - Input wrapped in flex row; Button (secondary, FolderOpen icon) rendered only when `isTauri()`
   - Cancel (null) or thrown error → input unchanged

## Deviations from Plan

None — plan executed exactly as written. (`try/catch` added around `open()` per plan's "抛错时静默" requirement.)

## Checkpoint

checkpoint:human-verify auto-approved (auto_advance=true). Manual `npm run tauri:dev` verification steps remain as UAT:
1. 文件归档 → 新建工作区 → 浏览 → system picker opens, path back-fills
2. Cancel → input unchanged

## Verification

- `npm run lint` (tsc --noEmit) passed after each task
- `grep tauri_plugin_dialog src-tauri/src/lib.rs` hit; `grep dialog:default src-tauri/capabilities/default.json` hit
- `grep "directory: true"` and `isTauri()` present in AddWorkspaceModal.tsx

## Known Stubs

None.

## Self-Check: PASSED

- Files: all modified files present in worktree
- Commits: d5cacac, 366238c verified via git log
