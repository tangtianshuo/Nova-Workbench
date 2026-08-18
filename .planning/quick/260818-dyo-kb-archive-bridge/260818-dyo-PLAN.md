---
phase: quick-260818-dyo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/workspace_scan.rs
  - src-tauri/src/lib.rs
  - src/ai/knowledgeRepo.ts
  - src/views/FileArchiveView.tsx
  - src/views/KnowledgeBaseView.tsx
autonomous: true
must_haves:
  truths:
    - "Tauri 模式下,文档归档文件表每行可'提取到知识库',内容来自真实磁盘文件,成功后知识库出现该文档(sourceType=archive_import)"
    - "Tauri 模式下,知识库文档详情可'归档到工作区',选择工作区后 .md 文件真实写入其 folderPath,文件表刷新可见"
    - "Web 模式两个入口均不显示"
  artifacts:
    - path: "src-tauri/src/workspace_scan.rs"
      provides: "read_workspace_file / write_workspace_file commands + 单测"
      contains: "read_workspace_file"
    - path: "src/views/FileArchiveView.tsx"
      provides: "提取到知识库 行动作"
      contains: "archive_import"
    - path: "src/views/KnowledgeBaseView.tsx"
      provides: "归档到工作区 按钮 + 工作区选择 Dialog"
      contains: "write_workspace_file"
  key_links:
    - from: "src/views/FileArchiveView.tsx"
      to: "read_workspace_file"
      via: "invoke('read_workspace_file', { path })"
      pattern: "read_workspace_file"
    - from: "src/views/FileArchiveView.tsx"
      to: "rndStore.addKnowledgeItem"
      via: "addKnowledgeItem(productId, {...}, { sourceType: 'archive_import' })"
      pattern: "archive_import"
    - from: "src/views/KnowledgeBaseView.tsx"
      to: "write_workspace_file + scanWorkspaceFiles"
      via: "invoke 写入后刷新"
      pattern: "write_workspace_file"
---

<objective>
打通知识库 ⇄ 文档归档双向通道(产品定位核心闭环):
(1) 归档文件 → 知识库;(2) 知识库文档 → 工作区 .md 文件。
Output: 2 个 Rust command + 两个视图各一个入口,web 模式隐藏。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src-tauri/src/workspace_scan.rs (既有 command 模式 + 单测风格,新 command 放同文件)
@src/stores/workspaceStore.ts (scanWorkspaceFiles / Workspace / WorkspaceFile)
@src/stores/rndStore.ts (addKnowledgeItem(productId, item, opts) — opts.sourceType)
@src/ai/knowledgeRepo.ts (KnowledgeDocInput.sourceType 当前是 `'seed' | 'agent' | 'user'` 联合类型,需加 'archive_import';存储列是开放 string,SQLite 无需迁移)
@src/views/FileArchiveView.tsx (文件表行操作列 :462-470;"刷新文件"按钮 :336-352 的 isTauri() gating 模式)
@src/views/KnowledgeBaseView.tsx (文档详情头部按钮区 :427-450;currentItem 为 ProductKnowledgeItem | KnowledgeDoc)

<interfaces>
// workspaceStore.ts
export interface Workspace { id: string; name: string; folderPath: string; projectId?: string; ... }
scanWorkspaceFiles(workspaceId: string): Promise<void>   // isTauri() gating, web no-op

// rndStore.ts
addKnowledgeItem: (productId: string,
  item: Omit<ProductKnowledgeItem, 'id' | 'productId' | 'updatedAt'>,
  opts?: { sourceType?: KnowledgeDocInput['sourceType'] }) => Promise<void>;
// ProductKnowledgeItem 必填: title, category, tags, author, readTime, summary, content
// category 是联合类型 — 用 '技术沉淀'(既有值)避免类型撒谎

// knowledgeRepo.ts
export interface KnowledgeDocInput { ...; sourceType?: 'seed' | 'agent' | 'user'; }  // Task 2 加 'archive_import'

// workspace_scan.rs 既有 command
#[tauri::command] pub fn scan_workspace_folder(folder_path: String) -> Result<ScanResult, String>
// lib.rs invoke_handler 已注册该 command — 新 command 需同样注册
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rust read/write workspace file commands</name>
  <files>src-tauri/src/workspace_scan.rs, src-tauri/src/lib.rs</files>
  <behavior>
  - read_workspace_file: 文本扩展白名单(.md .txt .json .csv .log .yml .yaml .xml .ts .tsx .js .rs .py)外 → Err;>200KB → Err;不存在/非文件 → Err;成功返回 String 内容(UTF-8 lossy)
  - write_workspace_file: file_name 含 `/` `\` `..` 或为空 → Err;folder 不存在 → Err;同名已存在 → 追加 `-<unix_millis>` 后缀(不覆盖用户文件);成功返回写入的完整路径 String
  </behavior>
  <action>
在 workspace_scan.rs 追加两个 command(复用既有风格:std::fs,无新依赖):

1. `const TEXT_EXTS: &[&str]` 白名单 + `const MAX_READ_BYTES: u64 = 200 * 1024;`
2. `#[tauri::command] pub fn read_workspace_file(path: String) -> Result<String, String>`:
   - Path 校验 is_file;extension 小写匹配白名单,否则 `Err("仅支持读取文本类文件 (.md/.txt/.json 等)")`
   - metadata().len() > MAX_READ_BYTES → `Err("文件超过 200KB 限制")`
   - `fs::read_to_string` 失败用 `fs::read` + `String::from_utf8_lossy`(兼容 GBK 边缘文件不崩溃)
   - 安全简化(ponytail):路径来源是本应用扫描结果(文件表),不做工作区前缀校验 — 前缀校验需前端传 workspaces 列表过 IPC,收益低;UI 侧只对扫描到的行展示入口。加 `// ponytail: no workspace-prefix check; entry only offered on scanned rows — add prefix validation if exposed elsewhere`
3. `#[tauri::command] pub fn write_workspace_file(folder_path: String, file_name: String, content: String) -> Result<String, String>`:
   - `sanitize_file_name(file_name) -> Result<String, String>`:拒绝空、含 `/` `\`、`..`(独立 fn 便于测试)
   - folder 必须 is_dir,否则 Err
   - 同名存在:stem + `-` + `System::now millis`(std::time)重组文件名
   - `fs::write` 全路径,返回 `to_string_lossy()` 路径
4. lib.rs:invoke_handler 链上注册两个新 command(在 scan_workspace_folder 旁)
5. 单测(沿用 `mod tests` 风格):白名单扩展判定、sanitize 拒绝 `../x`、`a/b.md`、空名、sanitize 放行 `PRD v3.2.md`。文件系统 IO 用 `std::env::temp_dir()` + 唯一子目录,测试结束清理(读写往返 + 同名追加后缀各 1 个测试)
  </action>
  <verify>
    <automated>cd src-tauri && cargo test workspace_scan && cargo check</automated>
  </verify>
  <done>两个 command 注册可用,单测全绿,非文本/超大/路径注入均被拒绝</done>
</task>

<task type="auto">
  <name>Task 2: 文档归档 → 知识库(提取入口)</name>
  <files>src/ai/knowledgeRepo.ts, src/views/FileArchiveView.tsx</files>
  <action>
1. knowledgeRepo.ts:`KnowledgeDocInput.sourceType` 联合类型加 `| 'archive_import'`(存储列是开放 string,无迁移;仅类型层)
2. FileArchiveView.tsx 文件表行操作列(:462-470,现有 启动/Copy 按钮旁),`isTauri()` 时加 Button:
   ```
   <Button variant="ghost" size="xs" className="text-accent" onClick={() => void handleExtractToKnowledge(f)}>
     <FileText size={12} weight="duotone" /> 提取
   </Button>
   ```
   (仅对文本类扩展展示:f.name 匹配 /\.(md|txt|json|csv|log|ya?ml|xml|ts|tsx|js|rs|py)$/i — 与 Rust 白名单一致)
3. `handleExtractToKnowledge(f: WorkspaceFile)`:
   - productId 解析:`currentWorkspace.projectId` → 为空 fallback `useProductStore.getState().products[0]?.id`;仍无 → toast 提示"请先创建产品"并 return
   - `const { invoke } = await import('@tauri-apps/api/core'); const content = await invoke<string>('read_workspace_file', { path: f.path });`
   - `await useRndStore.getState().addKnowledgeItem(productId, { title: f.name.replace(/\.[^.]+$/, ''), category: '技术沉淀', tags: ['归档提取'], author: 'AI 助手(归档提取)', readTime: '—', summary: \`从工作区 ${currentWorkspace.name} 提取的 ${f.name}\`, content }, { sourceType: 'archive_import' });`
   - 成功 `showToast('已提取到知识库：' + f.name)`;失败 console.error + toast 错误文案(read 的 Err 字符串直接展示)
4. imports:补 useRndStore、useProductStore(直接 getState() 用法,不订阅避免无谓渲染)
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>tsc 通过;Tauri 下文本文件行出现"提取"按钮,点击后知识库出现 archive_import 来源文档;web 下不显示</done>
</task>

<task type="auto">
  <name>Task 3: 知识库 → 文档归档(归档入口)</name>
  <files>src/views/KnowledgeBaseView.tsx</files>
  <action>
1. 文档详情头部按钮区(:427-450 "分享"旁),`isTauri() && currentItem` 时加:
   ```
   <Button variant="secondary" size="sm" onClick={() => setShowArchiveDialog(true)} disabled={!currentItem?.content}>
     归档到工作区
   </Button>
   ```
2. 新增 state:`showArchiveDialog`、`archiveTargetWorkspaceId`(默认 workspaces[0]?.id ?? '')、`isArchiving`
3. 小 Dialog(max-w-md):
   - DialogHeader title="归档到工作区" description="选择目标工作区,文档将以 .md 文件写入其文件夹"
   - Select(workspaceStore.workspaces 下拉,显示 name + folderPath 截断)
   - DialogFooter: 取消 / primary"归档"(isArchiving 时 disabled + 文案"归档中...")
4. `confirmArchive()`:
   - 文件名清洗(前端兜底,与 Rust 一致):title 替换 `[\\/:*?"<>|]` 为 `_`,`.trim()`;`${cleanTitle}.md`
   - `invoke<string>('write_workspace_file', { folderPath: ws.folderPath, fileName, content: currentItem.content })`
   - 成功后 `await useWorkspaceStore.getState().scanWorkspaceFiles(ws.id)` 刷新文件表,toast 成功(含返回路径),关 Dialog
   - 失败 toast error 展示 Err 字符串
5. imports:isTauri(@/src/lib/api)、useWorkspaceStore、Dialog 组件已有(Dialog/DialogContent/DialogHeader/DialogFooter 已 import)、Select 组件已有。currentItem 取 content:ProductKnowledgeItem 与 KnowledgeDoc 都带 content 字段,直接 `currentItem?.content ?? ''`
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>tsc 通过;Tauri 下知识库文档可归档,目标工作区文件夹真实出现 .md,文件表刷新可见;同名不覆盖(时间戳后缀);web 下按钮隐藏</done>
</task>

</tasks>

<verification>
- `cd src-tauri && cargo test && cargo check`
- `npm run lint`
- 手动(tauri:dev):归档 .md 文件 → 提取 → 知识库可见且可搜索;知识库文档 → 归档 → 文件表出现新文件;web 模式两个入口隐藏
</verification>

<success_criteria>
- 双向通道在 Tauri 下端到端可用,web 隐藏,Rust 侧安全校验(白名单/大小/文件名)有单测覆盖
</success_criteria>

<output>
After completion, create `.planning/quick/260818-dyo-kb-archive-bridge/260818-dyo-SUMMARY.md`
</output>
