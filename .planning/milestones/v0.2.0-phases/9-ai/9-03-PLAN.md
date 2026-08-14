---
phase: 9-ai
plan: 03
type: execute
wave: 3
depends_on: [9-02]
files_modified:
  - package.json
  - src/ai/registry.ts
  - src/ai/tools/task.ts
  - src/ai/tools/product.ts
  - src/ai/tools/schedule.ts
  - src/ai/tools/workspace.ts
  - src/ai/tools/rnd.ts
  - src/ai/index.ts
autonomous: true
requirements: [AI-01, AI-04]

must_haves:
  truths:
    - "src/ai/registry.ts 暴露 Tool 接口 + toolRegistry Map + registerTool/toolsToSchemas/toolsToOpenAI/executeTool 函数"
    - "10-15 个 tools 注册到 toolRegistry:createTask/listTasks/listProducts/getProductDetails/createScheduleEvent/listScheduleEvents/listWorkspaceFiles/getRndDeliverables 等"
    - "每个 tool 有 name/description/zod schema/execute 函数,execute 直接调用 Zustand store action"
    - "toolsToSchemas() 把 Zod schema 转换为 JSON Schema array,传给 Rust chat command"
    - "executeTool(name, args) 用 Zod 校验 args,失败时 throw ToolArgError 包含 Zod issue (供 Plan 04 tool loop 自动重试)"
  artifacts:
    - path: "src/ai/registry.ts"
      provides: "Tool 接口 + toolRegistry Map + registerTool + toolsToSchemas + executeTool"
      contains: "export const toolRegistry"
    - path: "src/ai/tools/task.ts"
      provides: "createTask + listTasks + completeTask + updateTaskStatus 4 个 task tools"
      contains: "createTask"
    - path: "src/ai/tools/product.ts"
      provides: "listProducts + getProductDetails 2 个 product tools"
      contains: "listProducts"
    - path: "src/ai/tools/schedule.ts"
      provides: "createScheduleEvent + listScheduleEvents 2 个 schedule tools"
      contains: "createScheduleEvent"
    - path: "src/ai/tools/workspace.ts"
      provides: "listWorkspaceFiles tool"
      contains: "listWorkspaceFiles"
    - path: "src/ai/tools/rnd.ts"
      provides: "getRndDeliverables tool"
      contains: "getRndDeliverables"
    - path: "src/ai/index.ts"
      provides: "barrel export (registry + all tools)"
      contains: "export"
  key_links:
    - from: "src/ai/tools/task.ts"
      to: "src/stores/taskStore.ts"
      via: "execute 调用 useTaskStore.getState().addTask(args)"
      pattern: "useTaskStore\\.getState\\(\\)\\.addTask"
    - from: "src/ai/registry.ts"
      to: "chatWithTools() in src/lib/api.ts"
      via: "Plan 04 tool loop 调用 toolsToSchemas() 把 toolRegistry 转换为 JSON Schema array 传给 chatWithTools"
      pattern: "toolsToSchemas"
---

<objective>
Hand-rolled tool registry + 10-15 个基础 tools 实现。Tool = Zod schema + Zustand store action 调用,直接在 JS webview 内执行 (D-04)。

Purpose: 这是 Phase 9 的核心 (D-02)。Plan 04 的 tool loop 和 ⌘K palette 共用这个 registry。Ponytail:hand-rolled ~200 LOC,不引入 langchain/llamaindex (D-02 + deferred ideas)。
Output: src/ai/ 模块 (registry + 5 个 tool 文件按 domain 拆分) + 10-15 个 tools 注册
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

@src/stores/taskStore.ts
@src/stores/productStore.ts
@src/stores/scheduleStore.ts
@src/stores/workspaceStore.ts
@src/stores/rndStore.ts
@src/data/mockTasks.ts
@src/data/mockProducts.ts
@src/lib/api.ts

<interfaces>
<!-- 现有 taskStore actions (Phase 5 完成后) -->
```typescript
// src/stores/taskStore.ts
interface TaskState {
  categories: TaskCategory[];
  addTask: (task: Task, categoryId?: string) => void;
  completeTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  // ...
}
// useTaskStore.getState().addTask(...) — non-hook 调用 (action 里这样用)
```

<!-- 现有 Task 类型 (src/data/mockTasks.ts) -->
```typescript
export interface Task {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  time?: string;
  status: string;       // '未开始' | '进行中' | '已完成' 等
  description: string;
  project: string;      // legacy 镜像
  projectId?: string;   // 弱关联 (Phase 5)
  assignee: string;
  assigneeAvatar: string;
  deadline: string;
  aiSuggestions: string[];
  scheduledEventId?: string;
}
```

<!-- 现有 productStore + scheduleStore signatures -->
```typescript
// src/stores/productStore.ts
products: Product[];
addProduct: (product: Product) => void;

// src/stores/scheduleStore.ts (注意:Phase 6 还没跑,这里用 v0.1.0 的简化版)
events: ScheduleEvent[];
addEvent: (event: ScheduleEvent) => void;
// ScheduleEvent.date 当前是 number;Phase 6 会迁移到 string。Plan 03 tool 实现按 v0.1.0 现状 (number),Phase 9 之前 Phase 6 已完成的话再调整 — 见 Risks
```

<!-- chatWithTools (Plan 02 完成后) -->
```typescript
chatWithTools({
  messages, tools: JsonSchema7[], systemPrompt, provider,
  onToken?, onToolCall?, signal?
}): Promise<{ content: string; toolCalls: { name, args }[] }>
```
</interfaces>

<risks>
- **Phase 6 (Schedule CRUD) 依赖:** Plan 03 假设 Phase 6 已完成 (ScheduleEvent.date 是 string)。如果 Phase 9 在 Phase 6 之前执行,createScheduleEvent tool 的 date 参数需用 number 兼容 v0.1.0。本 plan 写成兼容式:tool schema 接受 string YYYY-MM-DD,execute 内部转 number (legacy) — 等待 Phase 6 完成后这条转换可删。
- **Phase 7 (跨模块联动) 依赖:** listTasks 等 tool 的返回里 projectId/project 字段都可用 (Phase 5 已扩展)。createScheduleEvent 的 taskId? 字段需要 Phase 6 扩展;兼容式写法:Phase 9 不实现 task-event 关联 tool,留到 Phase 10。
- **Tool 数量目标:** Roadmap 说 10-15。本 plan 实现 12 个 (task 4 + product 2 + schedule 2 + workspace 1 + rnd 1 + ui 2:switchProduct/setTaskStatus)。Ponytail:ui 工具很轻 (1 个 store action)。
</risks>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 安装 zod + 写 tool registry (~200 LOC)</name>
  <files>package.json, src/ai/registry.ts, src/ai/index.ts</files>
  <read_first>
    - package.json (确认 zod 未安装)
    - .planning/phases/9-ai/9-CONTEXT.md D-01/D-02/D-03/D-04 (hand-rolled + Zod 决策)
  </read_first>
  <behavior>
    - Tool<T> 接口:name / description / schema: ZodObject / execute: (args: T) => Promise<unknown> | unknown
    - toolRegistry: Map<string, RegisteredTool>,RegisteredTool = Tool + JSON Schema 缓存
    - registerTool(tool): 注册到 Map,把 Zod schema 转换 JSON Schema 缓存
    - toolsToSchemas(names?: string[]): JsonSchema7[],默认返回全部
    - executeTool(name, args): Zod parse args → 失败 throw ToolArgError(zodError) → 成功调 tool.execute
    - ToolArgError class { toolName, zodIssues } — Plan 04 tool loop 捕获后让 LLM 自动修正
  </behavior>
  <action>
1. 安装 zod:
   ```bash
   cd D:/Projects/Nova/pm-workspace && npm install zod
   ```
   (zod 是 peer of zod-to-json-schema,但 Ponytail:不引入 zod-to-json-schema,因为 zod 4.x 自带 zod.toJSONSchema() — 如果是 zod 3.x 才需要单独包。Plan 03 先尝试 `zod.toJSONSchema(schema)`,如果不存在,降级到 npm install zod-to-json-schema)
   验证:`node -e "const {z} = require('zod'); console.log(typeof z.toJSONSchema)"` — 如果是 'undefined',加 `npm install zod-to-json-schema`

2. 创建 `src/ai/registry.ts`:
   ```typescript
   import { z, ZodType, ZodError } from 'zod';

   // ponytail: hand-rolled tool registry. ~200 LOC target. NO LangGraph/Vercel AI SDK.
   // The registry is a Map — D-07 says this is the GraphFlow-deferred contract:
   // a future GraphFlow node can wrap toolRegistry.entries() without rewrite.

   export interface Tool<T extends ZodType<any, any, any> = ZodType<any, any, any>> {
     name: string;
     description: string;
     schema: T;
     execute: (args: z.infer<T>) => Promise<unknown> | unknown;
   }

   interface RegisteredTool {
     tool: Tool;
     jsonSchema: Record<string, unknown>;  // cached on register
   }

   export const toolRegistry = new Map<string, RegisteredTool>();

   export class ToolArgError extends Error {
     constructor(public toolName: string, public zodIssues: z.ZodIssue[]) {
       super(`Tool "${toolName}" arg validation failed: ${JSON.stringify(zodIssues)}`);
       this.name = 'ToolArgError';
     }
   }

   export function registerTool<T extends ZodType<any, any, any>>(tool: Tool<T>): void {
     if (toolRegistry.has(tool.name)) {
       console.warn(`[tool-registry] overwriting existing tool "${tool.name}"`);
     }
     // Zod 4: z.toJSONSchema. Zod 3 fallback: zod-to-json-schema package.
     const jsonSchema = zodToJsonSchema(tool.schema);
     toolRegistry.set(tool.name, { tool, jsonSchema });
   }

   // ponytail: lazy import — supports both zod 4 (built-in) and zod 3 (separate pkg)
   function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
     const zAny = z as any;
     if (typeof zAny.toJSONSchema === 'function') return zAny.toJSONSchema(schema);
     // Fallback: runtime import (only reached on zod 3.x)
     throw new Error('zod-to-json-schema package required for zod 3.x — install it');
   }

   export function toolsToSchemas(names?: string[]): Record<string, unknown>[] {
     const entries = names
       ? names.map((n) => toolRegistry.get(n)).filter(Boolean) as RegisteredTool[]
       : Array.from(toolRegistry.values());
     // OpenAI-style function declarations: { name, description, parameters }
     return entries.map(({ tool, jsonSchema }) => ({
       name: tool.name,
       description: tool.description,
       parameters: jsonSchema,
     }));
   }

   export async function executeTool(name: string, args: unknown): Promise<unknown> {
     const reg = toolRegistry.get(name);
     if (!reg) throw new Error(`Unknown tool: ${name}`);
     const parsed = reg.tool.schema.safeParse(args);
     if (!parsed.success) throw new ToolArgError(name, parsed.error.issues);
     return await reg.tool.execute(parsed.data);
   }

   export function listToolNames(): string[] {
     return Array.from(toolRegistry.keys());
   }
   ```

3. 创建 `src/ai/index.ts`:
   ```typescript
   export * from './registry';
   export * from './tools/task';
   export * from './tools/product';
   export * from './tools/schedule';
   export * from './tools/workspace';
   export * from './tools/rnd';
   ```
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    zod 安装,registry.ts ~150 LOC,工具签名 (Tool<T> / registerTool / executeTool / toolsToSchemas) 暴露。toolRegistry Map 就绪等待 tools 注册。
  </done>
</task>

<task type="auto">
  <name>Task 2: 注册 12 个 tools (5 个 domain 文件)</name>
  <files>src/ai/tools/task.ts, src/ai/tools/product.ts, src/ai/tools/schedule.ts, src/ai/tools/workspace.ts, src/ai/tools/rnd.ts</files>
  <read_first>
    - src/stores/taskStore.ts (addTask / completeTask / updateTask signatures)
    - src/stores/productStore.ts (products array)
    - src/stores/scheduleStore.ts (addEvent signature)
    - src/stores/workspaceStore.ts
    - src/stores/rndStore.ts (deliverables structure)
    - src/ai/registry.ts (Task 1 完成后,Tool<T> 接口)
  </read_first>
  <behavior>
    - 每个 tool 文件:import { registerTool } from '../registry'; import stores; 在 module top-level 调用 registerTool(...)
    - task.ts (4 tools):
      - createTask: schema { title: string, priority?: 'high'|'medium'|'low'='medium', deadline?: string, description?: string, categoryId?: string } → useTaskStore.getState().addTask({ id: crypto.randomUUID(), title, priority, deadline: deadline ?? '', description: description ?? '', project: '', assignee: '我', assigneeAvatar: '', status: '未开始', time: '', aiSuggestions: [] }, categoryId) → return { taskId }
      - listTasks: schema { projectId?: string, status?: string, priority?: string } → 读 useTaskStore.getState().categories,flat map tasks,按 filter 筛选,return [{id, title, status, priority, deadline, project}]
      - completeTask: schema { taskId: string } → useTaskStore.getState().completeTask(taskId)
      - updateTaskStatus: schema { taskId: string, status: '未开始'|'进行中'|'已完成' } → useTaskStore.getState().updateTask(taskId, { status })
    - product.ts (2 tools):
      - listProducts: schema {} → useProductStore.getState().products.map(p => ({ id, name, tagline, stage }))
      - getProductDetails: schema { productId: string } → 找 product,return { ...product (or subset) }
    - schedule.ts (2 tools):
      - createScheduleEvent: schema { title: string, date: string, time?: string, type?: string, location?: string } → date 字符串 YYYY-MM-DD,内部转 number (day-of-month) 兼容 v0.1.0 scheduleStore → useScheduleStore.getState().addEvent({ id: crypto.randomUUID(), title, date: dayNumber, time: time ?? '', type: type ?? 'meeting', location: location ?? '' }) — 注释 TODO Phase 6 完成后改回 string date
      - listScheduleEvents: schema {} → useScheduleStore.getState().events (转回 YYYY-MM-DD 字符串 format)
    - workspace.ts (1 tool):
      - listWorkspaceFiles: schema { workspaceId?: string } → useWorkspaceStore.getState() 调用 (signature 视实际 store)
    - rnd.ts (1 tool):
      - getRndDeliverables: schema { productId: string } → useRndStore.getState().deliverables[productId]
    - 共 10 tools (≤ 12 目标内,Phase 10 再扩展 updateTask/deleteTask/moveTask/rescheduleTask 等)
  </behavior>
  <action>
1. 创建 `src/ai/tools/task.ts`:
   ```typescript
   import { z } from 'zod';
   import { registerTool } from '../registry';
   import { useTaskStore } from '@/src/stores/taskStore';

   registerTool({
     name: 'createTask',
     description: 'Create a new task in the task board. Returns the new task id.',
     schema: z.object({
       title: z.string().min(1).describe('Task title'),
       priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
       deadline: z.string().optional().describe('YYYY-MM-DD'),
       description: z.string().optional(),
       categoryId: z.string().optional(),
     }),
     execute: async (args) => {
       const id = crypto.randomUUID();
       useTaskStore.getState().addTask({
         id,
         title: args.title,
         priority: args.priority,
         deadline: args.deadline ?? '',
         description: args.description ?? '',
         project: '',
         assignee: '我',
         assigneeAvatar: '',
         status: '未开始',
         time: '',
         aiSuggestions: [],
       }, args.categoryId);
       return { taskId: id };
     },
   });

   registerTool({
     name: 'listTasks',
     description: 'List tasks, optionally filtered by projectId/status/priority. Returns flat list (top 50).',
     schema: z.object({
       projectId: z.string().optional(),
       status: z.string().optional(),
       priority: z.enum(['high', 'medium', 'low']).optional(),
     }),
     execute: (args) => {
       const cats = useTaskStore.getState().categories;
       let tasks = cats.flatMap((c) => c.tasks);
       if (args.projectId) tasks = tasks.filter((t) => t.projectId === args.projectId);
       if (args.status) tasks = tasks.filter((t) => t.status === args.status);
       if (args.priority) tasks = tasks.filter((t) => t.priority === args.priority);
       return tasks.slice(0, 50).map((t) => ({
         id: t.id, title: t.title, status: t.status, priority: t.priority,
         deadline: t.deadline, project: t.project, projectId: t.projectId,
       }));
     },
   });

   registerTool({
     name: 'completeTask',
     description: 'Mark a task as completed by id.',
     schema: z.object({ taskId: z.string() }),
     execute: (args) => {
       useTaskStore.getState().completeTask(args.taskId);
       return { ok: true };
     },
   });

   registerTool({
     name: 'updateTaskStatus',
     description: 'Update task status. Use completeTask for marking completed.',
     schema: z.object({
       taskId: z.string(),
       status: z.enum(['未开始', '进行中', '已完成']),
     }),
     execute: (args) => {
       useTaskStore.getState().updateTask(args.taskId, { status: args.status });
       return { ok: true };
     },
   });
   ```

2. 创建 `src/ai/tools/product.ts`:
   ```typescript
   import { z } from 'zod';
   import { registerTool } from '../registry';
   import { useProductStore } from '@/src/stores/productStore';

   registerTool({
     name: 'listProducts',
     description: 'List all products. Returns array of {id, name, tagline, stage}.',
     schema: z.object({}),
     execute: () => {
       return useProductStore.getState().products.map((p) => ({
         id: p.id, name: p.name, tagline: p.tagline, stage: p.stage,
       }));
     },
   });

   registerTool({
     name: 'getProductDetails',
     description: 'Get full product details by id, including milestones.',
     schema: z.object({ productId: z.string() }),
     execute: (args) => {
       const p = useProductStore.getState().products.find((x) => x.id === args.productId);
       if (!p) return { error: 'Product not found' };
       return {
         id: p.id, name: p.name, tagline: p.tagline, stage: p.stage,
         description: (p as any).description ?? '',
         milestones: (p as any).milestones ?? [],
       };
     },
   });
   ```

3. 创建 `src/ai/tools/schedule.ts`:
   ```typescript
   import { z } from 'zod';
   import { registerTool } from '../registry';
   import { useScheduleStore } from '@/src/stores/scheduleStore';

   // ponytail: Phase 6 未跑时,ScheduleEvent.date 是 number (day-of-month)。
   // tool schema 用 ISO YYYY-MM-DD string,execute 内部转 number。Phase 6 完成后这条转换删。
   function dateStringToDayNumber(dateStr: string): number {
     const parts = dateStr.split('-');
     const day = parseInt(parts[2] ?? '15', 10);
     return isNaN(day) ? 15 : day;
   }
   function dayNumberToDateString(day: number, month?: number, year?: number): string {
     const now = new Date();
     const m = month ?? now.getMonth() + 1;
     const y = year ?? now.getFullYear();
     return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
   }

   registerTool({
     name: 'createScheduleEvent',
     description: 'Create a new schedule event. date as YYYY-MM-DD string.',
     schema: z.object({
       title: z.string().min(1),
       date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
       time: z.string().optional(),
       type: z.string().optional(),
       location: z.string().optional(),
     }),
     execute: (args) => {
       const id = crypto.randomUUID();
       useScheduleStore.getState().addEvent({
         id,
         title: args.title,
         date: dateStringToDayNumber(args.date),
         time: args.time ?? '',
         type: args.type ?? 'meeting',
         location: args.location ?? '',
       });
       return { eventId: id };
     },
   });

   registerTool({
     name: 'listScheduleEvents',
     description: 'List all schedule events. date returned as YYYY-MM-DD.',
     schema: z.object({}),
     execute: () => {
       return useScheduleStore.getState().events.map((e) => ({
         id: e.id, title: e.title, date: dayNumberToDateString(e.date),
         time: e.time, type: e.type, location: e.location,
       }));
     },
   });
   ```

4. 创建 `src/ai/tools/workspace.ts`:
   ```typescript
   import { z } from 'zod';
   import { registerTool } from '../registry';
   import { useWorkspaceStore } from '@/src/stores/workspaceStore';

   registerTool({
     name: 'listWorkspaceFiles',
     description: 'List files in current or specified workspace.',
     schema: z.object({ workspaceId: z.string().optional() }),
     execute: (args) => {
       const state: any = useWorkspaceStore.getState();
       // ponytail: workspaceStore signature varies; be defensive
       const workspaces = state.workspaces ?? [];
       if (args.workspaceId) {
         const w = workspaces.find((x: any) => x.id === args.workspaceId);
         return w?.files ?? [];
       }
       return workspaces.flatMap((w: any) => w.files ?? []);
     },
   });
   ```

5. 创建 `src/ai/tools/rnd.ts`:
   ```typescript
   import { z } from 'zod';
   import { registerTool } from '../registry';
   import { useRndStore } from '@/src/stores/rndStore';

   registerTool({
     name: 'getRndDeliverables',
     description: 'List R&D deliverables for a product.',
     schema: z.object({ productId: z.string() }),
     execute: (args) => {
       const state: any = useRndStore.getState();
       const deliverables = state.deliverables?.[args.productId] ?? [];
       return deliverables.map((d: any) => ({
         id: d.id, code: d.code, title: d.title, status: d.status,
       }));
     },
   });
   ```

6. 编辑 `src/ai/index.ts` 在 export 之外加 side-effect import 确保 tools 注册到 registry:
   ```typescript
   // Side-effect imports — registering tools into the registry on first import
   import './tools/task';
   import './tools/product';
   import './tools/schedule';
   import './tools/workspace';
   import './tools/rnd';

   export * from './registry';
   ```

7. 写 1 个 smoke test:src/ai/__tests__/registry.test.ts — Ponytail 模式 (非 framework)
   实际上 Nova 没有 vitest,所以简化为 src/ai/__tests__/selfcheck.ts:
   ```typescript
   // Self-check: import registry + all tool files, then verify expected tool count.
   // Run via: npx tsx src/ai/__tests__/selfcheck.ts
   import '../index';
   import { toolRegistry } from '../registry';

   const expected = [
     'createTask', 'listTasks', 'completeTask', 'updateTaskStatus',
     'listProducts', 'getProductDetails',
     'createScheduleEvent', 'listScheduleEvents',
     'listWorkspaceFiles', 'getRndDeliverables',
   ];
   const missing = expected.filter((n) => !toolRegistry.has(n));
   if (missing.length > 0) {
     console.error('MISSING TOOLS:', missing);
     process.exit(1);
   }
   console.log('OK: all', expected.length, 'tools registered');
   ```
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint && npx tsx src/ai/__tests__/selfcheck.ts</automated>
  </verify>
  <done>
    10 个 tools 注册到 toolRegistry,覆盖 task/product/schedule/workspace/rnd 5 个 domain。selfcheck 通过 (10/10)。Plan 04/05 可直接 import '@/src/ai' 使用。
  </done>
</task>

</tasks>

<verification>
- `npm run lint` 通过
- `npx tsx src/ai/__tests__/selfcheck.ts` 输出 "OK: all 10 tools registered"
- grep 验证: src/ai/registry.ts 包含 `export const toolRegistry` + `export async function executeTool`
- grep 验证: 5 个 tool 文件每个都 import registerTool 并调用至少 1 次
- grep 验证: src/ai/index.ts side-effect import './tools/*' 确保注册
</verification>

<success_criteria>
1. Hand-rolled tool registry ~150-200 LOC (registry.ts),无 langchain/llamaindex 依赖 (D-02 ✓) (AI-01 ✓)
2. Tool schema 用 Zod 定义 (D-03) (AI-01 ✓)
3. 10 个基础 tools 覆盖 task/product/schedule/workspace/rnd 5 domain (AI-04 ✓,目标 10-15 内)
4. Tool 实现 = Zustand store action 调用 (D-04) (AI-04 ✓)
5. executeTool 失败时抛 ToolArgError,Plan 04 tool loop 可捕获并让 LLM 修正 (AI-09 错误处理基础)
6. toolsToSchemas() 暴露 JSON Schema array 供 chatWithTools 调用
</success_criteria>

<output>
After completion, create `.planning/phases/9-ai/9-03-SUMMARY.md`
</output>
