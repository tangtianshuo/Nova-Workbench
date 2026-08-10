# Quick Task 260810-jwv: 项目重命名为 Nova-PM-Workspace - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

## Task Boundary

整个项目的命名修改为 Nova-PM-Workspace。涉及范围:
- 规划文档 (PROJECT/STATE/ROADMAP/REQUIREMENTS/CLAUDE.md)
- Tauri 配置 (productName/identifier)
- 包名 (package.json/Cargo.toml)
- 磁盘目录名 (pm-workspace → Nova-PM-Workspace)

## Implementation Decisions

### 命名格式
- **最终命名**: `Nova-PM-Workspace` (全小写 workspace,不是 "WorkSpace")
- **显示名 (productName, 文档标题)**: `Nova-PM-Workspace`
- **包名 (package.json name)**: `nova-pm-workspace` (kebab-case)
- **Crate 名 (Cargo.toml)**: `nova_pm_workspace` (snake_case, Rust 约定)
- **磁盘目录**: `D:\Projects\Nova\pm-workspace` → `D:\Projects\Nova\Nova-PM-Workspace`

### Tauri identifier 处理
- **identifier 保持不变**: `com.nova.pm-workspace`
- **理由**: identifier 是 app 唯一标识,修改会导致已安装用户的本地数据 (SQLite DB, localStorage) 无法访问。保持兼容。
- **仅修改 productName**: `Nova` → `Nova-PM-Workspace` (如果有 productName 字段) 或 保持 `Nova` 不变 (如果 productName 是窗口标题)

### 规划文档更新
- `.planning/PROJECT.md`: 所有 "Nova-PM-Workspace" → "Nova-PM-Workspace"
- `.planning/STATE.md`: 同上
- `.planning/ROADMAP.md`: 同上
- `.planning/REQUIREMENTS.md`: 同上
- `.planning/research/*.md`: 同上
- `CLAUDE.md`: 同上
- 其他 .md 文件: 同上

### 磁盘目录重命名
- **物理重命名文件夹**: `pm-workspace` → `Nova-PM-Workspace`
- **注意**: 这会破坏当前 Claude Code 会话,需要在执行完成后关闭并重新打开 Claude Code
- **执行时机**: 作为最后一步,在所有文件内容修改完成后再重命名目录

## Specific Ideas

- 磁盘目录重命名是高风险操作,需要在所有文件修改完成后执行
- 重命名后需要验证:git 仓库状态、Claude Code 会话、Tauri 构建、npm 构建
- 考虑是否需要更新 .git/config 中的 remote URL (如果配置了 remote)
- Cargo.toml 的 crate name 改为 `nova_pm_workspace` 后,需要同步更新 src-tauri/src/main.rs 中的 lib 引用 (如果有)

## Canonical References

No external specs — requirements fully captured in decisions above
