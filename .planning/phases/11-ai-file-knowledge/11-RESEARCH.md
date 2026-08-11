# Phase 11: AI 文件 + 知识库 - Research

**Research date:** 2026-08-10
**Scope:** `.planning/PROJECT.md`, `.planning/ROADMAP.md`, Phase 8/9/10 contexts and current source models/entry points
**Write scope:** This research only adds Phase 11 planning context; product code, package files, Rust and other phase files are unchanged.

## Executive Conclusion

Phase 11 的业务方向是明确的，但当前仓库还没有可直接执行的 Phase 9 AI Tool Use 基础，也没有完成 Phase 8 的知识编辑器闭环。当前可复用的真实能力是 Zustand + SQLite 持久化的工作区、产品知识、产品文档和研发交付物模型，以及仍在使用的旧 Express AI 端点。

最小可交付应以“索引元数据/摘要读取 -> AI 候选内容 -> 用户确认 -> store 写回 -> 重启验证”为边界。工作区文件应以 `Workspace.files` 为 canonical 输入；产品知识应以 `rndStore.knowledgeBase` 为 canonical 写入目标。全局 `KnowledgeBaseView` 的硬编码文档、`LocalIndexedFile` 的真实文件读取、产品文档覆盖写入和向量检索都不能在没有额外决策的情况下纳入闭环。

## Planning Inputs

### Roadmap and user constraint

`.planning/ROADMAP.md` 将 Phase 11 定义为：

- `listWorkspaceFiles`、`readKnowledgeArticle`、`writeKnowledgeArticle` Tool 扩展；
- workspace 文件摘要；
- 知识库文章生成/润色；
- 产品文档辅助；
- 将 `generateDeliverableAI` 升级为 Tool Use；
- 知识组织。

Phase 8/9/10 被定义为前置序列依赖，且用户要求 Phase 7 到 Phase 11 全部完成后统一 UAT。因此，本研究不将已有计划文件中的 success criteria 当成已经运行的功能；工作区中并行出现的 Phase 8 编辑器文件也只作为当前源码事实记录，不作为 Phase 8 已完成证据。

### Existing phase contracts

| Dependency | Planned contract | Current source evidence | Phase 11 consequence |
|---|---|---|---|
| Phase 8 | `MarkdownEditor` with `value/onChange/readOnly/className/placeholder`; ProductKnowledgeTab and KnowledgeBaseView edit paths | Current snapshot contains lazy `MarkdownEditor` + inner implementation and barrel export; ProductKnowledgeTab still uses Textarea; global view is hardcoded | Editor component exists, but integration and runtime/bundle/Tailwind evidence still gate article UI |
| Phase 9 | `src/ai` registry, Zod schemas, `chatWithTools`, `runToolLoop`, common tool trace | No `src/ai` directory or chat adapter; `api.ts` only has project generation adapter | Must extend Phase 9 registry, never create a second loop |
| Phase 10 | Multi-turn, confirmation and task/schedule tool loop behavior | Only planning artifacts are present for the AI layer | Reuse the final Phase 9/10 runtime confirmation state, not prompt-only assumptions |

## Source Evidence Inventory

### 1. KnowledgeBaseView is a static viewer

`src/views/KnowledgeBaseView.tsx:9-28` defines three folders and three documents directly in module constants. The selected document is local React state (`:30-33`). The viewer prints raw text with `whitespace-pre-wrap` (`:130-135`). The header contains an “编辑” button but no handler (`:124-127`).

Implications:

- This view has no productId, articleId, store selector, save action or persistence boundary.
- A Phase 11 tool cannot safely write to it without first introducing a new persisted global knowledge model.
- It can remain a read-only legacy surface while product-level AI knowledge uses `ProductKnowledgeTab`, or the main agent can explicitly expand scope.

### 2. ProductKnowledgeTab is the existing editable knowledge path

`src/components/product/ProductKnowledgeTab.tsx:43-64` obtains product knowledge and maintains selected/edit/create/polish state through `useApp()`. Existing operations are visible at `:82-134`:

- edit loads title/category/content/tags;
- save calls `updateKnowledgeItem(product.id, selectedItem.id, ...)`;
- create calls `addKnowledgeItem(product.id, ...)`;
- AI polish calls `polishKnowledgeArticleAI(product.id, selectedItem.id, action)`.

The current editor body and creation modal still use `Textarea` (`:323-346`, `:435-442`). The read view uses `ReactMarkdown` (`:357-360`). AI polish action buttons are already present (`:281-300`).

Implications:

- The store actions are sufficient for a first product-knowledge write tool.
- Phase 11 should feed candidate text into the existing edit state/preview, then confirm and call the store action.
- Phase 8 must replace the editor control before the final Markdown UX is considered complete.

### 3. `rndStore` contains durable product knowledge and deliverables

The type definitions in `src/data/mockRndData.ts:72-84` define `ProductKnowledgeItem`; `:159-175` define `FullLifecycleDeliverable`. The store actions are declared in `src/stores/rndStore.ts:98-103` and `:124-128`.

The implementation shows:

- `getKnowledgeForProduct` is product-scoped (`src/stores/rndStore.ts:298-304`);
- `addKnowledgeItem`, `updateKnowledgeItem`, and `deleteKnowledgeItem` mutate only `knowledgeBase[productId]` (`:306-325`);
- `polishKnowledgeArticleAI` posts title/content/action to the legacy endpoint and falls back to appending text when the call fails (`:327-342`);
- `generateDeliverableAI` marks a deliverable `generating`, calls the legacy endpoint, then stores returned content/status (`:468-493`);
- `syncDeliverableToDocs` maps a deliverable into a `ProductDocument` using `addProductDocument` (`:510-524`);
- SQLite persist includes `knowledgeBase` and `deliverables` (`:563-580`).

Implications:

- A Tool Use implementation can wrap existing actions without inventing another database.
- The existing async deliverable action currently returns `Promise<void>`; a tool must read the target back after the action if it needs to return content/status to the AI/UI.
- The fallback behavior is not proof of real AI generation and should be labeled in UAT evidence.

### 4. Workspace store is an index, not a file reader

`src/stores/workspaceStore.ts:5-37` defines `WorkspaceFile`, `Workspace`, and `LocalIndexedFile`. Seed data at `:39-107` demonstrates the distinction:

- `Workspace.files` has `contentSnippet` for two core files;
- `LocalIndexedFile` has `fullPath`, extension and associated application but no content;
- both can contain Windows paths and mocked/seed metadata.

Store actions at `src/stores/workspaceStore.ts:109-155` are limited to workspace CRUD, replacing workspace/file arrays and adding an indexed file. Persistence is configured at `:157-173` with SQLite storage, `nova-workspace`, version 1.

`FileArchiveView` confirms the UI boundary:

- workspaces and local index are separate tabs (`src/views/FileArchiveView.tsx:197-220`);
- workspace search uses name and optional `contentSnippet` (`:84-92`);
- local file search uses name/folder/extension/app (`:94-105`);
- locating a local file only copies its path (`:125-133`), and converting an index folder into a workspace fabricates a snippet from the path (`:135-141`).

Implications:

- `listWorkspaceFiles` can be honest and useful with current data if it returns bounded snippets.
- A local-index tool must not claim to summarize the file contents.
- No Phase 11 tool should call Node `fs` or write to `fullPath` without a separate security and parser design.

### 5. Existing workspace summary already defines a migration seam

`src/components/WorkspaceSummaryModal.tsx:15-56` uses `workspace.summary`, posts `workspace.files` plus project/task context to `/api/summarize-workspace`, and writes the returned summary back with `updateWorkspace(workspace.id, { summary: data.summary })`. The modal reloads a saved summary (`:17-18`, `:58-62`) and renders it as Markdown (`:155-160`).

`server.ts:116-181` implements the matching legacy endpoint. It builds the prompt only from the files' `name/type/contentSnippet` and project progress/task count, then returns Markdown or a fallback. It does not read the filesystem.

Implications:

- The existing summary UX can be adapted to a Tool Use result with minimal domain change.
- Existing automatic save-on-generation is a confirmation-policy decision: Phase 11 should not silently preserve this behavior when AI writes become chat tools.
- The old endpoint is an implementation seam, not evidence that Phase 9's common chat/tool contract exists.

### 6. Product documents have append-only support

`src/data/mockProducts.ts:13-23` defines `ProductDocument`. `src/stores/productStore.ts:24-26` exposes only `addProductDocument`; implementation at `:65-71` prepends a document to `product.documents` but does not update or delete an existing document.

`src/stores/rndStore.ts:510-524` uses this action when syncing a ready deliverable. Therefore:

- product-document AI assistance can safely produce a draft or add a new explicitly titled document;
- overwrite semantics require a new action and a separate approval decision;
- Phase 11 should not infer update capability from `syncDeliverableToDocs`.

### 7. Current API/server boundary is legacy and asymmetric

`src/lib/api.ts:52-109` exposes only `streamGenerateProject`, with Tauri `invoke('generate_project')` and web `fetch('/api/generate-project')` branches. There is no `chatWithTools` type or function in the current file.

`server.ts` currently contains:

- `/api/generate-project` (`:16-114`);
- `/api/summarize-workspace` (`:116-181`);
- `/api/workspace-files` mock list (`:183-194`);
- `/api/rnd/generate-deliverable` (`:196-228`);
- `/api/rnd/polish-knowledge-article` (`:230-260`).

The Phase 9 plan proposes a common `/api/chat` web fallback and Tauri `chat` command, but that is not current runtime evidence. Phase 11 must use whatever Phase 9 actually delivers and test both desktop and web fallback branches where applicable.

## Proposed End-to-End Flow

```text
User request
  -> Phase 9 ChatPanel / runToolLoop
  -> Phase 9 registry (Zod validation + tool trace)
  -> Phase 11 read tool
       -> workspaceStore or rndStore read
  -> LLM candidate summary/article/deliverable
  -> preview + explicit confirmation
  -> Phase 11 write tool or existing store action
  -> Zustand state + SQLite persist
  -> Markdown/UI view
```

For workspace summary, the write target is `Workspace.summary`. For product knowledge, the write target is `rndStore.knowledgeBase[productId]`. For product documents, the default terminal state is a draft unless the new-document action is explicitly approved.

## Dependency Acceptance Gates

Before writing Phase 11 execution plans, the main agent should collect evidence for:

1. Phase 7 cross-store links survive reload and the unified UAT order remains 7 -> 8 -> 9 -> 10 -> 11.
2. Phase 8 `MarkdownEditor` is present, exported and wired into the two intended edit surfaces; its bundle/Tailwind evidence is available.
3. Phase 9 registry and tool loop are present at the actual paths, with one smoke test proving `toolsToSchemas -> chatWithTools -> tool_call -> executeTool -> result`.
4. Phase 10 confirmation/multi-turn behavior is available to Phase 11 rather than reimplemented locally.
5. SQLite hydration is complete before any Phase 11 tool reads stores; no tool should operate on seed state during hydration.

## Risks

| Severity | Finding | Why it matters | Evidence/mitigation |
|---|---|---|---|
| P0 | AI foundation is absent from current source | Phase 11 cannot run without a shared transport/loop | `src/ai` and `chatWithTools` absent; gate on Phase 9 runtime proof |
| P1 | Two knowledge stores have different persistence semantics | Writing to hardcoded global docs would appear successful but vanish | Use `rndStore.knowledgeBase`; treat `KnowledgeBaseView` as legacy until modeled |
| P1 | File index has no content reader | LLM could hallucinate full-document analysis from names/snippets | Bound output and label source; no disk access |
| P1 | Unconfirmed AI write can change durable state | Candidate generation and persistence are distinct actions | Confirmation token/state enforced in executor |
| P1 | ProductKnowledge category mismatch | AI writes can fail type checks or produce UI-only categories | Normalize or approve union expansion before implementation |
| P1 | Legacy endpoint retirement can break current UI | Existing summary/polish/deliverable paths call direct endpoints | Compatibility test before removing/adapting routes |
| P2 | ProductDocument is append-only | “润色产品文档” can accidentally imply overwrite | Draft-only default or approve new update action |
| P2 | Existing fallback text is synthetic | UAT may incorrectly claim provider-backed AI success | Record provider, endpoint, and fallback branch in evidence |

## Verification Matrix

| Area | Evidence | Pass condition |
|---|---|---|
| Registry contract | Static import/self-check | All Phase 11 tools are registered once and expose JSON schemas |
| Workspace read | Tool trace + returned JSON | Correct workspace scope, snippets bounded, no file read claim |
| Workspace summary | UI + `Workspace.summary` before/after | Candidate visible, save requires confirmation, restart retains it |
| Article read/write | Tool trace + `rndStore.knowledgeBase` snapshot | Read is product/item scoped; write creates/updates only after confirmation |
| Markdown UX | Phase 8 editor runtime | Saved Markdown renders; cancel does not mutate original |
| Deliverable | Store status trace | `generating`/`ready` transitions and content are visible; failure is reported |
| Product scope | Cross-product negative case | Invalid/mismatched IDs do not leak or mutate other products |
| Transport | Desktop IPC and web fallback smoke | Same tool loop semantics; errors are humanized and no secret enters bundle |
| Persistence | Restart/re-hydration | Workspace summary, article and deliverable state survive |
| Unified UAT | Phase 7-11 end-to-end run | No per-phase sign-off is treated as final; all cross-module paths pass together |

## Research-Based Plan Shape

The eventual Phase 11 plans should be small and sequential:

1. Establish the Phase 9/10 dependency gate and exact runtime paths; add no new architecture if the gate passes.
2. Add scoped read tools and bounded result serializers for workspace files and product knowledge.
3. Add candidate/confirmation state and the product knowledge write tool; connect to the Phase 8 editor.
4. Register deliverable generation and product-document assistance with explicit draft/write boundaries.
5. Execute focused automated checks, then defer the combined 7-11 UAT checkpoint until all requested phases are implemented.

## Decisions Still Required

- Canonical global knowledge model versus product-only minimum target.
- Auto-save versus explicit “save summary” action for workspace summaries.
- Whether local indexed files may ever be content-read by AI.
- Whether product documents gain update semantics in this phase.
- Category normalization policy for AI-generated knowledge articles.
- Whether replacing the four legacy direct AI endpoints is part of Phase 11 or remains Phase 9/10 compatibility work.

---

*Phase: 11-ai-file-knowledge*
*Research based on current source and planning artifacts; no product code modified*
