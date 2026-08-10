# Quick Task 260810-jwv: 项目重命名为 Nova-PM-Workspace — Summary

**Task ID:** 260810-jwv
**Date:** 2026-08-10
**Commit:** 29af7a5

## What was done

### Task 1: 更新包名和配置文件 ✅

| 文件 | 修改 |
|------|------|
| `package.json` | `name: "nova"` → `name: "nova-pm-workspace"` |
| `src-tauri/Cargo.toml` | `name = "nova"` → `name = "nova_pm_workspace"`, description 更新 |
| `src-tauri/tauri.conf.json` | `productName: "Nova"` → `productName: "Nova-PM-Workspace"` |

Tauri identifier (`com.nova.pm-workspace`) 保持不变,避免破坏已安装用户数据。

### Task 2: 更新所有 Markdown 文档 ✅

全局替换 `"Nova PM Workspace"` → `"Nova-PM-Workspace"` 在以下文件:
- `.planning/PROJECT.md`, `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`
- `.planning/research/ARCHITECTURE.md`, `ARCHITECTURE-V0.2-CRUD.md`, `SUMMARY.md`
- `.planning/research/ATOMIC-EDITOR.md`, `PRODUCT-RND-LINKAGE.md` (新文件)
- `docs/ARCHITECTURE.md`, `DECISIONS.md`, `PIPELINE_DESIGN.md`, `README.md`
- `CLAUDE.md`

验证:0 个残留的 "Nova PM Workspace" 引用。

### 清理 ✅

- 删除 `.planning/phases/08-atomic-editor-markdown/` (空目录,已移到前置调研)
- 删除 `.planning/phases/09-product-rnd-linkage-research/` (空目录,已移到前置调研)
- 删除 `.planning/phases/` 父目录

### Task 3: 重命名磁盘目录 ⚠️ (待用户手动执行)

**高风险操作**: 需要关闭 Claude Code 会话后手动执行。

```bash
cd D:\Projects\Nova
mv pm-workspace Nova-PM-Workspace
cd Nova-PM-Workspace
claude  # 重新打开 Claude Code
```

## Files changed

- 3 个配置文件 (package.json, Cargo.toml, tauri.conf.json)
- 13 个 Markdown 文档 (.planning/*.md, docs/*.md, CLAUDE.md)
- 2 个新文件 (ATOMIC-EDITOR.md, PRODUCT-RND-LINKAGE.md)
- 1 个 Cargo.lock (自动更新)

## Verification

```bash
# 验证无残留引用
grep -rn "Nova PM Workspace" --include="*.md" --exclude-dir=node_modules --exclude-dir=.claude . | wc -l
# 输出: 0

# 验证包名
grep '"name"' package.json
# 输出: "name": "nova-pm-workspace"

# 验证 Tauri 配置
grep 'productName' src-tauri/tauri.conf.json
# 输出: "productName": "Nova-PM-Workspace"
```

## Remaining work

**Task 3 (磁盘目录重命名)** 需要用户手动执行,因为它会破坏当前 Claude Code 会话。

执行步骤:
1. 关闭当前 Claude Code 会话
2. 关闭所有在 pm-workspace 目录下运行的进程 (VS Code, npm, tauri 等)
3. 在父目录执行重命名: `cd D:\Projects\Nova && mv pm-workspace Nova-PM-Workspace`
4. 重新打开 Claude Code: `cd Nova-PM-Workspace && claude`

## Notes

- Tauri identifier `com.nova.pm-workspace` 保持不变 — 这是有意为之,避免破坏已安装用户的 SQLite DB 和 localStorage
- Cargo lib name `nova_lib` 保持不变 — 内部细节,不影响用户
- keyring service name `nova-pm` 保持不变 — 避免破坏已存储的 API key
- `.claude/worktrees/agent-*` 临时目录中的文件未修改 — 它们会被自动清理
