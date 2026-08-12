import { z } from 'zod';

// Hand-rolled registry only: Zod owns schemas and validation, while this Map
// owns renderer-side registration and execution. No tool framework is needed.
export type JsonSchema = Record<string, unknown>;
export type Schema<T = unknown> = z.ZodType<T>;
export type SchemaIssue = z.ZodIssue;

export interface Tool<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: TSchema;
  execute: (args: z.infer<TSchema>) => Promise<unknown> | unknown;
}

export interface RegisteredTool {
  tool: Tool;
  jsonSchema: JsonSchema;
}

export const toolRegistry = new Map<string, RegisteredTool>();

export class ToolArgError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(
    public readonly toolName: string,
    public readonly zodIssues: z.ZodIssue[],
  ) {
    super(`Tool "${toolName}" arg validation failed: ${JSON.stringify(zodIssues)}`);
    this.name = 'ToolArgError';
    this.issues = zodIssues;
  }
}

function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema) as JsonSchema;
}

export function registerTool<TSchema extends z.ZodType>(tool: Tool<TSchema>): void {
  if (toolRegistry.has(tool.name)) {
    console.warn(`[tool-registry] overwriting existing tool "${tool.name}"`);
  }
  toolRegistry.set(tool.name, {
    tool: tool as Tool,
    jsonSchema: zodToJsonSchema(tool.schema),
  });
}

export function toolsToSchemas(names?: string[]): JsonSchema[] {
  const entries = names
    ? names.map((name) => toolRegistry.get(name)).filter(Boolean) as RegisteredTool[]
    : Array.from(toolRegistry.values());

  return entries.map(({ tool, jsonSchema }) => ({
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
  }));
}

/** OpenAI's wrapped function format, useful for providers that require it. */
export function toolsToOpenAI(names?: string[]): JsonSchema[] {
  return toolsToSchemas(names).map(({ name, description, parameters }) => ({
    type: 'function',
    function: { name, description, parameters },
  }));
}

export async function executeTool(name: string, args: unknown): Promise<unknown> {
  const registered = toolRegistry.get(name);
  if (!registered) throw new Error(`Unknown tool: ${name}`);

  // ponytail: providers can deliver `arguments: null` for parameterless tools
  // (DeepSeek streaming full ToolCall path, Ollama). z.object({}).safeParse(null)
  // fails — coerce to {} so listProducts/getCurrentContext/etc. don't loop.
  const normalized = args === null || args === undefined ? {} : args;
  // TEMP DIAGNOSTIC (Phase 9 real-UAT — remove once tool_call failures are resolved):
  console.log('[tool-exec]', name, 'raw args=', args, 'normalized=', normalized);
  const parsed = registered.tool.schema.safeParse(normalized);
  if (!parsed.success) {
    console.warn('[tool-exec] zod fail', name, parsed.error.issues);
    throw new ToolArgError(name, parsed.error.issues);
  }
  return registered.tool.execute(parsed.data);
}

export function listToolNames(): string[] {
  return Array.from(toolRegistry.keys());
}
