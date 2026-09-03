---
phase: quick-260903-exg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ui/Toast.tsx
  - src/ai/pendingCount.ts
  - src/ai/pendingCount.test.ts
  - src/components/ConfirmationToastWatcher.tsx
  - src/App.tsx
  - src/components/layout/Sidebar.tsx
autonomous: true
requirements: [QUICK-EXG-01]
must_haves:
  truths:
    - "确认候选到达(0→N)时前台弹一次 Toast,点「去确认」跳转 Agent 工作区"
    - "已有 N 张待卡再到达新卡(N→N+N)不重复弹 Toast"
    - "待卡清空后再到达(N→0→N)重新弹"
    - "Sidebar「Agent 工作区」入口有待卡时显示数字红点,清空即消"
    - "D-05 不破:卡片仍只在 Agent Console 全局队列渲染,提醒仅引导跳转"
  artifacts:
    - path: "src/ai/pendingCount.ts"
      provides: "统一 pending 计数 selector + 0→N 转变纯函数"
      exports: ["selectPendingCount", "shouldToastOnTransition"]
    - path: "src/components/ConfirmationToastWatcher.tsx"
      provides: "MainLayout 挂载的 watcher,订阅计数发 toast"
    - path: "src/components/ConfirmationToastWatcher.test.ts 或 src/ai/pendingCount.test.ts"
      provides: "转变检测 node:test 用例"
  key_links:
    - from: "src/components/ConfirmationToastWatcher.tsx"
      to: "useChatConsoleStore + useTabRunStore"
      via: "zustand subscribe / selector"
      pattern: "useChatConsoleStore|useTabRunStore"
    - from: "ConfirmationToastWatcher toast action"
      to: "uiStore.setActiveTab('agent')"
      via: "toast action onClick"
      pattern: "setActiveTab\\('agent'\\)"
    - from: "src/components/layout/Sidebar.tsx"
      to: "selectPendingCount"
      via: "useSyncExternalStore 或组件内订阅"
      pattern: "selectPendingCount"
---

<objective>
前台确认提醒:候选到达(0→N)Toast 一次带「去确认」跳转 + Sidebar agent 入口数字红点。
Purpose: HITL 卡唯一渲染入口在 Agent Console(D-05),但前台零提醒导致用户漏卡。
Output: watcher 组件 + 统一计数 selector + Toast action 扩展 + Sidebar badge。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/stores/chatConsoleStore.ts   (七 pending 字段, L283-291;已有 bindToast 桥但无 action 支持,不用它)
@src/stores/tabRunStore.ts        (pendingDeliverables: TabDeliverableCandidate[])
@src/components/ui/Toast.tsx      (ToastProvider 挂 App 层;当前无 action 支持)
@src/components/layout/Sidebar.tsx (SidebarItem,L168 已有 isNew badge 先例)
@src/stores/uiStore.ts            (setActiveTab / activeTab)

<interfaces>
From src/components/ui/Toast.tsx:
```typescript
interface Toast {
  id: string; type: ToastType; title: string;
  description?: string; duration?: number;
}
// useToast() → { toast: (t: Omit<Toast,'id'>) => void, dismiss }
```

From src/stores/chatConsoleStore.ts (state fields, all `X | null`):
pendingConfirmation / pendingDestructiveAction / pendingExecApproval / pendingFsWrite / pendingPmWrite / pendingMemory / pendingPrdDraft

From src/stores/tabRunStore.ts:
pendingDeliverables: TabDeliverableCandidate[]

From src/stores/uiStore.ts:
setActiveTab(tab: string) — agent tab id = 'agent'
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Toast action 扩展 + 统一 pending 计数 selector + 转变纯函数(含测试)</name>
  <files>src/components/ui/Toast.tsx, src/ai/pendingCount.ts, src/ai/pendingCount.test.ts</files>
  <behavior>
    - shouldToastOnTransition(prev=0, next=0) → false
    - shouldToastOnTransition(prev=0, next=1) → true   (首卡到达,弹)
    - shouldToastOnTransition(prev=1, next=2) → false  (已有卡再加,不弹)
    - shouldToastOnTransition(prev=2, next=0) → false  (清空,不弹)
    - shouldToastOnTransition(prev=0, next=1, prevSeen=true 初始挂载已有卡) → false(挂载快照不算新到达;实现:watcher 首次同步不发)
    - selectPendingCount(state7字段, pendingDeliverables) 求和正确
  </behavior>
  <action>
    1. Toast.tsx 最小扩展:Toast interface 加 `action?: { label: string; onClick: () => void }`;ToastContainer 卡片内 description 下方渲染小按钮(`text-xs text-accent font-medium hover:underline cursor-pointer`),点击先 dismiss(t.id) 再 action.onClick()。不改现有样式结构,不引新依赖。
    2. 新建 src/ai/pendingCount.ts:
       - `export function selectPendingCount(consoleState: {...7 nullable fields}, pendingDeliverables: unknown[]): number` — 7 个字段各算 1(非 null),pendingDeliverables 算 length。
       - `export function shouldToastOnTransition(prev: number, next: number): boolean` — `prev === 0 && next > 0`。
    3. src/ai/pendingCount.test.ts:node:test + assert 覆盖上述 behavior。先写测试跑红,再实现跑绿(RED→GREEN)。
    ponytail 注:watcher 挂载快照处理放 Task 2 组件内(ref 标记首次同步),不塞进纯函数签名。
  </action>
  <verify>
    <automated>node --test src/ai/pendingCount.test.ts && npm run lint</automated>
  </verify>
  <done>测试全绿;Toast 支持 action 按钮;selector + 转变函数导出可用</done>
</task>

<task type="auto">
  <name>Task 2: Watcher 组件挂 App + Sidebar agent 红点</name>
  <files>src/components/ConfirmationToastWatcher.tsx, src/App.tsx, src/components/layout/Sidebar.tsx</files>
  <action>
    1. 新建 src/components/ConfirmationToastWatcher.tsx:渲染返回 null。用 zustand `useChatConsoleStore.subscribe` + `useTabRunStore.subscribe` 各自维护快照计数,合并后比较:首次同步(挂载时已有卡)只记不弹;之后 shouldToastOnTransition(prev, next) 为 true 时调 useToast().toast({ type: 'warning', title: '待确认操作', description: 'Agent 有操作等待你的确认', duration: 6000, action: { label: '去确认', onClick: () => useUIStore.getState().setActiveTab('agent') } })。组件在 useEffect 中挂/卸订阅。注意 StrictMode 双挂载:订阅在 effect 内自然配对清理,无泄漏;挂载快照 ref 在双挂载下重置无害(第二挂载同样只记不弹)。
    2. App.tsx:在 ToastProvider 内(与 MainLayout 同层)渲染 `<ConfirmationToastWatcher />`,不破坏现有结构。
    3. Sidebar.tsx:新增小组件 `AgentPendingBadge`(或直接在 Sidebar 内):`useSyncExternalStore` 或 useState+subscribe 订阅同两 store,用 selectPendingCount 求值;计数 > 0 时在 SidebarItem(agent 项)label 右侧渲染数字 badge,复用 isNew badge 的样式先例(`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent text-white`,数字用 accent 底白字以区别于「新」)。不改 MENU_ITEMS 静态数组结构 — badge 由 Sidebar 内部订阅渲染,仅对 id === 'agent' 的 item 生效(实现方式:SidebarItem 加可选 `badge?: number` prop,Sidebar 在 map 时对 agent 项传入;rnd-center 的独立 SidebarItem 不动)。
    设计令牌:全部语义类(bg-accent/text-accent/text-white),无硬编码色;不碰 AppContext。
  </action>
  <verify>
    <automated>npm run lint && node --test src/ai/pendingCount.test.ts</automated>
  </verify>
  <done>typecheck 绿;watcher 挂载;Sidebar agent 项有 badge 渲染路径;跳转仅 setActiveTab('agent'),卡片渲染仍唯一在 Agent Console(D-05 不破)</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>确认候选前台提醒:0→N Toast(可点「去确认」跳 Agent 工作区)+ Sidebar 数字红点</what-built>
  <how-to-verify>
    1. `npm run dev` 打开应用,进入 Agent 工作区发起一个会触发确认卡的 run(如知识写入/删除类工具)
    2. 切走 tab(留在前台)→ 候选到达时应弹 warning Toast「待确认操作」
    3. 点 Toast 上「去确认」→ 应回到 Agent 工作区且确认卡在
    4. 不点跳转,再触发第二张卡 → 不应再弹 Toast(N→N 不弹)
    5. 处理完全部卡 → Sidebar「Agent 工作区」红点消失
    6. 再触发新卡 → Toast 重新弹一次
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- npm run lint 绿;node --test src/ai/pendingCount.test.ts 绿
- D-05 不破:确认卡渲染路径零改动(仅新增提醒/跳转)
- 不引新依赖;设计令牌语义类;AppContext 未触碰
</verification>

<success_criteria>
Toast 在 0→N 弹一次且可跳转;N→N 静默;N→0→N 重弹;Sidebar badge 与计数同步;全部自动化检查绿
</success_criteria>

<output>
After completion, create `.planning/quick/260903-exg-toast/260903-exg-SUMMARY.md`
</output>
