# Codebase Structure

**Analysis Date:** 2026-08-08

## Directory Layout

```
pm-workspace/
├── src/                    # React frontend
│   ├── components/
│   │   ├── ui/             # 20 design-system primitives + index.ts barrel
│   │   ├── layout/         # TitleBar, Sidebar, Header (desktop chrome)
│   │   ├── product/        # 16 ProductManagement + R&D tab sub-components
│   │   ├── TaskKanban.tsx, ProjectCreateModal.tsx, AIAssistantPanel.tsx, ...  # 8 standalone feature components
│   ├── views/              # 11 top-level route screens (8 are lazy-loaded)
│   ├── stores/             # 6 Zustand stores (source of truth)
│   ├── store/              # Legacy AppContext.tsx (compat facade — single file)
│   ├── ai/                 # AI runtime: toolLoop, chatSession, registry, prompts, tools/
│   │   └── events/         # Agent Event Log (Phase 13): types, eventStore, invariants, artifacts
│   ├── data/               # mockProducts.ts, mockRndData.ts, mockTasks.ts (initial state + types)
│   ├── lib/                # utils.ts (cn, when), icons.ts
│   ├── hooks/              # useTheme.ts
│   ├── styles/             # tokens.css (design tokens)
│   ├── App.tsx             # Root: MainLayout, lazy routes, providers
│   ├── main.tsx            # createRoot entry
│   └── index.css           # Fonts + tokens import + Tailwind v4 @theme bridge
├── src-tauri/              # Tauri v2 desktop shell (Rust)
│   ├── src/                # main.rs, lib.rs (minimal — no commands)
│   ├── capabilities/       # default.json (Tauri permissions)
│   ├── icons/              # App icons
│   ├── tauri.conf.json     # Window config (frameless, transparent)
│   ├── Cargo.toml          # Rust deps
│   └── build.rs
├── server.ts               # Express + Gemini AI endpoints (dev + prod)
├── vite.config.ts          # @ alias, Tauri base path
├── package.json
├── tsconfig.json
├── metadata.json
├── skills-lock.json
└── .planning/codebase/     # This document and siblings
```

## Directory Purposes

**`src/components/ui/`:**
- Purpose: Design-system primitives built on Radix + motion + Tailwind v4 tokens
- Contains: 20 components — `Button`, `Card`, `Badge`, `Dialog`, `Input`, `Textarea`, `Select`, `Tabs`, `Switch`, `Checkbox`, `Tooltip`, `Popover`, `Toast`, `Avatar`, `DropdownMenu`, `ProgressBar`, `SegmentedControl`, `Separator`, `Skeleton`, `ScrollArea`
- Key files: `index.ts` (barrel — import from here, e.g. `import { Card, Button } from '@/src/components/ui'`), `Card.tsx` (canonical pattern reference), `Dialog.tsx` (replaces all modals)

**`src/components/layout/`:**
- Purpose: Desktop window frame and global navigation
- Contains: `TitleBar.tsx` (frameless window controls + Tauri drag region, platform detection), `Sidebar.tsx` (nav + `MENU_ITEMS` export), `Header.tsx` (page title/subtitle bar)
- Key files: `Sidebar.tsx` exports `MENU_ITEMS` array — the source of truth for the 7 main tabs

**`src/components/product/`:**
- Purpose: Sub-components too large to inline in `ProductManagementView` / `RndCenterView`
- Contains: 16 files — all tabs and modals for Product + R&D screens
- Key files: `FullDeliverablesTab.tsx`, `AIRequirementsTab.tsx`, `UIPrototypeTab.tsx`, `ProductKnowledgeTab.tsx`, `CodeManagementTab.tsx`, `TestManagementTab.tsx`, `CompetitorAnalysisTab.tsx` (R&D tabs); `ProductOverviewTab.tsx`, `ProductGovernanceTab.tsx`, `ProductDocsTab.tsx`, `ProductAnalyticsTab.tsx`, `ProductSkillsTab.tsx`, `ProductMilestonesTab.tsx` (Product tabs); `CreateProductModal.tsx`, `AddDocumentModal.tsx`, `AddSkillModal.tsx` (modals)
- Note: These are NOT lazy-loaded — bundled with their parent view

**`src/views/`:**
- Purpose: Top-level route screens, one per sidebar tab
- Contains: 11 files. 8 are wired in `App.tsx`: `AgentWorkspaceView`, `TaskManagementView`, `ProductManagementView`, `RndCenterView`, `ScheduleView`, `FileArchiveView`, `KnowledgeBaseView`, `SettingsView`. 3 are dormant (`PlaceholderView`, `ProjectOverviewView`, `SmartAnalysisView`)
- Key files: `ProductManagementView.tsx` (22KB, orchestrates 6 tabs + 3 modals), `RndCenterView.tsx` (orchestrates 7 R&D tabs), `FileArchiveView.tsx` (31KB, largest view)

**`src/stores/`:**
- Purpose: Zustand stores — the actual source of truth for all domain state
- Contains: `taskStore.ts`, `productStore.ts`, `rndStore.ts` (~700 lines, largest), `scheduleStore.ts`, `workspaceStore.ts`, `uiStore.ts`
- Key files: `rndStore.ts` holds 7 entity maps keyed by `productId`; `productStore.ts` is referenced cross-store via `useProductStore.getState()`

**`src/store/`:**
- Purpose: Compatibility facade. Single file
- Contains: `AppContext.tsx` only
- Note: Will be deleted once all `useApp()` callers migrate to direct store hooks

**`src/ai/`:**
- Purpose: Agent runtime — tool loop, chat session, tool registry + implementations
- Contains: `toolLoop.ts`, `chatSession.ts`, `registry.ts`, `confirmations.ts`, `prompts.ts`, `context.ts`, `tokenEstimate.ts`, `tools/`, `__tests__/`
- Key files: `events/eventStore.ts` (EventStore dual implementation — SQLite in Tauri, in-memory otherwise; seq allocated SQL-side), `events/invariants.ts` (tool_call↔tool_result pairing + seq contiguity checks), `events/artifacts.ts` (>4KB tool results), `events/types.ts` (event vocabulary per AGENT_MEMORY_REFERENCE §3)
- Note: New migrations for agent data land in `src-tauri/migrations/` (0002 = agent_events + agent_artifacts)

**`src/data/`:**
- Purpose: Initial state and type definitions for domain entities
- Contains: `mockProducts.ts` (35KB — `Product`, `ProductMilestone`, `ProductDocument`, `ProductSkill`, `INITIAL_PRODUCTS_DATA`), `mockRndData.ts` (59KB — R&D types and `FULL_LIFECYCLE_DELIVERABLES_CATALOG`), `mockTasks.ts` (`Task`, `TaskCategory`, `INITIAL_CATEGORIES`)
- Note: Despite "mock" naming, these define the **canonical domain types** imported throughout. Treat as a domain layer, not disposable fixtures

**`src/lib/`:**
- Purpose: Tiny shared utilities
- Contains: `utils.ts` (`cn()` merges Tailwind classes via clsx + tailwind-merge; `when()` conditional class), `icons.ts` (icon re-exports/helpers)
- Note: No `api.ts` exists despite CLAUDE.md mentioning it. Tauri `isTauri()` detection lives in `src/components/layout/TitleBar.tsx` instead

**`src/hooks/`:**
- Purpose: Custom React hooks
- Contains: `useTheme.ts` only

**`src/styles/`:**
- Purpose: Design system foundation
- Contains: `tokens.css` — CSS custom properties for colors, shadows, radii, motion. Imported by `src/index.css`, bridged to Tailwind via `@theme`

**`src-tauri/src/`:**
- Purpose: Rust entry point and Tauri builder
- Contains: `main.rs` (calls `nova_lib::run()`), `lib.rs` (`run()` — Tauri builder, min window size, shell plugin)
- Note: No Tauri commands. All native interaction happens via `@tauri-apps/api/window` from JS in `TitleBar.tsx`

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React root, imports `index.css`
- `src/App.tsx`: `MainLayout` component, lazy view imports, provider stack (`TooltipProvider` → `ToastProvider` → `AppProvider` → `MainLayout`)
- `server.ts`: Express server with 5 AI endpoints + Vite middleware
- `src-tauri/src/main.rs` → `src-tauri/src/lib.rs`: Tauri bootstrap

**Configuration:**
- `vite.config.ts`: `@` path alias, Tauri base path (`./` when `TAURI_ENV_PLATFORM` set)
- `tsconfig.json`: TypeScript config
- `package.json`: Scripts (`dev`, `build`, `lint` = `tsc --noEmit`, `tauri:dev`, `tauri:build`)
- `src-tauri/tauri.conf.json`: Window config (1440x900 default, 1024x680 min, `decorations: false`, `transparent: true`), `beforeDevCommand: bunx tsx server.ts`, `devUrl: http://localhost:3000`
- `src-tauri/Cargo.toml`: Rust deps (`tauri` 2, `tauri-plugin-shell`, `serde`)

**Core Logic:**
- `src/stores/rndStore.ts`: R&D domain — 7 entity maps, AI generation (currently mocked), deliverable lifecycle
- `src/stores/productStore.ts`: Product CRUD, skills, milestones
- `server.ts`: Gemini AI integration (the only place `GEMINI_API_KEY` is read)

**Design System:**
- `src/styles/tokens.css`: All tokens (CSS custom properties)
- `src/index.css`: `@theme` bridge to Tailwind v4, font imports
- `src/components/ui/index.ts`: Barrel for all primitives
- `src/lib/utils.ts`: `cn()` helper

**Testing:**
- `src/ai/__tests__/` + `src/stores/__tests__/`: node:test suites run via `npx tsx --test src/ai/__tests__/*.test.ts src/stores/__tests__/*.test.ts` (no package.json script)

## Naming Conventions

**Files:**
- Components: `PascalCase.tsx` — e.g. `ProductManagementView.tsx`, `TitleBar.tsx`, `Card.tsx`
- Stores: `camelCaseStore.ts` — e.g. `productStore.ts`, `rndStore.ts`, `uiStore.ts`
- Utilities: `camelCase.ts` — e.g. `utils.ts`, `icons.ts`, `api.ts`
- Constants in code: `UPPER_SNAKE_CASE` — e.g. `INITIAL_PRODUCTS_DATA`, `FULL_LIFECYCLE_DELIVERABLES_CATALOG`, `MENU_ITEMS`
- Hooks: `useXxx.ts` — e.g. `useTheme.ts`

**Directories:**
- Lowercase single word: `ui/`, `layout/`, `views/`, `stores/`, `store/`, `data/`, `lib/`, `hooks/`, `styles/`
- Exception: `product/` (feature group, holds ProductManagement + R&D sub-components)

**Exports:**
- Named exports everywhere — no default exports except `App` in `src/App.tsx`
- View components: `export function XxxView() {}` (consumed via `m.XxxView` in lazy importers)
- Stores: `export const useXxxStore = create(...)` plus `export type { ... }` for entity types
- UI primitives: named exports in each file, aggregated in `src/components/ui/index.ts` barrel

**Type Definitions:**
- Domain types live with their initial data: `src/data/mockProducts.ts` defines `Product`, `src/data/mockRndData.ts` defines R&D types
- Types are re-exported from the corresponding store (e.g. `productStore.ts` does `export type { Product } from '../data/mockProducts'`)
- `AppContext.tsx` re-exports everything for backward compatibility

## Where to Add New Code

**New Sidebar Tab / Top-level View:**
1. Create `src/views/MyFeatureView.tsx` — `export function MyFeatureView({ className }: { className?: string })`
2. Add lazy import to `src/App.tsx` (follow the existing pattern: `lazy(() => import('./views/...').then(m => ({ default: m.MyFeatureView })))`)
3. Add a case to `renderContent()` switch in `MainLayout`
4. Add a menu entry to `MENU_ITEMS` in `src/components/layout/Sidebar.tsx`
5. If cross-navigation from another view is needed, add a handler in `MainLayout` and pass as prop (see `handleNavigateToRnd`)

**New UI Primitive:**
1. Create `src/components/ui/MyComponent.tsx` — `forwardRef`, accept `className`, use `cn()` and design tokens
2. Export from `src/components/ui/index.ts`
3. Reference `Card.tsx` for the canonical pattern

**New State Slice:**
1. Decide: extend an existing store or create a new one
2. New store: `src/stores/myStore.ts` with `export const useMyStore = create<MyState>((set, get) => ({ ... }))`
3. Initialize from `src/data/mock*.ts` if domain data is involved
4. Wire into `src/store/AppContext.tsx` ONLY if you need `useApp()` callers to see it (otherwise skip)
5. For cross-store reads inside a store, use `useOtherStore.getState()` — never call hooks inside actions

**New Product/R&D Sub-tab:**
1. Create `src/components/product/MyTab.tsx` — receives `product` prop
2. Import and switch on a tab key in `ProductManagementView.tsx` (add to `DETAIL_TABS`) or `RndCenterView.tsx` (add to `TABS`)
3. If stateful, add actions to the relevant store (`productStore` or `rndStore`)

**New Modal:**
1. Use the existing `Dialog` primitive (`src/components/ui/Dialog.tsx`) — do not create a new modal abstraction
2. Pattern: `<Dialog open={...} onOpenChange={...}><DialogContent><DialogHeader /><DialogFooter /></DialogContent></Dialog>`
3. For feature-specific modals, place in `src/components/product/` (e.g. `CreateProductModal.tsx`)

**New AI Endpoint:**
1. Add a route handler in `server.ts` (follow existing `POST /api/rnd/generate-deliverable` pattern)
2. Read `process.env.GEMINI_API_KEY`; always provide a fallback when missing
3. Wire the frontend by calling `fetch('/api/...')` from a store action — replace existing mock `setTimeout` implementations

**New Utility Function:**
- Tiny shared helper: add to `src/lib/utils.ts` or a new `src/lib/<topic>.ts`
- Domain helper (stateful): put inside the relevant store

**New Hook:**
- `src/hooks/useXxx.ts`, named export

## Special Directories

**`src-tauri/target/`:**
- Purpose: Rust build output
- Generated: Yes
- Committed: No (gitignored)

**`src-tauri/gen/`:**
- Purpose: Tauri-generated scaffolding (Android/iOS/Capabilities)
- Generated: Yes (by `tauri` CLI)
- Committed: Partially — capabilities are checked in under `src-tauri/capabilities/`

**`dist/`:**
- Purpose: Vite production build output (frontend)
- Generated: Yes (`npm run build`)
- Committed: No

**`.planning/codebase/`:**
- Purpose: Architecture/structure/convention documents (this directory)
- Generated: By `/gsd:map-codebase` agent
- Committed: Yes

**`docs/`:**
- Purpose: Unknown — currently untracked in git (appears in `git status` as `??`)
- Generated: No
- Committed: Not yet

---

*Structure analysis: 2026-08-08*
