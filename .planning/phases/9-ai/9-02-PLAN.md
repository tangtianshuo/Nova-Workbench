---
phase: 9-ai
plan: 02
type: execute
wave: 2
depends_on: [9-01]
files_modified:
  - server.ts
  - src/lib/api.ts
autonomous: true
requirements: [AI-08, AI-09]

must_haves:
  truths:
    - "Express server.ts 删除 5 个旧 AI 端点,只保留 Vite middleware + /api/chat proxy + SPA fallback"
    - "/api/chat POST 端点接受 {messages, tools, systemPrompt, provider},从 .env 读取对应 provider key,流式返回 LLM 响应"
    - "src/lib/api.ts 暴露 chatWithTools(messages, tools, systemPrompt, provider, onToken, signal) 函数,内部 isTauri() 分支:invoke('chat') vs fetch('/api/chat')"
    - "Channel<StreamChunk> onmessage 处理 4 个 kind:token / done / error / tool_call"
    - "humanizeAIError 扩展支持 provider 相关错误 (e.g. 'invalid api key' 适配所有 provider 的 phrasing)"
  artifacts:
    - path: "server.ts"
      provides: "简化版 Express,只 1 个 /api/chat endpoint + Vite middleware + SPA fallback"
      contains: "/api/chat"
    - path: "src/lib/api.ts"
      provides: "chatWithTools() 函数,isTauri 双分支 (invoke vs fetch)"
      contains: "export async function chatWithTools"
  key_links:
    - from: "src/lib/api.ts"
      to: "Tauri invoke('chat')"
      via: "isTauri() 分支调用 Plan 01 注册的 chat command"
      pattern: "invoke<.*?>\\('chat'"
    - from: "src/lib/api.ts"
      to: "/api/chat"
      via: "fetch fallback for dev/web mode (D-21)"
      pattern: "fetch\\('/api/chat'"
    - from: "server.ts"
      to: "process.env.{DEEPSEEK_API_KEY,OPENAI_API_KEY,...}"
      via: "/api/chat endpoint 按选择的 provider 读对应 env var"
      pattern: "DEEPSEEK_API_KEY"
---

<objective>
把 Express server.ts 从 5 个 AI 端点简化到 1 个 /api/chat proxy,扩展 src/lib/api.ts 加 chatWithTools() 客户端函数 (isTauri 分支)。

Purpose: 删除冗余的 AI endpoints (D-19/D-20),让所有 AI 调用统一走 chat 命令 (Tauri) 或 /api/chat (web fallback)。Plan 03 的 tool registry 调用 chatWithTools,Plan 04/05 的 UI 通过它发送 messages。
Output: 简化版 server.ts (Vite middleware + /api/chat + SPA) + chatWithTools() 客户端
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/9-ai/9-CONTEXT.md
@.planning/phases/9-ai/9-01-PLAN.md

@server.ts
@src/lib/api.ts

<interfaces>
<!-- Plan 01 完成后 Rust 暴露的 chat command 签名 -->
```typescript
// Tauri invoke args (matches Rust ChatArgs)
type ChatArgs = {
  messages: { role: 'user' | 'assistant' | 'system', content: string }[];
  tools: JsonSchema[];   // JSON Schema array (from Zod → json-schema)
  systemPrompt: string;
  provider: 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'ollama';
  requestId: string;
  onToken: Channel<StreamChunk>;
};

// StreamChunk (Plan 01 扩展后)
type StreamChunk = {
  kind: 'token' | 'done' | 'error' | 'tool_call';
  data?: { text?: string; message?: string; name?: string; arguments?: unknown };
};

// invoke('chat') resolves to:
type ChatResult = { content: string; toolCalls: { name: string; arguments: unknown }[] };
```

<!-- 现有 src/lib/api.ts (Plan 02 复用 isTauri 双分支模式) -->
```typescript
export function isTauri(): boolean;
export async function streamGenerateProject(...): Promise<GenerateProjectResult>;  // 现有 pattern 参考
function humanizeAIError(message: string): string;  // 已有,需扩展
```

<!-- 现有 server.ts 5 个 AI endpoints (Plan 02 全删) -->
- POST /api/generate-project
- POST /api/summarize-workspace
- GET /api/workspace-files
- POST /api/rnd/generate-deliverable
- POST /api/rnd/polish-knowledge-article

<!-- 现有 server.ts Vite middleware + SPA fallback (Plan 02 保留) -->
```typescript
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}
app.listen(PORT, "127.0.0.1", () => { ... });
```
</interfaces>

<risks>
- **Streaming over fetch:** /api/chat 用 SSE 还是 chunked NDJSON? Ponytail:NDJSON 更简单 (每行一个 StreamChunk JSON),用 res.write() 推送,前端 reader.read() 解析。SSE 需要事件协议,overkill。
- **删除旧端点会破坏 ProjectCreateModal:** ProjectCreateModal 现在用 streamGenerateProject (走 invoke('generate_project') Tauri 路径或 fetch('/api/generate-project') web 路径)。Plan 02 删除 /api/generate-project 后,web 模式下 ProjectCreateModal 失效。Ponytail 决策:**保留 generate-project 端点**作为短期 debt (因为 streamGenerateProject 已用),只删除其他 4 个明显 dead 的 (summarize-workspace / workspace-files / rnd/generate-deliverable / rnd/polish-knowledge-article)。在 SUMMARY 标注 "generate-project 留作 v0.3+ web mode cleanup"。
</risks>
</context>

<tasks>

<task type="auto">
  <name>Task 1: server.ts 删除 4 个 dead endpoints,新增 /api/chat proxy</name>
  <files>server.ts</files>
  <read_first>
    - server.ts (现有 5 endpoints + Vite middleware + SPA fallback + listen)
    - .planning/phases/9-ai/9-CONTEXT.md (D-19/D-20/D-21 简化策略)
  </read_first>
  <behavior>
    - 删除 4 个 endpoints:/api/summarize-workspace, /api/workspace-files, /api/rnd/generate-deliverable, /api/rnd/polish-knowledge-article
    - 保留 /api/generate-project (streamGenerateProject 还在用,debt note)
    - 新增 POST /api/chat endpoint:
      - 接受 { messages, tools, systemPrompt, provider } body
      - 按 provider 从 process.env 读取 key (DEEPSEEK_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY,Ollama 不需要)
      - 用 @google/genai (gemini provider only) 或者轻量 fetch 调用 OpenAI-compatible endpoint (deepseek/openai/anthropic 都兼容 OpenAI format)
      - Ponytail 简化:web mode 只支持 gemini (因为已有 @google/genai SDK),其他 provider 走 Tauri 桌面端;web mode 下 provider != gemini 返回 400 "Desktop-only provider"
      - 流式响应用 NDJSON:res.write(JSON.stringify({kind:'token',data:{text}}) + '\n')
      - tool_call 通过 {kind:'tool_call', data:{name, arguments}} 行透传
      - 错误:{kind:'error', data:{message}}
      - 完毕:{kind:'done'}
  </behavior>
  <action>
1. 编辑 `server.ts`:
   - 删除 4 个 endpoints (L116-260 范围内的 summarize-workspace / workspace-files / rnd/generate-deliverable / rnd/polish-knowledge-article)
   - 保留 /api/generate-project 不动 (debt note: "generate-project 留作 web mode 短期 debt,Phase 10+ 可统一到 /api/chat")
   - 在 /api/generate-project 之后加新 endpoint:
     ```typescript
     // === Phase 9: Universal chat proxy (web mode fallback only) ===
     // Desktop (Tauri) does NOT use this — it calls invoke('chat') which routes
     // through rig-core in Rust. This endpoint exists for web/dev mode only.
     // ponytail: only gemini provider supported in web mode (@google/genai already in deps);
     // other providers return 400 — desktop is the primary surface (D-21).
     app.post('/api/chat', async (req, res) => {
       try {
         const { messages, tools, systemPrompt, provider } = req.body;
         if (provider !== 'gemini') {
           return res.status(400).json({
             error: `Provider "${provider}" not supported in web mode. Use desktop app.`,
           });
         }
         if (!process.env.GEMINI_API_KEY) {
           return res.status(400).json({ error: 'GEMINI_API_KEY not set in .env' });
         }
         // ponytail: NDJSON streaming — one StreamChunk JSON per line
         res.setHeader('Content-Type', 'application/x-ndjson');
         res.setHeader('Cache-Control', 'no-cache');
         res.setHeader('Connection', 'keep-alive');

         const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
         // 注:tool use 协议在 web mode 下作简化处理 — 把 tools schema 传给 Gemini
         // generateContentStream,如果 LLM 返回 functionCall,转成 tool_call chunk。
         const response = await ai.models.generateContentStream({
           model: 'gemini-1.5-flash',
           contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
           config: {
             systemInstruction: systemPrompt,
             tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
           },
         });

         for await (const chunk of response.stream) {
           const text = chunk.text();
           if (text) {
             res.write(JSON.stringify({ kind: 'token', data: { text } }) + '\n');
           }
           // functionCall 透传
           const fc = chunk.functionCalls()?.[0];
           if (fc) {
             res.write(JSON.stringify({ kind: 'tool_call', data: { name: fc.name, arguments: fc.args } }) + '\n');
           }
         }
         res.write(JSON.stringify({ kind: 'done' }) + '\n');
         res.end();
       } catch (error: any) {
         console.error('Chat proxy error:', error);
         res.write(JSON.stringify({ kind: 'error', data: { message: error.message } }) + '\n');
         res.end();
       }
     });
     ```
   - 保留 Vite middleware + SPA fallback + listen 不变
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    server.ts 只剩 1 个 AI endpoint (/api/generate-project legacy + /api/chat 新增) + Vite + SPA + listen。删除了 4 个 dead endpoints。npm run lint 通过。
  </done>
</task>

<task type="auto">
  <name>Task 2: src/lib/api.ts 加 chatWithTools() 客户端 + 扩展 StreamChunk</name>
  <files>src/lib/api.ts</files>
  <read_first>
    - src/lib/api.ts (现有 streamGenerateProject pattern + isTauri 分支)
    - server.ts (Task 1 完成后,/api/chat NDJSON 流式协议)
  </read_first>
  <behavior>
    - StreamChunk interface 扩展:kind union 加 'tool_call',data 加 name/arguments 字段
    - chatWithTools() 双分支:
      - Tauri:invoke('chat', { messages, tools, systemPrompt, provider, requestId, onToken: channel })
        - Channel.onmessage 处理 4 个 kind,转发到 onToken callback + onToolCall callback
      - Web:fetch('/api/chat', { method: POST, body }),用 ReadableStream reader 解析 NDJSON 行
    - 函数签名:
      ```typescript
      chatWithTools(args: {
        messages: ChatMessage[];
        tools: JsonSchema7[];
        systemPrompt: string;
        provider: Provider;
        onToken?: (text: string) => void;
        onToolCall?: (name: string, args: unknown) => void;
        signal?: AbortSignal;
      }): Promise<{ content: string; toolCalls: { name: string; args: unknown }[] }>
      ```
    - humanizeAIError 扩展:加 "model not found" / "context length exceeded" / "quota" 等错误模式
  </behavior>
  <action>
1. 编辑 `src/lib/api.ts`:

   a. 顶部加导出类型:
   ```typescript
   export type Provider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'ollama';
   export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
   export interface ChatToolCall { name: string; args: unknown }
   export interface ChatResult { content: string; toolCalls: ChatToolCall[] }
   ```

   b. StreamChunk interface 扩展:
   ```typescript
   interface StreamChunk {
     kind: 'token' | 'done' | 'error' | 'tool_call';
     data?: { text?: string; message?: string; name?: string; arguments?: unknown };
   }
   ```

   c. 新增 chatWithTools:
   ```typescript
   export async function chatWithTools(args: {
     messages: ChatMessage[];
     tools: Record<string, unknown>[];   // JSON Schema array (Zod-json-schema)
     systemPrompt: string;
     provider: Provider;
     onToken?: (text: string) => void;
     onToolCall?: (name: string, argsValue: unknown) => void;
     signal?: AbortSignal;
   }): Promise<ChatResult> {
     if (isTauri()) {
       const { invoke, Channel } = await import('@tauri-apps/api/core');
       const requestId = crypto.randomUUID();
       const channel = new Channel<StreamChunk>();
       const toolCalls: ChatToolCall[] = [];
       channel.onmessage = (msg) => {
         if (msg.kind === 'token' && msg.data?.text) args.onToken?.(msg.data.text);
         else if (msg.kind === 'tool_call' && msg.data?.name) {
           toolCalls.push({ name: msg.data.name, args: msg.data.arguments });
           args.onToolCall?.(msg.data.name, msg.data.arguments);
         }
         // 'done' and 'error' handled by invoke resolve/reject
       };
       args.signal?.addEventListener('abort', () => {
         invoke('cancel_chat', { requestId }).catch(() => {});
       });
       try {
         const result = await invoke<ChatResult>('chat', {
           messages: args.messages,
           tools: args.tools,
           systemPrompt: args.systemPrompt,
           provider: args.provider,
           requestId,
           onToken: channel,
         });
         return result;
       } catch (e) {
         const msg = typeof e === 'string' ? e : (e as Error).message ?? String(e);
         const human = humanizeAIError(msg);
         if (human === '已取消') throw new Error(human);
         throw new Error(human);
       }
     }

     // Web fallback (NDJSON streaming)
     const resp = await fetch('/api/chat', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         messages: args.messages,
         tools: args.tools,
         systemPrompt: args.systemPrompt,
         provider: args.provider,
       }),
       signal: args.signal,
     });
     if (!resp.ok) {
       const errText = await resp.text().catch(() => resp.statusText);
       throw new Error(humanizeAIError(`HTTP ${resp.status}: ${errText}`));
     }
     // ponytail: NDJSON — each line is a StreamChunk JSON
     const reader = resp.body?.getReader();
     const decoder = new TextDecoder();
     let buffer = '';
     let content = '';
     const toolCalls: ChatToolCall[] = [];
     if (!reader) throw new Error('No response body');
     while (true) {
       const { done, value } = await reader.read();
       if (done) break;
       buffer += decoder.decode(value, { stream: true });
       const lines = buffer.split('\n');
       buffer = lines.pop() ?? '';   // keep partial line
       for (const line of lines) {
         if (!line.trim()) continue;
         try {
           const chunk: StreamChunk = JSON.parse(line);
           if (chunk.kind === 'token' && chunk.data?.text) {
             content += chunk.data.text;
             args.onToken?.(chunk.data.text);
           } else if (chunk.kind === 'tool_call' && chunk.data?.name) {
             toolCalls.push({ name: chunk.data.name, args: chunk.data.arguments });
             args.onToolCall?.(chunk.data.name, chunk.data.arguments);
           } else if (chunk.kind === 'error' && chunk.data?.message) {
             throw new Error(humanizeAIError(chunk.data.message));
           }
         } catch (parseErr) {
           // Skip malformed line — ponytail: don't crash stream on bad JSON
           console.warn('[chatWithTools] bad NDJSON line:', line);
         }
       }
     }
     return { content, toolCalls };
   }
   ```

   d. humanizeAIError 扩展 (在现有 if 链后追加):
   ```typescript
   if (lower.includes('model not found') || lower.includes('does not exist')) return '模型不存在,请检查 Settings 配置';
   if (lower.includes('context length') || lower.includes('too long')) return '上下文过长,请缩短输入';
   if (lower.includes('quota') || lower.includes('billing')) return '配额不足,请检查 API 账户';
   ```
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    src/lib/api.ts 暴露 chatWithTools() + ChatMessage/Provider/ChatResult 类型。isTauri 双分支 (invoke vs fetch NDJSON)。下一步 Plan 03 tool registry 可调用此函数。
  </done>
</task>

</tasks>

<verification>
- `npm run lint` (tsc --noEmit) 通过
- grep 验证: server.ts 不包含 `/api/summarize-workspace` / `/api/workspace-files` / `/api/rnd/generate-deliverable` / `/api/rnd/polish-knowledge-article`
- grep 验证: server.ts 包含 `/api/chat`
- grep 验证: src/lib/api.ts 包含 `export async function chatWithTools`
- grep 验证: src/lib/api.ts StreamChunk kind union 包含 `'tool_call'`
</verification>

<success_criteria>
1. Express server.ts 删除 4 个 dead AI 端点 (D-20) (AI-08 ✓)
2. 新增 /api/chat NDJSON 流式 proxy,只支持 gemini provider (web mode fallback)
3. chatWithTools() 客户端函数支持 isTauri 双分支 (AI-09 ✓)
4. StreamChunk 协议扩展 tool_call kind
5. humanizeAIError 扩展支持 provider 相关错误 (AI-09 错误处理基础)
6. /api/generate-project 保留作为短期 debt (debt note in code)
</success_criteria>

<output>
After completion, create `.planning/phases/9-ai/9-02-SUMMARY.md`
</output>
