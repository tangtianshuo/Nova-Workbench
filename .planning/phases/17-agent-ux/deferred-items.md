# Phase 17 Deferred Items

Out-of-scope discoveries logged during execution. Not fixed by the finding agent.

- **2026-08-17, 17-03 executor:** `npm run lint` fails in `src/ai/__tests__/phase17ContextCarry.test.ts:11` — `Module '"@/src/data/mockTasks"' has no exported member 'Product'`. File belongs to parallel sibling 17-02 (⌘K carry). Left untouched per scope boundary; 17-02/verifier to resolve.
