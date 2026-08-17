---
phase: 15-fts5
plan: 03
subsystem: knowledge-domain
tags: [knowledge, fts5, versioning, projection, cascade, seed-migration]
requires:
  - "migration 0004 knowledge_docs + knowledge_fts (Plan 15-01)"
  - "src/ai/ftsTokens.ts toFtsTokens/toFtsIndexedText/toFtsMatchString (Plan 15-01)"
  - "src/ai/memoryStore.ts deleteByProduct (Plan 15-01)"
provides:
  - "src/ai/knowledgeRepo.ts: getKnowledgeRepo dual impl — upsertDoc (version chain) / getCurrentDocs / listVersions / search (FTS5 hybrid + structural filters) / deleteByProduct / rebuildFts"
  - "searchKnowledgeHybrid(query, limit) convenience wrapper (referenced by 15-02 context assembler)"
  - "knowledge_seed_v15 one-shot gate: kv_store ('nova-rnd') → knowledge_docs migration, mock fallback"
  - "rndStore.hydrateKnowledgeFromRepo boot projection; knowledgeBase no longer persisted to kv blob"
  - "deleteProduct app-level cascade: memories soft-delete + knowledge/FTS delete, events untouched"
affects:
  - "src/ai/tools/knowledgeSearch.ts (search+list route through repo, retrieval 'fts5-hybrid')"
  - "src/ai/tools/knowledgeWrite.ts (awaits async rndStore knowledge writes)"
  - "src/store/AppContext.tsx (add/updateKnowledgeItem signatures → Promise<void>)"
  - "src/stores/rndStore.ts persist bucket (knowledgeBase stripped)"
tech-stack:
  added: []  # zero new deps
  patterns:
    - "version chain via UPDATE-supersede + INSERT version=(MAX+1) subselect, no transactions (fail-safe: re-run upsert repairs)"
    - "projection store: single write API in repo, zustand bucket rebuilt via hydrate"
    - "independent seed gate keyed knowledge_seed_v15 (has_seeded already 'true' on existing installs)"
    - "limit+1 fetch for overflow detection in tool layer"
key-files:
  created:
    - src/ai/knowledgeRepo.ts
    - src/ai/__tests__/phase15KnowledgeRepo.test.ts
    - src/ai/__tests__/phase15Cascade.test.ts
  modified:
    - src/stores/storage/initializeDatabase.ts
    - src/stores/rndStore.ts
    - src/stores/productStore.ts
    - src/ai/tools/knowledgeSearch.ts
    - src/ai/tools/knowledgeWrite.ts
    - src/store/AppContext.tsx
    - src/ai/__tests__/knowledgeWrite.test.ts
    - src/ai/__tests__/phase11Plan03.test.ts
decisions:
  - "Cascade placed in productStore.deleteProduct (fire-and-forget, public sync signature stable); rndStore.cleanupProduct keeps projection omit only — single cascade point, no double delete"
  - "KnowledgeDocInput gained optional updatedAt (seed/backfill + test determinism) and KnowledgeHit gained author (plan's tool mapping referenced h.author but its own KnowledgeHit interface omitted it)"
  - "onRehydrateStorage INITIAL_KNOWLEDGE_BASE merge-back REMOVED: it would re-inject mock data over the SQLite projection (e.g. a product whose docs were all deleted) — hydrateKnowledgeFromRepo owns the bucket"
  - "All rndStore '刚刚' relative strings ISO-ified (plan acceptance: grep count 0), not just knowledge actions"
  - "search truncated via limit+1 fetch in the tool layer (repo slice carries no overflow signal)"
metrics:
  duration: ~35 min
  completed: 2026-08-15
---

# Phase 15 Plan 03: Knowledge Repo + rndStore Projection + Product Cascade Summary

知识域垂直落地: knowledgeRepo 双实现(SQLite FTS5 版本化写 + 检索 / 内存同构镜像)、kv_store→SQLite 一次性迁移 gate、rndStore.knowledgeBase 投影化(persist 桶剥离)、knowledgeSearch tool 走 repo 单一真相源、产品删除应用层级联(memories 软删 + 知识/FTS 删除,events 保留)。110/110 tests green(96 baseline + 14 new),lint clean,零新依赖。

## What Was Built

### Task 1 — knowledgeRepo.ts 双实现 (commits 3ea7530 RED, aa058ff GREEN)
- `upsertDoc`: ①UPDATE 置 superseded_at(旧行让位)②INSERT version=(MAX+1) 子查询 ③INSERT knowledge_fts(toFtsIndexedText 各字段) — 无事务,失败可幂等重跑修复 / rebuildFts 兜底。
- `search` 有关键词: `knowledge_fts MATCH $match JOIN knowledge_docs ... superseded_at IS NULL + product/since 过滤, ORDER BY f.rank`;无关键词仅过滤: 跳 FTS 按 updated_at DESC(filters alone 也触发搜索模式,锁定)。标签过滤 JS 侧。
- `deleteByProduct`: FTS 先删(docs 残留不可搜,顺序安全);`rebuildFts`: 全删 + 重插当前版本。
- 内存实现: Map<docId, 全版本数组>,toFtsTokens 逐 token AND 匹配 + scoreArticle 同款词法权重排序 — FTS 语义等价(Pitfall 9)。
- 10-test suite: 版本链、检索不返失效、中文 2 字命中、AND 语义等价 toFtsMatchString、结构过滤、来源元数据、时间过滤、审计保留、标签过滤、单例。

### Task 2 — seed gate + rndStore 投影化 (commit c76c39c)
- `initializeDatabase.ts`: has_seeded 块之后独立 `knowledge_seed_v15` gate;`migrateKnowledgeIntoSqlite` 读 kv_store 'nova-rnd' blob(用户数据优先)→ 空则 INITIAL_KNOWLEDGE_BASE 兜底;相对串 updatedAt 无法解析 → Date.now() ISO(Pitfall 4)。启动末尾 `hydrateKnowledgeFromRepo()` 重建投影。
- `rndStore.ts`: `hydrateKnowledgeFromRepo` action;`addKnowledgeItem`/`updateKnowledgeItem` 改 async 走 repo 单一写 API(update = 同 docId 新版本行,MEM-04 审计链);persist partialize 剥离 knowledgeBase + migrate delete;全部 '刚刚' → ISO。
- `knowledgeWrite.ts`: writeConfirmedArticle 改 async + await;AppContext 签名同步 Promise<void>。

### Task 3 — tool 改造 + 级联 (commits f40572a RED, 6ae3e9c GREEN)
- `knowledgeSearch.ts`: search/list 均 async 走 `getKnowledgeRepo()`,retrieval `'fts5-hybrid'`,matches 带 sourceType/version/updatedAt(MEM-07);rndStore 直读删除;search truncated 用 limit+1 探测。
- `productStore.deleteProduct`: 追加 fire-and-forget 级联(memoryStore.deleteByProduct + knowledgeRepo.deleteByProduct),公开同步签名稳定,events 不触碰(append-only 锁定决策)。
- 4-test cascade suite: MEM-07 元数据、bounded list 语义、级联生效、无 eventStore 引用(源码 grep 级断言)。

## Verification

- `npm test`: 110/110 green(15-03 新增 14: knowledgeRepo 10 + cascade 4)
- `npm run lint`: 0 errors
- 迁移幂等: gate 条件 `!knowledgeSeedRows[0]`(meta 无行才跑)— 第二次启动直接跳过;upsertDoc 幂等重跑可修复中途失败残留
- Acceptance greps all pass: `knowledge_seed_v15`(独立于 has_seeded 块)、`hydrateKnowledgeFromRepo`、`grep -c "刚刚" = 0`、partialize 无 knowledgeBase、`retrieval: 'fts5-hybrid'`、productStore 含 `deleteByProduct`、knowledgeRepo 无 `BEGIN TRANSACTION`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed onRehydrateStorage INITIAL_KNOWLEDGE_BASE merge-back**
- **Found during:** Task 2
- **Issue:** The pre-existing post-hydrate safety net merged mock knowledge back into any missing/empty bucket — over the new SQLite projection this re-injects deleted/mock data (e.g. product whose docs were all deleted gets mock articles resurrected).
- **Fix:** Deleted the merge; `hydrateKnowledgeFromRepo()` owns the bucket on Tauri, INITIAL_KNOWLEDGE_BASE stays as web-dev initial value only.

**2. [Rule 3 - Blocking] Interface additions the plan's own snippets required**
- **Found during:** Tasks 1/3
- **Issue:** Plan's tool mapping reads `h.author` but its KnowledgeHit interface omitted author; Test 4/6 (updated_at DESC / since exclusion) impossible without injectable timestamps.
- **Fix:** Added `author: string` to KnowledgeHit and optional `updatedAt?: string` to KnowledgeDocInput (seed/backfill + test determinism only, defaults to now).

**3. [Rule 1 - Regression] Existing tests updated to the new repo contract (plan-sanctioned)**
- `knowledgeWrite.test.ts`: updatedAt assertion '刚刚' → ISO parse check (addKnowledgeItem now async + ISO).
- `phase11Plan03.test.ts`: knowledge list/search test re-seeded via memory repo, retrieval assertions 'bounded-store-list'/'bounded-lexical' → 'fts5-hybrid', matchedFields dropped, sourceType/version added.

## Known Stubs

None. (readTime in repo-hydrated projection items is `'—'` — the repo deliberately stores no reading-time estimate; UI edits preserve the existing projection value. Not a data stub; noted for transparency.)

## Self-Check: PASSED

- Files: src/ai/knowledgeRepo.ts, src/ai/__tests__/phase15KnowledgeRepo.test.ts, src/ai/__tests__/phase15Cascade.test.ts created; initializeDatabase.ts, rndStore.ts, productStore.ts, knowledgeSearch.ts, knowledgeWrite.ts, AppContext.tsx modified — all present.
- Commits 3ea7530, aa058ff, c76c39c, f40572a, 6ae3e9c verified on branch.
