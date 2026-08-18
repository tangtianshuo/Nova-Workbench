---
phase: quick-260818-swm-agent
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/views/AgentWorkspaceView.tsx]
autonomous: true
requirements: [QUICK-SWM-01]
must_haves:
  truths:
    - "右栏「Agent 工作区」网格渲染 workspaceStore 的真实 workspaces"
    - "点击「添加」打开 AddWorkspaceModal,创建后新工作区出现在网格中"
    - "workspaces 为空时显示居中空状态提示而非空网格"
  artifacts:
    - path: "src/views/AgentWorkspaceView.tsx"
      provides: "真实工作区网格 + 添加流程"
      contains: "useWorkspaceStore"
  key_links:
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "src/stores/workspaceStore.ts"
      via: "useWorkspaceStore((s) => s.workspaces)"
      pattern: "useWorkspaceStore"
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "src/components/AddWorkspaceModal.tsx"
      via: "条件渲染 modal"
      pattern: "AddWorkspaceModal"
---

<objective>
把 AgentWorkspaceView 右栏「Agent 工作区」网格从 mock agents 常量切换为 workspaceStore 真实数据,并让「添加」按钮打开既有的 AddWorkspaceModal。
Purpose: 消除硬编码假数据,复用完整添加工作区流程。
Output: 修改后的 src/views/AgentWorkspaceView.tsx。
</objective>

<context>
@./CLAUDE.md
@src/views/AgentWorkspaceView.tsx
@src/stores/workspaceStore.ts
@src/components/AddWorkspaceModal.tsx

<interfaces>
// src/stores/workspaceStore.ts
export interface Workspace {
  id: string;
  name: string;
  folderPath: string;
  projectId?: string;
  projectName?: string;
  files: WorkspaceFile[];
  summary?: string;
  createdAt: string;
}
export const useWorkspaceStore: UseBoundStore<...>; // workspaces: Workspace[]

// src/components/AddWorkspaceModal.tsx
interface AddWorkspaceModalProps {
  onClose: () => void;
  onSuccess: (workspace: Workspace) => void;
}
export function AddWorkspaceModal({ onClose, onSuccess }: AddWorkspaceModalProps): JSX.Element;
// 内部自处理 addWorkspace + Tauri 自动扫描,调用方只需关 modal。
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 接入真实 workspaces 与 AddWorkspaceModal</name>
  <files>src/views/AgentWorkspaceView.tsx</files>
  <action>
只改「Agent Workspace Grid」卡片(约 110-151 行)及顶部 imports,其余(左栏、最近任务卡、双栏布局、高度公式)不动:

1. 删除 mock `agents` 常量(26-34 行)。`recentTasks` 保留。
2. Imports: 移除不再使用的 `Lightning, Cube, FileText`(保留 `Folder, Plus` 等);新增 `import { AddWorkspaceModal } from '@/src/components/AddWorkspaceModal';` 和 `import { useWorkspaceStore } from '@/src/stores/workspaceStore';`。
3. 组件内: `const workspaces = useWorkspaceStore((s) => s.workspaces);` + `const [showAddWorkspace, setShowAddWorkspace] = useState(false);`(direct store 访问,项目 preferred pattern)。
4. 「添加」Button 加 `onClick={() => setShowAddWorkspace(true)}`。
5. 网格渲染 workspaces:
   - key 用 `ws.id`(不是 idx)
   - 图标统一 `<Folder size={16} weight="duotone" className="text-accent" />`,容器 `w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 bg-accent-subtle`
   - 名称 `text-sm font-medium text-text-primary truncate` 显示 `ws.name`;路径 `text-[11px] text-text-tertiary truncate mt-0.5 font-mono` 显示 `ws.folderPath`
   - 保留 CardHover p-3 结构、grid-cols-2 gap-2.5、motion 入场动画
6. 空状态: `workspaces.length === 0` 时显示 `<div className="text-center text-sm text-text-tertiary py-8">暂无工作区,点击「添加」创建</div>`,不渲染网格。
7. 卡片末尾(</Card> 后或视图根内)条件渲染:
   `{showAddWorkspace && <AddWorkspaceModal onClose={() => setShowAddWorkspace(false)} onSuccess={() => setShowAddWorkspace(false)} />}` — modal 内部已处理 addWorkspace + 扫描,onSuccess 只需关闭。
8. 不加卡片点击行为(原型也无,YAGNI)。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>网格显示 store 中的真实工作区(至少 INITIAL_WORKSPACES 的 WenXiBuddy),「添加」打开 AddWorkspaceModal,创建后新工作区出现在网格,空状态提示正确,tsc 通过。</done>
</task>

</tasks>

<verification>
npm run lint 通过;视觉确认:Agent 工作区卡片渲染 sqlite 持久化的工作区而非 7 个硬编码条目。
</verification>

<success_criteria>
- mock agents 常量已删除
- workspaces 网格 + 空状态 + AddWorkspaceModal 接线完成
- 仅 src/views/AgentWorkspaceView.tsx 一个文件变更
</success_criteria>

<output>
完成后创建 `.planning/quick/260818-swm-agent/260818-swm-SUMMARY.md`
</output>
