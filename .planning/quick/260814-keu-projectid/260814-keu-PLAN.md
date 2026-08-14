---
phase: quick
plan: 260814-keu-projectid
type: execute
wave: 1
depends_on: []
files_modified:
  - src/stores/workspaceStore.ts
  - src/store/AppContext.tsx
autonomous: true
requirements: [QUICK-KEU-01]

must_haves:
  truths:
    - "删除产品后，所有 workspace 的 projectId/projectName 不再指向已删除产品"
    - "FileArchiveView / WorkspaceSummaryModal 按名称回退查找仍能工作（无悬空引用）"
  artifacts:
    - path: "src/stores/workspaceStore.ts"
      provides: "unlinkProjectWorkspaces action"
      contains: "unlinkProjectWorkspaces"
    - path: "src/store/AppContext.tsx"
      provides: "删除产品时调用 workspace 清理"
      contains: "unlinkProjectWorkspaces"
  key_links:
    - from: "src/store/AppContext.tsx"
      to: "src/stores/workspaceStore.ts"
      via: "doDeleteProduct 内 useWorkspaceStore.getState().unlinkProjectWorkspaces(productId)"
      pattern: "unlinkProjectWorkspaces\\(productId\\)"
---

<objective>
修复删除产品时 workspace.projectId 悬空引用。与既有 `unlinkProjectTasks`（CROSS-03）同构：在 workspaceStore 加 unlink action，并在 AppContext 的 doDeleteProduct 级联清理中调用。

Purpose: 删除产品后 FileArchiveView.tsx:78 / WorkspaceSummaryModal.tsx:23 用 `projectId || projectName` 查产品不再得到 undefined 悬空。
Output: 最小 diff（两个文件，各 ~5 行）。
</objective>

<context>
@src/stores/workspaceStore.ts
@src/store/AppContext.tsx

<interfaces>
From src/stores/taskStore.ts:170-178（参照模式，CROSS-03 引入）:
```typescript
unlinkProjectTasks: (projectId: string) => void;
// 实现：map 遍历，匹配 projectId 的 task 清除链接字段
```

From src/stores/workspaceStore.ts（已有，直接复用结构）:
```typescript
interface Workspace {
  id: string;
  projectId?: string;   // 悬空字段
  projectName?: string; // 镜像字段，一并清除
  // ...
}
export const useWorkspaceStore = create<WorkspaceState>()(persist((set) => ({ ... })))
```

From src/store/AppContext.tsx doDeleteProduct（~389-405）:
现有顺序：1. unlinkProjectTasks → 2. 逐个 updateEvent 清 projectId → 3. rndStore.cleanupProduct → 4. deleteProduct → 5. 清 selection。
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 添加 unlinkProjectWorkspaces 并接入产品删除级联</name>
  <files>src/stores/workspaceStore.ts, src/store/AppContext.tsx</files>
  <action>
1. `src/stores/workspaceStore.ts`：
   - `WorkspaceState` 接口加 `unlinkProjectWorkspaces: (projectId: string) => void;`
   - 实现放在 `deleteWorkspace` 之后，与 taskStore 的 `unlinkProjectTasks` 同构：
     ```typescript
     unlinkProjectWorkspaces: (projectId) =>
       set((state) => ({
         workspaces: state.workspaces.map((w) =>
           w.projectId === projectId
             ? { ...w, projectId: undefined, projectName: undefined }
             : w
         ),
       })),
     ```
     注意：`updateWorkspace` 逐个调用会多次 set，此处一次性 map 更符合既有 unlink 模式。
2. `src/store/AppContext.tsx` 的 `doDeleteProduct`：在步骤 2（日程清理）与步骤 3（rnd cleanup）之间插入：
   ```typescript
   // 2.5 Detach all workspaces from this product (dangling projectId fix)
   useWorkspaceStore.getState().unlinkProjectWorkspaces(productId);
   ```
   确认 AppContext 已导入 `useWorkspaceStore`（workspaces 已在 context 中暴露，应已有导入；若无则补 import）。

不做的事（YAGNI）：
- 不改 `getDeleteProductImpact` 的确认弹窗计数（弹窗只展示 task/event/rnd 数量，workspace 静默解链与任务解链行为一致）
- 不动 Task.project 镜像字段或 ScheduleEvent 其他字段（已有处理或另案）
</action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>tsc 通过；删除产品后无 workspace 残留该 productId（可在 dev 中手动验证：删除 WenXiBuddy 产品，FileArchiveView 工作区卡片不再显示关联产品徽标/不报 undefined）</done>
</task>

</tasks>

<verification>
- `npm run lint`（tsc --noEmit）通过
- grep 确认 `unlinkProjectWorkspaces` 在 workspaceStore 定义且在 AppContext.doDeleteProduct 中被调用
</verification>

<success_criteria>
- 删除任意产品后，`useWorkspaceStore.getState().workspaces` 中不存在 `projectId === 被删产品id` 的条目
- 最小 diff：仅两个文件，无新依赖、无新抽象
</success_criteria>

<output>
完成后总结修改内容（quick 任务无需 SUMMARY 文件）
</output>
