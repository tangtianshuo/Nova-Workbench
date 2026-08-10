# Quick Task 260810-jwv: 项目重命名为 Nova-PM-Workspace

**Plan ID:** 260810-jwv
**Created:** 2026-08-10
**Description:** 将整个项目命名从 "Nova-PM-Workspace" 修改为 "Nova-PM-Workspace"

## Context Reference

See: [260810-jwv-CONTEXT.md](./260810-jwv-CONTEXT.md)

## Scope Summary

### 决策锁定

- **最终命名**: `Nova-PM-Workspace` (全小写 workspace)
- **包名 (package.json)**: `nova-pm-workspace` (kebab-case)
- **Crate 名 (Cargo.toml package)**: `nova_pm_workspace` (snake_case)
- **Crate 名 (Cargo.toml lib)**: 保持 `nova_lib` 不变 (内部细节,不影响用户)
- **Tauri productName**: `Nova-PM-Workspace`
- **Tauri identifier**: `com.nova.pm-workspace` (保持不变,避免破坏已安装用户数据)
- **Tauri window title**: `Nova` (保持简短窗口标题)
- **磁盘目录**: `pm-workspace` → `Nova-PM-Workspace` (最后一步执行)

### 影响范围

| 类型 | 文件 | 修改内容 |
|------|------|----------|
| 包名 | `package.json` | `name: "nova"` → `name: "nova-pm-workspace"` |
| Crate | `src-tauri/Cargo.toml` | `name = "nova"` → `name = "nova_pm_workspace"`, description 更新 |
| Tauri | `src-tauri/tauri.conf.json` | `productName: "Nova"` → `productName: "Nova-PM-Workspace"` |
| 规划文档 | `.planning/*.md` | "Nova-PM-Workspace" → "Nova-PM-Workspace" |
| 调研文档 | `.planning/research/*.md` | 同上 |
| 架构文档 | `docs/*.md` | 同上 |
| 项目指令 | `CLAUDE.md` | 同上 |
| 目录 | `D:\Projects\Nova\pm-workspace` | → `D:\Projects\Nova\Nova-PM-Workspace` |

### 不修改的内容

- Tauri identifier (`com.nova.pm-workspace`) — 保持不变
- Tauri window title (`Nova`) — 保持简短
- Cargo lib name (`nova_lib`) — 内部细节
- keyring service name (`nova-pm`) — 保持不变,避免破坏已存储的 API key
- `.claude/worktrees/agent-*` 临时目录 — 跳过,会自动清理

## Tasks

### Task 1: 更新包名和配置文件

**Files**:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

**Action**:
1. `package.json`: 修改 `name` 字段从 `"nova"` 到 `"nova-pm-workspace"`
2. `src-tauri/Cargo.toml`: 
   - `[package] name` 从 `"nova"` 改为 `"nova_pm_workspace"`
   - `[package] description` 从 `"Nova - Product & R&D Lifecycle Workspace"` 改为 `"Nova-PM-Workspace - Product & R&D Lifecycle Workspace"`
3. `src-tauri/tauri.conf.json`: `productName` 从 `"Nova"` 改为 `"Nova-PM-Workspace"`

**Verify**:
```bash
grep -E '"name"|"productName"' package.json src-tauri/tauri.conf.json | head -5
grep -E '^name|^description' src-tauri/Cargo.toml | head -5
```

**Done**: 三个配置文件的名称字段已更新,JSON/TOML 格式有效

---

### Task 2: 更新所有 Markdown 文档

**Files**:
- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/ARCHITECTURE-V0.2-CRUD.md`
- `.planning/research/STACK.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/FEATURES.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/ATOMIC-EDITOR.md`
- `.planning/research/PRODUCT-RND-LINKAGE.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PIPELINE_DESIGN.md`
- `docs/README.md`
- `CLAUDE.md`

**Action**:
对所有文件执行全局替换:
- `"Nova-PM-Workspace"` → `"Nova-PM-Workspace"`
- `"Nova-PM-WorkSpace"` → `"Nova-PM-Workspace"` (如果存在)

注意:
- 不修改 `.claude/worktrees/agent-*` 临时目录中的文件
- 不修改 keyring service name `"nova-pm"` (在 STACK.md 中,保持不变)
- 不修改 Tauri identifier `"com.nova.pm-workspace"` (在文档中如果提及,保持不变)

**Verify**:
```bash
grep -rn "Nova-PM-Workspace" --include="*.md" --exclude-dir=node_modules --exclude-dir=.claude . | wc -l
# 应该返回 0 (除了 CONTEXT.md 中的引用)
```

**Done**: 所有 .md 文件中的 "Nova-PM-Workspace" 已替换为 "Nova-PM-Workspace"

---

### Task 3: 重命名磁盘目录 (最后一步)

**Files**:
- 目录: `D:\Projects\Nova\pm-workspace` → `D:\Projects\Nova\Nova-PM-Workspace`

**Action**:
**⚠️ 高风险操作**: 这会破坏当前 Claude Code 会话

1. 确保所有文件修改已提交 (git commit)
2. 关闭所有在 `pm-workspace` 目录下运行的进程 (Claude Code, VS Code, npm, tauri 等)
3. 在父目录执行重命名:
   ```bash
   cd D:\Projects\Nova
   mv pm-workspace Nova-PM-Workspace
   ```
4. 重新打开 Claude Code:
   ```bash
   cd D:\Projects\Nova\Nova-PM-Workspace
   claude
   ```

**Verify**:
```bash
pwd
# 应该显示 D:\Projects\Nova\Nova-PM-Workspace

git status
# 应该显示 clean working tree

ls -la .planning/quick/260810-jwv-nova-pm-workspace/
# 应该存在并包含 CONTEXT.md, PLAN.md, SUMMARY.md
```

**Done**: 磁盘目录已重命名,Claude Code 会话已在新目录下重新启动

---

## Execution Order

1. Task 1 (包名和配置) → commit
2. Task 2 (Markdown 文档) → commit
3. Task 3 (目录重命名) → 用户手动执行 (需要关闭 Claude Code)

## Notes

- Task 3 需要用户手动执行,因为它会破坏当前 Claude Code 会话
- 执行 Task 3 前,必须确保 Task 1 和 Task 2 的修改已提交
- 重命名目录后,用户需要重新打开 Claude Code
- `.claude/worktrees/agent-*` 临时目录中的文件不修改,它们会被自动清理
