---
phase: 9-ai
plan: 05
type: execute
wave: 5
depends_on: [9-04]
files_modified:
  - src/components/ChatPanel.tsx
  - src/components/Header.tsx
  - src/components/layout/Sidebar.tsx
  - src/stores/uiStore.ts
autonomous: true
requirements: [AI-03, AI-06]

must_haves:
  truths:
    - "src/components/ChatPanel.tsx 是 slide-out panel (width=480),复用 Phase 5 Drawer 组件,支持多轮对话"
    - "Header 或 Sidebar 上的 AI 按钮点击触发 ChatPanel open (uiStore.isChatPanelOpen)"
    - "ChatPanel 支持多轮对话:维护 messages 数组,每次 submit 追加 user message,runToolLoop 完成后追加 assistant message"
    - "ChatPanel 复用 runToolLoop + buildCoreContext (Plan 04 实现)"
    - "uiStore 加 isChatPanelOpen: boolean + setChatPanelOpen"
    - "ChatPanel 内部显示对话历史 + tool trace + 流式 response + 错误 toast"
  artifacts:
    - path: "src/components/ChatPanel.tsx"
      provides: "Slide-out chat panel (480px),多轮对话"
      contains: "ChatPanel"
  key_links:
    - from: "src/components/ChatPanel.tsx"
      to: "src/ai toolLoop.ts runToolLoop"
      via: "每次 submit 调用 runToolLoop,传入当前 userMessage"
      pattern: "runToolLoop"
    - from: "src/components/ChatPanel.tsx"
      to: "src/components/ui/Drawer.tsx"
      via: "复用 DrawerContent (width=480) 做 slide-out"
      pattern: "DrawerContent.*width=\\{480\\}"
    - from: "src/components/layout/Sidebar.tsx"
      to: "src/stores/uiStore setChatPanelOpen"
      via: "AI 按钮触发 setChatPanelOpen(true)"
      pattern: "setChatPanelOpen"
---

<objective>
Slide-out chat panel UI (复用 Phase 5 Drawer, width=480),支持多轮对话。这是 D-16 的 primary 交互形式 (D-17 业界标准:Cursor/Claude Desktop/Notion AI/Linear 都用这个模式)。

Purpose: PM 工作流是边看任务看板边问 AI,slide-out 不中断上下文 (D-17 rationale)。CmdKPalette 是 quick action,ChatPanel 是长对话专用。
Output: ChatPanel.tsx + Sidebar/Header 入口按钮 + uiStore 状态
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/9-ai/9-CONTEXT.md
@.planning/phases/9-ai/9-04-PLAN.md

@src/components/ui/Drawer.tsx
@src/components/ui/Button.tsx
@src/components/ui/Input.tsx
@src/components/ui/Toast.tsx
@src/stores/uiStore.ts
@src/components/layout/Sidebar.tsx
@src/components/layout/Header.tsx
@src/ai/toolLoop.ts
@src/ai/context.ts

<interfaces>
<!-- Phase 5 Drawer (复用,width 改 480) -->
```typescript
// src/components/ui/Drawer.tsx
export const Drawer = DialogPrimitive.Root;
export function DrawerContent({ className, children, width = 360, ...props });  // width prop
export function DrawerHeader({ title, description, children });
export function DrawerBody({ className, ...props });
export function DrawerFooter({ className, ...props });
```

<!-- Plan 04 runToolLoop + ToolLoopCallbacks -->
```typescript
runToolLoop({
  userMessage, provider, systemPromptOverride?, signal?,
  callbacks?: { onToken?, onToolStart?, onToolEnd? }
}): Promise<{ content, iterations, toolCallsExecuted, truncated }>
```

<!-- uiStore (Plan 04 已加 isCmdKOpen,Plan 05 加 isChatPanelOpen) -->
```typescript
isCmdKOpen: boolean;
setCmdKOpen(open: boolean): void;
// Plan 05 add:
isChatPanelOpen: boolean;
setChatPanelOpen(open: boolean): void;
```
</interfaces>

<risks>
- **Drawer width override:** Phase 5 Drawer 默认 360,Plan 05 用 480。Drawer 已支持 `width` prop (Drawer.tsx L13),直接传 `width={480}` 即可,无需修改 Drawer 组件本身。
- **Multi-turn message history:** runToolLoop 接受 single userMessage;多轮对话需要 ChatPanel 自己维护 messages 数组,但当前 runToolLoop 每次重建 messages (L60 `messages = [{user}]`)。Ponytail 决策:**Plan 05 不修改 runToolLoop**,而是 ChatPanel 把对话历史拼成单个 user message (e.g. "之前我们讨论了 X。现在的问题:Y")。简化版,Phase 10 再升级到 runToolLoop 支持 history 参数。
- **Streaming jitter:** 流式渲染可能让 scroll 跳动。auto-scroll to bottom 用 useEffect on response length。
</risks>
</context>

<tasks>

<task type="auto">
  <name>Task 1: ChatPanel slide-out 组件 (480px,多轮对话,复用 Drawer)</name>
  <files>src/components/ChatPanel.tsx, src/stores/uiStore.ts</files>
  <read_first>
    - src/components/ui/Drawer.tsx (复用,width prop 已支持)
    - src/stores/uiStore.ts (Plan 04 完成,加 isChatPanelOpen)
    - src/ai/toolLoop.ts (Plan 04 完成,runToolLoop)
    - src/ai/index.ts (export runToolLoop)
    - .planning/phases/9-ai/9-CONTEXT.md D-16/D-17 (slide-out primary 形态)
  </read_first>
  <behavior>
    - uiStore 加 isChatPanelOpen + setChatPanelOpen
    - ChatPanel 用 <Drawer open={isChatPanelOpen} onOpenChange={setChatPanelOpen}>
    - <DrawerContent width={480}> 内含:DrawerHeader (title: "AI 助手") + DrawerBody (对话历史 + tool trace + response) + DrawerFooter (Input + Send button)
    - 维护 state:messages: { role: 'user'|'assistant', content, toolTrace? }[]
    - submit:runToolLoop({ userMessage: input, provider, callbacks: { onToken, onToolStart, onToolEnd } }) → 把 response push 到 messages
    - 多轮对话历史:每次 submit 把前面 N-1 轮的 assistant summary 拼到 user message (Risks 说明,简化版)
    - 流式 response 单独显示在 "正在回复" 区域,完成后 push 到 messages
    - auto-scroll to bottom
    - Provider:暂时硬编码 'deepseek' (Plan 06 改成 uiStore.activeAIProvider)
  </behavior>
  <action>
1. 编辑 `src/stores/uiStore.ts`:
   - 加 `isChatPanelOpen: boolean;` + `setChatPanelOpen: (open: boolean) => void;`
   - 默认值 `isChatPanelOpen: false`
   - 实现 setChatPanelOpen

2. 创建 `src/components/ChatPanel.tsx`:
   ```typescript
   import { useState, useRef, useEffect } from 'react';
   import { Sparkle, PaperPlaneTilt, Check, Warning, Hourglass } from '@phosphor-icons/react';
   import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter } from '@/src/components/ui/Drawer';
   import { Button } from '@/src/components/ui/Button';
   import { useUIStore } from '@/src/stores/uiStore';
   import { runToolLoop } from '@/src/ai';
   import { useToast } from '@/src/components/ui/Toast';
   import { cn } from '@/src/lib/utils';

   interface ChatMessage {
     role: 'user' | 'assistant';
     content: string;
     toolTrace?: { name: string; status: 'running' | 'ok' | 'error' }[];
   }

   export function ChatPanel() {
     const isOpen = useUIStore((s) => s.isChatPanelOpen);
     const setOpen = useUIStore((s) => s.setChatPanelOpen);
     const [messages, setMessages] = useState<ChatMessage[]>([]);
     const [input, setInput] = useState('');
     const [streamingResponse, setStreamingResponse] = useState('');
     const [streamingTrace, setStreamingTrace] = useState<{ name: string; status: 'running' | 'ok' | 'error' }[]>([]);
     const [loading, setLoading] = useState(false);
     const bodyRef = useRef<HTMLDivElement>(null);
     const { toast } = useToast();

     // auto-scroll to bottom on new content
     useEffect(() => {
       bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
     }, [messages, streamingResponse, streamingTrace]);

     const handleSubmit = async () => {
       const trimmed = input.trim();
       if (!trimmed || loading) return;
       setInput('');
       setLoading(true);
       setStreamingResponse('');
       setStreamingTrace([]);

       // Ponytail: multi-turn history simplified — prepend prior context as text (Risks note)
       const historyPrefix = messages.length > 0
         ? `之前的对话:\\n${messages.map((m) => (${m.role}: ${m.content.slice(0, 200)}`)).join('\\n')}\\n\\n现在的问题: `
         : '';
       const userMessage = historyPrefix + trimmed;

       setMessages((m) => [...m, { role: 'user', content: trimmed }]);

       try {
         const result = await runToolLoop({
           userMessage,
           provider: 'deepseek',   // Plan 06 改成 uiStore.activeAIProvider
           callbacks: {
             onToken: (t) => setStreamingResponse((r) => r + t),
             onToolStart: (name) => setStreamingTrace((t) => [...t, { name, status: 'running' }]),
             onToolEnd: (name, _r, error) =>
               setStreamingTrace((t) => t.map((x) => x.name === name ? { ...x, status: error ? 'error' : 'ok' } : x)),
           },
         });
         setMessages((m) => [...m, {
           role: 'assistant',
           content: result.content || '(no response)',
           toolTrace: streamingTrace.length > 0 ? streamingTrace : undefined,
         }]);
         if (result.truncated) {
           toast({ type: 'warning', title: 'Tool loop 达到 5 次上限' });
         }
       } catch (e) {
         toast({ type: 'error', title: 'AI 调用失败', description: (e as Error).message });
       } finally {
         setLoading(false);
         setStreamingResponse('');
         setStreamingTrace([]);
       }
     };

     return (
       <Drawer open={isOpen} onOpenChange={setOpen}>
         <DrawerContent width={480} className="bg-bg-primary">
           <DrawerHeader title="AI 助手" description="问任何 PM 工作相关的问题" />
           <DrawerBody ref={bodyRef} className="space-y-4">
             {messages.length === 0 && !streamingResponse && (
               <div className="text-center text-text-tertiary py-12">
                 <Sparkle size={32} weight="duotone" className="mx-auto mb-3 opacity-50" />
                 <p className="text-sm">问我能帮你做什么</p>
                 <p className="text-xs mt-1">例如:"创建一个高优任务,明天截止"</p>
               </div>
             )}
             {messages.map((m, i) => (
               <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                 <div className={cn(
                   'rounded-[var(--radius-lg)] px-4 py-2 max-w-[85%]',
                   m.role === 'user' ? 'bg-accent text-white' : 'bg-bg-secondary text-text-primary'
                 )}>
                   {m.toolTrace && m.toolTrace.length > 0 && (
                     <div className="flex flex-wrap gap-1 mb-2 text-xs">
                       {m.toolTrace.map((t, j) => (
                         <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-overlay">
                           {t.status === 'ok' && <Check size={10} weight="bold" />}
                           {t.status === 'error' && <Warning size={10} weight="bold" />}
                           {t.status === 'running' && <Hourglass size={10} />}
                           {t.name}
                         </span>
                       ))}
                     </div>
                   )}
                   <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                 </div>
               </div>
             ))}
             {/* Streaming response */}
             {(streamingResponse || streamingTrace.length > 0) && (
               <div className="flex justify-start">
                 <div className="rounded-[var(--radius-lg)] px-4 py-2 max-w-[85%] bg-bg-secondary">
                   {streamingTrace.length > 0 && (
                     <div className="flex flex-wrap gap-1 mb-2 text-xs">
                       {streamingTrace.map((t, j) => (
                         <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-overlay">
                           {t.status === 'running' && <Hourglass size={10} className="animate-pulse" />}
                           {t.status === 'ok' && <Check size={10} weight="bold" />}
                           {t.status === 'error' && <Warning size={10} weight="bold" />}
                           {t.name}
                         </span>
                       ))}
                     </div>
                   )}
                   <div className="text-sm whitespace-pre-wrap">
                     {streamingResponse || 'AI 思考中...'}
                   </div>
                 </div>
               </div>
             )}
           </DrawerBody>
           <DrawerFooter className="flex-row items-center gap-2">
             <input
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
               placeholder="问 AI..."
               disabled={loading}
               className="flex-1 px-3 py-2 text-sm bg-bg-secondary border border-border-subtle rounded-[var(--radius-md)] outline-none focus:border-accent text-text-primary"
             />
             <Button variant="primary" size="sm" onClick={handleSubmit} disabled={loading || !input.trim()}>
               <PaperPlaneTilt size={14} weight="bold" />
               发送
             </Button>
           </DrawerFooter>
         </DrawerContent>
       </Drawer>
     );
   }
   ```
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    ChatPanel 组件就绪,复用 Drawer (width=480),多轮对话 + 流式 + tool trace + auto-scroll。uiStore 加 isChatPanelOpen。下一步 Task 2 加入口按钮 + App 挂载。
  </done>
</task>

<task type="auto">
  <name>Task 2: Sidebar 加 AI 按钮 + App.tsx 挂载 ChatPanel</name>
  <files>src/components/layout/Sidebar.tsx, src/App.tsx</files>
  <read_first>
    - src/components/layout/Sidebar.tsx (现有结构,找合适位置加 AI 按钮)
    - src/App.tsx (现有 React tree + CmdKPalette 挂载位置)
    - src/components/ChatPanel.tsx (Task 1 完成)
  </read_first>
  <behavior>
    - Sidebar 底部或顶部加 AI 按钮 (Sparkle icon),onClick 调用 uiStore.setChatPanelOpen(true)
    - App.tsx 顶层挂载 <ChatPanel /> (与 CmdKPalette 同级)
    - 按钮位置选择:Sidebar 顶部 logo 下方 (固定位置,不随 activeTab 切换)
  </behavior>
  <action>
1. 编辑 `src/components/layout/Sidebar.tsx`:
   - 顶部加 `import { useUIStore } from '@/src/stores/uiStore';` 和 `import { Sparkle } from '@phosphor-icons/react';`
   - 在 Sidebar nav items 上方加 AI 按钮:
     ```tsx
     <button
       onClick={() => useUIStore.getState().setChatPanelOpen(true)}
       className="w-full flex items-center gap-2.5 px-3 py-2 mb-3 rounded-[var(--radius-md)] bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium"
     >
       <Sparkle size={16} weight="duotone" />
       AI 助手
       <span className="ml-auto text-[10px] text-text-tertiary font-mono">⌘K</span>
     </button>
     ```
   - 注:也可以用 useUIStore hook 而非 getState(),Ponytail:在 functional component 里用 hook 更 idiomatic

2. 编辑 `src/App.tsx`:
   - import { ChatPanel } from '@/src/components/ChatPanel';
   - 在 React tree 顶层 (与 CmdKPalette 同级,MainLayout 内部或外部) 挂载 <ChatPanel />
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    Sidebar 顶部 AI 按钮可触发 ChatPanel open,App.tsx 顶层挂载 ChatPanel。用户在任意 tab 都能点击 AI 按钮唤出 slide-out。
  </done>
</task>

</tasks>

<verification>
- `npm run lint` 通过
- grep 验证: src/components/ChatPanel.tsx 包含 `DrawerContent width={480}` + `runToolLoop` + `useUIStore`
- grep 验证: src/stores/uiStore.ts 包含 `isChatPanelOpen` + `setChatPanelOpen`
- grep 验证: src/components/layout/Sidebar.tsx 包含 `setChatPanelOpen`
- grep 验证: src/App.tsx 包含 `<ChatPanel`
</verification>

<success_criteria>
1. Slide-out chat panel 从右侧滑出,480px 宽 (复用 Phase 5 Drawer) (D-16/D-17) (AI-03 ✓)
2. 多轮对话支持 (messages state,auto-scroll) (AI-03 ✓)
3. 复用 runToolLoop + buildCoreContext (Plan 04 实现) (AI-06 ✓)
4. Sidebar 入口按钮,所有页面可触发 (D-17 slide-out primary 交互)
5. Core context injection 在 runToolLoop 内部自动调用 (AI-06 ✓)
</success_criteria>

<output>
After completion, create `.planning/phases/9-ai/9-05-SUMMARY.md`
</output>
