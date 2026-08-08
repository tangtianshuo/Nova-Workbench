# Testing Patterns

**Analysis Date:** 2026-08-08

## Test Framework

**Runner:** None configured.

**Status:**
- No test runner installed (no `jest`, `vitest`, `playwright`, `mocha`, `@testing-library/*` in `package.json` `devDependencies` or `dependencies`)
- No test config files (no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`)
- No `test` script in `package.json` (`scripts`: `dev`, `build`, `build:server`, `start`, `clean`, `lint`, `tauri`, `tauri:dev`, `tauri:build`)
- `npm run lint` runs `tsc --noEmit` — this is type-checking only, not testing

**Assertion Library:** None.

**Run Commands:**
```bash
npm run lint          # tsc --noEmit (type-check only — the closest thing to a gate)
npm run build         # Vite build (will fail on TS errors)
```

There is no `npm test`. Do not invent one without first installing a runner.

## Test File Organization

**Location:** No tests exist anywhere in `src/`, `src-tauri/`, or project root.

**Naming:** N/A — when adding tests, follow the chosen runner's default co-location convention (see "Recommendations" below).

**Structure:** N/A.

## Test Structure

No existing tests. The codebase has zero test coverage.

## Mocking

**Framework:** None installed. No `msw`, `nock`, `jest.mock`, `vi.mock`, or `sinon` available.

**What would need mocking (when tests are added):**
- `@google/genai` Gemini API calls in `server.ts` (each endpoint instantiates `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` inline)
- `localStorage` in `src/hooks/useTheme.ts`
- `window.matchMedia` in `useTheme.ts` and `src/components/layout/TitleBar.tsx` (`detectPlatform`)
- Tauri APIs in `TitleBar.tsx` (`getCurrentWindow`, `__TAURI_INTERNALS__` global detection) — must run in browser test env
- Zustand stores — test via actual store instances (Zustand supports `act()`-based testing without mocks) or via `jest.mock('../stores/...')`
- `setTimeout` in `src/stores/productStore.ts` (`runProductSkill` uses `await new Promise(r => setTimeout(r, 1400))` to fake async work)
- `fetch` (not used directly — API calls go through the Express server, which proxies to Gemini)

## Fixtures and Factories

**Test Data:** None dedicated to tests.

**Existing Mock Data (production seed data, reusable for tests):**
- `src/data/mockProducts.ts` — `INITIAL_PRODUCTS_DATA`, plus types `Product`, `ProductMilestone`, `ProductDocument`, `ProductSkill`
- `src/data/mockTasks.ts` — tasks + `Task`, `TaskCategory` types
- Other domain mock files in `src/data/` (schedule, workspace, rnd, etc.)
- `server.ts` has a hardcoded `/api/workspace-files` mock response (4 fake files) — example of inline mock fixtures

**Factories:** None. When adding tests, prefer importing `INITIAL_PRODUCTS_DATA` rather than redefining fixtures.

## Coverage

**Requirements:** None enforced. No coverage tool installed.

**View Coverage:**
```bash
# Does not exist — would need vitest --coverage or jest --coverage
```

## Test Types

**Unit Tests:** None.

**Integration Tests:** None.

**E2E Tests:** None. Tauri has `tauri-driver` for E2E but no setup exists. Playwright/Cypress not installed.

**Manual Testing Only:** Currently relies on `npm run dev` (Express + Vite at `http://localhost:3000`) and `npm run tauri:dev` (full desktop) for manual verification.

## Common Patterns

No existing test patterns. Below is the **recommended baseline** for adding tests, consistent with the existing stack.

**Recommended runner:** Vitest (matches Vite/React/Tailwind v4 stack, zero-config, JSDOM out of the box).

**Recommended setup steps (first test):**
1. `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
2. Add to `vite.config.ts`:
   ```ts
   /// <reference types="vitest" />
   test: { environment: 'jsdom' }
   ```
3. Add `"test": "vitest"` to `package.json` scripts
4. Co-locate tests as `*.test.tsx` next to source, or `__tests__/` per directory

**Recommended first targets (highest leverage):**
- `src/lib/utils.ts` — pure `cn()` and `when()` functions, trivial to test
- `src/hooks/useTheme.ts` — pure logic with `localStorage` and `matchMedia` mocks
- `src/stores/*.ts` — Zustand stores are unit-testable by importing the hook directly: `const { result } = renderHook(() => useProductStore()); act(() => result.current.addProduct(...))`
- `server.ts` endpoints — supertest + mocked `GoogleGenAI`

**Async Testing Pattern (when added):**
```typescript
// Await store async actions directly
it('runs product skill', async () => {
  const { result } = renderHook(() => useProductStore());
  await act(async () => {
    await result.current.runProductSkill('p1', 's1');
  });
  expect(result.current.products[0].associatedSkills[0].status).toBe('active');
});
```

**Error Testing Pattern (when added):**
```typescript
// server.ts endpoint shape — wrap and assert status
it('returns 500 on Gemini failure', async () => {
  // mock GoogleGenAI to throw
  const res = await request(app).post('/api/generate-project').send({ prompt: '' });
  expect(res.status).toBe(500);
});
```

## Platform / Tauri Considerations

- Tests run in Node/JSDOM — Tauri-specific code paths (`src/components/layout/TitleBar.tsx`) need the `isTauri()` guard mocked to return `false`, since `__TAURI_INTERNALS__` does not exist in test env
- `getCurrentWindow()` from `@tauri-apps/api/window` must be mocked if testing `TitleBar.tsx` directly
- `detectPlatform()` in `TitleBar.tsx` parses `navigator.userAgent` — overridable via `Object.defineProperty(navigator, 'userAgent', ...)`

## CI

**No CI configured.** No `.github/workflows/`, no GitLab CI, no Jenkins file. The only "gate" is whatever the developer runs locally before commit (typically `npm run lint`).

---

*Testing analysis: 2026-08-08*
