# Architecture

**Analysis Date:** 2026-08-08

## Pattern Overview

**Overall:** Single-page React application with tab-based view switching, wrapped by a Tauri v2 desktop shell. No router library — navigation is driven by an `activeTab` string state in `MainLayout`. State lives in six Zustand stores behind a thin React Context compatibility facade.

**Key Characteristics:**
- Tab-switching SPA (not URL-routed) — view chosen via `activeTab` switch in `src/App.tsx`
- Code-splitting per view via `React.lazy` + `Suspense`
- Zustand stores as single source of truth; `AppContext` is a delegation layer, not the source
- Frameless Tauri window with custom `TitleBar` (drag region + platform-specific window controls)
- Design tokens (CSS custom properties) bridged to Tailwind v4 via `@theme` in `src/index.css`
- Express dev server doubles as the production server — Vite middleware in dev, static dist in prod
- AI features (Gemini) live in the server, frontend never sees the API key

## Layers

**Presentation / Views:**
- Purpose: Top-level route screens; one per sidebar tab
- Location: `src/views/`
- Contains: 8 lazy-loaded view components (`AgentWorkspaceView`, `TaskManagementView`, `ProductManagementView`, `RndCenterView`, `ScheduleView`, `FileArchiveView`, `KnowledgeBaseView`, `SettingsView`). Also `PlaceholderView`, `ProjectOverviewView`, `SmartAnalysisView` (not currently routed)
- Depends on: `useApp()` context, `components/ui/*`, `components/product/*` (for ProductManagement/RndCenter)
- Used by: `MainLayout` in `src/App.tsx`

**Feature Components:**
- Purpose: Heavy, view-specific UI broken out of the view file
- Location: `src/components/product/` (16 files for the Product + R&D tabs), `src/components/` (8 standalone: `TaskKanban`, `ProjectCreateModal`, `AIAssistantPanel`, `ProjectTimeline`, `ProjectVisualizer`, `SetAsWorkspaceModal`, `WorkspaceSummaryModal`, `StatsRow`, `AddWorkspaceModal`)
- Contains: Tab panels, modals, kanban, timeline, AI panels — all bundled with their parent view (not lazy)
- Depends on: `useApp()` context, `components/ui/*`
- Used by: `views/ProductManagementView.tsx`, `views/RndCenterView.tsx`, `views/FileArchiveView.tsx`

**UI Primitives (Design System):**
- Purpose: Reusable Radix + motion + Tailwind components, themable via tokens
- Location: `src/components/ui/` (20 components) with barrel `src/components/ui/index.ts`
- Contains: `Card`, `Button`, `Badge`, `Dialog`, `Input`, `Textarea`, `Select`, `Tabs`, `Switch`, `Checkbox`, `Tooltip`, `Popover`, `Toast`, `Avatar`, `DropdownMenu`, `ProgressBar`, `SegmentedControl`, `Separator`, `Skeleton`, `ScrollArea`
- Depends on: `@radix-ui/*`, `motion/react`, `cn()` from `src/lib/utils.ts`, design tokens
- Used by: Every layer above. Always import primitives from here — do not re-implement

**Layout / Desktop Chrome:**
- Purpose: Window frame, navigation, page header
- Location: `src/components/layout/` — `TitleBar.tsx`, `Sidebar.tsx` (exports `MENU_ITEMS`), `Header.tsx`
- Contains: Frameless-window controls (macOS traffic lights + Windows controls via `@tauri-apps/api/window`), sidebar nav, header with title/subtitle
- Depends on: Tauri window APIs (only inside `TitleBar`), tokens, `motion`
- Used by: `MainLayout`

**State (Zustand Stores):**
- Purpose: Domain state and actions
- Location: `src/stores/`
  - `taskStore.ts` — categories + tasks, `getProjectTaskCount`
  - `productStore.ts` — products CRUD, skills, milestones (sync `runProductSkill` mock)
  - `rndStore.ts` (largest, ~700 lines) — requirements, prototypes, knowledge, code scaffolds, test cases, competitors, deliverables. Cross-store read of `productStore` via `useProductStore.getState()`
  - `scheduleStore.ts` — events
  - `workspaceStore.ts` — workspaces + local indexed files
  - `uiStore.ts` — activeTab, selectedProductId, theme, modal flags
- Contains: All business logic (AI generation is mocked with `setTimeout` — real AI lives in `server.ts`)
- Depends on: `src/data/mock*.ts` for initial state and type definitions
- Used by: `AppContext` (subscribes and re-exports) and — preferred — direct hook calls from views/components

**Compatibility Facade (Legacy):**
- Purpose: Bridge old `useApp()` callers to the new Zustand stores during migration
- Location: `src/store/AppContext.tsx`
- Contains: One large context value aggregating subscriptions from all 6 stores; re-exports all store types
- Depends on: All 6 stores
- Used by: Most existing views still call `useApp()`. New code should call stores directly (e.g. `useProductStore()`)
- Removal: Tracked as future debt once all callers migrate

**Server (Express + Gemini):**
- Purpose: Hosts the AI endpoints; serves Vite dev middleware or static dist in prod
- Location: `server.ts` (root, single file)
- Contains: 5 endpoints — `POST /api/generate-project`, `POST /api/summarize-workspace`, `GET /api/workspace-files`, `POST /api/rnd/generate-deliverable`, `POST /api/rnd/polish-knowledge-article`. Falls back gracefully when `GEMINI_API_KEY` is missing (returns hardcoded templates)
- Depends on: `@google/genai`, `express`, `vite` (dev only), `dotenv`
- Used by: Frontend via `fetch` from views/components

**Tauri Shell:**
- Purpose: Native desktop wrapper
- Location: `src-tauri/` — `src/main.rs` (entry), `src/lib.rs` (`run()` builder), `tauri.conf.json`, `Cargo.toml`, `capabilities/default.json`
- Contains: Minimal Rust — only window setup (`set_min_size 1024x680`), shell plugin. No Tauri commands defined; frontend uses `@tauri-apps/api/window` directly from JS for window controls
- Depends on: `tauri` 2, `tauri-plugin-shell`
- Used by: `npm run tauri:dev` / `npm run tauri:build` which spawn `bunx tsx server.ts` as `beforeDevCommand`

## Data Flow

**Tab navigation:**
1. User clicks sidebar item → `Sidebar` calls `onTabChange(id)` → `setActiveTab` in `MainLayout` (local `useState`, NOT uiStore)
2. `renderContent()` switch returns the matching lazy component
3. `<Suspense>` shows `ViewLoading` skeleton; `<AnimatePresence>` cross-fades via `motion.div key={activeTab}`

**Cross-view navigation (Product → R&D):**
1. `ProductManagementView` calls `onNavigateToRnd(productId)` prop
2. `MainLayout.handleNavigateToRnd` calls `setSelectedProductId` (uiStore via `useApp`) then `setActiveTab('rnd-center')`
3. `RndCenterView` reads `selectedProductId` and selects that product in its picker

**AI deliverable generation (typical async flow):**
1. View calls `useApp().generateDeliverableAI(productId, code, prompt)`
2. `AppContext` delegates to `useRndStore.generateDeliverableAI`
3. Store currently mocks with `await new Promise(r => setTimeout(r, 1200))` then `set()` updates state — **does NOT call the server**
4. Component re-renders via Zustand subscription
5. (Server endpoint `/api/rnd/generate-deliverable` exists in `server.ts` but is not currently wired to the store — wiring it is future work)

**State Management:**
- Zustand stores are the source of truth. Components subscribe via `useXxxStore((s) => s.field)` selectors
- `AppContext` subscribes to every store and re-exports as a single context value — convenience for old code, slight re-render overhead
- Cross-store access inside stores uses `useOtherStore.getState()` (see `rndStore.getProd`) — never call hooks inside store actions

## Key Abstractions

**Product (central domain entity):**
- Purpose: A product/project being managed. Drives most of the app's screens
- Defined in: `src/data/mockProducts.ts`, re-exported from `src/stores/productStore.ts` as `Product` and aliased as `Project`
- Pattern: Single type used across product, R&D, schedule, workspace stores; selected via `uiStore.selectedProductId`

**Deliverable Catalog:**
- Purpose: 18 canonical R&D deliverables generated per product (PRD, arch doc, API spec, etc.)
- Defined in: `src/data/mockRndData.ts` (`FULL_LIFECYCLE_DELIVERABLES_CATALOG`); materialized per-product by `buildInitialDeliverables()` in `rndStore.ts`
- Pattern: Catalog + per-product instances keyed by `productId` in `deliverables: Record<string, FullLifecycleDeliverable[]>`

**Design Token:**
- Purpose: Single source for color/radius/motion values, theming hook for dark mode
- Defined in: `src/styles/tokens.css` (CSS custom properties) and bridged to Tailwind via `@theme` in `src/index.css`
- Pattern: Always use semantic Tailwind classes (`bg-bg-primary`, `text-text-secondary`, `border-border-subtle`, `bg-accent`) — never raw hex/rgb

**UI Primitive Component:**
- Purpose: Composable design-system building block (Radix + motion + tokens)
- Pattern: `forwardRef` component, accepts `className` last, merges via `cn()`, exposes variants via discriminated `variant` prop. See `Card.tsx` for canonical example
- Examples: `src/components/ui/Card.tsx`, `Button.tsx`, `Dialog.tsx`, `Badge.tsx`

## Entry Points

**Web/Dev bootstrap:**
- Location: `src/main.tsx`
- Triggers: Browser load (dev: Vite middleware in `server.ts`; prod: static `dist/index.html`)
- Responsibilities: `createRoot(...).render(<App />)` in `StrictMode`, imports `index.css`

**Desktop bootstrap:**
- Location: `src-tauri/src/main.rs` → `nova_lib::run()` in `src-tauri/src/lib.rs`
- Triggers: `npm run tauri:dev` / `tauri:build`
- Responsibilities: Tauri builder, register shell plugin, set min window size, load `http://localhost:3000` (dev) or embedded dist (prod)

**Server bootstrap:**
- Location: `server.ts` → `startServer()`
- Triggers: `npm run dev`, `npm start`, or Tauri's `beforeDevCommand`
- Responsibilities: Express app, AI endpoints, Vite middleware (dev) or static dist (prod), listens on `0.0.0.0:3000`

## Error Handling

**Strategy:** Minimal and inconsistent. Errors are caught locally, not propagated through a boundary

**Patterns:**
- Server endpoints: `try/catch` per handler, log to `console.error`, return `res.status(500).json({ error: error.message })`
- Stores: AI mock actions swallow errors silently — `await new Promise(r => setTimeout(r, ...))` cannot fail
- Components: No error boundaries detected. Render errors crash the view
- Toast notifications exist (`src/components/ui/Toast.tsx`, `useToast()`) but are not systematically used for error reporting

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` only. No structured logger. Server logs to stdout, frontend to browser console

**Validation:** None on the client. Server validates by relying on Gemini's `responseSchema` for the project-generation endpoint; other endpoints trust the request body shape

**Authentication:** None. The app is a local desktop client. The only secret is `GEMINI_API_KEY` in `.env`, read only by `server.ts`

**Platform Detection:** `isTauri()` in `src/components/layout/TitleBar.tsx` checks `'__TAURI_INTERNALS__' in window`. Tauri-specific code is isolated to `TitleBar` — the rest of the app is platform-agnostic

**Path Alias:** `@` → project root (configured in `vite.config.ts`). Imports look like `@/src/lib/utils`, `@/src/components/ui/Card`

**Internationalization:** None. UI strings are hardcoded Chinese for product/domain text; component-level labels are English. Mixed throughout

---

*Architecture analysis: 2026-08-08*
