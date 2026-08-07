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
