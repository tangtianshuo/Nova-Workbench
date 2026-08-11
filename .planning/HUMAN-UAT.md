# Unified Phase 7-11 UAT

Date: 2026-08-11
Workspace: `D:\Projects\Nova\nova-pm-workspace`
Mode: browser UAT with deterministic `/api/chat` mock, store/tool tests, and local Ollama provider UAT

## Evidence

- `npm run lint`: passed.
- `npm test`: 8/8 passed.
- AI focused tests: 17/17 passed, 33 tools registered.
- `NOVA_OLLAMA_MODEL=gemma4:e2b cargo test --manifest-path src-tauri/Cargo.toml llm::tests::ollama_real_tool_call_uat -- --ignored --nocapture`: passed; production Rust `chat_with_tools` returned `createTask` with the expected title, priority, and deadline.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 17 passed, 1 environment-dependent Ollama test ignored by default.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed; only pre-existing dead-code warning.
- `npm run build`: passed.
- `python scripts/uat_smoke.py` through `with_server.py`: passed with no console or page errors.
- The unified browser run includes an initial load followed by F5 reload; `console-errors: []` and `pageerror` remained empty.
- Screenshot: `C:\Users\10345\.codex\visualizations\2026\08\11\nova-pm-workspace-unified-uat.png`

## Results

### Phase 7: Cross-module

Passed in browser UAT:

- Task creation with product and deadline, task -> calendar arrangement, product/calendar badges.
- Calendar task/product association navigation.
- Task completion -> linked event completed styling and persisted status.
- Task deletion -> event remains and its `taskId` reverse link is cleared.
- Product detail stage progress and R&D deliverable linkage render.
- Product deletion confirmation -> product removed, schedule retained with `projectId` cleared, R&D records cleaned.

The focused UAT verifies the core integration path and local-storage persistence. The browser run also performs the explicit F5 persistence check. A separate human 35-step run covering every Phase 5/6 regression action remains a release-signoff recommendation, not an implementation blocker.

### Phase 8: MDXEditor

Passed in browser UAT:

- Product knowledge editor lazy-loads and accepts Markdown editing.
- Product knowledge save works.
- Knowledge base editor supports edit, cancel, and return to reader mode.
- No browser console/page errors were observed.

Known non-blocking build gap: `MarkdownEditorInner` is about 297 KB gzip, above the planned 250 KB target.

### Phase 9: AI foundation

Passed in browser UAT:

- Cmd-K opens and switches to AI conversation mode.
- ChatPanel opens at the intended slide-out surface.
- Deterministic mock `/api/chat` tool call creates a real Zustand task.
- Web settings expose Gemini boundary without reading or displaying a client API key.

Local provider UAT passed through the production Rust path with Ollama `gemma4:e2b` and a real `createTask` tool call. No DeepSeek, OpenAI, Anthropic, or Gemini key is configured in the environment, and no `.env` file is present, so cloud-provider-specific UAT remains unexecuted.

### Phase 10: AI task and schedule

Passed by focused tests:

- Advanced task and schedule tools, destructive confirmation contracts, date context, multi-turn session retention, association idempotency, dependency context, and product breakdown.

The real Ollama tool-call round trip is covered by the Rust UAT test. Date context, multi-turn planning, batch operations, and destructive confirmation are covered by focused tests and deterministic browser UAT; cloud-provider-specific model behavior remains unexecuted because no cloud credentials are configured.

### Phase 11: AI files and knowledge

Passed by focused tests and browser UAT:

- Bounded workspace/knowledge reads and lexical knowledge search.
- Product-scoped knowledge candidate generation.
- Candidate cancellation leaves the original article unchanged.
- Candidate confirmation writes the article after the strict-schema fix.
- Product PRD context remains draft-only and R&D deliverable reads real store-backed status/content.

Workspace/knowledge scope, candidate confirmation, and persistence are covered by focused tests and browser UAT. The local Ollama transport/tool-call path is verified; model-generated workspace summaries and article prose are not asserted against a cloud provider because no cloud credentials are configured.

## Fixes found during UAT

- Added accessible names to product knowledge edit/delete icon buttons.
- Removed nested `<button>` elements from task and schedule product selectors.
- Fixed knowledge candidate confirmation to omit the internal `operation` field rejected by the strict write schema.
- Fixed `HydrationGate` hook-order failure by making all six Zustand hydration selectors unconditional; startup and F5 reload now produce no React hook errors.

## Sign-off status

Phase 7-11 code plans and the unified UAT gate are complete for the available local and mock environments. A real Ollama tool-call UAT also passed without persisting credentials. Cloud-provider-specific UAT remains an explicit environment gap because no cloud keys are configured; it does not block the completed local milestone.
