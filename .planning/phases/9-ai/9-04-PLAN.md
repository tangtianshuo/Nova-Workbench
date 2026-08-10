---
phase: 9-ai
plan: 04
type: execute
wave: 4
depends_on: [9-03]
files_modified:
  - src/ai/toolLoop.ts
  - src/ai/context.ts
  - src/components/CmdKPalette.tsx
  - src/hooks/useCmdK.ts
  - src/App.tsx
autonomous: true
requirements: [AI-01, AI-02, AI-06]

must_haves:
  truths:
    - "src/ai/toolLoop.ts 暴露 runToolLoop(userMessage, opts) 函数:发送 userMessage 到 chatWithTools → 收到 tool_calls → 在 JS 执行 → 把 tool_result 拼到 messages → 再次 chat,直到 LLM 不再要 tool"
    - "src/ai/context.ts 暴露 buildCoreContext():拼接 selected product + active tasks top 10 + upcoming events top 5 成 Markdown,~500-1000 tokens (D-09/D-10)"
    - "CmdKPalette 组件 (CmdKPalette.tsx) 实现 Raycast-style 命令菜单 + AI 对话双模式 (D-18)"
    - "useCmdK hook 注册全局 ⌘K 快捷键 (Cmd+K on macOS, Ctrl+K on Windows/Linux),通过 uiStore 控制 palette open 状态"
    - "App.tsx 挂载 <CmdKPalette /> 在 React tree 顶层,所有页面都可触发"
    - "Tool loop 错误处理:ToolArgError 触发 1 次自动重试 (D-09 错误处理 + AI-09),把 Zod issue 反馈给 LLM 让其修正"
  artifacts:
    - path: "src/ai/toolLoop.ts"
      provides: "runToolLoop 协调器:LLM ↔ tools ↔ messages,~80 LOC"
      contains: "export async function runToolLoop"
    - path: "src/ai/context.ts"
      provides: "buildCoreContext() 返回 Markdown string (~500-1000 tokens)"
      contains: "export function buildCoreContext"
    - path: "src/components/CmdKPalette.tsx"
      provides: "⌘K Raycast-style 命令菜单 + AI 对话双模式"
      contains: "CmdKPalette"
    - path: "src/hooks/useCmdK.ts"
      provides: "全局 ⌘K 快捷键 + open state via uiStore"
      contains: "useCmdK"
  key_links:
    - from: "src/ai/toolLoop.ts"
      to: "src/lib/api.ts chatWithTools"
      via: "tool loop 调用 chatWithTools(toolsToSchemas(), messages)"
      pattern: "chatWithTools"
    - from: "src/ai/toolLoop.ts"
      to: "src/ai/registry.ts executeTool"
      via: "tool loop 收到 tool_call 后执行 executeTool"
      pattern: "executeTool"
    - from: "src/components/CmdKPalette.tsx"
      to: "src/ai/toolLoop.ts runToolLoop"
      via: "AI 对话模式提交时调用 runToolLoop"
      pattern: "runToolLoop"
    - from: "src/App.tsx"
      to: "src/components/CmdKPalette.tsx"
      via: "顶层挂载 CmdKPalette"
      pattern: "CmdKPalette"
---

<objective>
实现 tool loop (~80 LOC,LLM ↔ tools ↔ messages 协调器) + core context injection + ⌘K Raycast-style palette UI。Tool loop 是 Phase 9 的 brain (D-01 + D-02),CmdKPalette 是用户主入口 (D-16/D-17/D-18)。

Purpose: Plan 03 提供了 tools,Plan 04 把它们和 LLM 接成 loop。⌘K palette 同时支持快速命令 (一键触发 tool) 和自然语言对话 (走 tool loop)。
Output: toolLoop.ts + context.ts + CmdKPalette.tsx + useCmdK hook + App.tsx 挂载
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/9-ai/9-CONTEXT.md
@.planning/phases/9-ai/9-02-PLAN.md
@.planning/phases/9-ai/9-03-PLAN.md

@src/lib/api.ts
@src/stores/uiStore.ts
@src/stores/productStore.ts
@src/stores/taskStore.ts
@src/stores/scheduleStore.ts
@src/App.tsx
@src/components/ui/Input.tsx
@src/components/ui/Dialog.tsx

<interfaces>
<!-- Plan 02 chatWithTools signature -->
```typescript
chatWithTools(args: {
  messages: ChatMessage[];
  tools: Record<string, unknown>[];
  systemPrompt: string;
  provider: Provider;
  onToken?: (text: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  signal?: AbortSignal;
}): Promise<{ content: string; toolCalls: { name: string; args: unknown }[] }>
```

<!-- Plan 03 registry exports -->
```typescript
export const toolRegistry: Map<string, RegisteredTool>;
export function toolsToSchemas(names?: string[]): Record<string, unknown>[];
export async function executeTool(name: string, args: unknown): Promise<unknown>;
export class ToolArgError extends Error { toolName, zodIssues }
export function listToolNames(): string[];
```

<!-- 现有 uiStore (供 useCmdK 控制 palette open state) -->
```typescript
// src/stores/uiStore.ts 已有 activeTab/selectedProductId/theme/modalFlags 等
// Plan 04 加: isCmdKOpen: boolean + setCmdKOpen
```

<!-- 现有 useProductStore (buildCoreContext 读 selectedProductId) -->
```typescript
products: Product[];
// useProductStore.getState().products.find(p => p.id === selectedProductId)
```
</interfaces>

<risks>
- **Tool loop termination:** LLM 可能无限要求 tool call。Ponytail:加 maxIterations (默认 5) 硬上限,超过就强制返回当前 content 给用户。
- **ToolArgError retry 1 次:** D-09 说"参数错误 AI 自动修正(最多 1 次重试)"。Ponytail:计数 per-tool-name,某 tool 在一次 loop 中 ToolArgError 超过 1 次 → 把错误反馈给 LLM 让其放弃这个 tool 或换个 tool。
- **⌘K vs browser default:** Cmd+K 在浏览器有 default (聚焦搜索栏)。preventDefault + stopPropagation 必须。
- **Streaming during tool loop:** token 流到 UI 时,如果 tool_call 中断,UI 应该显示 "[执行 tool: xxx]..." 占位。Plan 04 实现 onToken 流,但 tool_call 之间的 "thinking" 阶段简化为 spinner。
</risks>
</context>

<tasks>

<task type="auto">
  <name>Task 1: src/ai/toolLoop.ts (runToolLoop 协调器) + src/ai/context.ts (buildCoreContext)</name>
  <files>src/ai/toolLoop.ts, src/ai/context.ts, src/ai/index.ts</files>
  <read_first>
    - src/ai/registry.ts (Plan 03 完成,executeTool/toolsToSchemas/ToolArgError)
    - src/lib/api.ts (Plan 02 完成,chatWithTools)
    - src/stores/productStore.ts (selectedProductId 字段)
    - src/stores/taskStore.ts (categories[].tasks 结构)
    - src/stores/scheduleStore.ts (events 结构)
    - .planning/phases/9-ai/9-CONTEXT.md D-09/D-10 (核心上下文 + 错误处理)
  </read_first>
  <behavior>
    - runToolLoop(userMessage, opts):循环 ≤ 5 次:
      1. messages.push({ role: 'user' 或 'tool', content: userMessage 或 tool_result })
      2. chatWithTools({ messages, tools: toolsToSchemas(), systemPrompt: coreContextMarkdown, provider, onToken })
      3. 如果 result.toolCalls.length > 0:对每个 tool_call,executeTool(name, args),catch ToolArgError 时把 Zod issues 加进 messages 作 tool_result;成功则加 tool_result {ok, data};continue 循环
      4. 如果 result.toolCalls.length === 0:return result.content (LLM 不再要 tool)
    - maxIterations 超过:return last content + warning "tool loop 达到上限"
    - opts 字段:{ provider, onToken?, onToolStart?(name, args), onToolEnd?(name, result), signal?, systemPromptOverride? }
    - buildCoreContext():返回 Markdown string:
      ```
      # Current Context
      ## Selected Product
      - Name: ... | Stage: ... | Tagline: ...
      ## Active Tasks (top 10)
      - [high] task1 (deadline 2026-08-15) [product: ...]
      ...
      ## Upcoming Events (next 7 days, top 5)
      - 2026-08-12 14:00 设计走查 (review)
      ...
      ## User Preferences
      - Theme: dark
      ```
    - Token estimate:Markdown 字符数 / 4 ≈ tokens;目标 500-1000 tokens,即 ~2000-4000 chars
  </behavior>
  <action>
1. 创建 `src/ai/context.ts`:
   ```typescript
   import { useProductStore } from '@/src/stores/productStore';
   import { useTaskStore } from '@/src/stores/taskStore';
   import { useScheduleStore } from '@/src/stores/scheduleStore';
   import { useUIStore } from '@/src/stores/uiStore';

   // D-09/D-10: Core context injection — ~500-1000 tokens, Markdown format (LLM-friendly + human-debug-readable).
   // Selected product + active tasks top 10 + upcoming events top 5.
   export function buildCoreContext(): string {
     const ui = useUIStore.getState();
     const selectedProductId = (ui as any).selectedProductId;
     const products = useProductStore.getState().products;
     const product = products.find((p) => p.id === selectedProductId);

     const lines: string[] = ['# Current Context'];

     if (product) {
       lines.push('## Selected Product');
       lines.push(`- Name: ${product.name} | Stage: ${product.stage} | Tagline: ${product.tagline}`);
     } else {
       lines.push('## Selected Product');
       lines.push('- (none selected)');
     }

     // Active tasks: top 10 across all categories (exclude completed)
     const allTasks = useTaskStore.getState().categories.flatMap((c) => c.tasks);
     const active = allTasks
       .filter((t) => t.status !== '已完成')
       .slice(0, 10);
     lines.push('## Active Tasks (top 10)');
     if (active.length === 0) lines.push('- (no active tasks)');
     for (const t of active) {
       lines.push(`- [${t.priority}] ${t.title} (deadline ${t.deadline || 'N/A'})${t.project ? ` [product: ${t.project}]` : ''}`);
     }

     // Upcoming events: top 5 (Phase 6 will make this real; v0.1.0 just lists current)
     const events = useScheduleStore.getState().events.slice(0, 5);
     lines.push('## Upcoming Events (top 5)');
     if (events.length === 0) lines.push('- (no events)');
     for (const e of events) {
       lines.push(`- ${e.title} — ${e.time} (${e.type})`);
     }

     return lines.join('\n');
   }
   ```

2. 创建 `src/ai/toolLoop.ts`:
   ```typescript
   import { chatWithTools, ChatMessage, Provider } from '@/src/lib/api';
   import { executeTool, toolsToSchemas, ToolArgError } from './registry';
   import { buildCoreContext } from './context';

   const MAX_ITERATIONS = 5;

   export interface ToolLoopCallbacks {
     onToken?: (text: string) => void;
     onToolStart?: (name: string, args: unknown) => void;
     onToolEnd?: (name: string, result: unknown, error?: string) => void;
   }

   export interface RunToolLoopArgs {
     userMessage: string;
     provider: Provider;
     systemPromptOverride?: string;
     signal?: AbortSignal;
     callbacks?: ToolLoopCallbacks;
   }

   export interface ToolLoopResult {
     content: string;
     iterations: number;
     toolCallsExecuted: number;
     truncated: boolean;   // true if hit MAX_ITERATIONS
   }

   // ponytail: ~80 LOC. Hand-rolled because D-02 forbids LangGraph/Vercel AI SDK/Claude Agent SDK.
   // The loop: messages → chatWithTools → if tool_calls, executeTool → append tool_result → repeat.
   // D-09: ToolArgError triggers 1 retry per tool name per loop (Zod issue fed back to LLM).
   export async function runToolLoop(args: RunToolLoopArgs): Promise<ToolLoopResult> {
     const systemPrompt = args.systemPromptOverride ?? buildCoreContext();
     const messages: ChatMessage[] = [{ role: 'user', content: args.userMessage }];
     const argErrorCount = new Map<string, number>();  // toolName → count
     let toolCallsExecuted = 0;
     let lastContent = '';
     let truncated = false;

     for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
       const result = await chatWithTools({
         messages,
         tools: toolsToSchemas(),
         systemPrompt,
         provider: args.provider,
         onToken: args.callbacks?.onToken,
         signal: args.signal,
       });
       lastContent = result.content;

       if (result.toolCalls.length === 0) {
         return { content: lastContent, iterations: iter + 1, toolCallsExecuted, truncated: false };
       }

       // Append assistant's tool_call intention to messages
       messages.push({ role: 'assistant', content: lastContent || '[requesting tools]' });

       for (const tc of result.toolCalls) {
         args.callbacks?.onToolStart?.(tc.name, tc.args);
         try {
           const out = await executeTool(tc.name, tc.args);
           args.callbacks?.onToolEnd?.(tc.name, out);
           messages.push({
             role: 'user',
             content: `[tool_result ${tc.name}] ${JSON.stringify(out).slice(0, 800)}`,
           });
           toolCallsExecuted++;
         } catch (e) {
           const errMsg = e instanceof Error ? e.message : String(e);
           args.callbacks?.onToolEnd?.(tc.name, null, errMsg);
           if (e instanceof ToolArgError) {
             const count = (argErrorCount.get(tc.name) ?? 0) + 1;
             argErrorCount.set(tc.name, count);
             // D-09: feed Zod issue back so LLM can self-correct; after 1 retry, give up on this call
             messages.push({
               role: 'user',
               content: `[tool_error ${tc.name}] ${e.message}. ${count <= 1 ? 'Please fix args and retry.' : 'Giving up on this tool call.'}`,
             });
           } else {
             messages.push({
               role: 'user',
               content: `[tool_error ${tc.name}] ${errMsg}`,
             });
           }
         }
       }
     }

     truncated = true;
     return { content: lastContent, iterations: MAX_ITERATIONS, toolCallsExecuted, truncated };
   }
   ```

3. 编辑 `src/ai/index.ts` 加 export:
   ```typescript
   export * from './toolLoop';
   export * from './context';
   ```
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    toolLoop.ts (~80 LOC) + context.ts 就绪。runToolLoop 协调 LLM ↔ tools ↔ messages,ToolArgError 1 次重试 (D-09),maxIterations 5 兜底。buildCoreContext 拼接 selected product + active tasks top 10 + upcoming events top 5 成 Markdown。下一步 CmdKPalette UI 直接调用 runToolLoop。
  </done>
</task>

<task type="auto">
  <name>Task 2: CmdKPalette 组件 (Raycast-style) + useCmdK hook + App.tsx 挂载</name>
  <files>src/components/CmdKPalette.tsx, src/hooks/useCmdK.ts, src/stores/uiStore.ts, src/App.tsx</files>
  <read_first>
    - src/stores/uiStore.ts (现有 state 结构,加 isCmdKOpen)
    - src/App.tsx (现有 React tree + lazy-loaded views + MainLayout)
    - src/components/ui/Dialog.tsx (Radix Dialog 模式参考)
    - src/components/ui/Input.tsx
    - .planning/phases/9-ai/9-CONTEXT.md D-16/D-17/D-18 (CmdK 双模式)
  </read_first>
  <behavior>
    - useCmdK hook:在 App 顶层调用,注册 keydown listener:
      - Ctrl/Cmd+K → toggle uiStore.isCmdKOpen
      - Escape → close
      - preventDefault + stopPropagation
    - uiStore 加 isCmdKOpen: boolean + setCmdKOpen(open)
    - CmdKPalette 视觉:fixed top-center dialog (top: 20%),max-w-2xl,w-full,高 z-index,背景 overlay
    - 双模式 (segmented control 在 input 上方):
      - 命令模式:列出 toolRegistry 所有 tools 作为 quick actions,Enter 触发 executeTool,shift+Enter 走 AI 对话
      - AI 对话模式:input 是消息框,Enter 调用 runToolLoop,流式渲染回复
    - 流式渲染:onToken 把 text 累加到 response display
    - Provider:从 uiStore.activeAIProvider 读 (Plan 06 加);Plan 04 暂时硬编码 'deepseek' (D-13 默认)
    - 关闭信号:done 后保持 panel open 让用户看回复,Esc 或点击 overlay 关闭
  </behavior>
  <action>
1. 编辑 `src/stores/uiStore.ts`:
   - 在 state interface 加 `isCmdKOpen: boolean; setCmdKOpen: (open: boolean) => void;`
   - 加 `activeAIProvider: 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'ollama'; setActiveAIProvider: (p) => void;` (Plan 06 Settings UI 用)
   - 默认值:`isCmdKOpen: false, activeAIProvider: 'deepseek'` (D-13)
   - 加 actions 实现

2. 创建 `src/hooks/useCmdK.ts`:
   ```typescript
   import { useEffect } from 'react';
   import { useUIStore } from '@/src/stores/uiStore';

   // D-18: ⌘K triggers palette. Cmd on macOS, Ctrl elsewhere.
   export function useCmdK() {
     const setCmdKOpen = useUIStore((s) => s.setCmdKOpen);
     useEffect(() => {
       const handler = (e: KeyboardEvent) => {
         const isMod = e.metaKey || e.ctrlKey;
         if (isMod && e.key.toLowerCase() === 'k') {
           e.preventDefault();
           e.stopPropagation();
           setCmdKOpen(true);
         }
         if (e.key === 'Escape') {
           setCmdKOpen(false);
         }
       };
       window.addEventListener('keydown', handler, true);  // capture phase
       return () => window.removeEventListener('keydown', handler, true);
     }, [setCmdKOpen]);
   }
   ```

3. 创建 `src/components/CmdKPalette.tsx`:
   - 结构:Radix Dialog (open from uiStore.isCmdKOpen)
   - 顶部 Input (autoFocus),上方 segmented control [命令 | AI 对话]
   - 命令模式:列出 tools (从 toolRegistry),filter by query,Enter 触发当前 highlight 的 tool (弹出小 prompt 输入 args,简化版直接调用 executeTool)
   - AI 对话模式:input 是 message,Enter 调用 runToolLoop,渲染流式 response + tool call 占位 ("[执行 createTask...] ✓")
   - 错误处理:ToolArgError / 其他错误显示红色 chip "AI 调用失败: ..."
   - Provider:暂时硬编码 'deepseek' (Plan 06 改成读 uiStore.activeAIProvider)
   - 动画:Dialog content 用 motion (复用 tokens spring)
   ```typescript
   import { useState, useRef } from 'react';
   import * as DialogPrimitive from '@radix-ui/react-dialog';
   import { motion, AnimatePresence } from 'motion/react';
   import { MagnifyingGlass, Sparkle, Check, Warning } from '@phosphor-icons/react';
   import { cn } from '@/src/lib/utils';
   import { useUIStore } from '@/src/stores/uiStore';
   import { toolRegistry, listToolNames, executeTool } from '@/src/ai';
   import { runToolLoop } from '@/src/ai';
   import { useToast } from '@/src/components/ui/Toast';
   import { SegmentedControl } from '@/src/components/ui/SegmentedControl';

   export function CmdKPalette() {
     const isOpen = useUIStore((s) => s.isCmdKOpen);
     const setOpen = useUIStore((s) => s.setCmdKOpen);
     const [mode, setMode] = useState<'command' | 'chat'>('command');
     const [query, setQuery] = useState('');
     const [response, setResponse] = useState('');
     const [toolTrace, setToolTrace] = useState<{ name: string; status: 'running' | 'ok' | 'error' }[]>([]);
     const [loading, setLoading] = useState(false);
     const { toast } = useToast();

     // Filter tools by query
     const toolNames = listToolNames().filter((n) =>
       n.toLowerCase().includes(query.toLowerCase())
     );

     const handleSubmitChat = async () => {
       if (!query.trim() || loading) return;
       setLoading(true);
       setResponse('');
       setToolTrace([]);
       try {
         const result = await runToolLoop({
           userMessage: query,
           provider: 'deepseek',   // Plan 06 改成 uiStore.activeAIProvider
           callbacks: {
             onToken: (t) => setResponse((r) => r + t),
             onToolStart: (name) => setToolTrace((t) => [...t, { name, status: 'running' }]),
             onToolEnd: (name, _result, error) =>
               setToolTrace((t) => t.map((x) => x.name === name ? { ...x, status: error ? 'error' : 'ok' } : x)),
           },
         });
         if (result.truncated) {
           toast({ type: 'warning', title: 'AI 提示', description: 'Tool loop 达到 5 次上限' });
         }
       } catch (e) {
         toast({ type: 'error', title: 'AI 调用失败', description: (e as Error).message });
       } finally {
         setLoading(false);
       }
     };

     const handleRunCommand = async (toolName: string) => {
       // Simplified: prompt for args as JSON (Phase 10 will add per-tool forms)
       const argsStr = window.prompt(`Args for ${toolName} (JSON):`, '{}');
       if (!argsStr) return;
       try {
         const args = JSON.parse(argsStr);
         await executeTool(toolName, args);
         toast({ type: 'success', title: `${toolName} executed` });
         setOpen(false);
       } catch (e) {
         toast({ type: 'error', title: `${toolName} failed`, description: (e as Error).message });
       }
     };

     return (
       <DialogPrimitive.Root open={isOpen} onOpenChange={setOpen}>
         <DialogPrimitive.Portal>
           <DialogPrimitive.Overlay asChild>
             <motion.div
               className="fixed inset-0 z-modal bg-bg-overlay/60 backdrop-blur-sm"
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             />
           </DialogPrimitive.Overlay>
           <DialogPrimitive.Content asChild>
             <motion.div
               className="fixed left-1/2 top-[15vh] -translate-x-1/2 z-modal w-[min(640px,90vw)]"
               initial={{ opacity: 0, y: -8, scale: 0.98 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: -8, scale: 0.98 }}
               transition={{ type: 'spring', stiffness: 400, damping: 30 }}
             >
               <div className="rounded-[var(--radius-xl)] bg-bg-primary border border-border-subtle shadow-shadow-lg overflow-hidden">
                 {/* Mode segmented control */}
                 <div className="flex items-center gap-2 px-3 pt-3">
                   <SegmentedControl
                     value={mode}
                     onChange={(v) => setMode(v as 'command' | 'chat')}
                     segments={[
                       { id: 'command', label: '命令', icon: <MagnifyingGlass size={14} /> },
                       { id: 'chat', label: 'AI 对话', icon: <Sparkle size={14} /> },
                     ]}
                   />
                 </div>
                 {/* Input */}
                 <input
                   autoFocus
                   value={query}
                   onChange={(e) => setQuery(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       if (mode === 'chat') handleSubmitChat();
                       else if (toolNames[0]) handleRunCommand(toolNames[0]);
                     }
                   }}
                   placeholder={mode === 'command' ? '搜索命令...' : '问 AI 做什么...'}
                   className="w-full px-4 py-3 bg-transparent text-text-primary placeholder:text-text-tertiary outline-none border-b border-border-subtle"
                 />
                 {/* Body */}
                 <div className="max-h-[50vh] overflow-y-auto p-2">
                   {mode === 'command' && (
                     <ul>
                       {toolNames.map((n) => {
                         const t = toolRegistry.get(n);
                         return (
                           <li key={n}>
                             <button
                               onClick={() => handleRunCommand(n)}
                               className="w-full text-left px-3 py-2 rounded-[var(--radius-sm)] hover:bg-bg-secondary flex items-center gap-2"
                             >
                               <span className="font-medium text-sm text-text-primary">{n}</span>
                               <span className="text-xs text-text-tertiary truncate">{t?.tool.description}</span>
                             </button>
                           </li>
                         );
                       })}
                     </ul>
                   )}
                   {mode === 'chat' && (
                     <div className="space-y-3 p-3">
                       {toolTrace.length > 0 && (
                         <div className="space-y-1">
                           {toolTrace.map((t, i) => (
                             <div key={i} className="flex items-center gap-2 text-xs">
                               {t.status === 'running' && <span className="animate-spin">⏳</span>}
                               {t.status === 'ok' && <Check size={12} weight="bold" className="text-success" />}
                               {t.status === 'error' && <Warning size={12} weight="bold" className="text-danger" />}
                               <span className="text-text-secondary">{t.name}</span>
                             </div>
                           ))}
                         </div>
                       )}
                       {response && (
                         <div className="text-sm text-text-primary whitespace-pre-wrap">{response}</div>
                       )}
                       {loading && !response && (
                         <div className="text-sm text-text-tertiary">AI 思考中...</div>
                       )}
                     </div>
                   )}
                 </div>
               </div>
             </motion.div>
           </DialogPrimitive.Content>
         </DialogPrimitive.Portal>
       </DialogPrimitive.Root>
     );
   }
   ```

4. 编辑 `src/App.tsx`:
   - 在 App 函数顶部调用 `useCmdK();`
   - 在 React tree 顶层 (MainLayout 同级或内部) 挂载 `<CmdKPalette />`
   - Lazy import 可选 (Ponytail:直接 import 即可,组件本身轻量)

5. 简化:CmdKPalette 用 prompt() 收集 command args — 这是 Ponytail 简化,Phase 10 升级到 per-tool form
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    CmdKPalette UI 在 React tree 顶层挂载,⌘K 全局快捷键触发。命令模式列出 toolRegistry,Enter 触发 executeTool(prompt 收 args)。AI 对话模式调用 runToolLoop,流式渲染 + tool trace 显示。错误走 toast。
  </done>
</task>

</tasks>

<verification>
- `npm run lint` 通过
- grep 验证: src/ai/toolLoop.ts 包含 `export async function runToolLoop`
- grep 验证: src/ai/context.ts 包含 `export function buildCoreContext`
- grep 验证: src/components/CmdKPalette.tsx 包含 `runToolLoop` + `toolRegistry`
- grep 验证: src/hooks/useCmdK.ts 包含 `keydown` + `'k'`
- grep 验证: src/App.tsx 包含 `useCmdK()` + `<CmdKPalette`
- grep 验证: src/stores/uiStore.ts 包含 `isCmdKOpen` + `setCmdKOpen`
</verification>

<success_criteria>
1. Tool loop 实现完成,~80 LOC,无 langchain 依赖 (D-01/D-02) (AI-01 ✓)
2. ⌘K 全局快捷键 + Raycast-style palette UI (双模式:命令 + AI 对话) (D-16/D-18) (AI-02 ✓)
3. ToolArgError 触发 1 次重试,maxIterations 5 兜底 (D-09 错误处理) (AI-09 错误处理基础)
4. Core context injection 每次 chatWithTools 注入 Markdown systemPrompt (D-09/D-10) (AI-06 ✓)
5. CmdKPalette 在 App.tsx 顶层挂载,所有页面可触发 (D-17 slide-out 在 Plan 05)
</success_criteria>

<output>
After completion, create `.planning/phases/9-ai/9-04-SUMMARY.md`
</output>
