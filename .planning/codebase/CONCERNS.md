# Codebase Concerns

**Analysis Date:** 2026-08-08

## Tech Debt

### Legacy AppContext Compatibility Layer (HIGH)
- Issue: `src/store/AppContext.tsx` is a 260-line React Context that re-exports all 6 Zustand stores. It was meant as a temporary bridge during migration (see header comment "This file will be removed once all views are migrated") but 30+ files still consume `useApp()` instead of stores directly. The provider subscribes to ~30 individual store selectors on every render, recreating the context value object each time (no `useMemo`).
- Files: `src/store/AppContext.tsx`; all consumers in `src/views/*`, `src/components/*` (30 files import `useApp`)
- Impact: Unnecessary re-renders across the whole tree on any state change (context value identity changes each render). Two parallel API surfaces (`useApp()` vs direct stores) means new contributors learn two patterns. Type definitions live in store files but are re-exported through AppContext, muddying ownership.
- Fix approach: Migrate one view at a time from `useApp()` to direct store hooks. Once the last consumer is gone, delete `AppContext.tsx` and the `AppProvider` wrapper in `src/App.tsx`. Group by store: `useTaskStore` first (smallest surface), then `useProductStore`, `useRndStore` last (largest). Track via grep for `useApp(`.

### Dark Mode Tokens Defined But Not Wired (MEDIUM — explicitly noted in CLAUDE.md as "Phase 7 technical debt")
- Issue: `src/styles/tokens.css` defines a complete `.dark` token set (lines 116-156), `src/hooks/useTheme.ts` toggles the `.dark` class on `<html>` and persists to `localStorage`, but no UI control invokes `useTheme()`. `src/views/SettingsView.tsx` has an "外观主题" (appearance) nav item that does not connect to the theme hook.
- Files: `src/styles/tokens.css` (116-156), `src/hooks/useTheme.ts`, `src/views/SettingsView.tsx`
- Impact: Dark mode is fully built and dead. Users cannot access it. Toggle code and CSS together are ~80 lines of unused surface.
- Fix approach: Wire `useTheme()` into `SettingsView.tsx` "appearance" section: a three-way Switch/Select for light/dark/system + a quick toggle in `src/components/layout/Header.tsx`. Verify a few token-driven components against the dark palette (shadows, glass, borders) before shipping.

### No State Persistence (HIGH)
- Issue: All 5 Zustand stores (`productStore`, `taskStore`, `rndStore`, `scheduleStore`, `workspaceStore`) use plain `create()` with no `persist` middleware. State resets on every page reload / app restart. All user-created products, tasks, milestones, AI-generated deliverables, and knowledge articles vanish.
- Files: `src/stores/productStore.ts:34`, `src/stores/rndStore.ts`, `src/stores/taskStore.ts`, `src/stores/scheduleStore.ts`, `src/stores/workspaceStore.ts`
- Impact: Application is effectively a demo — no user data survives a refresh. This is the single biggest gap between "Apple-style desktop client" positioning and actual behavior.
- Fix approach: Add `zustand/middleware` `persist` to each store with `localStorage` (or Tauri store plugin for desktop). Use `partialize` to drop non-serializable fields (functions, transient UI flags). Only `uiStore` theme-related flags should be excluded — and those already live in `useTheme.ts` localStorage. Validate the `rndStore` shape: it has 7 nested `Record<productId, ...>` maps that need schema versioning for future migrations.

### `Project` Type Duplication (LOW)
- Issue: `Project` is defined as `export type Project = Product` in `src/stores/productStore.ts:11`, and `AppContext` exposes both `projects`/`setProjects` (mapped to `products`) AND `products`/`setProducts` — same data, two names. Code reads `projects` in some places, `products` in others.
- Files: `src/store/AppContext.tsx:61-64`, `src/stores/productStore.ts:11`
- Impact: Cognitive load, risk of bugs when code assumes the two arrays are independent.
- Fix approach: Pick `products` (matches store name). Remove `projects`/`setProjects` from `AppContextType` and migrate the ~few call sites. Bundle this with the AppContext removal.

## Known Bugs

### Mixed-language Task Status Union (MEDIUM)
- Issue: `src/types.ts:4` defines `status: 'todo' | 'in_progress' | 'done' | '已完成' | '进行中' | '未开始'` — English and Chinese literals mixed in the same union. Any status comparison must check both languages or miss cases.
- Files: `src/types.ts:4`; consumers in `src/components/TaskKanban.tsx`, `src/views/TaskManagementView.tsx`
- Impact: Kanban columns and filters that compare against `'todo' | 'in_progress' | 'done'` will silently drop tasks whose status is the Chinese literal, and vice versa. High risk of "task disappears" bugs.
- Fix approach: Pick one canonical set (recommend English: `todo`/`in_progress`/`done`). Add a migration map for any persisted/seeded Chinese values in `src/data/mockTasks.ts`. Update the union and all comparison sites. This is a one-shot rename, not a long-running refactor.

### `getProjectTaskCount` Signature Mismatch (LOW)
- Issue: `AppContextType` declares `getProjectTaskCount: (projectIdOrName?: string) => number` — accepts either an ID or a name as a single arg. Stringly-typed polymorphism makes the contract ambiguous.
- Files: `src/store/AppContext.tsx:133`, `src/stores/taskStore.ts`
- Impact: Callers cannot trust what to pass; behavior depends on whether tasks store ID or name in `task.project`. Bugs here are silent (returns 0).
- Fix approach: Split into `getTaskCountByProjectId(id)` and `getTaskCountByProjectName(name)`, or normalize tasks to always reference project ID.

### JSON.parse on AI Output Without Schema Guard (MEDIUM)
- Issue: `server.ts:88-90` parses Gemini output by stripping markdown fences and calling `JSON.parse` directly. If the model emits malformed JSON or extra prose, the throw bubbles up as a 500 with the raw error message.
- Files: `server.ts:88-91` (`/api/generate-project`)
- Impact: One bad AI response kills the project-creation flow with an opaque error. No retry, no validation against the response schema the prompt requested.
- Fix approach: Wrap parse in try/catch with a clear user-facing error ("AI returned unparseable output, please retry"). Optionally validate against the `responseSchema` shape with a lightweight validator (zod is not installed; a hand-written shape check is enough). Log the raw text on failure for debugging.

## Security Considerations

### Express Server Has No CORS, No Rate Limiting, No Auth (HIGH)
- Issue: `server.ts` binds to `0.0.0.0:3000` (line 259) with no `cors` middleware, no rate limiter, no auth check on any of the 5 endpoints. Any device on the LAN can POST to `/api/generate-project` etc. and burn the Gemini API quota.
- Files: `server.ts:259` (bind), all route handlers at lines 17, 99, 166, 179, 213
- Risk: API key abuse / cost runaway; the dev server is exposed to the local network by default. The Tauri production build bundles this same Express server (`npm run start` → `dist/server.cjs`), so this is not just a dev concern.
- Current mitigation: None.
- Recommendations:
  1. Bind to `127.0.0.1` instead of `0.0.0.0` unless LAN access is a hard requirement.
  2. Add `express-rate-limit` (not installed) or a trivial in-memory limiter per-IP on AI endpoints.
  3. Add a simple shared-secret header check (`X-Nova-Token`) even for local-only deployments, since Tauri ships the server inside the app bundle.
  4. For Tauri production builds, consider moving Gemini calls into Rust (`src-tauri/src/lib.rs`) via Tauri commands so the API key never touches the Node layer.

### API Key Lives in `.env`, Bundled Into Tauri App (HIGH)
- Issue: `GEMINI_API_KEY` is read from `.env` at server startup (`server.ts:8` `dotenv.config()`). The production build (`npm run build:server` → `dist/server.cjs`) bundles `dotenv` and ships inside the Tauri app. The `.env` file is not packaged by default, but the production server requires the user to provide `GEMINI_API_KEY` at runtime, with no fallback path documented.
- Files: `server.ts:8`, `package.json:9` (`build:server`), `src-tauri/tauri.conf.json`
- Risk: Either (a) the key is baked into the bundle (leak risk on distribution) or (b) end users have no key and every AI endpoint silently falls back to mock content — which is what the code does today (`server.ts:103`, `183`, `217` all guard with `if (process.env.GEMINI_API_KEY)`). The "AI" experience for shipped builds is currently mock text.
- Current mitigation: `.gitignore` excludes `.env`, `.env.local`, `.env.*.local` (verified). `.env.example` exists.
- Recommendations: Document the key-provisioning story for end users. For desktop distribution, prefer OS keychain via Tauri or per-user env config — not a bundled dotenv.

### Tauri CSP Disabled (MEDIUM)
- Issue: `src-tauri/tauri.conf.json:30-31` sets `"security": { "csp": null }`. No Content Security Policy is enforced on the webview.
- Files: `src-tauri/tauri.conf.json:29-31`
- Risk: If any user-supplied or AI-generated content is ever rendered as raw HTML (currently none detected — no `dangerouslySetInnerHTML`, no `eval`, no `innerHTML`), there is no CSP backstop. Markdown rendering via `react-markdown` (installed) is generally safe but worth verifying against the actual usage.
- Current mitigation: `react-markdown` does not allow raw HTML by default. No `dangerouslySetInnerHTML` found in `src/`.
- Recommendations: Define an explicit CSP in `tauri.conf.json` that allows only the Express origin and inline styles needed by Tailwind. Default-deny script-src.

### User Input Concatenated Into AI Prompts (MEDIUM — prompt injection)
- Issue: `server.ts:31-33` interpolates `prompt` and `filesContext` directly into the Gemini system prompt. `server.ts:117-123` does the same with `workspaceName`, `folderPath`, `projectName`, and file contents. `server.ts:189-195` interpolates `product.name`, `product.description`, `customPrompt`. A malicious file name or workspace description becomes part of the model's instructions.
- Files: `server.ts:31-33`, `117-123`, `189-195`, `223-228`
- Risk: Prompt injection — user-controlled data can override the system instructions (e.g., "ignore previous instructions and return..."). Since output is shown to the same user who supplied the input, blast radius is limited to that user's session, but the AI output is also persisted to stores and shown to others if workspaces are shared later.
- Recommendations: Use the Gemini SDK's `systemInstruction` field for the system prompt and pass user content as `contents` (separate role), so the model can distinguish instructions from data. Sanitize or fence user-supplied strings. This is a structural change to how `ai.models.generateContent` is called.

### `/api/workspace-files` Returns Hardcoded Mock (LOW)
- Issue: `server.ts:166-176` ignores any request context and returns a hardcoded 4-file array. Comment at line 167-168 admits "In a real app we'd read from local fs. Here we'll just mock."
- Files: `server.ts:166-176`; consumer `src/components/ProjectCreateModal.tsx:22-26`
- Risk: The "select workspace files" UI in project creation always shows the same 4 fake files regardless of the user's actual workspace. Misleading UX, not a security issue.
- Recommendations: Either read from the workspace folder path (already tracked in `workspaceStore`) using Node `fs`, or remove the file-picker step from `ProjectCreateModal` until real FS access lands.

## Performance Bottlenecks

### AppContext Re-renders the Whole Tree (HIGH — pairs with tech debt above)
- Issue: `src/store/AppContext.tsx:226-251` constructs a fresh `value` object on every render of `AppProvider`. Since `AppProvider` subscribes to ~30 store slices, any state change re-renders the provider, which gives every consumer a new context value, which re-renders every consumer — even those that only read `selectedProductId`.
- Files: `src/store/AppContext.tsx:226-253`
- Cause: Missing `useMemo` on the value object; the wrapper closures (`addProject`, `deleteProductWrapped` at lines 215-224) are also recreated each render.
- Improvement path: Wrap value in `useMemo` keyed on the ~30 selectors. Better: finish the AppContext removal and let consumers subscribe surgically via individual `useXxxStore((s) => s.field)` calls (Zustand only re-renders on the selected slice changing).

### Largest Files Bundle Together (MEDIUM)
- Issue: `src/data/mockRndData.ts` is 1,335 lines and `src/data/mockProducts.ts` is 706 lines of seed data. They are imported synchronously by stores at module-load time (`productStore.ts:7`, `rndStore.ts:19`), so all seed data is in the main bundle rather than lazy-loaded with the views that need it.
- Files: `src/data/mockRndData.ts` (1335 lines), `src/data/mockProducts.ts` (706 lines), `src/stores/productStore.ts:7`, `src/stores/rndStore.ts:19`
- Cause: Stores eagerly import seed data.
- Improvement path: Lazy-load seed data (`await import('../data/mockRndData')` inside store initializers) or split seeds per-product so only the active product's data loads. Low priority unless bundle size shows up in profile.

### AI Calls Have No Client-side Abort or Debounce (LOW)
- Issue: AI generation calls in `src/components/product/*.tsx` fire on button click with no `AbortController` and no debounce. Rapid clicks (e.g., "generate all deliverables" in `FullDeliverablesTab.tsx`) stack multiple Gemini requests.
- Files: `src/stores/rndStore.ts:408` (`generateDeliverableAI`), `435` (`generateAllDeliverablesBatchAI`); callers in `src/components/product/FullDeliverablesTab.tsx`
- Improvement path: Track an `AbortController` per in-flight generation; disable the trigger button while `status === 'generating'` (the store already sets this status — verify the UI consumes it).

## Fragile Areas

### `rndStore` — God Store With 7 Nested Maps (HIGH)
- Issue: `src/stores/rndStore.ts` (472 lines) holds `requirements`, `prototypes`, `knowledgeBase`, `codeScaffolds`, `testCases`, `competitorData`, `deliverables` — all keyed by `productId`. Every accessor does `state.X[productId] || INITIAL_X.p1 || []` (see lines 297-299, 321-323, 399-405). If a product ID is `undefined` or stale, you silently get the `p1` seed data — a different product's data shows up with no error.
- Files: `src/stores/rndStore.ts` (entire file, especially accessors at 297, 321, 365, 399)
- Why fragile: The fallback chain `[productId] || INITIAL.p1` is a footgun — it returns a *specific* product's seed data instead of an empty state. Any code path that loses the productId (race condition on selection change, deleted product) displays Product 1's content under the wrong product header.
- Safe modification: Change accessors to fall back to a typed empty value, not `INITIAL.p1`. Add a guard that logs when `productId` is unknown. When splitting this store, do it by domain (requirements store, prototype store, etc.), not by accident.
- Test coverage: None. This is the highest-value place to add tests first.

### Manually-synced Mock Data Across Files (MEDIUM)
- Issue: `src/data/mockRndData.ts`, `src/data/mockProducts.ts`, `src/data/mockTasks.ts` define shape contracts that stores and components import directly. A field rename in mock data breaks compilation in many places but a shape change (adding a required field) silently propagates as `undefined` until something renders it.
- Files: All `src/data/*.ts`, consumed by stores and ~15 components.
- Why fragile: No schema validation between mock data and the types it's supposed to satisfy — mocks are imported as plain consts, not type-checked against an explicit interface in many cases.
- Safe modification: Annotate every mock export with its interface (`export const INITIAL_PRODUCTS_DATA: Product[] = [...]` not `= [...]`). Run `tsc --noEmit` (the `lint` script) before any merge.

### `motion/react` Page Transitions Assume Single Tab (LOW)
- Issue: `src/App.tsx:107-117` wraps `renderContent()` in `<AnimatePresence mode="wait">` keyed on `activeTab`. Custom routing via `useState` (no router library) means deep-linking, browser back/forward, and tab persistence across reloads are all unsupported.
- Files: `src/App.tsx:41-89` (no router), `src/components/layout/Sidebar.tsx`
- Why fragile: Any feature that needs URL state (share a product link, open a specific tab on launch) requires retrofitting a router.
- Safe modification: If URL routing is ever needed, add `react-router` (not installed) and migrate `activeTab` state to a route param. Until then, do not build features that depend on URL state.

## Scaling Limits

### In-Memory Stores + No Backend (HIGH)
- Current capacity: Single user, single session, browser memory only.
- Limit: All products, R&D artifacts, tasks, schedules, workspaces live in JS heap. A few hundred products with full R&D data each will measurably slow the UI ( Zustand subscriptions + the AppContext re-render problem above).
- Scaling path: Persist to localStorage first (small lift), then to a real backend (SQLite via Tauri SQL plugin, or a server). The store shape is already clean enough to serialize; the work is plumbing, not redesign.

### Single AI Request In-flight Per Endpoint (LOW)
- Limit: Each AI endpoint handles one request synchronously per client. No queue, no batching (except the mock `generateAllDeliverablesBatchAI` which just `setTimeout`s).
- Scaling path: If multi-user or batch AI ever matters, add a job queue. Not a current concern.

## Dependencies at Risk

### `lucide-react` Still Installed After Phosphor Migration (LOW)
- Issue: `package.json:39` lists `lucide-react ^0.546.0` but CLAUDE.md states "All lucide-react icons have been migrated to @phosphor-icons/react." If the migration is complete, this is dead weight in `node_modules` (not necessarily in the bundle unless imported).
- Files: `package.json:39`
- Impact: Larger `node_modules`, confused contributors about which icon set to use.
- Migration plan: `grep -r "lucide-react" src/` to confirm zero imports, then `npm uninstall lucide-react`.

### Express 4.x (MEDIUM — security)
- Issue: `package.json:38` pins `express ^4.21.2`. Express 5 has been GA; Express 4 is in maintenance and receives security fixes only on the latest 4.x line. The installed 4.21.2 may lag current patches.
- Impact: Dependency on a maintenance-only branch.
- Migration plan: Evaluate Express 5 upgrade or move AI endpoints into Tauri Rust commands and drop Express entirely (aligns with the API-key-in-bundle concern above).

## Missing Critical Features

### No Persistence Layer (see Tech Debt above)
- Problem: User data does not survive app restart.
- Blocks: Any real-world use as a project management tool.

### No Real Backend / Database
- Problem: The "backend" is an Express server with 5 endpoints, 4 of which call Gemini and 1 returns mock files. There is no data store, no auth, no multi-user anything.
- Blocks: Multi-user collaboration, sync across devices, audit history.

### No Automated Tests
- Problem: Zero test files in `src/` (verified via glob for `*.test.*` and `*.spec.*`). `package.json` has no test script, no test runner installed (no jest/vitest in deps or devDeps). The `lint` script is `tsc --noEmit` (type-checking only).
- Blocks: Safe refactoring of the fragile areas above (especially `rndStore`). Any change to store accessors or the AppContext migration risks silent regressions.
- Priority: High — adding even a thin vitest suite around `rndStore` accessors and `taskStore` status comparisons would catch the most likely regressions during the AppContext removal.

### No Error Boundary
- Problem: `src/App.tsx` has no React error boundary. A render error in any lazy-loaded view crashes the whole app with a blank screen.
- Blocks: Graceful degradation when a single view throws.
- Fix approach: Wrap `<Suspense>` in an Error Boundary component that shows a fallback card with a "reload" button. ~20 lines, no new dependency.

## Test Coverage Gaps

### Entire Application — Zero Tests
- What's not tested: Everything. Stores, components, server endpoints, AI prompt construction, JSON parsing, status comparisons.
- Files: All of `src/`, `server.ts`
- Risk: The mixed-language `Task.status` union, the `rndStore` `INITIAL.p1` fallback, the AppContext re-render problem, and the JSON.parse-on-AI-output bug are all currently undetectable except by manual use. Any of them could ship a regression silently.
- Priority:
  - High: `src/stores/rndStore.ts` accessor behavior (productId fallback, status transitions)
  - High: `src/stores/taskStore.ts` status comparison against the mixed-language union (drives the bug above)
  - Medium: `server.ts` AI endpoint error paths (malformed JSON, missing key, network failure)
  - Medium: `src/store/AppContext.tsx` value-stability (memoization regression test)

### No CI Pipeline
- What's not tested: Anything automated. No `.github/workflows/`, no CI config detected.
- Risk: `tsc --noEmit` (the `lint` script) runs only locally and only if a developer remembers.
- Priority: Medium — even a single GitHub Action running `npm run lint` on PRs would catch type errors before merge.

---

*Concerns audit: 2026-08-08*
