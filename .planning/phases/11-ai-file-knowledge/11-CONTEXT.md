# Phase 11: AI 文件 + 知识库 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning, pending Phase 7-10 implementation/UAT gates
**Mode:** Read-only source research

## Phase Boundary

Phase 11 的最小目标是把现有的工作区文件索引、产品知识条目和研发交付物接入 Phase 9 的 Tool Use 链路，让用户可以在已有 AI 对话入口中完成一条可审计闭环：

1. 选择或引用当前工作区/产品；
2. AI 读取受限的文件元数据与摘要，或读取一个明确的产品知识条目；
3. AI 生成工作区摘要、知识条目草稿/润色结果，或针对产品文档/交付物给出草稿；
4. 用户看到候选内容并明确确认；
5. 仅在确认后写回现有 Zustand store，并通过现有持久化恢复；
6. UI 在知识库/产品知识/交付物视图中能看到写回结果。

本 phase 不引入真实文件系统递归扫描、文件内容解析器、LanceDB/向量检索、自动发布、多人协作、任意路径写入，也不把全局硬编码知识库直接伪装成可持久化实体。Phase 7-11 完成后按用户要求统一 UAT；本 phase 文档不授权提前分 phase UAT。

## Current Facts

### 两套文件模型必须分开

- `WorkspaceFile` 是工作区内的内容索引模型，含 `id/name/type/size/updatedAt/path/contentSnippet?`；`Workspace` 还含 `folderPath/projectId?/projectName?/files/summary?`。
- `LocalIndexedFile` 是全局本地文件索引模型，含 `id/name/folder/fullPath/size/type/extension/updatedAt/associatedApp/isFavorite?`，没有内容摘要字段。
- 因此，文件摘要的最小实现应以 `Workspace.files` 为 AI 输入；`LocalIndexedFile` 只能做文件清单/位置提示，不能被描述为已读取了文件内容。
- 当前两个模型都由 `nova-workspace` Zustand persist 保存；`Workspace.summary` 已有持久化字段。

### 两套知识文档模型也必须分开

- `KnowledgeBaseView.tsx` 当前使用本地常量 `FOLDERS`/`DOCS`，文章标题和正文硬编码在 view 内；“编辑”按钮当前没有状态或保存行为。
- 产品知识库使用 `rndStore.knowledgeBase: Record<string, ProductKnowledgeItem[]>`，条目字段为 `id/productId/title/category/tags/author/updatedAt/readTime/summary/content/isPinned?`。
- 产品知识条目已有 `addKnowledgeItem`、`updateKnowledgeItem`、`deleteKnowledgeItem` 和 SQLite persist；`ProductKnowledgeTab` 已有编辑、创建、删除和 AI 润色入口。
- `ProductDocument` 是产品实体中的嵌套文档，字段包括 `id/title/category/version/author/updatedAt/wordCount/summary/content`。当前只有 `addProductDocument`，没有通用的 update/delete document action。
- `FullLifecycleDeliverable` 位于 `rndStore.deliverables[productId]`，有 `phase/code/title/format/status/content` 等字段；已有 `generateDeliverableAI(productId, code, customPrompt?)` 和 `syncDeliverableToDocs`。

## Minimum Deliverable

### M1: 受限工作区文件清单与摘要

- 新增 `listWorkspaceFiles` Tool，默认读取 `useWorkspaceStore.getState().workspaces`，可按 `workspaceId` 限定；返回工作区标识、关联项目和有上限的文件列表。
- AI 的工作区摘要只基于返回的 `WorkspaceFile` 元数据和 `contentSnippet`，并明确标注“索引摘要”而非文件全文分析。
- 摘要首版可复用现有 `Workspace.summary` 字段和现有工作区摘要展示；AI tool 默认只生成结果，保存摘要必须经过用户确认后调用现有 `updateWorkspace(workspaceId, { summary })`。
- 不把 `LocalIndexedFile.fullPath`、系统路径或未验证的本地文件内容发送给 LLM；如未来支持该模型，必须另立权限和读取契约。

### M2: 产品知识条目读、草稿、确认写回

- 新增 `readKnowledgeArticle` Tool，按 `productId + itemId` 读取单条产品知识；不存在时返回可解释错误，不返回其他产品的内容。
- 新增 `writeKnowledgeArticle` Tool，支持新建或更新产品知识条目，但执行前必须由 UI/对话层完成明确确认。工具不接受任意路径、不覆盖其他产品、不删除条目。
- AI 生成/润色的结果先以候选 Markdown 呈现；确认后才调用 `addKnowledgeItem` 或 `updateKnowledgeItem`。保存后验证 `rndStore` 和 SQLite rehydrate 均可读到同一内容。
- 该闭环的 canonical target 是 `rndStore.knowledgeBase`，不是当前硬编码的 `KnowledgeBaseView.DOCS`。全局知识库是否改造成持久化模型列为主代理决策，不在最小闭环中隐式解决。

### M3: 产品文档和 R&D 交付物辅助

- 复用 Phase 9 已有产品/交付物读取工具或等价 store 读取，给 AI 提供选定产品的文档、知识条目和交付物摘要，生成产品文档草稿或改进建议。
- 将现有 `generateDeliverableAI(productId, code, customPrompt?)` 注册到同一 Tool Use registry，保留现有 `productId/code/customPrompt` 契约和 `generating -> ready` 状态变化；工具结果应从 store 回读受限内容，而不是只返回“Ready”。
- 最小闭环只承诺“生成/增强候选内容 + 用户确认后写入已有实体”。由于 `ProductDocument` 当前没有 update action，自动覆盖既有产品文档不属于已锁定交付；新增文档是否开放为独立 write tool 需要主代理决定。

## Data Contracts

以下是 Phase 11 规划契约。它们是对现有字段和 Phase 9 Tool 接口的约束，不代表当前源码已经存在这些 tool。

### Tool result boundaries

```ts
// Current source model
type WorkspaceFile = {
  id: string;
  name: string;
  type: 'doc' | 'code' | 'sheet' | 'pdf' | 'design' | 'archive';
  size: string;
  updatedAt: string;
  path: string;
  contentSnippet?: string;
};

type ProductKnowledgeItem = {
  id: string;
  productId: string;
  title: string;
  category: string;
  tags: string[];
  author: string;
  updatedAt: string;
  readTime: string;
  summary: string;
  content: string;
  isPinned?: boolean;
};
```

```ts
// Phase 11 tool-level shape; exact Zod spelling is implementation detail
listWorkspaceFiles({ workspaceId?: string }): {
  workspaceId: string;
  workspaceName: string;
  folderPath: string;
  projectId?: string;
  files: Array<Pick<WorkspaceFile,
    'id' | 'name' | 'type' | 'size' | 'updatedAt' | 'contentSnippet'>>;
  truncated: boolean;
}

readKnowledgeArticle({ productId: string; itemId: string }): {
  article: ProductKnowledgeItem;
}

writeKnowledgeArticle({
  productId: string;
  itemId?: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  summary?: string;
  confirmationToken: string;
}): {
  articleId: string;
  operation: 'created' | 'updated';
}

generateDeliverable({
  productId: string;
  code: string;
  customPrompt?: string;
}): {
  productId: string;
  code: string;
  status: 'ready' | 'generating' | 'draft';
  content?: string;
}
```

Contract rules:

- Read results are bounded, product/workspace scoped, and must not include secrets or arbitrary full local paths unless the user explicitly requested path metadata.
- `writeKnowledgeArticle` is the only Phase 11 write tool proposed for the minimum knowledge loop. The confirmation requirement is a behavioral gate, not a prompt-only instruction; the execution layer must reject an unconfirmed write.
- The current store writes `updatedAt: '刚刚'` and generates IDs internally. The tool must not manufacture a second competing ID or timestamp convention.
- `ProductKnowledgeItem.category` currently has a type union that does not match all category values used by `ProductKnowledgeTab` (`业务规则`/`架构约束`/`踩坑指南` are cast through `any`). Phase 11 must either normalize to the existing union or explicitly expand the type before using AI-generated categories.

## Phase 8 Dependency

Phase 11 consumes the editor integration; it should not create a second editor or alter rendering-only `react-markdown` usage.

Expected Phase 8 interface from `08-CONTEXT.md`:

```ts
MarkdownEditor({
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
})
```

Required Phase 8 gate before Phase 11 implementation:

- `src/components/ui/MarkdownEditor.tsx` exists and the barrel export works;
- `ProductKnowledgeTab` uses it for edit/create content;
- `KnowledgeBaseView` has a real edit/save/cancel path, or is explicitly excluded from the persisted AI write flow;
- lazy loading and Tailwind v4 coexistence have evidence from the Phase 8 verification.

Current snapshot partially satisfies these gates: `src/components/ui/MarkdownEditor.tsx` and `MarkdownEditorInner.tsx` now exist and are exported, with lazy loading and the expected value/onChange/readOnly/placeholder/className surface. The integration gate is still open because `ProductKnowledgeTab` still renders `Textarea`, `KnowledgeBaseView` still renders hardcoded `DOCS` with an inert edit button, and bundle/Tailwind/runtime evidence has not been recorded in this read-only research.

## Phase 9 Dependency

Phase 11 must extend the same registry and tool loop. It must not create another chat transport, confirmation loop, provider abstraction, or tool schema mechanism.

The Phase 9 planning contract is:

- `src/ai/registry.ts`: `Tool`, `toolRegistry`, `registerTool`, `toolsToSchemas`, `executeTool`, `ToolArgError`;
- domain modules register tools at module load and expose them through `src/ai/index.ts`;
- `src/lib/api.ts`: `chatWithTools({ messages, tools, systemPrompt, provider, onToken?, onToolCall?, signal? })` returning `{ content, toolCalls }`;
- `src/ai/toolLoop.ts`: `runToolLoop(...)`, max iteration guard, Zod argument retry, tool start/end callbacks;
- write confirmation and UI preview must be represented in the loop/UI state, not only as an LLM prompt sentence.

Current source does not contain `src/ai`, `ChatPanel`, `CmdKPalette`, `chatWithTools`, or `toolRegistry`; the Phase 9 plans are therefore dependency specifications, not runtime evidence. Phase 11 planning/execution must begin with a Phase 9 artifact and smoke-test gate.

## Tool Boundary

### Allowed in the minimum phase

- Read `Workspace.files` and their existing `contentSnippet` values.
- Read one product knowledge item by explicit product and item identifiers.
- Read selected product documents/requirements/deliverables through existing store data or Phase 9 tools.
- Generate Markdown/text candidates through the existing AI transport.
- After explicit confirmation, add/update a product knowledge item and save a workspace summary through existing store actions.
- Invoke the existing deliverable generation action through the common registry.

### Explicitly out of scope

- Reading arbitrary `fullPath` values from disk, recursive directory traversal, or silently uploading files.
- Writing/deleting/renaming files on the host filesystem.
- Automatic publication or cross-product knowledge copying.
- Destructive knowledge deletion, bulk rewrites, or overwriting an existing article without confirmation.
- LanceDB/vector search, semantic indexing, embeddings, and claims of full-document semantic understanding.
- Replacing `KnowledgeBaseView`'s global hardcoded model without a separately approved data-model change.

## Risks and Mitigations

| Risk | Evidence | Planning response |
|---|---|---|
| Phase 9 is only planned, not present in source | No `src/ai` directory; `src/lib/api.ts` only exposes `streamGenerateProject` | Add a hard dependency gate; do not duplicate the registry/loop |
| Phase 8 editor/data flow is incomplete | `ProductKnowledgeTab` uses `Textarea`; `KnowledgeBaseView` uses constants | Require Phase 8 verification before article UAT; keep global KB out of the minimum persisted target |
| File metadata is mistaken for file content | `LocalIndexedFile` has no content field; `WorkspaceFile.contentSnippet` is optional | Label outputs as index-based; no full-content claims or disk reads |
| AI writes bypass human review | Existing store actions mutate immediately | Require confirmation token/state in the write execution path and show candidate diff/preview |
| Category contract drift | UI category options differ from `ProductKnowledgeItem` union | Decide normalization/union expansion before implementing write tool |
| Legacy endpoint divergence | `server.ts` still has `/api/summarize-workspace`, `/api/workspace-files`, `/api/rnd/generate-deliverable`, `/api/rnd/polish-knowledge-article` | Phase 11 uses Phase 9 `chatWithTools`; retire/adapt legacy routes only in their owning phase, with compatibility checks |
| Product document overwrite is unsupported | `productStore` exposes `addProductDocument` only | Keep product-document assistance draft-only unless a new write contract is approved |
| Persisted content is lost or cross-scoped | Stores use SQLite persist and productId maps | Verify before/after store snapshots and restart rehydrate for every write path |

## Validation Evidence Required

The final Phase 11 evidence should be collected only in the unified Phase 7-11 UAT, plus focused automated checks:

1. Static: TypeScript passes; every Phase 11 tool has a Zod schema, registry registration, scoped result and store-level test.
2. Tool trace: a workspace summary shows `listWorkspaceFiles` and bounded inputs; article generation shows `readKnowledgeArticle` before candidate output; write trace shows explicit confirmation before `writeKnowledgeArticle`.
3. Persistence: create/update a product knowledge item, reload/restart, and verify the same `productId/itemId/content`; save a workspace summary and reload it.
4. Scope: request another product/workspace by an invalid or mismatched ID and verify no unrelated content is returned or mutated.
5. UI: Phase 8 editor renders the saved Markdown, cancel leaves the original content intact, and the product/R&D views reflect deliverable status/content.
6. Legacy boundary: verify the desktop path uses the Phase 9 IPC/chat adapter and web fallback uses the single agreed chat endpoint; do not treat old direct endpoints as Phase 11 completion evidence.

## Open Decisions for Main Agent

1. Should Phase 11 canonicalize all AI-written knowledge to product-level `rndStore.knowledgeBase`, or should the global `KnowledgeBaseView` receive a new persisted store model first?
2. Should workspace summaries be auto-persisted after one confirmation, or remain chat-only with a separate “save summary” UI action?
3. Should `LocalIndexedFile` ever become an AI-readable source, and if so what explicit file-read permission/parser boundary is required?
4. Should product-document assistance be draft-only, or should Phase 11 add a separate `add/updateProductDocument` contract?
5. How should AI categories map to the current `ProductKnowledgeItem.category` union and the UI's broader category labels?
6. Is R&D deliverable generation in scope as a registered Tool only, or must this phase also replace the legacy direct endpoint and add a user confirmation/preview UX?
7. What exact Phase 9 runtime artifacts are accepted as the dependency gate before Phase 11 files are implemented?

---

*Phase: 11-ai-file-knowledge*
*Context gathered: 2026-08-10 (read-only source research)*
