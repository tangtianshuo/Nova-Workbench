# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Start Express server + Vite dev server (http://localhost:3000)
npm run build        # Production build (Vite)
npm run lint         # TypeScript type checking (tsc --noEmit)
```

### Tauri Desktop
```bash
npm run tauri:dev    # Tauri development (Express + Vite + Rust)
npm run tauri:build  # Tauri production build
```

## Architecture Overview

**Nova** is an Apple-style project management desktop client built with:
- **Frontend:** React 19 + Vite + Tailwind v4
- **Backend:** Express server with Gemini AI integration (server.ts)
- **Desktop:** Tauri v2 wrapper (src-tauri/)
- **State:** Zustand stores (migrating from legacy AppContext)

### Directory Structure

```
src/
├── components/
│   ├── ui/          # 20 Radix-based primitive components (Button, Card, Dialog, etc.)
│   ├── layout/      # TitleBar, Sidebar, Header (desktop chrome)
│   └── product/     # 16 ProductManagementView sub-components (tabs, modals)
├── views/           # 11 lazy-loaded route views
├── stores/          # 6 Zustand stores (task, product, rnd, schedule, workspace, ui)
├── store/           # Legacy AppContext (compatibility layer - delegates to Zustand)
├── styles/          # tokens.css (design system foundation)
├── lib/             # utils.ts (cn), api.ts, icons.ts
├── hooks/           # Custom hooks (useTheme)
└── data/            # Mock data files

src-tauri/src/       # Rust backend (Tauri commands, tray)
server.ts            # Express API endpoints (Gemini AI integration)
```

## Design System

### Tokens (src/styles/tokens.css)
All colors, shadows, radii, and motion values are CSS custom properties mapped to Tailwind utilities via `@theme` directive.

**Key tokens:**
- Colors: `--accent`, `--bg-app`, `--text-primary`, `--border`, `--color-success/warning/danger`
- Radius: `--radius-sm/md/lg/xl` (6px/10px/14px/20px)
- Motion: `--ease-spring`, `--duration-fast/normal/slow`

**Usage in components:**
```tsx
// Use semantic token classes, not hardcoded colors
<div className="bg-bg-primary text-text-primary border-border-subtle">
<Button className="bg-accent text-white hover:bg-accent-hover">
```

### Icons
Use `@phosphor-icons/react` with `weight="duotone"`:
```tsx
import { Sparkle, Folder, CheckCircle } from '@phosphor-icons/react';
<Sparkle size={16} weight="duotone" />
```

### UI Components (src/components/ui/)
All built on Radix primitives with design tokens. Key components:
- **Card** - variants: default, elevated, glass, interactive, dark
- **Button** - variants: primary, secondary, ghost, danger
- **Dialog** - replaces all modals (Dialog/DialogContent/DialogHeader/DialogFooter)
- **Badge** - variants: default, accent, success, warning, danger, neutral
- **Input/Textarea** - with label support, icon slots
- **Select** - Radix Select composition (Select/SelectTrigger/SelectContent/SelectItem)

### Utility: cn() (src/lib/utils.ts)
```tsx
import { cn } from '@/src/lib/utils';
<div className={cn('base-class', isActive && 'active-class', className)} />
```

## State Management

### Current Pattern (Compatibility Layer)
`useApp()` from `src/store/AppContext.tsx` wraps Zustand stores for backward compatibility. Views should migrate to direct store usage:

```tsx
// Legacy (still works)
const { projects, addProject } = useApp();

// Preferred (direct store access)
import { useProductStore } from '@/src/stores/productStore';
const { projects, addProject } = useProductStore();
```

### Zustand Stores (src/stores/)
- **taskStore** - Tasks, categories, completion
- **productStore** - Products, documents, skills, milestones
- **rndStore** - R&D center (requirements, prototypes, knowledge, code, tests, competitors, deliverables)
- **scheduleStore** - Calendar events
- **workspaceStore** - Workspaces, local files
- **uiStore** - activeTab, selectedProductId, theme, modal flags

## Views & Routing

Views are lazy-loaded in `src/App.tsx` with `React.lazy()` + `Suspense`. No router library - uses `activeTab` state in MainLayout.

**View pattern:**
```tsx
export function SomeView({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      <Card>...</Card>
    </div>
  );
}
```

## Animations

Use `motion` from `motion/react` (Framer Motion):
```tsx
import { motion, AnimatePresence } from 'motion/react';

// Page transitions
<AnimatePresence mode="wait">
  <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    {content}
  </motion.div>
</AnimatePresence>

// Spring physics
<motion.div transition={{ type: 'spring', stiffness: 350, damping: 30 }} />

// Interactive elements
<motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} />
```

## Backend (server.ts)

Express server provides AI endpoints using Gemini API:
- `POST /api/generate-project` - AI project generation
- `POST /api/summarize-workspace` - AI workspace summary
- `GET /api/workspace-files` - List local files

**Environment:** Set `GEMINI_API_KEY` in `.env` file.

## Tauri Integration

Tauri wraps the web app as a native desktop client:
- **Config:** `src-tauri/tauri.conf.json`
- **Window:** Frameless (`decorations: false`), transparent, custom TitleBar
- **IPC:** Tauri commands in `src-tauri/src/lib.rs` (currently minimal - Express fallback for dev)

**Platform detection:**
```tsx
import { isTauri } from '@/src/lib/api';
if (isTauri()) { /* use Tauri APIs */ }
```

## Common Patterns

### Modal/Dialog
```tsx
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/src/components/ui/Dialog';

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader title="Title" description="Description" />
    {/* content */}
    <DialogFooter>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button variant="primary" onClick={handleSave}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Card with glass effect
```tsx
<Card variant="glass" className="p-6">
  <h2>Glass Card</h2>
</Card>
```

### Badge with semantic variant
```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Error</Badge>
```

## Code Splitting

Views are automatically code-split via lazy loading in App.tsx. Product sub-components are bundled with ProductManagementView.

## Notes

- **No pure white/black:** Design tokens use off-white (#F2F4F8) and off-black (#161A22)
- **Phosphor icons only:** All lucide-react icons have been migrated to @phosphor-icons/react
- **Tailwind v4:** Uses `@theme` directive instead of tailwind.config.js
- **Desktop-optimized:** Font sizes are smaller (14px base), compact spacing
- **Dark mode:** Tokens defined but not yet wired to UI (Phase 7 technical debt)

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Nova-PM-Workspace**

Nova 是一个 **AI native 的产品经理桌面工作台**,基于 Tauri v2 + React 19。当前 v0.1.0 已交付完整的 PM 视图框架(产品/任务/研发/日程/文件/知识库)、Apple 风格设计系统、以及 Gemini Express 后端。下一步目标是按 `docs/ARCHITECTURE.md` 蓝图,把"AI native Agent 工作台"从 UI 框架落地到真正的 Rust 原生后端(GraphFlow + Rig + LanceDB + SQLite,零 Sidecar)。

**Core Value:** 让产品经理拥有一个**懂你、能替你干活**的桌面 AI Agent —— 不是 chatbot,而是能跑 Pipeline(需求→PRD→原型→代码→测试)、有第二大脑、关键节点 HITL 的真 Agent。

### Constraints

- **Tech stack**: React 19 + Tauri v2 + Tailwind v4(已锁,不重构)
- **Granularity**: Coarse — v1 控制在 3-5 个 phase(用户选择)
- **No sidecar**: 不引入 Node.js 子进程做 LLM/工作流;最终目标全 Rust
- **Backward compat**: AppContext.tsx 兼容层在所有 view 迁移完之前不删
- **Distribution**: 桌面构建为 Tauri app(Windows/macOS/Linux),Web 模式作为 dev fallback
- **Security**: API key 不进客户端 bundle;Tauri CSP 必须显式声明(当前 `csp: null` 是 debt)
- **Persistence**: 本地优先,先 localStorage(zustand persist)再 SQLite(Tauri SQL 插件)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ~5.8.2 - Frontend (React views, components, stores) and backend (`server.ts` Express API)
- Rust (edition 2021) - Tauri v2 native shell (`src-tauri/src/lib.rs`, `main.rs`)
- CSS - Tailwind v4 + design tokens (`src/styles/tokens.css`)
- JSON - Configuration (`package.json`, `tsconfig.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`)
## Runtime
- Node.js (target ES2022; `@types/node` ^22.14.0 present)
- Tauri webview (system WebView2/WKWebView/WebKitGTK)
- Bun-compatible (Tauri `beforeDevCommand` / `beforeBuildCommand` invoke `bunx tsx` / `bunx vite build`)
- npm (scripts in `package.json` use `npm run`)
- Lockfile: not detected in initial scan (`package-lock.json` / `bun.lockb` presence unverified)
## Frameworks
- React 19.0.1 + react-dom 19.0.1 - UI library (`src/`)
- Vite 6.2.3 - Dev server + production bundler (`vite.config.ts`, integrated as middleware inside `server.ts` in dev)
- Express 4.21.2 - Backend HTTP server (`server.ts`) hosting `/api/*` endpoints and SPA static fallback
- Tauri v2 (`tauri` crate) - Native desktop wrapper (`src-tauri/`)
- Not detected. No test runner (jest/vitest), no `*.test.*` files, no test script in `package.json`. `npm run lint` runs `tsc --noEmit` (typecheck only).
- esbuild 0.25.0 - Bundles `server.ts` to `dist/server.cjs` for production (`build:server` script)
- tsx 4.21.0 - Runs `server.ts` directly in dev (`dev` script)
- @vitejs/plugin-react 5.0.4 - React Fast Refresh / JSX in Vite
- @tailwindcss/vite 4.1.14 - Tailwind v4 Vite plugin (no `tailwind.config.js`; uses `@theme` directive)
- @tauri-apps/cli 2.11.4 - `tauri dev` / `tauri build` orchestration
## Key Dependencies
- react / react-dom 19.0.1 - React 19, JSX runtime (`"jsx": "react-jsx"`)
- zustand 5.0.14 - State management. Six stores under `src/stores/` (task, product, rnd, schedule, workspace, ui). Legacy `src/store/AppContext.tsx` is a compatibility shim.
- @radix-ui/react-* (checkbox, dialog, dropdown-menu, popover, scroll-area, select, separator, slot, switch, tabs, tooltip) - Primitives backing `src/components/ui/`
- motion 12.23.24 - Framer Motion (imported as `motion/react`) for page/element animations
- @phosphor-icons/react 2.1.10 - Icon library, `weight="duotone"` is the project convention. `src/lib/icons.ts` is the central re-export/migration map.
- tailwind-merge 3.6.0 + clsx 2.1.1 - Powering `cn()` helper in `src/lib/utils.ts`
- recharts 3.10.1 - Charts (used by R&D analytics views)
- react-markdown 10.1.0 - Rendering AI-generated Markdown content
- lucide-react 0.546.0 - Legacy; CLAUDE.md notes migration to Phosphor. `src/lib/icons.ts` documents the migration.
- @google/genai 2.4.0 - Google Gemini SDK used in `server.ts` (model `gemini-3.6-flash`)
- express 4.21.2 - API host
- dotenv 17.2.3 - Loads `GEMINI_API_KEY` from `.env`
- @tauri-apps/api 2.11.1 - IPC bridge (`src/components/layout/TitleBar.tsx` uses `getCurrentWindow()`)
- tauri (Rust crate, v2, `macos-private-api` feature) + tauri-plugin-shell 2 - Native shell (`src-tauri/Cargo.toml`)
- serde 1 / serde_json 1 - Rust serialization (currently minimal; no custom commands defined yet)
- @fontsource/geist 5.3.0 + @fontsource/geist-mono 5.3.0 - Self-hosted Geist font family
## Configuration
- `.env` file present (existence only; contents not read). `.env.example` exists but is also in a denied path - treat as authoritative reference for required vars.
- Required env var: `GEMINI_API_KEY` (used by every AI endpoint in `server.ts`; endpoints fall back to canned text when unset)
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
- `jsx: react-jsx`, `experimentalDecorators: true`, `useDefineForClassFields: false`
- Path alias: `@/*` → `./*` (project root, so imports look like `@/src/lib/utils`)
- `noEmit: true` (Vite/esbuild handle emission)
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- Alias `@` → project root
- `base: './'` when `TAURI_ENV_PLATFORM` set (Tauri production), `'/'` otherwise
- HMR enabled unless `DISABLE_HMR=true`
- `productName: Nova`, `identifier: com.nova.pm-workspace`, version 0.1.0
- Dev URL: `http://localhost:3000`; frontendDist: `../dist`
- Window: 1440x900 (min 1024x680), `decorations: false`, `transparent: true`, `center: true`, `macOSPrivateApi: true`
- `csp: null` (no Content Security Policy enforced)
- Bundle targets: all (icns/ico/png)
- Capabilities (`src-tauri/capabilities/default.json`): core defaults + window controls (minimize/maximize/toggle/close/start-dragging/is-maximized/set-resizable) + `shell:allow-open`
- `npm run build` → Vite build (frontend only)
- `npm run build:server` → esbuild bundles `server.ts` → `dist/server.cjs` (CJS, externalized packages, sourcemap)
- `npm run start` → `node dist/server.cjs` (production server)
- `npm run tauri:build` → Tauri production desktop bundle (runs `bunx vite build` first per `beforeBuildCommand`)
## Platform Requirements
- Node.js 22+, npm
- Optional: Bun (Tauri's before-commands invoke `bunx`; falls back to npx-style resolution)
- Rust toolchain + Tauri v2 prerequisites (for `tauri:dev` / `tauri:build`)
- `GEMINI_API_KEY` env var for AI features (without it, endpoints return canned fallbacks)
- Desktop bundle via Tauri (Windows `.exe`/`.msi`, macOS `.app`/`.dmg`, Linux AppImage)
- Production web mode also supported: `npm run build && npm run start` serves SPA + Express API on port 3000, bound to `0.0.0.0`
- Express server is the single process: hosts both `/api/*` and the static SPA / Vite middleware
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Components: `PascalCase.tsx` (e.g., `Button.tsx`, `ProductOverviewTab.tsx`, `CreateProductModal.tsx`)
- Stores: `camelCaseStore.ts` suffix (e.g., `productStore.ts`, `taskStore.ts`, `uiStore.ts`)
- Non-component modules: `camelCase.ts` (e.g., `utils.ts`, `icons.ts`, `api.ts`)
- Views: `PascalCaseView.tsx` suffix (e.g., `ScheduleView.tsx`, `SettingsView.tsx`)
- Mock data: `mock<Domain>.ts` (e.g., `src/data/mockProducts.ts`, `src/data/mockTasks.ts`)
- Hooks: `use<Verb>.ts` (e.g., `src/hooks/useTheme.ts`)
- React components: `PascalCase` (e.g., `Button`, `ProductManagementView`, `ToastContainer`)
- Hooks: `use` prefix camelCase (e.g., `useTheme`, `useToast`, `useTauriWindow`, `useApp`)
- Store creators: `use<Domain>Store` (e.g., `useProductStore`, `useRndStore`, `useUIStore`)
- Handlers/helpers inside components: `camelCase` (e.g., `handleSubmit`, `getHeaderInfo`, `getStatusBadge`)
- Constants: `UPPER_SNAKE_CASE` for module-level config (e.g., `STAGE_BADGE`, `DETAIL_TABS`, `NAV_ITEMS`, `EVENT_COLORS`, `MENU_ITEMS`)
- Local state: `camelCase` (e.g., `activeTab`, `searchQuery`, `selectedStage`)
- Boolean state: `is`/`show`/`has` prefix (e.g., `isActive`, `showCreateProductModal`, `hasEvents`)
- Types: `PascalCase` (e.g., `Variant`, `Size`, `ToastType`, `Theme`)
- Props interfaces: `Props` suffix or named by purpose (e.g., `ButtonProps`, `CardProps`, `SidebarProps`, `TabsListProps`)
- Union types use string literals: `'primary' | 'secondary' | 'ghost' | 'danger' | 'link'`
- State interfaces: `<Domain>State` (e.g., `ProductState`, `ToastContextValue`)
## Code Style
- No Prettier/ESLint config present — style enforced by convention and `cn()` helper
- 2-space indentation
- Single quotes for strings (`'primary'`, `'text-primary'`)
- Trailing commas in multi-line objects/arrays
- Semicolons omitted on most lines (imports, declarations) but used inside JSX className strings
- JSX across multiple lines when 3+ props
- No ESLint config in project (only `tsc --noEmit` via `npm run lint`)
- Type errors are the only enforced gate. Style drift is possible — match surrounding code.
- Strict-ish config in `tsconfig.json`: `target: ES2022`, `moduleResolution: bundler`, `jsx: react-jsx`, `isolatedModules: true`, `noEmit: true`
- `experimentalDecorators: true`, `useDefineForClassFields: false`
- `allowImportingTsExtensions: true` — imports may include `.tsx`/`.ts` suffix (e.g., `import App from './App.tsx'` in `src/main.tsx`)
- `skipLibCheck: true`
- Types defined inline next to consumers; no separate `types/` directory except `src/types.ts`
## Import Organization
- `@/*` → project root (configured in `tsconfig.json` and `vite.config.ts`)
- `@/src/lib/utils` for `cn`
- `@/src/components/ui/*` for design system primitives
- Relative paths (`../`, `./`) used for sibling modules inside views/components
- Inconsistency: some files mix alias and relative imports for the same purpose. Prefer `@/src/...` alias for cross-directory imports, relative for siblings.
- `src/components/ui/index.ts` re-exports all UI primitives. Import from `'@/src/components/ui'` (or `'../ui'`) to get `Button`, `Card`, `Dialog`, `DialogHeader`, `Input`, etc. in one statement. See `src/components/product/CreateProductModal.tsx` for the pattern.
## Component Patterns
- Built on Radix primitives (`@radix-ui/react-*`) wrapped with design tokens
- Use `forwardRef` for interactive elements (Button, Card, Input, Badge, Avatar, Checkbox)
- Set `<Component>.displayName = '<Name>'` after `forwardRef` declaration
- Variants via `Record<Variant, string>` map + `variantStyles[variant]` lookup
- Sizes via `Record<Size, string>` map + `sizeStyles[size]` lookup
- Compose classes with `cn('base classes', variantStyles[variant], className)` — `className` ALWAYS last so consumers override
- Default export only for `App.tsx` (`export default function App()`); all other components use named exports
- Extend native HTML attributes: `interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, MotionConflict>`
- Motion/React conflict: when wrapping with `motion.<el>`, omit `onDrag*`/`onAnimation*` from native props via `type MotionConflict = 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'`
- Signature: `export function SomeView({ className }: { className?: string })` or with specific props
- Wrap root in `<div className={cn('space-y-6', className)}>` (or layout-specific class)
- Consume state via `useApp()` from `src/store/AppContext.tsx` (compatibility layer) — preferred future pattern is direct store access via `useProductStore()`, `useTaskStore()`, etc.
- Local UI state via `useState` (modals, filters, search query, active tab)
- Use `<Dialog>` + `<DialogContent>` + `<DialogHeader title=... description=...>` + `<DialogFooter>` composition from `src/components/ui/Dialog.tsx`
- State lifted to parent: `const [isOpen, setIsOpen] = useState(false)` then `<Dialog open={isOpen} onOpenChange={setIsOpen}>`
- Modal components accept `onClose: () => void` prop (e.g., `CreateProductModal`, `AddDocumentModal`)
- Cancel button uses `<Button variant="secondary">`, primary action uses `<Button variant="primary">`
## Styling
- Defined in `src/styles/tokens.css` as CSS custom properties (HSL components)
- Bridged to Tailwind v4 via `@theme` in `src/index.css` (`--color-accent: hsl(var(--accent))`)
- **Forbidden:** `bg-white`, `bg-black`, `text-gray-500`, hex colors
- **Allowed:** `bg-bg-primary`, `bg-bg-secondary`, `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `border-border-subtle`, `bg-accent`, `text-accent`, `text-success/warning/danger`
- Exception: `Card` `dark` variant uses literal gradients (`from-slate-950 via-indigo-950/90`) — special-case hero panels only
- Use `rounded-[var(--radius-sm|md|lg|xl)]` for explicit control
- Or rely on component defaults (Card uses `--radius-lg`, Button uses `--radius-md`)
- `cn(...inputs)` from `@/src/lib/utils` for class merging (clsx + tailwind-merge)
- `when(condition, className)` helper for conditional classes (rarely used; prefer `&&` inside `cn()`)
- Glass effect: `glass` or `glass-subtle` custom utility classes from `src/index.css`
- Tauri drag: `.drag-region` / `.no-drag` custom utilities
- Base font 14px (`text-sm` ≈ 13px, `text-md` ≈ 15px)
- Compact: `px-3 py-1.5` for buttons, `p-5` for card content, `gap-2` for button groups
- Heights fixed via `h-9` (input), `h-8` (md button), `h-7` (sm button), `h-6` (xs button)
## Animation Patterns
- Page transitions: `stiffness: 350, damping: 30`
- Modal/card hover: `stiffness: 400, damping: 30`
- Tap feedback: `whileTap={{ scale: 0.97 }}`
- Hover lift: `whileHover={{ y: -2 }}` with `transition={{ type: 'spring', stiffness: 400, damping: 25 }}`
- Checkbox/indicator pop-in: `stiffness: 500, damping: 25`
- SegmentedControl sliding indicator: `layoutId="segmented-indicator"` + `stiffness: 400, damping: 30`
## Icons
- Default `weight="duotone"` for the Apple-style feel
- Sizes: `12` (inline in badges), `14` (small UI), `16` (default), `20` (card headers), `40` (placeholder heroes)
- Active state icons use `weight="fill"` (see `src/views/SettingsView.tsx`)
- Alias layer in `src/lib/icons.ts` provides `Icon`-prefixed names (e.g., `IconSearch`, `IconBot`) — but most files import directly from `@phosphor-icons/react` using the Phosphor native names (e.g., `MagnifyingGlass`, `Robot`, `CaretDown`). Prefer direct import; use the alias only when migrating legacy lucide names.
## State Management
- Created via `create<StateInterface>((set, get) => ({ ... }))`
- Mutations use immutable spreads: `set((state) => ({ products: state.products.map(...) }))`
- Async actions return `{ success: boolean, ... }` (see `runProductSkill` in `src/stores/productStore.ts`)
- Simulate async with `await new Promise((r) => setTimeout(r, 1400))` for demo flows
- Each store owns one domain: task, product, rnd, schedule, workspace, ui
- `useApp()` from `src/store/AppContext.tsx` wraps all Zustand stores into a single context for legacy code
- 30 files still use `useApp()` — including most views and `src/App.tsx`
- **Preferred for new code:** direct store hooks (`useProductStore()`, `useTaskStore()`, etc.)
- `AppContext.tsx` re-exports all types for backward compatibility
- Initial state seeded from `src/data/mock*.ts` files
- Types co-located in mock files (e.g., `Product`, `ProductMilestone`, `ProductDocument` in `src/data/mockProducts.ts`) and re-exported from stores
## Error Handling
- Minimal error boundaries — relies on React's default handling
- Form validation: early-return guard pattern (`if (!name.trim()) return;` in `CreateProductModal.tsx`)
- Context hook throws if used outside provider: `if (!ctx) throw new Error('useToast must be used within ToastProvider')` (see `src/components/ui/Toast.tsx`)
- Optional chaining heavily used: `currentProduct?.tagline`, `product?.stage`
- Visual error state via props (`error` prop on Input/Textarea shows red border + helper text)
- Every endpoint wrapped in `try/catch`
- Error response: `res.status(500).json({ error: error.message })` with `console.error(...)` log
- AI endpoints fall back gracefully when `GEMINI_API_KEY` is unset — return mock/markdown fallback content
- Type assertions: `(err: any)` in catch blocks, `(f: any)` in map callbacks for untyped API inputs
- `useToast()` hook for user-facing success/error feedback: `toast({ type: 'success', title: '...', description: '...' })`
- Auto-dismiss after 4s default (configurable via `duration`)
## Logging
- `console.error()` for caught errors in `server.ts` AI endpoints
- `console.log()` appears only in legacy `src/components/ProjectCreateModal.tsx` and `src/components/WorkspaceSummaryModal.tsx` (debug leftovers)
- No structured logging, no levels, no transport
## Comments
- File headers explaining purpose (see `src/lib/icons.ts`, `src/lib/utils.ts`, `src/store/AppContext.tsx`)
- Section dividers inside files: `/* === Section Name === */` or `/* --- Section --- */` (see `Dialog.tsx`, `Toast.tsx`)
- Migration/debt notes: "Legacy (still works)" / "This file will be removed once..." (see `AppContext.tsx` header)
- Platform-specific quirk notes (see `TitleBar.tsx`: `__TAURI_INTERNALS__ is always injected by Tauri v2`)
- `#![cfg_attr(...)]` style comment in Rust (`src-tauri/src/main.rs`)
- Sparse. Used on `cn()` and `when()` in `src/lib/utils.ts`, on `SegmentedControl` describing Apple-style behavior, on store hook signatures
- Most functions have no JSDoc — code is self-documenting via clear naming
## Function Design
- Destructured props with explicit types: `({ className, variant = 'primary', ...props }: ButtonProps)`
- Default values in destructuring (`variant = 'primary'`, `size = 'md'`)
- Rest spread for native HTML attrs: `...props` forwarded to underlying element
- React nodes for components
- For async store actions: `{ success: true, timestamp: ... }` or void
- For event handlers: void (early-return for validation)
## Module Design
- Named exports for all components (`export function Button`, `export const Card = forwardRef(...)`)
- Default export only for `src/App.tsx`
- Re-export types alongside values: `export type { Product } from '../data/mockProducts'`
- Barrel file `src/components/ui/index.ts` aggregates all UI primitives — import from there in feature code
- Component + types + sub-components in one file (e.g., `Card.tsx` exports `Card`, `CardHover`, `CardHeader`, `CardContent`, `CardFooter`)
- Mock data + types in same file (`src/data/mockProducts.ts`)
- Store + state interface + types in same file (`src/stores/productStore.ts`)
- Views lazy-loaded in `src/App.tsx` via `React.lazy(() => import('./views/X').then(m => ({ default: m.X })))`
- Suspense fallback: `<ViewLoading />` skeleton
- Product sub-components bundled with `ProductManagementView` (not lazy)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Tab-switching SPA (not URL-routed) — view chosen via `activeTab` switch in `src/App.tsx`
- Code-splitting per view via `React.lazy` + `Suspense`
- Zustand stores as single source of truth; `AppContext` is a delegation layer, not the source
- Frameless Tauri window with custom `TitleBar` (drag region + platform-specific window controls)
- Design tokens (CSS custom properties) bridged to Tailwind v4 via `@theme` in `src/index.css`
- Express dev server doubles as the production server — Vite middleware in dev, static dist in prod
- AI features (Gemini) live in the server, frontend never sees the API key
## Layers
- Purpose: Top-level route screens; one per sidebar tab
- Location: `src/views/`
- Contains: 8 lazy-loaded view components (`AgentWorkspaceView`, `TaskManagementView`, `ProductManagementView`, `RndCenterView`, `ScheduleView`, `FileArchiveView`, `KnowledgeBaseView`, `SettingsView`). Also `PlaceholderView`, `ProjectOverviewView`, `SmartAnalysisView` (not currently routed)
- Depends on: `useApp()` context, `components/ui/*`, `components/product/*` (for ProductManagement/RndCenter)
- Used by: `MainLayout` in `src/App.tsx`
- Purpose: Heavy, view-specific UI broken out of the view file
- Location: `src/components/product/` (16 files for the Product + R&D tabs), `src/components/` (8 standalone: `TaskKanban`, `ProjectCreateModal`, `AIAssistantPanel`, `ProjectTimeline`, `ProjectVisualizer`, `SetAsWorkspaceModal`, `WorkspaceSummaryModal`, `StatsRow`, `AddWorkspaceModal`)
- Contains: Tab panels, modals, kanban, timeline, AI panels — all bundled with their parent view (not lazy)
- Depends on: `useApp()` context, `components/ui/*`
- Used by: `views/ProductManagementView.tsx`, `views/RndCenterView.tsx`, `views/FileArchiveView.tsx`
- Purpose: Reusable Radix + motion + Tailwind components, themable via tokens
- Location: `src/components/ui/` (20 components) with barrel `src/components/ui/index.ts`
- Contains: `Card`, `Button`, `Badge`, `Dialog`, `Input`, `Textarea`, `Select`, `Tabs`, `Switch`, `Checkbox`, `Tooltip`, `Popover`, `Toast`, `Avatar`, `DropdownMenu`, `ProgressBar`, `SegmentedControl`, `Separator`, `Skeleton`, `ScrollArea`
- Depends on: `@radix-ui/*`, `motion/react`, `cn()` from `src/lib/utils.ts`, design tokens
- Used by: Every layer above. Always import primitives from here — do not re-implement
- Purpose: Window frame, navigation, page header
- Location: `src/components/layout/` — `TitleBar.tsx`, `Sidebar.tsx` (exports `MENU_ITEMS`), `Header.tsx`
- Contains: Frameless-window controls (macOS traffic lights + Windows controls via `@tauri-apps/api/window`), sidebar nav, header with title/subtitle
- Depends on: Tauri window APIs (only inside `TitleBar`), tokens, `motion`
- Used by: `MainLayout`
- Purpose: Domain state and actions
- Location: `src/stores/`
- Contains: All business logic (AI generation is mocked with `setTimeout` — real AI lives in `server.ts`)
- Depends on: `src/data/mock*.ts` for initial state and type definitions
- Used by: `AppContext` (subscribes and re-exports) and — preferred — direct hook calls from views/components
- Purpose: Bridge old `useApp()` callers to the new Zustand stores during migration
- Location: `src/store/AppContext.tsx`
- Contains: One large context value aggregating subscriptions from all 6 stores; re-exports all store types
- Depends on: All 6 stores
- Used by: Most existing views still call `useApp()`. New code should call stores directly (e.g. `useProductStore()`)
- Removal: Tracked as future debt once all callers migrate
- Purpose: Hosts the AI endpoints; serves Vite dev middleware or static dist in prod
- Location: `server.ts` (root, single file)
- Contains: 5 endpoints — `POST /api/generate-project`, `POST /api/summarize-workspace`, `GET /api/workspace-files`, `POST /api/rnd/generate-deliverable`, `POST /api/rnd/polish-knowledge-article`. Falls back gracefully when `GEMINI_API_KEY` is missing (returns hardcoded templates)
- Depends on: `@google/genai`, `express`, `vite` (dev only), `dotenv`
- Used by: Frontend via `fetch` from views/components
- Purpose: Native desktop wrapper
- Location: `src-tauri/` — `src/main.rs` (entry), `src/lib.rs` (`run()` builder), `tauri.conf.json`, `Cargo.toml`, `capabilities/default.json`
- Contains: Minimal Rust — only window setup (`set_min_size 1024x680`), shell plugin. No Tauri commands defined; frontend uses `@tauri-apps/api/window` directly from JS for window controls
- Depends on: `tauri` 2, `tauri-plugin-shell`
- Used by: `npm run tauri:dev` / `npm run tauri:build` which spawn `bunx tsx server.ts` as `beforeDevCommand`
## Data Flow
- Zustand stores are the source of truth. Components subscribe via `useXxxStore((s) => s.field)` selectors
- `AppContext` subscribes to every store and re-exports as a single context value — convenience for old code, slight re-render overhead
- Cross-store access inside stores uses `useOtherStore.getState()` (see `rndStore.getProd`) — never call hooks inside store actions
## Key Abstractions
- Purpose: A product/project being managed. Drives most of the app's screens
- Defined in: `src/data/mockProducts.ts`, re-exported from `src/stores/productStore.ts` as `Product` and aliased as `Project`
- Pattern: Single type used across product, R&D, schedule, workspace stores; selected via `uiStore.selectedProductId`
- Purpose: 18 canonical R&D deliverables generated per product (PRD, arch doc, API spec, etc.)
- Defined in: `src/data/mockRndData.ts` (`FULL_LIFECYCLE_DELIVERABLES_CATALOG`); materialized per-product by `buildInitialDeliverables()` in `rndStore.ts`
- Pattern: Catalog + per-product instances keyed by `productId` in `deliverables: Record<string, FullLifecycleDeliverable[]>`
- Purpose: Single source for color/radius/motion values, theming hook for dark mode
- Defined in: `src/styles/tokens.css` (CSS custom properties) and bridged to Tailwind via `@theme` in `src/index.css`
- Pattern: Always use semantic Tailwind classes (`bg-bg-primary`, `text-text-secondary`, `border-border-subtle`, `bg-accent`) — never raw hex/rgb
- Purpose: Composable design-system building block (Radix + motion + tokens)
- Pattern: `forwardRef` component, accepts `className` last, merges via `cn()`, exposes variants via discriminated `variant` prop. See `Card.tsx` for canonical example
- Examples: `src/components/ui/Card.tsx`, `Button.tsx`, `Dialog.tsx`, `Badge.tsx`
## Entry Points
- Location: `src/main.tsx`
- Triggers: Browser load (dev: Vite middleware in `server.ts`; prod: static `dist/index.html`)
- Responsibilities: `createRoot(...).render(<App />)` in `StrictMode`, imports `index.css`
- Location: `src-tauri/src/main.rs` → `nova_lib::run()` in `src-tauri/src/lib.rs`
- Triggers: `npm run tauri:dev` / `tauri:build`
- Responsibilities: Tauri builder, register shell plugin, set min window size, load `http://localhost:3000` (dev) or embedded dist (prod)
- Location: `server.ts` → `startServer()`
- Triggers: `npm run dev`, `npm start`, or Tauri's `beforeDevCommand`
- Responsibilities: Express app, AI endpoints, Vite middleware (dev) or static dist (prod), listens on `0.0.0.0:3000`
## Error Handling
- Server endpoints: `try/catch` per handler, log to `console.error`, return `res.status(500).json({ error: error.message })`
- Stores: AI mock actions swallow errors silently — `await new Promise(r => setTimeout(r, ...))` cannot fail
- Components: No error boundaries detected. Render errors crash the view
- Toast notifications exist (`src/components/ui/Toast.tsx`, `useToast()`) but are not systematically used for error reporting
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
