---
phase: quick-260819-evz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/fileTree.ts
  - src/lib/fileTree.test.ts
  - src/components/FileTree.tsx
  - src/views/AgentWorkspaceView.tsx
  - src/views/FileArchiveView.tsx
  - src-tauri/src/workspace_scan.rs
autonomous: true
requirements: [QUICK-EVZ-01]
must_haves:
  truths:
    - "Agent 页右栏 SegmentedControl 有第三个 tab「工作区文件」，显示当前工作区递归文件树"
    - "文件树文件夹可展开/折叠，文件按类型显示图标，文件夹先于文件、按名排序"
    - "扫描截断时显示「已截断」提示"
    - "文件归档页显示 localIndexedFiles 的文件树（保留现有列表）"
  artifacts:
    - path: "src/lib/fileTree.ts"
      provides: "buildFileTree 纯函数"
      exports: ["buildFileTree"]
    - path: "src/components/FileTree.tsx"
      provides: "递归文件树组件"
      min_lines: 40
  key_links:
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "workspaceStore.scanWorkspaceFiles"
      via: "tab 激活/工作区切换时触发"
      pattern: "scanWorkspaceFiles"
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "buildFileTree"
      via: "从 workspace.files 的 path 建树"
      pattern: "buildFileTree"
---

<objective>
Agent 页右栏新增「工作区文件」tab（递归文件树），文件归档页也显示文件树。Rust 扫描深度/数量上限放宽。
</objective>

<context>
@src/stores/workspaceStore.ts
@src/views/FileArchiveView.tsx
@src/views/AgentWorkspaceView.tsx
@src-tauri/src/workspace_scan.rs
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: buildFileTree 纯函数 + node:test 测试</name>
  <files>src/lib/fileTree.ts, src/lib/fileTree.test.ts</files>
  <behavior>
    - 空数组 → 空 children
    - 嵌套：['a/b/c.txt', 'a/d.txt', 'e.txt'] → 顶层 folder a（含 folder b 含 c.txt、file d.txt）+ file e.txt
    - 排序：同层 folder 在前、file 在后，各按 name localeCompare 排序
    - Windows 反斜杠路径（'D:\\ws\\docs\\PRD.docx'）与正斜杠都能解析（统一 replace(/\\/g,'/')）
    - 中间目录不存在文件的隐式 folder 自动创建
  </behavior>
  <action>
    导出类型 `FileTreeNode = { kind: 'folder'; name: string; children: FileTreeNode[] } | { kind: 'file'; name: string; path: string }`。
    `buildFileTree(paths: string[]): FileTreeNode[]`：split('/') 逐级插入 Map 嵌套结构，最后转数组并排序（folder 先、name 排序）。~40 行，无依赖。
    测试用 `node --import tsx --test` 兼容写法（对齐现有 npm test 脚本），放 `src/lib/fileTree.test.ts`。
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>测试覆盖嵌套/空/排序/反斜杠 case，全部通过</done>
</task>

<task type="auto">
  <name>Task 2: FileTree 递归组件</name>
  <files>src/components/FileTree.tsx</files>
  <action>
    `export function FileTree({ nodes, defaultExpandedDepth = 1 }: { nodes: FileTreeNode[]; defaultExpandedDepth?: number })`。
    内部维护 `expanded: Set<string>`（key = 路径前缀）；folder 行：CaretDown/CaretRight（旋转）、Folder duotone 图标、点击/Enter 切换，`role="button" tabIndex={0} onKeyDown`（参考 AgentWorkspaceView L167-176 列表行模式）。
    file 行：按扩展名映射 FileText/FileCode/FileXls/Image/File 图标（duotone，14px），name truncate。
    类名只用 token（text-text-primary/secondary、hover:bg-bg-secondary）。空树渲染 `text-text-tertiary` 占位文案（文案由调用方传或默认「暂无文件」）。
    folder 图标可带文件计数 Badge（可选，不强制）。motion 不必须——纯 CSS transition 即可。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>组件可递归渲染任意深度，键盘可操作 folder 展开折叠</done>
</task>

<task type="auto">
  <name>Task 3: 接入两个视图 + Rust 上限放宽</name>
  <files>src/views/AgentWorkspaceView.tsx, src/views/FileArchiveView.tsx, src-tauri/src/workspace_scan.rs</files>
  <action>
    AgentWorkspaceView：SegmentedControl segments 加 `{ id: 'files', label: '工作区文件' }`（activeTab state 类型放宽为 string）。tab==='files' 且 activeWorkspaceId 变化时 `scanWorkspaceFiles(activeWorkspaceId)`（useEffect + ref 防重入；web dev 无 Tauri 时 store no-op，直接用 mock workspace.files）。`useMemo(() => buildFileTree(activeWorkspace?.files?.map(f => f.path) ?? []), [...])` 渲染 `<FileTree>`；truncated 判定：Tauri 下 store 已吞掉 truncated，简化处理——文件数达到上限时（workspaceScan 后 files.length >= 1000）显示提示，或直接 files.length > 0 且无法得知 truncated 时不显示。ponytail 简化：不透传 truncated，仅当 Rust 返回截断时 console.warn 已有；UI 底部固定提示改为「文件较多时可能被截断」常驻小字——若 files.length >= 1000 则显示「已截断：仅显示前 1000 个文件」。
    FileArchiveView：在「本地文件」tab（localIndexedFiles 区域）顶部或 SegmentedControl 旁加一个 Card 渲染 `buildFileTree(localIndexedFiles.map(f => f.fullPath))` + `<FileTree defaultExpandedDepth={1}>`；现有列表/筛选不删。跨工作区 mock 路径顶级目录自然分组（buildFileTree 天然行为）。
    workspace_scan.rs：`MAX_DEPTH: 3 → 6`，`MAX_FILES: 500 → 1000`（用户明确要求递归）。
  </action>
  <verify>
    <automated>npm run lint && npm test && cd src-tauri && cargo check</automated>
  </verify>
  <done>两个页面显示文件树，Rust 编译通过</done>
</task>

</tasks>

<verification>
npm run lint + npm test 0 fail；cd src-tauri && cargo check 通过。
</verification>

<success_criteria>
Agent 页右栏三段 tab，第三个显示递归文件树；文件归档页文件树正常显示；嵌套/排序正确。
</success_criteria>
