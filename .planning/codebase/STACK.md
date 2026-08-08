# Technology Stack

**Analysis Date:** 2026-08-08

## Languages

**Primary:**
- TypeScript ~5.8.2 - Frontend (React views, components, stores) and backend (`server.ts` Express API)
- Rust (edition 2021) - Tauri v2 native shell (`src-tauri/src/lib.rs`, `main.rs`)
- CSS - Tailwind v4 + design tokens (`src/styles/tokens.css`)

**Secondary:**
- JSON - Configuration (`package.json`, `tsconfig.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`)

## Runtime

**Environment:**
- Node.js (target ES2022; `@types/node` ^22.14.0 present)
- Tauri webview (system WebView2/WKWebView/WebKitGTK)
- Bun-compatible (Tauri `beforeDevCommand` / `beforeBuildCommand` invoke `bunx tsx` / `bunx vite build`)

**Package Manager:**
- npm (scripts in `package.json` use `npm run`)
- Lockfile: not detected in initial scan (`package-lock.json` / `bun.lockb` presence unverified)

## Frameworks

**Core:**
- React 19.0.1 + react-dom 19.0.1 - UI library (`src/`)
- Vite 6.2.3 - Dev server + production bundler (`vite.config.ts`, integrated as middleware inside `server.ts` in dev)
- Express 4.21.2 - Backend HTTP server (`server.ts`) hosting `/api/*` endpoints and SPA static fallback
- Tauri v2 (`tauri` crate) - Native desktop wrapper (`src-tauri/`)

**Testing:**
- Not detected. No test runner (jest/vitest), no `*.test.*` files, no test script in `package.json`. `npm run lint` runs `tsc --noEmit` (typecheck only).

**Build/Dev:**
- esbuild 0.25.0 - Bundles `server.ts` to `dist/server.cjs` for production (`build:server` script)
- tsx 4.21.0 - Runs `server.ts` directly in dev (`dev` script)
- @vitejs/plugin-react 5.0.4 - React Fast Refresh / JSX in Vite
- @tailwindcss/vite 4.1.14 - Tailwind v4 Vite plugin (no `tailwind.config.js`; uses `@theme` directive)
- @tauri-apps/cli 2.11.4 - `tauri dev` / `tauri build` orchestration

## Key Dependencies

**Critical (frontend):**
- react / react-dom 19.0.1 - React 19, JSX runtime (`"jsx": "react-jsx"`)
- zustand 5.0.14 - State management. Six stores under `src/stores/` (task, product, rnd, schedule, workspace, ui). Legacy `src/store/AppContext.tsx` is a compatibility shim.
- @radix-ui/react-* (checkbox, dialog, dropdown-menu, popover, scroll-area, select, separator, slot, switch, tabs, tooltip) - Primitives backing `src/components/ui/`
- motion 12.23.24 - Framer Motion (imported as `motion/react`) for page/element animations
- @phosphor-icons/react 2.1.10 - Icon library, `weight="duotone"` is the project convention. `src/lib/icons.ts` is the central re-export/migration map.
- tailwind-merge 3.6.0 + clsx 2.1.1 - Powering `cn()` helper in `src/lib/utils.ts`
- recharts 3.10.1 - Charts (used by R&D analytics views)
- react-markdown 10.1.0 - Rendering AI-generated Markdown content
- lucide-react 0.546.0 - Legacy; CLAUDE.md notes migration to Phosphor. `src/lib/icons.ts` documents the migration.

**Critical (backend / desktop):**
- @google/genai 2.4.0 - Google Gemini SDK used in `server.ts` (model `gemini-3.6-flash`)
- express 4.21.2 - API host
- dotenv 17.2.3 - Loads `GEMINI_API_KEY` from `.env`
- @tauri-apps/api 2.11.1 - IPC bridge (`src/components/layout/TitleBar.tsx` uses `getCurrentWindow()`)
- tauri (Rust crate, v2, `macos-private-api` feature) + tauri-plugin-shell 2 - Native shell (`src-tauri/Cargo.toml`)
- serde 1 / serde_json 1 - Rust serialization (currently minimal; no custom commands defined yet)

**Infrastructure (fonts):**
- @fontsource/geist 5.3.0 + @fontsource/geist-mono 5.3.0 - Self-hosted Geist font family

## Configuration

**Environment:**
- `.env` file present (existence only; contents not read). `.env.example` exists but is also in a denied path - treat as authoritative reference for required vars.
- Required env var: `GEMINI_API_KEY` (used by every AI endpoint in `server.ts`; endpoints fall back to canned text when unset)

**TypeScript (`tsconfig.json`):**
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
- `jsx: react-jsx`, `experimentalDecorators: true`, `useDefineForClassFields: false`
- Path alias: `@/*` → `./*` (project root, so imports look like `@/src/lib/utils`)
- `noEmit: true` (Vite/esbuild handle emission)

**Vite (`vite.config.ts`):**
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- Alias `@` → project root
- `base: './'` when `TAURI_ENV_PLATFORM` set (Tauri production), `'/'` otherwise
- HMR enabled unless `DISABLE_HMR=true`

**Tauri (`src-tauri/tauri.conf.json`):**
- `productName: Nova`, `identifier: com.nova.pm-workspace`, version 0.1.0
- Dev URL: `http://localhost:3000`; frontendDist: `../dist`
- Window: 1440x900 (min 1024x680), `decorations: false`, `transparent: true`, `center: true`, `macOSPrivateApi: true`
- `csp: null` (no Content Security Policy enforced)
- Bundle targets: all (icns/ico/png)
- Capabilities (`src-tauri/capabilities/default.json`): core defaults + window controls (minimize/maximize/toggle/close/start-dragging/is-maximized/set-resizable) + `shell:allow-open`

**Build:**
- `npm run build` → Vite build (frontend only)
- `npm run build:server` → esbuild bundles `server.ts` → `dist/server.cjs` (CJS, externalized packages, sourcemap)
- `npm run start` → `node dist/server.cjs` (production server)
- `npm run tauri:build` → Tauri production desktop bundle (runs `bunx vite build` first per `beforeBuildCommand`)

## Platform Requirements

**Development:**
- Node.js 22+, npm
- Optional: Bun (Tauri's before-commands invoke `bunx`; falls back to npx-style resolution)
- Rust toolchain + Tauri v2 prerequisites (for `tauri:dev` / `tauri:build`)
- `GEMINI_API_KEY` env var for AI features (without it, endpoints return canned fallbacks)

**Production:**
- Desktop bundle via Tauri (Windows `.exe`/`.msi`, macOS `.app`/`.dmg`, Linux AppImage)
- Production web mode also supported: `npm run build && npm run start` serves SPA + Express API on port 3000, bound to `0.0.0.0`
- Express server is the single process: hosts both `/api/*` and the static SPA / Vite middleware

---

*Stack analysis: 2026-08-08*
