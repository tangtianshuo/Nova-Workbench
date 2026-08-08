# Coding Conventions

**Analysis Date:** 2026-08-08

## Naming Patterns

**Files:**
- Components: `PascalCase.tsx` (e.g., `Button.tsx`, `ProductOverviewTab.tsx`, `CreateProductModal.tsx`)
- Stores: `camelCaseStore.ts` suffix (e.g., `productStore.ts`, `taskStore.ts`, `uiStore.ts`)
- Non-component modules: `camelCase.ts` (e.g., `utils.ts`, `icons.ts`, `api.ts`)
- Views: `PascalCaseView.tsx` suffix (e.g., `ScheduleView.tsx`, `SettingsView.tsx`)
- Mock data: `mock<Domain>.ts` (e.g., `src/data/mockProducts.ts`, `src/data/mockTasks.ts`)
- Hooks: `use<Verb>.ts` (e.g., `src/hooks/useTheme.ts`)

**Functions & Components:**
- React components: `PascalCase` (e.g., `Button`, `ProductManagementView`, `ToastContainer`)
- Hooks: `use` prefix camelCase (e.g., `useTheme`, `useToast`, `useTauriWindow`, `useApp`)
- Store creators: `use<Domain>Store` (e.g., `useProductStore`, `useRndStore`, `useUIStore`)
- Handlers/helpers inside components: `camelCase` (e.g., `handleSubmit`, `getHeaderInfo`, `getStatusBadge`)

**Variables:**
- Constants: `UPPER_SNAKE_CASE` for module-level config (e.g., `STAGE_BADGE`, `DETAIL_TABS`, `NAV_ITEMS`, `EVENT_COLORS`, `MENU_ITEMS`)
- Local state: `camelCase` (e.g., `activeTab`, `searchQuery`, `selectedStage`)
- Boolean state: `is`/`show`/`has` prefix (e.g., `isActive`, `showCreateProductModal`, `hasEvents`)

**Types & Interfaces:**
- Types: `PascalCase` (e.g., `Variant`, `Size`, `ToastType`, `Theme`)
- Props interfaces: `Props` suffix or named by purpose (e.g., `ButtonProps`, `CardProps`, `SidebarProps`, `TabsListProps`)
- Union types use string literals: `'primary' | 'secondary' | 'ghost' | 'danger' | 'link'`
- State interfaces: `<Domain>State` (e.g., `ProductState`, `ToastContextValue`)

## Code Style

**Formatting:**
- No Prettier/ESLint config present — style enforced by convention and `cn()` helper
- 2-space indentation
- Single quotes for strings (`'primary'`, `'text-primary'`)
- Trailing commas in multi-line objects/arrays
- Semicolons omitted on most lines (imports, declarations) but used inside JSX className strings
- JSX across multiple lines when 3+ props

**Linting:**
- No ESLint config in project (only `tsc --noEmit` via `npm run lint`)
- Type errors are the only enforced gate. Style drift is possible — match surrounding code.

**TypeScript:**
- Strict-ish config in `tsconfig.json`: `target: ES2022`, `moduleResolution: bundler`, `jsx: react-jsx`, `isolatedModules: true`, `noEmit: true`
- `experimentalDecorators: true`, `useDefineForClassFields: false`
- `allowImportingTsExtensions: true` — imports may include `.tsx`/`.ts` suffix (e.g., `import App from './App.tsx'` in `src/main.tsx`)
- `skipLibCheck: true`
- Types defined inline next to consumers; no separate `types/` directory except `src/types.ts`

## Import Organization

**Order (observed in most files):**
1. React hooks (`useState`, `useEffect`, `forwardRef`, `lazy`, `Suspense`)
2. Third-party (`motion/react`, `@phosphor-icons/react`, `@radix-ui/*`, `zustand`)
3. App UI primitives via `@/src/...` alias (Card, Button, Badge, etc.)
4. Local components via relative paths (`../components/...`, `../store/AppContext`)
5. Utilities (`@/src/lib/utils`)

**Path Aliases:**
- `@/*` → project root (configured in `tsconfig.json` and `vite.config.ts`)
- `@/src/lib/utils` for `cn`
- `@/src/components/ui/*` for design system primitives
- Relative paths (`../`, `./`) used for sibling modules inside views/components
- Inconsistency: some files mix alias and relative imports for the same purpose. Prefer `@/src/...` alias for cross-directory imports, relative for siblings.

**Barrel File:**
- `src/components/ui/index.ts` re-exports all UI primitives. Import from `'@/src/components/ui'` (or `'../ui'`) to get `Button`, `Card`, `Dialog`, `DialogHeader`, `Input`, etc. in one statement. See `src/components/product/CreateProductModal.tsx` for the pattern.

## Component Patterns

**UI Primitives (`src/components/ui/`):**
- Built on Radix primitives (`@radix-ui/react-*`) wrapped with design tokens
- Use `forwardRef` for interactive elements (Button, Card, Input, Badge, Avatar, Checkbox)
- Set `<Component>.displayName = '<Name>'` after `forwardRef` declaration
- Variants via `Record<Variant, string>` map + `variantStyles[variant]` lookup
- Sizes via `Record<Size, string>` map + `sizeStyles[size]` lookup
- Compose classes with `cn('base classes', variantStyles[variant], className)` — `className` ALWAYS last so consumers override
- Default export only for `App.tsx` (`export default function App()`); all other components use named exports
- Extend native HTML attributes: `interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, MotionConflict>`
- Motion/React conflict: when wrapping with `motion.<el>`, omit `onDrag*`/`onAnimation*` from native props via `type MotionConflict = 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'`

**Views (`src/views/`):**
- Signature: `export function SomeView({ className }: { className?: string })` or with specific props
- Wrap root in `<div className={cn('space-y-6', className)}>` (or layout-specific class)
- Consume state via `useApp()` from `src/store/AppContext.tsx` (compatibility layer) — preferred future pattern is direct store access via `useProductStore()`, `useTaskStore()`, etc.
- Local UI state via `useState` (modals, filters, search query, active tab)

**Modals:**
- Use `<Dialog>` + `<DialogContent>` + `<DialogHeader title=... description=...>` + `<DialogFooter>` composition from `src/components/ui/Dialog.tsx`
- State lifted to parent: `const [isOpen, setIsOpen] = useState(false)` then `<Dialog open={isOpen} onOpenChange={setIsOpen}>`
- Modal components accept `onClose: () => void` prop (e.g., `CreateProductModal`, `AddDocumentModal`)
- Cancel button uses `<Button variant="secondary">`, primary action uses `<Button variant="primary">`

## Styling

**Tokens (always use semantic tokens, never hardcoded colors):**
- Defined in `src/styles/tokens.css` as CSS custom properties (HSL components)
- Bridged to Tailwind v4 via `@theme` in `src/index.css` (`--color-accent: hsl(var(--accent))`)
- **Forbidden:** `bg-white`, `bg-black`, `text-gray-500`, hex colors
- **Allowed:** `bg-bg-primary`, `bg-bg-secondary`, `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `border-border-subtle`, `bg-accent`, `text-accent`, `text-success/warning/danger`
- Exception: `Card` `dark` variant uses literal gradients (`from-slate-950 via-indigo-950/90`) — special-case hero panels only

**Radius:**
- Use `rounded-[var(--radius-sm|md|lg|xl)]` for explicit control
- Or rely on component defaults (Card uses `--radius-lg`, Button uses `--radius-md`)

**Utility:**
- `cn(...inputs)` from `@/src/lib/utils` for class merging (clsx + tailwind-merge)
- `when(condition, className)` helper for conditional classes (rarely used; prefer `&&` inside `cn()`)
- Glass effect: `glass` or `glass-subtle` custom utility classes from `src/index.css`
- Tauri drag: `.drag-region` / `.no-drag` custom utilities

**Spacing & Sizing (desktop-optimized):**
- Base font 14px (`text-sm` ≈ 13px, `text-md` ≈ 15px)
- Compact: `px-3 py-1.5` for buttons, `p-5` for card content, `gap-2` for button groups
- Heights fixed via `h-9` (input), `h-8` (md button), `h-7` (sm button), `h-6` (xs button)

## Animation Patterns

**Library:** `motion/react` (Framer Motion v12 rebranded)

**Import:**
```tsx
import { motion, AnimatePresence } from 'motion/react';
```

**Page transitions** (see `src/App.tsx`):
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
  >
    {content}
  </motion.div>
</AnimatePresence>
```

**Spring physics standard values:**
- Page transitions: `stiffness: 350, damping: 30`
- Modal/card hover: `stiffness: 400, damping: 30`
- Tap feedback: `whileTap={{ scale: 0.97 }}`
- Hover lift: `whileHover={{ y: -2 }}` with `transition={{ type: 'spring', stiffness: 400, damping: 25 }}`
- Checkbox/indicator pop-in: `stiffness: 500, damping: 25`
- SegmentedControl sliding indicator: `layoutId="segmented-indicator"` + `stiffness: 400, damping: 30`

**Animated modals** (see `src/components/ui/Dialog.tsx`):
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.96 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.96 }}
  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
/>
```

## Icons

**Library:** `@phosphor-icons/react` only. `lucide-react` is in `package.json` but deprecated.

**Usage:**
```tsx
import { Sparkle, Robot, CheckCircle } from '@phosphor-icons/react';
<Sparkle size={20} weight="duotone" className="text-accent" />
```

**Conventions:**
- Default `weight="duotone"` for the Apple-style feel
- Sizes: `12` (inline in badges), `14` (small UI), `16` (default), `20` (card headers), `40` (placeholder heroes)
- Active state icons use `weight="fill"` (see `src/views/SettingsView.tsx`)
- Alias layer in `src/lib/icons.ts` provides `Icon`-prefixed names (e.g., `IconSearch`, `IconBot`) — but most files import directly from `@phosphor-icons/react` using the Phosphor native names (e.g., `MagnifyingGlass`, `Robot`, `CaretDown`). Prefer direct import; use the alias only when migrating legacy lucide names.

## State Management

**Zustand Stores (`src/stores/`):**
- Created via `create<StateInterface>((set, get) => ({ ... }))`
- Mutations use immutable spreads: `set((state) => ({ products: state.products.map(...) }))`
- Async actions return `{ success: boolean, ... }` (see `runProductSkill` in `src/stores/productStore.ts`)
- Simulate async with `await new Promise((r) => setTimeout(r, 1400))` for demo flows
- Each store owns one domain: task, product, rnd, schedule, workspace, ui

**Compatibility Layer:**
- `useApp()` from `src/store/AppContext.tsx` wraps all Zustand stores into a single context for legacy code
- 30 files still use `useApp()` — including most views and `src/App.tsx`
- **Preferred for new code:** direct store hooks (`useProductStore()`, `useTaskStore()`, etc.)
- `AppContext.tsx` re-exports all types for backward compatibility

**Mock data:**
- Initial state seeded from `src/data/mock*.ts` files
- Types co-located in mock files (e.g., `Product`, `ProductMilestone`, `ProductDocument` in `src/data/mockProducts.ts`) and re-exported from stores

## Error Handling

**Frontend:**
- Minimal error boundaries — relies on React's default handling
- Form validation: early-return guard pattern (`if (!name.trim()) return;` in `CreateProductModal.tsx`)
- Context hook throws if used outside provider: `if (!ctx) throw new Error('useToast must be used within ToastProvider')` (see `src/components/ui/Toast.tsx`)
- Optional chaining heavily used: `currentProduct?.tagline`, `product?.stage`
- Visual error state via props (`error` prop on Input/Textarea shows red border + helper text)

**Backend (`server.ts`):**
- Every endpoint wrapped in `try/catch`
- Error response: `res.status(500).json({ error: error.message })` with `console.error(...)` log
- AI endpoints fall back gracefully when `GEMINI_API_KEY` is unset — return mock/markdown fallback content
- Type assertions: `(err: any)` in catch blocks, `(f: any)` in map callbacks for untyped API inputs

**Toast notifications:**
- `useToast()` hook for user-facing success/error feedback: `toast({ type: 'success', title: '...', description: '...' })`
- Auto-dismiss after 4s default (configurable via `duration`)

## Logging

**Framework:** `console.*` only — no logging library

**Patterns:**
- `console.error()` for caught errors in `server.ts` AI endpoints
- `console.log()` appears only in legacy `src/components/ProjectCreateModal.tsx` and `src/components/WorkspaceSummaryModal.tsx` (debug leftovers)
- No structured logging, no levels, no transport

**Recommendation for new code:** Use `console.error` for failures, avoid `console.log` in committed code.

## Comments

**When to Comment:**
- File headers explaining purpose (see `src/lib/icons.ts`, `src/lib/utils.ts`, `src/store/AppContext.tsx`)
- Section dividers inside files: `/* === Section Name === */` or `/* --- Section --- */` (see `Dialog.tsx`, `Toast.tsx`)
- Migration/debt notes: "Legacy (still works)" / "This file will be removed once..." (see `AppContext.tsx` header)
- Platform-specific quirk notes (see `TitleBar.tsx`: `__TAURI_INTERNALS__ is always injected by Tauri v2`)
- `#![cfg_attr(...)]` style comment in Rust (`src-tauri/src/main.rs`)

**JSDoc/TSDoc:**
- Sparse. Used on `cn()` and `when()` in `src/lib/utils.ts`, on `SegmentedControl` describing Apple-style behavior, on store hook signatures
- Most functions have no JSDoc — code is self-documenting via clear naming

**Chinese strings in UI:** Commonplace — labels like `'产品研发中心'`, `'规划中'`, `'商业化运营'`. The product is bilingual (English code, Chinese UI). Match the surrounding view's language for new UI strings.

## Function Design

**Size:** Components are 50-300 lines. Helpers within a component are typically 5-30 lines.

**Parameters:**
- Destructured props with explicit types: `({ className, variant = 'primary', ...props }: ButtonProps)`
- Default values in destructuring (`variant = 'primary'`, `size = 'md'`)
- Rest spread for native HTML attrs: `...props` forwarded to underlying element

**Return Values:**
- React nodes for components
- For async store actions: `{ success: true, timestamp: ... }` or void
- For event handlers: void (early-return for validation)

## Module Design

**Exports:**
- Named exports for all components (`export function Button`, `export const Card = forwardRef(...)`)
- Default export only for `src/App.tsx`
- Re-export types alongside values: `export type { Product } from '../data/mockProducts'`
- Barrel file `src/components/ui/index.ts` aggregates all UI primitives — import from there in feature code

**Co-location:**
- Component + types + sub-components in one file (e.g., `Card.tsx` exports `Card`, `CardHover`, `CardHeader`, `CardContent`, `CardFooter`)
- Mock data + types in same file (`src/data/mockProducts.ts`)
- Store + state interface + types in same file (`src/stores/productStore.ts`)

**Lazy loading:**
- Views lazy-loaded in `src/App.tsx` via `React.lazy(() => import('./views/X').then(m => ({ default: m.X })))`
- Suspense fallback: `<ViewLoading />` skeleton
- Product sub-components bundled with `ProductManagementView` (not lazy)

---

*Convention analysis: 2026-08-08*
