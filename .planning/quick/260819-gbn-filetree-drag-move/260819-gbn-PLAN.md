---
phase: quick-260819-gbn
plan: 01
type: execute
wave: 1
depends_on: [quick-260819-fqx]
files_modified:
  - src-tauri/src/file_ops.rs
  - src-tauri/src/lib.rs
  - src/components/FileTree.tsx
  - src/views/AgentWorkspaceView.tsx
autonomous: false
requirements: [QUICK-GBN-01, QUICK-GBN-02, QUICK-GBN-03, QUICK-GBN-04]
must_haves:
  truths:
    - "Tauri 下，文件树中拖拽文件到文件夹行或拖拽文件夹到另一文件夹行 → 真实移动（fs::rename），树刷新 + success toast"
    - "拖拽任意节点到树根容器空白处 → 移动到工作区根目录"
    - "把文件夹移进自己的子孙目录被拒绝（error toast 中文文案）；目标已存在同名被拒绝；同位置移动为无操作（不报错不刷新）"
    - "拖动中源行 opacity-50，目标文件夹高亮 bg-accent-subtle；文件节点不是 drop target"
    - "右键文件节点也有「新建文件夹」「新建文件」（目标=所在父文件夹）；右键文件夹节点新建目标=该文件夹"
    - "web dev 模式（非 Tauri）无拖拽 handlers、无菜单，行为与现在完全一致"
  artifacts:
    - path: "src-tauri/src/file_ops.rs"
      provides: "fs_move(root, src_rel, dest_dir_rel) + ancestor/冲突/同位置防护 + cargo test"
      exports: ["fs_move"]
      min_lines: 100
    - path: "src/components/FileTree.tsx"
      provides: "可选 dnd prop：行 draggable、文件夹/根容器 drop target、拖动视觉反馈；文件节点菜单补新建两项"
  key_links:
    - from: "src/components/FileTree.tsx"
      to: "dnd.onMove(srcRel, destDirRel)"
      via: "行 onDragStart 设置 dataTransfer + 源高亮；文件夹 onDragOver preventDefault + 高亮；onDrop 回调"
      pattern: "onDrop|dataTransfer"
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "invoke('fs_move')"
      via: "dnd.onMove → invoke({ root, srcRel, destDirRel }) → scanWorkspaceFiles + toast"
      pattern: "invoke\\('fs_move'"
    - from: "src-tauri/src/file_ops.rs"
      to: "resolve_in_root + ancestor check"
      via: "fs_move 先 resolve 两条路径，dest_dir starts_with src 时 Err"
      pattern: "fs_move"
---

<objective>
工作区文件树补两件事：① 原生 HTML5 拖拽移动文件/文件夹（像真实文件系统）；② 右键文件/文件夹节点也能新建文件夹/新建文件。全部复用 fqx 的 ContextMenu / file_ops / Dialog / toast / 刷新基础设施，零新依赖。
</objective>

<context>
@.planning/quick/260819-fqx-filetree-context-menu/260819-fqx-SUMMARY.md
@src/components/FileTree.tsx
@src/lib/fileTree.ts
@src/views/AgentWorkspaceView.tsx
@src-tauri/src/file_ops.rs
@src-tauri/src/lib.rs

<interfaces>
已存在，直接复用（不要新建）：
- src/components/FileTree.tsx: `FileTreeMenu { onReveal, onCreate(kind, parentRel), onRename }`，行/根容器已包 ContextMenu；file 节点 `node.path` 为相对 posix 路径（如 `docs/a.md`），folder 同
- src-tauri/src/file_ops.rs: `resolve_in_root(root, rel)`（canonicalize + starts_with）、`sanitize_file_name`、`create_entry`、temp_subdir 测试 helper
- src/views/AgentWorkspaceView.tsx: `fileTreeMenu`（Tauri+folderPath 才传）、`nameDialog` 流程、`refreshTree()`、`toast`
- src/stores/workspaceStore.ts: `scanWorkspaceFiles(workspaceId)`

本 plan 新增契约：
- file_ops.rs: `#[tauri::command] fs_move(root: String, src_rel: String, dest_dir_rel: String) -> Result<String, String>`
- FileTree.tsx: 可选 prop `dnd?: { onMove: (srcRel: string, destDirRel: string) => void }` — 不传时行不挂 draggable（web dev 天然无拖拽）
- FileTreeMenu 不变（新建走已有 onCreate，只是 file 节点也调用它）
</interfaces>

</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rust fs_move 命令 + 防护测试</name>
  <files>src-tauri/src/file_ops.rs, src-tauri/src/lib.rs</files>
  <behavior>
    - fs_move 文件入文件夹: root 下 a.md + docs/ → fs_move(root, "a.md", "docs") → Ok，docs/a.md 存在、根下 a.md 消失
    - fs_move 文件夹: docs2 → fs_move(root, "docs", "docs2") → docs2/docs 存在
    - 移进自身子孙被拒: fs_move(root, "docs", "docs/sub") → Err("不能将文件夹移动到自身内部")
    - 同名冲突被拒: 目标目录已有同名 → Err("已存在同名项")
    - 同位置无操作: fs_move(root, "a.md", "")（a.md 已在根）→ Err("已在目标位置") 或 Ok 不动——选 Err("已在目标位置")，前端 toast 提示即可，不特殊分支
  </behavior>
  <action>
    在 file_ops.rs 追加：
    1. `#[tauri::command] pub fn fs_move(root: String, src_rel: String, dest_dir_rel: String) -> Result<String, String>`：
       - `let src = resolve_in_root(Path::new(&root), &src_rel)?;` 须 exists 否则 Err("目标不存在")；`let dest_dir = resolve_in_root(Path::new(&root), &dest_dir_rel)?;` 须 is_dir 否则 Err("目标必须是文件夹")。
       - 同位置：`src.parent() == Some(dest_dir.as_path())` → Err("已在目标位置")。
       - ancestor：src 是目录且 `dest_dir.starts_with(&src)` → Err("不能将文件夹移动到自身内部")。
       - target = dest_dir.join(src.file_name()…)；target.exists() → Err("已存在同名项")；`fs::rename(&src, &target)`（同卷，同一工作区根内必成立）map_err("移动失败")→ Ok(target 字符串)。
    2. tests 追加 `move_roundtrip`：用现有 temp_subdir helper 覆盖上面 5 个 behavior case。
    3. lib.rs invoke_handler 追加 `file_ops::fs_move,`。
    不动 Cargo.toml（既有未提交本地改动，零新依赖）。
  </action>
  <verify>
    <automated>cd src-tauri && cargo check && cargo test file_ops</automated>
  </verify>
  <done>fs_move 注册且 5 类防护测试全绿（文件移动/文件夹移动/子孙拒/冲突拒/同位置）</done>
</task>

<task type="auto">
  <name>Task 2: FileTree 原生拖拽 + 文件节点右键新建</name>
  <files>src/components/FileTree.tsx</files>
  <action>
    1. 新可选 prop `dnd?: { onMove: (srcRel: string, destDirRel: string) => void }`，与 menu 一路从 FileTree 传到 TreeRow。dnd 存在时才挂拖拽 handlers（web dev 不传即无）。
    2. TreeRow 内部状态 `dragging` / `dropActive`（useState，行级即可）：所有节点（文件+文件夹 header）`draggable={!!dnd}`，`onDragStart={e => { e.dataTransfer.setData('text/plain', node.path); e.dataTransfer.effectAllowed='move'; setDragging(true); }}`，`onDragEnd={() => setDragging(false)}`；dragging 时行 className 加 `opacity-50`。
    3. 文件夹 header 与树根容器为 drop target：`onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; setDropActive(true); }}`、`onDragLeave={() => setDropActive(false)}`、`onDrop={e => { e.preventDefault(); setDropActive(false); const src = e.dataTransfer.getData('text/plain'); if (src && src !== destRel) dnd.onMove(src, destRel); }}`。文件夹 destRel = node.path，根容器 destRel = ''。dropActive 时 header/容器 className 加 `bg-accent-subtle`。drop 后 `setDragging(false)`（onDrop 不一定在源行触发，onDragEnd 也会兜底）。注意根容器 drop 要 stopPropagation 不必要——嵌套 drop 冒泡到根会双触发：文件夹行 onDrop 里 `e.stopPropagation()`。
    4. 文件节点菜单补两项：在「打开位置」后加 `新建文件夹`（onCreate('dir', parentRel)）与 `新建文件`（onCreate('file', parentRel)），parentRel = node.path 去掉最后一段：`node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''`。图标/文案对齐 folder 菜单现有项（FolderPlus / FilePlus, 12px duotone）。文件节点仍不是 drop target（无 onDragOver/onDrop）。
    token classnames only；不动 FileTreeMenu 接口。
  </action>
  <verify>
    <automated>npm run lint && npm test</automated>
  </verify>
  <done>dnd 传入时行可拖、文件夹/根可放、视觉反馈生效；不传时零行为变化；文件右键菜单含新建两项</done>
</task>

<task type="auto">
  <name>Task 3: AgentWorkspaceView 接线 fs_move</name>
  <files>src/views/AgentWorkspaceView.tsx</files>
  <action>
    在 fileTreeMenu 同处追加：
    1. `const handleMove = async (srcRel: string, destDirRel: string) => { try { await invoke('fs_move', { root: folderPath, srcRel, destDirRel }); toast({ type: 'success', title: '已移动', description: srcRel }); refreshTree(); } catch (e) { toast({ type: 'error', title: '移动失败', description: String(e) }); } };`
    2. FileTree 传 `dnd={isTauri() && folderPath ? { onMove: (s, d) => void handleMove(s, d) } : undefined}`（与 menu 同条件，fileTreeMenu 可复用同一 tauri 判断，最短 diff 直接内联条件亦可）。
    invoke 参数键用 Rust 形参名（srcRel/destDirRel → Tauri 自动 camelCase 映射，与 fqx 的 parentRel/newName 同模式）。
  </action>
  <verify>
    <automated>npm run lint && npm test</automated>
  </verify>
  <done>拖拽 → fs_move → 树刷新 + success/error toast 闭环</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>文件树原生拖拽移动（文件/文件夹/移到根空白）+ 文件与文件夹节点右键均可新建文件夹/新建文件</what-built>
  <how-to-verify>
    `npm run tauri:dev` → Agent 工作区页 →「工作区文件」tab：
    1. 拖一个文件到某文件夹行（高亮出现）松手 → 文件进入该文件夹，资源管理器确认真实移动，success toast
    2. 拖一个文件夹到另一文件夹 → 整个文件夹（含内容）移动
    3. 拖任意节点到树空白区域 → 移到工作区根
    4. 拖文件夹到自己内部的子文件夹 → error toast「不能将文件夹移动到自身内部」，原位不动
    5. 拖到已有同名项的文件夹 → error toast「已存在同名项」
    6. 右键一个文件 → 菜单含「新建文件夹」「新建文件」→ 新建落在该文件所在目录；右键文件夹同项落在该文件夹内
    7. 回归：重命名、打开位置、根空白右键新建仍正常
    8. web 模式 `npm run dev` → 无拖拽、无菜单
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
npm run lint 0 错误；npm test 全绿；cd src-tauri && cargo check && cargo test 全绿（含 fs_move 新 case）。
</verification>

<success_criteria>
拖拽移动三类目标（文件夹/文件夹嵌套/根空白）真实落盘；子孙/同名/同位置三类非法移动被 Rust 拒绝并 error toast；文件与文件夹右键均可新建；web dev 零变化。
</success_criteria>

<deviations>
- 按既定决策跳过：多选拖拽、跨工作区拖拽、剪切/粘贴等键盘 a11y DnD 替代路径、移动 undo。
- 同位置移动返回 Err（「已在目标位置」）而非静默 Ok —— 统一 Err 通道，少一个前端分支。
- 拖拽视觉反馈用 useState 行级状态（不用 dataTransfer 里塞 UI 状态或全局 store），最短正确。
</deviations>

<output>
完成后创建 `.planning/quick/260819-gbn-filetree-drag-move/260819-gbn-SUMMARY.md`。
原子提交（直接 git commit --no-verify，bin/gsd-tools.cjs 不在仓库；勿 stage src-tauri/Cargo.toml 既有改动）：
1. `git commit --no-verify -m "feat(quick-gbn): Rust fs_move command with ancestor/collision guards + tests"` — src-tauri/src/file_ops.rs, src-tauri/src/lib.rs
2. `git commit --no-verify -m "feat(quick-gbn): FileTree native drag-move + create actions on file node menu"` — src/components/FileTree.tsx
3. `git commit --no-verify -m "feat(quick-gbn): wire drag-move fs_move in Agent workspace view"` — src/views/AgentWorkspaceView.tsx
</output>
