---
phase: quick-260818-dyo
plan: 01
subsystem: knowledge-archive-bridge
tags: [tauri, rust-commands, knowledge-base, file-archive]
requires: [workspace-scan, knowledgeRepo, rndStore.addKnowledgeItem]
provides: [read_workspace_file, write_workspace_file, archive_import sourceType, kb-archive bridge UI]
key-files:
  created: []
  modified:
    - src-tauri/src/workspace_scan.rs
    - src-tauri/src/lib.rs
    - src/ai/knowledgeRepo.ts
    - src/views/FileArchiveView.tsx
    - src/views/KnowledgeBaseView.tsx
decisions:
  - No workspace-prefix validation on read (paths come from scanned rows only) — ponytail comment marks upgrade path
  - Same-name write gets millis suffix, never overwrites user files
metrics:
  duration: ~25 min
  completed: 2026-08-18
---

# Quick Task 260818-dyo: 知识库 ⇄ 文档归档双向通道 Summary

**One-liner:** Two Rust commands (`read_workspace_file` text-whitelist/200KB-capped, `write_workspace_file` collision-suffixed) bridging archive files into the knowledge base (`archive_import` source) and knowledge docs out to workspace `.md` files — Tauri-only, hidden on web.

## Commits (worktree branch, cherry-pick to master)

| Task | Commit | Content |
| ---- | ------ | ------- |
| sync | ef242bb | chore: sync master versions of workspace-scan related files (6 files, conflict-free base) |
| 1 | 94b6841 | feat: read/write_workspace_file Rust commands + tests (8/8 green) |
| 2 | 821193e | feat: extract workspace file to knowledge base (archive_import) |
| 3 | 91eeeb1 | feat: archive knowledge doc to workspace as .md |

## What Was Built

1. **Rust commands** (`src-tauri/src/workspace_scan.rs`):
   - `read_workspace_file`: TEXT_EXTS whitelist (md/txt/json/csv/log/yml/yaml/xml/ts/tsx/js/rs/py), 200KB cap, `read_to_string` → `from_utf8_lossy` fallback (GBK-safe), registered in `lib.rs`
   - `write_workspace_file`: `sanitize_file_name` rejects empty / `/` / `\` / `..`; dir must exist; same-name collision appends `-<unix_millis>`; returns written path
   - Tests: whitelist, sanitize rules (incl. `PRD v3.2.md` pass, `../x.md` reject), read/write roundtrip, collision suffix — `cargo test workspace_scan` 8/8, `cargo check` clean
2. **归档 → 知识库** (`FileArchiveView.tsx`): Tauri-only "提取" ghost button on text-extension rows → `invoke('read_workspace_file')` → `rndStore.addKnowledgeItem(..., { sourceType: 'archive_import' })`; productId = workspace.projectId → products[0] fallback; toast on success/error. `knowledgeRepo.ts` sourceType union extended (type-only, SQLite column is open string).
3. **知识库 → 归档** (`KnowledgeBaseView.tsx`): Tauri-only "归档到工作区" button (disabled without content) → workspace-select Dialog → `invoke('write_workspace_file')` with frontend filename sanitize (`[\\/:*?"<>|]` → `_`) → `scanWorkspaceFiles(ws.id)` refresh; toast shows written path; workspace defaults to first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] category literal `'技术沉淀'` not in ProductKnowledgeItem category union**
- **Found during:** Task 2 (tsc error)
- **Fix:** Used `'经验沉淀'` (existing union member) — plan's suggestion predated the union type.
- **Commit:** 821193e

**2. [Rule 1 - Bug] archiveTargetWorkspaceId default '' would fail lookup if user never touches Select**
- **Fix:** confirmArchive falls back to `workspaces[0]?.id`.
- **Commit:** 91eeeb1

## Verification

- `cd src-tauri && cargo test workspace_scan` — 8/8 pass; `cargo check` clean
- `npm run lint` (tsc) — clean
- `npm test` — 161/161 pass (knowledge + stores + AI suites; earlier single-file node run failure was loader-only, npm script uses tsx)

### Manual UAT (not run — document for verifier)

`npm run tauri:dev`, then:
1. 文档归档 → select workspace → 刷新文件 → any `.md`/`.txt` row shows 提取 → click → knowledge base shows new doc (sourceType archive_import), searchable.
2. 知识库 → open a doc → 归档到工作区 → pick workspace → 归档 → `.md` appears in target folder + file table after refresh; archiving same doc twice yields millis-suffixed file (no overwrite).
3. Web mode (`npm run dev`): neither 提取 nor 归档到工作区 visible.

## Known Stubs

None — both directions write real data end to end.

## Self-Check: PASSED

All 4 commits present on worktree branch; all listed files modified; tests green.
