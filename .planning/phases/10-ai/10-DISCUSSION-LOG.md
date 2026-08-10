# Phase 10 Discussion Log

**Date:** 2026-08-10  
**Topic:** AI 架构决策 — Phase 10 基础 Tool Use 架构  
**Duration:** ~60 min (6 areas discussed)  
**Outcome:** 22 decisions locked (D-01 through D-22)

---

## Context

User triggered `/gsd:discuss-phase` with argument "与我讨论一下0.2 阶段的 AI 相关内容。通过什么架构实现ai 功能。" — mapped to Phase 10 (first AI phase in v0.2.0 roadmap).

**Critical product positioning revealed mid-discussion:** Nova is primarily a **commercial PM productivity tool** targeting product managers. Resume/portfolio value is Plan B only if commercialization fails. This fundamentally shaped architecture choices — commercial stability > framework buzzwords.

---

## Area A: Tool Use 实现位置

### Question
Tool execution loop 放在 JS (webview) 还是 Rust (Tauri backend)?

### Options Considered
- **A1: JS-side in webview** — hand-rolled tool loop (~200 LOC), tools call Zustand store actions directly
- **A2: Rust-side via GraphFlow** — use Rust workflow engine, tools as Rust functions
- **A3: Hybrid** — Rust handles LLM calls, JS handles tool execution
- **A4: Full framework** — LangGraph.js / Vercel AI SDK / Claude Agent SDK

### User Clarifications
1. "讨论一下 js side 从生态角度 和运行效率角度 有什么好处。rust 有什么好处" — wanted efficiency/ecosystem tradeoff analysis
2. "如何实现JS side。目前的tauri 架构,是否意味着 需要引入bun 作为 js 运行时。" — concerned about JS runtime dependency
3. "如果在js side 跑 是否会阻断UI进程,是否意味着可以使用 langgraph js 这类框架?" — concerned about UI blocking + framework viability

### Resolution
- **Selected: A1 (JS-side hand-rolled)** + A3 hybrid clarification
- Rust = LLM passthrough + system interaction (keychain, file I/O)
- JS = tool registry + tool loop + tool execution (calls Zustand stores)
- Webview already has full JS runtime (V8/JavaScriptCore) — no Bun/Node needed
- Tool execution is async I/O + <1ms store mutations — won't block UI
- **Rationale:** Commercial product needs control + minimal dependencies. Hand-rolled ~200 LOC vs LangGraph.js (heavy, breaking changes, webview compatibility uncertain).

### Decisions Locked
- D-01: Tool loop in JS (webview React app)
- D-02: Hand-rolled tool registry + loop, no framework dependency
- D-03: Tool schema in Zod (TS), JSON Schema passed to Rust LLM call
- D-04: Tool implementation = Zustand store action calls
- D-05: Rust = LLM passthrough + system interaction only

---

## Area B: GraphFlow 处理

### Question
GraphFlow (Rust workflow engine, pre-1.0) 是否在 Phase 10 引入?

### Options Considered
- **B1: Introduce GraphFlow in Phase 10** — use for tool orchestration, HITL prep
- **B2: Defer to v0.3+** — maintain v0.1.0 Phase 4 decision, evaluate maturity later
- **B3: Use LangGraph.js instead** — JS-native, more mature ecosystem

### User Clarifications
- "为什么会推荐使用vercel ai sdk。之前我用过claude code sdk 是否可行。如果面向 面试的简历项目。是否需要迎合大众,使用 langgraph js?" — asked about framework alternatives for resume value
- **Critical:** "首先,定位是生产力工具。面向产品经理的生产力工具。其次才是需要迎合面试市场。我想基于该项目做商业化,只有当商业化进行不下去的时候,才会用来包装简历。" — revealed commercial-first positioning

### Resolution
- **Selected: B2 (Defer GraphFlow to v0.3+)**
- LangGraph.js rejected (same problem: heavy framework, LangChain ecosystem breaking changes)
- Claude Agent SDK rejected (Anthropic lock-in, conflicts with multi-provider)
- Vercel AI SDK rejected (Next.js assumptions, extra dependency layer)
- **Rationale:** Commercial product needs stability. Pre-1.0 crates (GraphFlow) and heavy frameworks (LangGraph.js) are liabilities. Resume story: "I built a commercial PM product, hand-rolled tool loop, served real users" > "I used LangGraph."

### Decisions Locked
- D-06: GraphFlow deferred to v0.3+ (maintain v0.1.0 Phase 4 decision)
- D-07: Phase 10 tool loop designed to be "GraphFlow-node-wrapable" (registry is Map, not framework)
- D-08: v0.3+ evaluate GraphFlow maturity; if still pre-1.0, continue hand-rolled

---

## Area C: 上下文注入策略

### Question
How much context to inject into every LLM call?

### Options Considered
- **C1: All stores (full dump)** — ~10,000+ tokens, complete but expensive
- **C2: Selected product only** — minimal, ~200 tokens, but too narrow
- **C3: Current tab context** — dynamic based on active view, ~500 tokens
- **C4: Smart summary** — LLM-generated context summary, requires pre-processing
- **C5: Hybrid core + on-demand** — core ~500-1000 tokens (selected product + active tasks + upcoming events), extend via tools

### Resolution
- **Selected: C5 (Hybrid core + on-demand)**
- Core context (always injected):
  - Selected product (name, tagline, stage)
  - Active tasks of selected product (top 10: title, status, priority, due date)
  - Upcoming events (next 7 days, top 5: title, date, type)
  - User preferences (theme, working hours)
- On-demand via tools:
  - `listAllTasks(filter?)` — cross-product task query
  - `listProducts()` — all products overview
  - `getProductDetails(productId)` — deep dive into product
  - `searchKnowledgeBase(query)` — knowledge retrieval (v0.3+ with LanceDB)
  - `getRndDeliverables(productId)` — R&D deliverables
  - `listWorkspaceFiles()` — file workspace
- **Rationale:** Cost control is critical for commercialization. 500-1000 tokens vs 10,000+ → 10x LLM cost reduction. Faster response too.

### Decisions Locked
- D-09: Hybrid core + on-demand context strategy
- D-10: Core context ~500-1000 tokens (selected product + active tasks + upcoming events + preferences)
- D-11: On-demand context via tools (listAllTasks, listProducts, getProductDetails, etc.)

---

## Area D: Provider 策略

### Question
Single provider (DeepSeek) or multi-provider from day 1?

### Options Considered
- **D1: Single provider (DeepSeek)** — match current v0.1.0 setup, simpler
- **D2: Multi-provider from day 1** — support DeepSeek/Claude/GPT/Gemini/Ollama via rig-core

### Resolution
- **Selected: D2 (Multi-provider from day 1)**
- rig-core 0.41 already supports multi-provider abstraction
- Settings UI will have provider selector + API key per provider
- Rust `llm.rs` extended to be provider-agnostic
- **Rationale:** Commercial product must support BYOK (Bring Your Own Key) + cost optimization. rig-core already has the abstraction, engineering effort is minimal.

### Decisions Locked
- D-12: Multi-provider from day 1, reuse rig-core capabilities
- D-13: Default DeepSeek V4 Flash (v0.1.0 UAT Issue #6), but user can switch in Settings
- D-14: Settings UI: provider selector + API key per provider
- D-15: Rust `llm.rs` extended to provider-agnostic (trait-based or enum dispatch)

---

## Area E: Chat UI 形态

### Question
What chat interaction forms to support?

### Options Considered
- **E1: Slide-out panel only** — right-side panel, ⌘K or icon to invoke
- **E2: ⌘K command palette only** — quick commands (create task, jump to product, etc.)
- **E3: Full-page AgentWorkspace only** — upgrade existing view
- **E4: All three forms** — slide-out (primary) + ⌘K + full-page for long conversations

### Resolution
- **Selected: E4 (All three, Phase 10 delivers first two)**
- Long-term goal:
  1. **Slide-out panel (primary)** — right-side, ⌘K or icon, follows industry standard (Cursor/Claude Desktop/Notion AI/Linear)
  2. **⌘K command palette** — quick commands, also triggers AI conversation (Raycast-style)
  3. **AgentWorkspaceView (existing)** — upgrade to real AI, "long conversation" entry
- Phase 10 delivers: slide-out + ⌘K
- Phase 11/12: upgrade AgentWorkspaceView
- **Rationale:** PM workflow is "look at task board + ask AI" — slide-out doesn't interrupt context. Three forms cover different use cases.

### Decisions Locked
- D-16: Three chat forms long-term; Phase 10 delivers first two
- D-17: Slide-out panel is primary interaction (industry standard pattern)
- D-18: ⌘K triggers both command palette and AI conversation (Raycast-style)

---

## Area F: Express 端点未来

### Question
What to do with the 5 Express AI endpoints (generate-project, summarize-workspace, workspace-files, rnd/generate-deliverable, rnd/polish-knowledge-article)?

### Options Considered
- **F1: Keep Express as-is** — maintain both Express + Rust LLM paths
- **F2: Delete Express entirely** — all AI goes through Rust
- **F3: Simplify Express to dev/web mode only** — keep for Vite HMR + web fallback

### Resolution
- **Selected: F3 (Simplify Express to dev/web mode only)**
- Express simplified to:
  - Vite middleware (dev HMR)
  - Single `/api/chat` LLM proxy (web mode fallback — browsers can't expose API keys)
- Delete 5 old AI endpoints
- `npm run tauri:dev` and `npm run tauri:build` don't use Express
- v0.3+ decision point: if no web demand, delete Express entirely
- **Rationale:** Reduce maintenance burden, focus on desktop experience. Desktop-first is product strategy.

### Decisions Locked
- D-19: Express simplified to dev/web mode only
- D-20: Delete 5 old AI endpoints
- D-21: `npm run tauri:dev` and `npm run tauri:build` don't use Express
- D-22: v0.3+ decision: if no web demand, delete Express entirely

---

## Rejected Alternatives Summary

| Framework | Why Rejected |
|-----------|--------------|
| **LangGraph.js** | Heavy dependency, LangChain ecosystem breaking changes, webview compatibility uncertain, resume buzzword ≠ commercial value |
| **Claude Agent SDK** | Anthropic lock-in, conflicts with multi-provider strategy |
| **Vercel AI SDK** | Next.js assumptions, extra dependency layer for Tauri IPC adaptation |
| **GraphFlow (v0.2.0)** | Pre-1.0 + single author, commercial product risk too high |

---

## Claude's Discretion Areas

The following were left to Claude's discretion (not explicitly discussed):
- Tool registry file organization (single file vs domain-split)
- Slide-out panel animation/styling (follow tokens.css design system)
- ⌘K command list (derive from Phase 10 success criteria)
- Core context serialization format (compact JSON vs Markdown)
- Error handling layering (parameter error → AI retry 1x vs direct error)

These will be resolved during `/gsd:plan-phase 10`.

---

## Outcome

**22 decisions locked** across 6 areas (A-F).  
**CONTEXT.md generated:** `.planning/phases/10-ai/10-CONTEXT.md`  
**Next step:** `/gsd:plan-phase 10` — downstream agents read CONTEXT.md and produce implementation plan.

---

*Discussion completed: 2026-08-10*  
*Facilitator: Claude (discuss-phase workflow)*
