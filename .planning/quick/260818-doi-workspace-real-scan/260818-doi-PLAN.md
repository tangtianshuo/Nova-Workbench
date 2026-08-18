---
phase: quick-260818-doi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/commands.rs
  - src-tauri/src/lib.rs
  - src/stores/workspaceStore.ts
  - src/views/FileArchiveView.tsx
  - src/components/AddWorkspaceModal.tsx
autonomous: false
requirements: [QUICK-DOI-01]
must_haves:
  truths:
    - "Tauri 桌面端工作区文件列表真实反映 folderPath 文件夹内容"
    - "新建工作区后文件列表来自真实扫描而非 mock 默认文件"
    - "Web dev 模式行为不变（保留 mock）"
  artifacts:
    - path: "src-tauri/src/commands.rs"
      provides: "scan_workspace_folder command"
      contains: "scan_workspace_folder"
    - path: "src/stores/workspaceStore.ts"
      provides: "scanWorkspaceFiles action"
      contains: "scanWorkspaceFiles"
  key_links:
    - from: "src/stores/workspaceStore.ts"
      to: "scan_workspace_folder"
      via: "invoke"
      pattern: "invoke\\('scan_workspace_folder'"
---

<objective>
工作区文件列表从硬编码 mock 改为 Tauri 端真实扫描 folderPath。web dev 模式保留现状 fallback。
</objective>

<context>
@src-tauri/src/commands.rs (IPC command 模式，新增 command 加在此文件)
@src-tauri/src/lib.rs (invoke_handler 注册表)
@src/stores/workspaceStore.ts (Workspace/WorkspaceFile 类型，action 模式，set((state)=>...) 不可变更新)
@src/lib/api.ts (isTauri())
@src/components/AddWorkspaceModal.tsx (handleSubmit → addWorkspace → onSuccess)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rust scan_workspace_folder command</name>
  <files>src-tauri/src/commands.rs, src-tauri/src/lib.rs</files>
  <action>
在 commands.rs 追加（不改动既有 command）：

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileDto {
    pub id: String,
    pub name: String,
    pub file_type: String, // 注意: serde camelCase 会产出 "fileType"，前端要映射。改为直接命名 type 字段避开 Rust 关键字问题: 用 `#[serde(rename = "type")] pub r#type: String` 或字段名 file_type + 前端映射 —— 推荐后者，前端已要做 DTO→WorkspaceFile 转换。
    pub size: String,      // 人读格式 "2.8 MB"
    pub updated_at: String, // "YYYY-MM-DD HH:MM"
    pub path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<WorkspaceFileDto>,
    pub truncated: bool,
}

#[tauri::command]
pub fn scan_workspace_folder(folder_path: String) -> Result<ScanResult, String>
```

- std::fs 递归扫描，max_depth 3 / max 500 文件；超限停止并 truncated=true
- 跳过隐藏条目（Unix dot 前缀 + Windows 用 `file_name().to_str()` 判断 '.' 前缀即可）与 node_modules/.git/target 目录
- type 按扩展名映射：.md/.doc(x)→doc, .pdf→pdf, .xls(x)/.csv→sheet, .ts/.tsx/.rs/.py/.js/.json→code, .psd/.fig/.sketch→design, .zip/.rar/.7z→archive, 其他→doc
- size 人读格式（B/KB/MB/GB，1 位小数，<1024 用整数 B）；updatedAt 用 SystemTime→chrono 或手写 UNIX epoch 转 UTC（repo 已有 chrono 吗？没有就手写或加 chrono —— 先查 Cargo.toml，避免新依赖可用 `time` crate 若已存在，否则加 chrono，桌面项目加 chrono 无负担）
- 只读文件（非目录），metadata 失败的条目跳过
- lib.rs invoke_handler 注册 `commands::scan_workspace_folder`
- 单元测试（commands.rs `#[cfg(test)]`）：映射函数按扩展名、size 格式化、忽略名单
  </action>
  <verify>cd src-tauri && cargo test scan 2>&1 | tail -5（编译 + 测试绿）</verify>
  <done>command 注册且 `cargo test` 通过</done>
</task>

<task type="auto">
  <name>Task 2: store action + UI 接线</name>
  <files>src/stores/workspaceStore.ts, src/views/FileArchiveView.tsx, src/components/AddWorkspaceModal.tsx</files>
  <action>
workspaceStore.ts 新增 action：

```ts
scanWorkspaceFiles: async (workspaceId: string): Promise<void> => {
  if (!isTauri()) return; // web dev 保留 mock
  const ws = useWorkspaceStore.getState().workspaces.find(w => w.id === workspaceId);
  if (!ws?.folderPath) return;
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    const result = await invoke<{ files: Array<{id:string;name:string;fileType:string;size:string;updatedAt:string;path:string}>; truncated: boolean }>('scan_workspace_folder', { folderPath: ws.folderPath });
    useWorkspaceStore.getState().updateWorkspace(workspaceId, { files: result.files.map(f => ({ ...f, type: f.fileType as WorkspaceFile['type'] })) });
    if (result.truncated) console.warn('工作区文件扫描已截断(>500 文件或 >3 层)');
  } catch (e) { console.error('scan_workspace_folder failed:', e); }
}
```

注意: set 已有 updateWorkspace，直接复用；action 加入 WorkspaceState 接口。action 内不调 hook，用 getState()。

FileArchiveView.tsx：工作区详情 header 加"刷新文件"按钮（Phosphor ArrowsClockwise size 14 duotone），isTauri() 时渲染，onClick={() => scanWorkspaceFiles(currentWorkspace.id)}，扫描中禁用按钮（本地 useState isScanning）。

AddWorkspaceModal.tsx：onSuccess(newWs) 后（Tauri 模式）调 scanWorkspaceFiles(newWs.id)，替换 defaultFiles 硬编码 —— Tauri 模式 files 初始为 `[]`（真实扫描回填），web 模式保留 defaultFiles。

isTauri 从 `@/src/lib/api` 导入；store 里也用它（lib/api 无 React 依赖，安全）。
  </action>
  <verify>npm run lint 通过</verify>
  <done>lint 绿；按钮仅在 Tauri 显示；新工作区在桌面端自动回填真实文件</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>工作区真实文件扫描（Rust command + store action + UI）</what-built>
  <how-to-verify>
1. `npm run tauri:dev`
2. 打开 文档归档 Tab，选已有工作区 → 点"刷新文件" → 文件列表应真实反映 D:\Projects\WenXiBuddy\workspace（若该路径不存在，列表清空且无报错）
3. 新建工作区指向一个真实文件夹 → 创建后文件列表 = 该文件夹内容（含子目录，≤3 层，无 node_modules/.git）
4. `npm run dev`（web 模式）→ 无"刷新文件"按钮，mock 文件仍在
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<success_criteria>
cargo test 绿 + npm run lint 绿 + 人工 checkpoint 通过
</success_criteria>
