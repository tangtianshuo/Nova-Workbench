---
phase: quick-260819-fqx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/file_ops.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/workspace_scan.rs
  - src/lib/fileTree.ts
  - src/lib/fileTree.test.ts
  - src/lib/fsName.ts
  - src/lib/fsName.test.ts
  - src/components/FileTree.tsx
  - src/views/AgentWorkspaceView.tsx
autonomous: false
requirements: [QUICK-FQX-01, QUICK-FQX-02, QUICK-FQX-03, QUICK-FQX-04, QUICK-FQX-05]
must_haves:
  truths:
    - "Tauri 下，Agent 页文件树文件/文件夹右键可「在文件资源管理器中打开位置」，Windows 上 explorer 定位到该文件（文件夹则直接打开）"
    - "文件夹节点与树容器空白处右键可「新建文件夹」「新建文件」，Dialog 输入名称后创建空文件/目录并出现在树上"
    - "文件和文件夹均可「重命名」，同名校已存在时 error toast 且不改名"
    - "所有 Rust fs 操作拒绝工作区根之外的路径（canonicalize + starts_with 双保险）与非法名（../分隔符/Windows 非法字符）"
    - "动作成功后树自动刷新（scanWorkspaceFiles）+ success toast；失败 error toast 显示 Rust Err 文案"
    - "web dev 模式（非 Tauri）文件树不渲染右键菜单"
  artifacts:
    - path: "src-tauri/src/file_ops.rs"
      provides: "reveal_in_explorer / fs_create_dir / fs_create_file / fs_rename + 路径安全纯函数"
      exports: ["reveal_in_explorer", "fs_create_dir", "fs_create_file", "fs_rename"]
      min_lines: 80
    - path: "src/lib/fsName.ts"
      provides: "前端非法名校验（快速反馈，Rust 为准）"
    - path: "src/components/FileTree.tsx"
      provides: "带可选右键菜单的文件树"
  key_links:
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "invoke('fs_create_dir' 等)"
      via: "菜单 onSelect → Dialog → invoke → scanWorkspaceFiles 刷新"
      pattern: "invoke\\('fs_(create|rename)|reveal_in_explorer"
    - from: "src-tauri/src/file_ops.rs"
      to: "canonicalize root containment check"
      via: "每个命令先 resolve_in_root"
      pattern: "resolve_in_root"
    - from: "src/lib/fileTree.ts"
      to: "folder node path"
      via: "build 时累计相对路径，供菜单定位文件夹"
      pattern: "kind: 'folder'"
---

<objective>
Agent 工作区页「工作区文件」树的右键菜单：在资源管理器中打开位置 / 新建文件夹 / 新建文件 / 重命名。真实文件系统操作走 Tauri Rust 命令，路径锁死在工作区根内。
</objective>

<context>
@src/components/FileTree.tsx
@src/lib/fileTree.ts
@src/lib/fileTree.test.ts
@src/views/AgentWorkspaceView.tsx
@src/stores/workspaceStore.ts
@src/components/ui/ContextMenu.tsx
@src-tauri/src/workspace_scan.rs
@src-tauri/src/lib.rs

<interfaces>
已存在，直接复用（不要新建）：
- src/components/ui/ContextMenu.tsx: ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel — 已进 ui barrel；@radix-ui/react-context-menu 已在 package.json
- src-tauri/src/workspace_scan.rs: `fn sanitize_file_name(name: &str) -> Result<String, String>`（已拒 ..、/、\、空名，有 cargo test）
- src/stores/workspaceStore.ts: `scanWorkspaceFiles(workspaceId)`（web dev no-op）、`Workspace.folderPath`
- src/lib/api.ts: `isTauri()`
- src/lib/fileTree.ts: `FileTreeNode = { kind:'folder'; name; children } | { kind:'file'; name; path }`（folder 目前无 path，本 plan 补上）

本 plan 创建、供 AgentWorkspaceView 消费：
- src/lib/fsName.ts: `export function isValidFsName(name: string): boolean`（trim 非空、无 / \ .. 与 Windows 非法字符）
- src/lib/fileTree.ts 变更: folder 节点增加 `path: string`（相对工作区根，posix 分隔符）
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rust file_ops 命令 + 路径安全纯函数（含 cargo test）</name>
  <files>src-tauri/src/file_ops.rs, src-tauri/src/lib.rs, src-tauri/src/workspace_scan.rs</files>
  <behavior>
    - resolve_in_root(root, rel): rel 含 `..` 段 → Err；join 后 canonicalize（不存在时对父目录 canonicalize 再拼尾部——新建场景目标尚不存在），结果 starts_with(root canonicalize) 不成立 → Err
    - resolve_in_root 合法: root/a/b.md → Ok；root/a/../../c → Err；含 `..` 任意位置 → Err
    - fs_create_dir(root, parent_rel, name): 非法名 → Err；已存在 → Err("已存在")；成功 → Ok(新路径)
    - fs_create_file(root, parent_rel, name): 同上，fs::write 空内容
    - fs_rename(root, rel, new_name): 非法名/目标已存在/源不存在 → Err；仅同目录改名（join(parent, new_name)），不跨目录移动
    - sanitize_file_name 扩展：拒绝 Windows 非法字符 `\/:*?"<>|` 中的任意一个（含控制字符可不做）
  </behavior>
  <action>
    新建 `src-tauri/src/file_ops.rs`（模块注释对齐 workspace_scan.rs 风格）：
    1. 把 workspace_scan.rs 的 `sanitize_file_name` **移**到 file_ops.rs 并设 `pub(crate)`（workspace_scan 改 `use crate::file_ops::sanitize_file_name;`），在原有拒绝项上加 `name.chars().any(|c| "\\/:*?\"<>|".contains(c))` → Err("文件名包含非法字符")。同步把 workspace_scan.rs 里 sanitize_rules 测试搬到 file_ops.rs 并加非法字符 case（`a:b.md`、`a?.md` → Err）。
    2. `fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, String>`：rel 段中任一为 `..` → Err；`root.join(rel)` 后，若路径存在直接 canonicalize，否则 canonicalize 父目录再 join 文件名（支持 create 场景）；canonicalize 后不以 canonicalized root 开头 → Err("路径超出工作区范围")。root 自身 canonicalize 失败 → Err。
    3. `#[tauri::command] pub fn reveal_in_explorer(path: String) -> Result<(), String>`：cfg windows → `Command::new("explorer").args(["/select,", &path])`（path 含逗号也没关系，/select, 整体一个 arg 即可；若不生效改为 raw arg format!("/select,{}", path)）；cfg target_os="macos" → `open -R path`；else → `xdg-open parent`。用 `std::process::Command`，不 spawn 失败静默 Ok 也行但优先 `.status()` map_err。不依赖 tauri-plugin-shell，无需动 capabilities。
    4. `#[tauri::command] pub fn fs_create_dir(root: String, parent_rel: String, name: String) -> Result<String, String>`：sanitize → resolve_in_root(root, parent_rel) → target=parent.join(name)，target.exists() → Err("已存在同名项")，fs::create_dir → Ok(target 字符串)。
    5. `#[tauri::command] pub fn fs_create_file(...)` 同构，`fs::write(&target, b"")`。
    6. `#[tauri::command] pub fn fs_rename(root: String, rel: String, new_name: String) -> Result<String, String>`：sanitize(new_name) → resolve_in_root(root, rel) 得旧路径（须 exists，否则 Err("不存在")）→ new = old.parent().join(new_name)，new.exists() → Err("已存在同名项") → fs::rename → Ok(new)。
    7. lib.rs：`mod file_ops;` + invoke_handler 追加 4 个命令。
    cargo test 用临时目录模式（对齐 workspace_scan.rs 的 `temp_subdir` helper，可直接在 file_ops tests 里复制小份）：穿越拒绝、非法字符拒绝、合法创建/重命名通过、同名冲突 Err。
    **不要动 src-tauri/Cargo.toml**（有未提交本地改动，且零新依赖）。
  </action>
  <verify>
    <automated>cd src-tauri && cargo check && cargo test file_ops</automated>
  </verify>
  <done>4 个命令注册，路径安全/非法名/同名冲突测试全绿</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: fileTree folder 路径 + 前端名校验 + FileTree 可选右键菜单</name>
  <files>src/lib/fileTree.ts, src/lib/fileTree.test.ts, src/lib/fsName.ts, src/lib/fsName.test.ts, src/components/FileTree.tsx</files>
  <behavior>
    - buildFileTree 后 folder 节点携带相对路径（posix /）：`['a/b/c.txt']` → folder a path='a'，folder b path='a/b'
    - isValidFsName('PRD v3.2.md') → true；`''`、`'  '`、`'a/b'`、`'a\\b'`、`'..x'` 含 `..`、`'a:b'`、`'a?.md'` → false
  </behavior>
  <action>
    1. fileTree.ts：`toTree`/`buildFileTree` 传前缀，folder 节点加 `path: string`（相对根，'/' 分隔，根级 folder path 即其名）。fileTree.test.ts 加断言（嵌套 case 里查 folder.path）。
    2. 新建 `src/lib/fsName.ts`（~6 行）：`export function isValidFsName(name: string): boolean` —— trim 非空、不含 `/ \ .. : * ? " < > |`。fsName.test.ts 用 node:test（npm test 已 glob src/lib/*.test.ts）。
    3. FileTree.tsx：加可选 prop `menu?: { onReveal: (path: string) => void; onCreate: (kind: 'dir' | 'file', parentRel: string) => void; onRename: (rel: string, kind: 'folder' | 'file', currentName: string) => void }`。menu 存在时：每个 TreeRow 外包 `<ContextMenu><ContextMenuTrigger asChild>{row}</ContextMenuTrigger>`；file 行菜单 = 打开位置 + 重命名；folder 行 = 打开位置 + 新建文件夹 + 新建文件 + 重命名（parentRel = node.path）；树根容器（return 的最外 div）同样包一层，parentRel = ''，菜单 = 新建文件夹 + 新建文件。菜单图标用 Phosphor duotone 12px（FolderOpen / FolderPlus / FilePlus / PencilSimple）。menu 不传 → 行为与现在完全一致（web dev 不传即无菜单）。文件夹行包 ContextMenu 后保留原 onClick 展开（Trigger asChild 不吞左键）。
    复用现有 ui/ContextMenu 原语，禁止新建菜单组件。
  </action>
  <verify>
    <automated>npm test && npm run lint</automated>
  </verify>
  <done>folder 带 path；FileTree 在传入 menu 时右键出四类动作，不传时不变</done>
</task>

<task type="auto">
  <name>Task 3: AgentWorkspaceView 接线（invoke + Dialog + toast + 刷新）</name>
  <files>src/views/AgentWorkspaceView.tsx</files>
  <action>
    1. `const tauri = isTauri()`；仅在 tauri 且 activeWorkspace 有 folderPath 时给 FileTree 传 menu（web dev 不渲染菜单，决策 6）。
    2. 三个动作 handler：onReveal → `invoke('reveal_in_explorer', { path })`，Err → error toast。onCreate/onRename → 打开共享 Dialog（state: `{ kind: 'newDir' | 'newFile' | 'rename', parentRel, rel?, currentName? }`），Dialog 内 Input；提交时先 `if (!isValidFsName(name)) { toast error '名称包含非法字符'; return; }` 再 invoke 对应命令（create 传 `{ root: activeWorkspace.folderPath, parentRel, name }`，rename 传 `{ root, rel, newName }`——注意 Tauri 命令参数名 snake_case 字段按 Rust 参数名传：`root, parent_rel/name` 等，invoke 参数对象键用 Rust 形参名）。对 file 节点 rel：node.path 是绝对路径——reveal 直接用；create/rename 的 rel 需相对路径：file 用 node.path，Rust 侧 resolve_in_root 需要相对路径，所以 file 的 rel 取 `node.path.slice(folderPath.length).replace(/\\/g,'/').replace(/^\//,'')`（或直接给 fs_rename 传绝对路径并让 resolve_in_root 对以 root 开头的绝对路径做 relativize——二选一，选前者，保持 resolve_in_root 契约简单）。
    3. 成功 → `void scanWorkspaceFiles(activeWorkspaceId)`（scannedFor.current 置 null 让 effect 不挡手动刷新，或直接调 store 即可——store 本身无 ref 守卫，直接调用即可）+ success toast；失败 → error toast 显示 Rust Err 字符串。
    4. Dialog 复用 ui barrel 的 Dialog/DialogContent/DialogHeader/DialogFooter/Input/Button（对齐 CreateProductModal 模式）。
  </action>
  <verify>
    <automated>npm run lint && npm test</automated>
  </verify>
  <done>四个右键动作闭环：菜单 → Dialog → invoke → 树刷新 + toast</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Agent 页工作区文件树右键菜单（打开位置 / 新建文件夹 / 新建文件 / 重命名），Rust 真实文件系统操作，路径锁工作区根内</what-built>
  <how-to-verify>
    `npm run tauri:dev` 打开桌面端 → Agent 工作区页 → 右栏「工作区文件」tab：
    1. 文件右键 →「在文件资源管理器中打开位置」→ explorer 打开并选中该文件；文件夹右键同项 → 直接打开该文件夹
    2. 树空白处右键 → 新建文件夹 / 新建文件 → Dialog 输入名 → 树刷新出现新项，资源管理器确认真实存在
    3. 文件与文件夹分别重命名 → 树刷新显示新名
    4. 重命名为已存在名 → error toast，原文件未动
    5. 输入 `a:b` 或 `a/b` → 前端立即拒绝
    6. web 模式 `npm run dev` 浏览器打开 → 右键无自定义菜单
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
npm run lint 0 错误；npm test 全绿（fileTree folder path + fsName 校验新 case）；cd src-tauri && cargo check && cargo test 全绿。
</verification>

<success_criteria>
四个右键动作在 Tauri 桌面端全部可用且真实落盘；路径穿越与非法名被 Rust 侧拒绝；web dev 无菜单；树与 toast 反馈正确。
</success_criteria>

<deviations>
- 任务描述决策 2 要求「新增 @radix-ui/react-context-menu 依赖 + 新建 ContextMenu.tsx 原语」——两者已存在（Phase 17 产物，已进 barrel），本 plan 直接复用，不新增依赖不新建文件。
- sanitize_file_name 不新写：从 workspace_scan.rs 迁移到 file_ops.rs 并扩展 Windows 非法字符（避免两份校验）。
- 跳过（用户未点名/破坏性）：删除、移动/剪切；FileArchiveView 的树（mock 数据）不加菜单。
</deviations>

<output>
完成后创建 `.planning/quick/260819-fqx-filetree-context-menu/260819-fqx-SUMMARY.md`。
提交（仓库根目录，勿 stage src-tauri/Cargo.toml 的既有改动）：
1. `node bin/gsd-tools.cjs commit --no-verify "feat(quick-fqx): Rust file ops commands with workspace-root path safety + tests"` — src-tauri/src/file_ops.rs, src-tauri/src/lib.rs, src-tauri/src/workspace_scan.rs
2. `node bin/gsd-tools.cjs commit --no-verify "feat(quick-fqx): FileTree context menu + folder paths + name validation"` — src/lib/fileTree.ts, src/lib/fileTree.test.ts, src/lib/fsName.ts, src/lib/fsName.test.ts, src/components/FileTree.tsx
3. `node bin/gsd-tools.cjs commit --no-verify "feat(quick-fqx): wire file tree context menu in Agent workspace view"` — src/views/AgentWorkspaceView.tsx
</output>
