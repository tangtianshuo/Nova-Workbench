# External Integrations

**Analysis Date:** 2026-08-08

## APIs & External Services

**AI / LLM:**
- Google Gemini - All AI features route through the Express server, never called from the browser directly
  - SDK: `@google/genai` 2.4.0 (`import { GoogleGenAI, Type } from '@google/genai'`)
  - Auth: `GEMINI_API_KEY` env var, loaded via `dotenv` in `server.ts`
  - Model used: `gemini-3.6-flash` (hardcoded string in every endpoint)
  - Custom HTTP header sent on every request: `'User-Agent': 'aistudio-build'`
  - Calling pattern: a fresh `new GoogleGenAI({ apiKey, httpOptions })` is instantiated inside each request handler (no shared client)

**Endpoints exposed by Express (`server.ts`), all on port 3000:**

| Endpoint | Method | Purpose | Gemini feature |
|---|---|---|---|
| `/api/generate-project` | POST | AI-generated project plan (milestones + tasks) | Structured output via `responseSchema` (Type.OBJECT) + `responseMimeType: 'application/json'` |
| `/api/summarize-workspace` | POST | Chinese-language workspace summary | Plain text generation; has fallback canned response when `GEMINI_API_KEY` is missing |
| `/api/rnd/generate-deliverable` | POST | Generate product deliverable (Markdown/JSON/SQL) | Plain text generation; fallback `{ status: 'fallback' }` when key missing |
| `/api/rnd/polish-knowledge-article` | POST | Polish/restructure knowledge-base article | Plain text generation; fallback returns input unchanged |
| `/api/workspace-files` | GET | List local workspace files | **Mock only** - returns hardcoded array of 4 files, no real filesystem access |

**Frontend callers (where AI features are invoked from the browser):**
- `src/components/ProjectCreateModal.tsx` - `/api/workspace-files` + `/api/generate-project`
- `src/components/WorkspaceSummaryModal.tsx` - `/api/summarize-workspace`
- `src/stores/rndStore.ts` - `/api/rnd/polish-knowledge-article`, `/api/rnd/generate-deliverable` (via `polishKnowledgeArticleAI`, `generateDeliverableAI` actions)
- `src/stores/rndStore.ts` also contains non-network mock AI (`generateCodeScaffoldAI`, `generateTestCasesAI`, `generateCompetitorAnalysisAI`) that use `setTimeout` and return canned data - no Gemini integration

## Data Storage

**Databases:**
- None. No DB client, ORM, or migration tool present.

**File Storage:**
- Local filesystem only (Tauri). No cloud storage SDK.
- `/api/workspace-files` in `server.ts` is currently a **mock** (comment: "In a real app we'd read from local fs. Here we'll just mock a few files"). `fs` is imported in `server.ts` but only `dotenv` uses it indirectly - no real file reads happen in any endpoint.
- Workspace "files" in the UI are backed by mock data (`src/data/mockProducts.ts`, `mockRndData.ts`).

**Caching:**
- None. No Redis, no client-side cache library, no SWR/React Query. Zustand stores hold all in-memory state (e.g. `src/stores/rndStore.ts`, `src/stores/productStore.ts`).

## Authentication & Identity

**Auth Provider:**
- None. No login flow, no auth middleware on Express, no user model.
- The single secret (`GEMINI_API_KEY`) lives server-side only; browser never sees it.

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Bugsnag, or equivalent.

**Logs:**
- `console.error` inside each Express endpoint's `catch` block (`server.ts`)
- `console.log` on server startup: `Server running on http://localhost:${PORT}`
- Frontend errors mostly swallowed silently (e.g. `catch (e) { /* fallback */ }` in `src/stores/rndStore.ts:290`)

## CI/CD & Deployment

**Hosting:**
- Local desktop app via Tauri bundle (`src-tauri/tauri.conf.json` → targets "all": Windows/macOS/Linux)
- Optional standalone web server via `node dist/server.cjs`

**CI Pipeline:**
- None detected. No `.github/workflows/`, no `.gitlab-ci.yml`, no `Jenkinsfile`.

## Environment Configuration

**Required env vars:**
- `GEMINI_API_KEY` - Google Gemini API key. Without it, AI endpoints degrade to fallback canned responses or return the input unchanged. Loaded via `dotenv.config()` at top of `server.ts`.

**Optional env vars:**
- `NODE_ENV` - When set to `'production'`, `server.ts` serves `dist/` statically; otherwise mounts Vite dev middleware.
- `TAURI_ENV_PLATFORM` - Tauri sets this; `vite.config.ts` reads it to flip `base` to `'./'`.
- `DISABLE_HMR` - When `'true'`, disables Vite HMR and file watcher (used by Tauri dev mode).

**Secrets location:**
- `.env` at project root (gitignored per standard practice; `.env.example` present for documentation).
- No secrets manager, no vault integration.

## Webhooks & Callbacks

**Incoming:**
- None. No webhook receivers, no OAuth callbacks.

**Outgoing:**
- None. The app initiates requests to Gemini only; Gemini does not call back.

## Tauri Native Integration

**IPC surface (`src-tauri/src/lib.rs`):**
- No custom Tauri commands (`#[tauri::command]`) are defined.
- `setup` hook enforces a minimum window size of 1024x680 at runtime.
- Only plugin loaded: `tauri_plugin_shell::init()` (used for `shell:allow-open` capability, e.g. opening external URLs in the system browser).

**Frontend Tauri usage:**
- `src/components/layout/TitleBar.tsx` is the sole consumer of `@tauri-apps/api/window` (`getCurrentWindow()` for minimize/maximize/close/drag).
- Platform detection helper `isTauri()` checks for `'__TAURI_INTERNALS__' in window || '__TAURI__' in window` - all Tauri calls go through this guard so the app also runs as a plain web app via `npm run dev`.

**Capabilities (`src-tauri/capabilities/default.json`):**
- Window: allow-minimize, allow-maximize, allow-toggle-maximize, allow-close, allow-start-dragging, allow-is-maximized, allow-set-resizable
- Shell: allow-open
- No filesystem, dialog, http, or notification permissions requested.

---

*Integration audit: 2026-08-08*
