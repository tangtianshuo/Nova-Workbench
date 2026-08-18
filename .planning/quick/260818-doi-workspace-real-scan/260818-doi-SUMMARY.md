---
phase: quick-260818-doi
plan: 01
subsystem: file-archive
tags: [tauri, workspace, fs-scan]
requires: []
provides: [scan_workspace_folder command, scanWorkspaceFiles action]
affects: [workspaceStore, FileArchiveView, AddWorkspaceModal]
key-files:
  created: [src-tauri/src/workspace_scan.rs]
  modified: [src-tauri/src/lib.rs, src/stores/workspaceStore.ts, src/views/FileArchiveView.tsx, src/components/AddWorkspaceModal.tsx]
decisions:
  - "New file workspace_scan.rs instead of commands.rs to minimize merge conflicts with evolved master"
  - "Hand-rolled epoch→UTC conversion instead of adding chrono dependency"
metrics:
  duration: 12m
  completed: 2026-08-18
---

# Quick Task 260818-doi: Workspace Real File Scan Summary

工作区文件列表从硬编码 mock 改为 Tauri 端真实扫描 folderPath（深度 3 / 500 文件上限），web dev 模式保留 mock。

## What Was Done

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c7989c4 | Rust `scan_workspace_folder` command（新文件 workspace_scan.rs，4 单测绿） |
| 2 | 0d2d6a4 | store `scanWorkspaceFiles` action + FileArchiveView 刷新按钮 + AddWorkspaceModal Tauri 空文件初始化 |

## Verification

- `cargo test workspace_scan`: 4/4 passed (ext mapping, size formatting, ignore list, epoch formatting)
- `npm run lint` (tsc --noEmit): clean

## Deviations from Plan

- **[Rule 3 - Blocking]** Plan 指定改 commands.rs；按 orchestrator 指示改为新文件 `src-tauri/src/workspace_scan.rs` + lib.rs 最小 diff（`mod` + handler 一行），避免与 master 大改的 commands 模块冲突。
- **[Plan note]** 时间戳未加 chrono 依赖，手写 civil-from-days 算法（UTC，仅展示用途）。
- 其余按 plan 执行。

## Known Stubs

None.

## Self-Check: PASSED

- src-tauri/src/workspace_scan.rs: FOUND (commit c7989c4)
- Commits c7989c4, 0d2d6a4: FOUND

## Checkpoint (pending human verify)

1. `npm run tauri:dev`
2. 文档归档 → 选工作区 → "刷新文件" → 列表真实反映 folderPath（路径不存在则清空且无报错）
3. 新建工作区指向真实文件夹 → 创建后自动回填真实文件（≤3 层，无 node_modules/.git）
4. `npm run dev`（web）→ 无刷新按钮，mock 文件保留
