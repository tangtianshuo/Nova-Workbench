# Phase 2: Persistence (Zustand persist + SQLite) - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning
**Mode:** --auto (all gray areas auto-resolved with recommended defaults)

<domain>
## Phase Boundary

把 5 个 Zustand store(product/task/rnd/schedule/workspace)从 in-memory 升级到持久化,先修复 rndStore 的 INITIAL.p1 fallback bug(防止持久化错误产品的数据),再引入 SQLite(`tauri-plugin-sql`)作为存储后端,通过 ~20 行 `createJSONStorage` 适配器对接 Zustand persist。每个 store 配 `partialize` 剔除 transient flag、`version` + `migrate` 存根、`_hasHydrated` 防闪烁,首次运行从 `mock*.ts` 播种一次(`has_seeded` gate)。

**不在本 phase**:
- `themeStore` 已经用自己的 localStorage key(`nova-theme`)持久化,本 phase 不动它 — unifying 是 over-engineering
- `uiStore` 的 theme 字段已经迁到 themeStore(Phase 1),uiStore 只剩 activeTab/selectedProductId/modal flags
- AppContext.tsx 全量移除(跟踪为 out-of-scope,跟随各 view 迁移逐步消除)
- 数据导出/导入、备份/恢复(后续 milestone)
- 多窗口同步(目前单窗口)
- 服务端持久化 / 云同步(Out of Scope)
- 自动化测试基础设施(单独立项,本 phase 只对 rndStore accessor 做最小测试)

</domain>

<decisions>
## Implementation Decisions

### SQLite 后端选择

- **D-01:** 用 `tauri-plugin-sql`(官方,sqlx-based,JS-side API via `@tauri-apps/plugin-sql`)作为存储后端,而不是 `rusqlite` 或 dual-layer
  - **Why:** PERSIST-04 明确要求;官方维护;JS-side API 直接对接 Zustand persist 适配器(无需新 Rust command);Phase 4 GraphFlow PoC 的 `SqliteSessionStorage` 实现可复用同一连接池
  - **Where:** `package.json`(npm dep `@tauri-apps/plugin-sql`)+ `src-tauri/Cargo.toml`(cargo dep `tauri-plugin-sql`)+ `src-tauri/src/lib.rs`(`.plugin(tauri_plugin_sql::Builder::default().build())`)
  - **Ponytail:** 不引第二个 SQL 库(rusqlite)。一个 SQL 后端够用

### Zustand persist 适配器

- **D-02:** 写一个 ~20 行的 `createJSONStorage` 适配器,把 Zustand persist 对接到 `@tauri-apps/plugin-sql` 的 `select`/`execute` API
  - **Why:** PERSIST-05 明确要求;适配器是 Zustand persist 的标准扩展点(createJSONStorage 接受任意 async storage);保留 Zustand 的 rehydrate/migrate/partialize 钩子
  - **Where:** 新文件 `src/stores/storage/sqliteStorage.ts`(~20 行)
  - **Adapter shape:**
    ```ts
    // sqliteStorage.ts
    import { createJSONStorage, type StateStorage } from 'zustand/middleware';
    import { isTauri } from '@/src/lib/api';
    import { lazySqlite } from './lazySqlite';

    export const sqliteStorage = createJSONStorage(() => ({
      getItem: async (name) => {
        const db = await lazySqlite();
        const rows = await db.select<{ value: string }[]>(
          'SELECT value FROM kv_store WHERE key = $1',
          [name]
        );
        return rows[0]?.value ?? null;
      },
      setItem: async (name, value) => {
        const db = await lazySqlite();
        await db.execute(
          'INSERT OR REPLACE INTO kv_store (key, value) VALUES ($1, $2)',
          [name, value]
        );
      },
      removeItem: async (name) => {
        const db = await lazySqlite();
        await db.execute('DELETE FROM kv_store WHERE key = $1', [name]);
      },
    } satisfies StateStorage));
    ```
  - **每个 store 一行 key** in `kv_store`: `'nova-product'` / `'nova-task'` / `'nova-rnd'` / `'nova-schedule'` / `'nova-workspace'` / `'nova-ui'`。Value 是 JSON.stringify 后的 partialize 结果

- **D-03:** 适配器在 `isTauri() === false`(dev/web 模式)时降级到 `localStorage`,保留 dev/prod parity
  - **Why:** Web/dev 模式无 Tauri SQLite plugin;dev 时 Vite middleware + Express 仍工作;降级确保开发体验不受影响
  - **How:** 适配器顶层 `if (!isTauri()) return createJSONStorage(() => localStorage);`
  - **Ponytail:** 不为 dev 模式写第二套存储,只做一层 if 分支

### Schema 版本管理 + 迁移策略

- **D-04:** 启动期(在 React 渲染前)按顺序执行:
  1. `Database.load('sqlite:nova.db')` — 打开/创建数据库
  2. 跑迁移文件(命名 `0001_init.sql`, `0002_*.sql`...)— forward-only additive,不允许 DROP/ALTER DROP
  3. Sanity `SELECT key FROM kv_store LIMIT 1` — 若 throw,弹"DB schema 损坏"错误,不进入应用
  4. 读 `meta` 表的 `schema_version` 行,与 app 期望的版本比对 — 若 DB 版本 > app 版本(downgrade 场景),拒绝启动并提示用户升级 app
  5. 读 `meta.has_seeded` — 若 false,从 `mock*.ts` 播种初始数据,写完置 true
  6. 标记 hydration 完成,渲染应用
- **D-05:** 初始 schema(0001_init.sql):
  ```sql
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
  INSERT OR IGNORE INTO meta (key, value) VALUES ('has_seeded', 'false');
  ```
- **D-06:** 迁移文件放在 `src-tauri/migrations/`,通过 `tauri-plugin-sql` 的 `Builder::default().add_migrations(...)` 注册。Ponytail: 不写自己的 migration runner,用 plugin 自带的 — 但加 sanity SELECT 兜底它已知的 silent-failure bug(PITFALLS Pitfall 2)
  - **Why:** plugin 自带 runner 跟踪 `__migrations` 表,但 plugins-workspace#509 显示它有时静默失败。我们额外加 sanity SELECT + 显式 `schema_version` 表双保险
  - **Forward-only additive:** 后续 schema 变更新增 `0002_*.sql`,内容只允许 `CREATE TABLE` / `ALTER TABLE ADD COLUMN` / `CREATE INDEX`。CI/手动 grep `DROP|ALTER.*DROP` 在 migrations/ 目录应为零结果
  - **Ponytail:** 不写 down migrations(plugin 不支持,且 desktop app 用户在任意旧版本,无法 clean revert)

### rndStore INITIAL.p1 fallback bug 修复(必须在 persist 之前)

- **D-07:** 修 rndStore 的 accessor,把 `[productId] || INITIAL_X.p1`(返回特定产品的种子数据)改成 `[productId] || EMPTY_X`(类型化的空值)
  - **Why:** PITFALLS Pitfall 3 + CONCERNS.md "rndStore — God Store" 明确警告:persist 这个 bug 等于把"显示错误产品数据"这个 footgun 永久冻结。必须先修再 persist(PERSIST-08)
  - **Where:** `src/stores/rndStore.ts` 所有 accessor(读取 `requirements[productId]` / `prototypes[productId]` / etc 的位置)
  - **EMPTY values:**
    - `EMPTY_REQUIREMENT: { id: '', productId: '', items: [] }`(或 `null`,看类型定义)
    - `EMPTY_PROTOTYPE: { ... }`
    - `EMPTY_LIST: []`(用于 knowledgeBase / codeScaffolds / testCases)
    - `EMPTY_COMPETITOR: { ... }`
  - **Guard log:** 加一个 `if (!state.X[productId]) console.warn('[rndStore] unknown productId:', productId)` 帮助开发期发现问题
  - **Ponytail:** 不在本 phase 拆分 rndStore(那是单独的 refactor,scope creep);只修 fallback bug

- **D-08:** 修复需通过一个最小自检(无 jest/vitest,用 `tsx --test` 或 `node --test` 跑一个 ~30 行的脚本)
  - **Test:** 创建一个 store,调用 `getRequirements('unknown-id')`,断言返回 EMPTY 而非 INITIAL_REQUIREMENTS.p1
  - **Where:** 新文件 `src/stores/__tests__/rndStore.test.ts`(或 `.mjs` 脚本);放 `package.json` 的 `test` script

### 首次运行播种

- **D-09:** 启动流程在迁移 + sanity check 之后,读 `meta.has_seeded`:
  - 若 `'false'`:从 `src/data/mockProducts.ts` / `mockTasks.ts` / `mockRndData.ts` / `mockSchedule.ts` / `mockWorkspace.ts` 读种子数据,通过 batch insert 写入 kv_store(每个 store 一行 JSON),最后 `UPDATE meta SET value = 'true' WHERE key = 'has_seeded'`
  - 若 `'true'`:跳过播种,直接进入 hydration
- **D-10:** `has_seeded` 是 one-shot gate,不是"有没有数据"
  - **Why:** 用户删除所有产品后,重启不应自动重新播种(那会"复活"删除的数据)。一旦首次播种完成,数据所有权归用户
  - **Edge case:** 用户手动删 nova.db 后下次启动会重新播种 — 这是预期行为

### Hydration 防闪烁

- **D-11:** 每个 store 加 `_hasHydrated: boolean` flag,在 `onRehydrateStorage` 回调中置 true
  ```ts
  persist(creator, {
    // ...
    onRehydrateStorage: () => (state) => {
      state?._setHydrated();
    },
  })
  ```
  - 加一个 `_setHydrated: () => set({ _hasHydrated: true })` action
- **D-12:** App 顶层加 `<HydrationGate>` 组件,在所有 store hydrated 之前渲染 skeleton/loading,之后渲染真实应用
  - **Where:** `src/App.tsx` wrap `<MainLayout>` in `<HydrationGate>`
  - **Gate logic:** `const allHydrated = useProductStore(s => s._hasHydrated) && useTaskStore(s => s._hasHydrated) && ...` — 5 个 store 全部 true 才放行
  - **Ponytail:** 不为 hydration 写第二个 state machine,直接复用 _hasHydrated flags

### Transient field 剔除(partialize)

- **D-13:** 每个 store 显式 `partialize`,只持久化真实业务数据,剔除 transient UI flags / 异步状态
  - **productStore:** 持久化 `products`。剔除:无其他字段(全是 action)
  - **taskStore:** 持久化 `categories`(其中包含 tasks)。剔除:无其他字段
  - **rndStore:** 持久化 7 个 nested Record(requirements/prototypes/knowledgeBase/codeScaffolds/testCases/competitorData/deliverables)。剔除:无 transient 字段
  - **scheduleStore:** 持久化 `events`。剔除:无其他字段
  - **workspaceStore:** 持久化 `workspaces`, `localFiles`。剔除:无其他字段
  - **uiStore:** 持久化 `activeTab`, `selectedProductId`。剔除:`isSearchOpen`, `isNewTaskOpen`(模态开关 — 重启不应保留)、`theme`(已迁 themeStore)
  - **Why:** 模态开关 / loading 状态 / 选中项 都是 transient,rehydrate 后回到默认值是用户预期
  - **Ponytail:** store 字段已经几乎全是数据,partialize 写起来很短

### Capability 文件 + DB scope

- **D-14:** 新增 `src-tauri/capabilities/sql.json`,显式 scope SQL plugin 到 `${appData}/nova.db`
  ```json
  {
    "identifier": "sql",
    "description": "SQLite persistence for Zustand stores",
    "windows": ["main"],
    "permissions": [
      "sql:allow-load",
      "sql:allow-execute",
      "sql:allow-select",
      "sql:allow-close"
    ]
  }
  ```
  - 在 `tauri.conf.json` 或 `default.json` 引用(具体看 Tauri v2 capability 模型)
  - **Why:** PITFALLS Pitfall 5 警告 capability + scope 缺失会 silent reject;Phase 3 SEC-03 会规范化每个 feature 一个 capability 文件
  - **Ponytail:** 现在只一个 sql.json,不为 Phase 3 提前创建 llm.json

### Claude's Discretion

- 启动期初始化的具体编排(在 `main.tsx` 之前调一个 `await initializeDatabase()` 还是用 module-level side effect)— 选更易在当前架构落地的
- `lazySqlite` 单例的具体实现(模块级 promise cache vs React context provider)— 选简单的
- HydrationGate 的 skeleton 视觉(复用 `ViewLoading` 还是新组件)— 复用现有
- 播种 batch 写入的具体语法(execute_batch vs 多次 execute in Promise.all)— 看 plugin API
- 迁移文件的注册方式(在 lib.rs `add_migrations` vs 在 JS side `Database.load('sqlite:nova.db', migrations)` 选其一,plugin 文档优先)

### Folded Todos
无 — `gsd-tools todo match-phase 2` 返回 0 matches。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目内文件
- `src/stores/productStore.ts` — 持久化目标 1
- `src/stores/taskStore.ts` — 持久化目标 2(注意 mixed-language status union,但本 phase 不修)
- `src/stores/rndStore.ts` — 持久化目标 3 + INITIAL.p1 fallback bug 修复源(D-07)
- `src/stores/scheduleStore.ts` — 持久化目标 4
- `src/stores/workspaceStore.ts` — 持久化目标 5
- `src/stores/uiStore.ts` — 持久化目标 6(仅 activeTab + selectedProductId)
- `src/stores/themeStore.ts` — **不在本 phase scope**(已有自己的 localStorage),但研究者需了解以避免重复持久化
- `src/data/mockProducts.ts`, `mockTasks.ts`, `mockRndData.ts`, `mockSchedule.ts`, `mockWorkspace.ts` — 首次播种源(D-09)
- `src/main.tsx` — 应用入口,hydration gate 接入点
- `src/App.tsx` — `<HydrationGate>` 包裹位置
- `src/lib/api.ts` — `isTauri()` 检测(D-03 dev/web fallback)
- `src-tauri/src/lib.rs` — Tauri builder,SQL plugin + migrations 注册点
- `src-tauri/Cargo.toml` — 添加 `tauri-plugin-sql` cargo dep
- `src-tauri/capabilities/default.json` — 当前 capability 表面(扩展或新增 sql.json)
- `src-tauri/tauri.conf.json` — 配置参考
- `package.json` — npm dep `@tauri-apps/plugin-sql`
- `.planning/codebase/CONCERNS.md` §"rndStore — God Store" + §"No State Persistence" — bug 真相
- `.planning/codebase/CONVENTIONS.md` — 命名/样式/store 模式约定
- `.planning/codebase/STACK.md` — Zustand 5 + Tauri v2 当前依赖
- `.planning/research/PITFALLS.md` §Pitfall 2 (SQL migrations silent fail) + §Pitfall 3 (Zustand persist pitfalls) + §Pitfall 5 (capabilities) — 关键陷阱
- `.planning/research/SUMMARY.md` §Persistence — 推荐方案(tauri-plugin-sql / sqlx / createJSONStorage)
- `.planning/research/STACK.md` — 推荐版本号
- `.planning/REQUIREMENTS.md` — PERSIST-01..PERSIST-09 详细需求
- `.planning/PROJECT.md` — Active 项 B. SQLite 持久化层 + Constraints(no sidecar / 本地优先)

### 外部权威
- Tauri v2 SQL Plugin — https://v2.tauri.app/plugin/sql/ — 官方文档,sqlx-based,migration 支持
- tauri-plugin-sql docs.rs — https://docs.rs/crate/tauri-plugin-sql/latest — Rust API
- Zustand persist 文档 — https://zustand.docs.pmnd.rs/integrations/persisting-store-data — `createJSONStorage` + `partialize` + `onRehydrateStorage` + `migrate`
- Zustand v5 migration guide — https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5 — v5 的 equality fn 变化(本 phase 不用,但研究者应了解)
- plugins-workspace#509 — https://github.com/tauri-apps/plugins-workspace/issues/509 — SQL migrations silent fail bug
- plugins-workspace#1346 — https://github.com/tauri-apps/plugins-workspace/issues/1346 — No down migrations
- plugins-workspace#3536 — https://github.com/tauri-apps/plugins-workspace/issues/3536 — Permissions need scopes

### 不引用
- `docs/ARCHITECTURE.md` §"SqliteSaver" — 那是 Phase 4 GraphFlow 范围,本 phase 只做前端 Zustand 持久化
- `docs/DECISIONS.md` ADR-002 — 含虚构 GraphFlow 声明(Phase 4 才处理)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`@tauri-apps/api`** 已在依赖中(`isTauri()` 已在 `src/lib/api.ts` 导出) — 适配器可直接用
- **Zustand 5.0.14** 已装 — `persist` 中间件内置,`createJSONStorage` / `partialize` / `migrate` / `onRehydrateStorage` 全可用
- **6 个 store 文件已结构化**(`src/stores/*.ts`) — 加 persist 只是 wrap `create(...)`,API 不变
- **mock 数据已就位**(`src/data/mock*.ts`) — 播种源现成
- **`useApp()` 兼容层**(`src/store/AppContext.tsx`) — 持久化在 store 层做,AppContext 是 pass-through,无需改动

### Established Patterns
- **Store 创建:** `create<State>((set, get) => ({ ... }))` — Phase 1 themeStore 已确立 Zustand 模式
- **`isTauri()` 分支:** `src/lib/api.ts` 已有,本 phase 复用(D-03 dev/web fallback)
- **TypeScript strict-ish:** 所有 store 字段显式类型,partialize 返回类型必须匹配
- **forward-only additive:** PITFALLS Pitfall 2 明确推荐,本 phase 是首个 schema,后续 migration 严格 additive

### Integration Points
- **`src-tauri/src/lib.rs`** — `.plugin(tauri_plugin_sql::Builder::default().add_migrations(...).build())` 注册 plugin + migrations
- **`src-tauri/Cargo.toml`** — 加 `tauri-plugin-sql = "2"`
- **`package.json`** — 加 `@tauri-apps/plugin-sql`(npm)
- **`src-tauri/capabilities/`** — 新增 sql.json(D-14)
- **`src/main.tsx`** — 应用启动前 `await initializeDatabase()`(migration + sanity check + seed),然后 `createRoot().render(...)`
- **`src/App.tsx`** — `<HydrationGate>` 包裹 `<MainLayout>`(D-12)
- **`src/stores/*.ts`** — 每个 store wrap `persist(...)`,加 `_hasHydrated` + `_setHydrated` + `partialize`
- **新文件 `src/stores/storage/sqliteStorage.ts`** — createJSONStorage 适配器(D-02)
- **新文件 `src/stores/storage/lazySqlite.ts`** — 单例 lazy `Database.load(...)`
- **新文件 `src/stores/storage/initializeDatabase.ts`** — 启动期编排(migration + sanity + seed)
- **新目录 `src-tauri/migrations/`** — 0001_init.sql
- **新文件 `src/stores/__tests__/rndStore.test.ts`** — D-08 自检

</code_context>

<specifics>
## Specific Ideas

- **"刷新即重置"是当前最大 gap**(CONCERNS.md "No State Persistence" HIGH) — 用户所有 products/tasks/milestones/AI 生成的 deliverables/knowledge articles 在刷新后消失。这是把 Nova 从"demo"变成"可用工具"的最关键一步
- **rndStore 修复是 PERSIST-08 的硬前置** — 不修就持久化 = 把"显示错误产品数据"bug 永久冻结
- **`schema_version` 比对 app 期望版本** — 防 downgrade 场景:用户从 v0.2 回滚到 v0.1,v0.1 看到 v0.2 写的 schema 应拒绝启动而不是 silent corruption
- **`has_seeded` 是 one-shot** — 用户清空数据后不应自动重新播种,这是"数据所有权"问题
- **dev/web fallback 用 localStorage** — dev 时 Vite middleware 工作流不破坏;适配器一层 if 分支
- **mock 数据播种用 batch insert** — `tauri-plugin-sql` 支持 `execute_batch`,避免每行一次 IPC round-trip(PITFALLS 性能陷阱)

</specifics>

<deferred>
## Deferred Ideas

- **rndStore 拆分成多个 domain store(requirements/prototypes/knowledge/...)** — 单独 refactor,不在本 phase。本 phase 只修 INITIAL.p1 fallback bug(D-07)
- **AppContext.tsx 全量移除** — 跟随各 view 迁移到 direct store hook 时逐步消除,不在本 phase 单独处理
- **themeStore 统一到 SQLite 持久化** — themeStore 已用自己的 localStorage('nova-theme'),unifying 是 over-engineering,YAGNI
- **数据导出/导入 / 备份 / 恢复** — 后续 milestone,需要 UX 设计
- **多窗口同步** — 当前单窗口;Zustand persist 不天然跨窗口,需要 `BroadcastChannel` 或 Tauri events
- **服务端 / 云同步** — Out of Scope per PROJECT.md
- **自动化测试基础设施** — 单独立项;本 phase 只对 rndStore accessor 做最小自检(D-08),不为整个 stores/ 加 test suite
- **rndStore 7 个 nested Record 的部分持久化 / lazy load** — 当前全量持久化即可,数据量小时不必优化
- **数据库加密** — `tauri-plugin-stronghold` 是后续 polish,目前 SQLite 文件不加密
- **多数据库文件(per-workspace / per-project)** — 当前单 db(`${appData}/nova.db`)够用

### Reviewed Todos
无 — `todo match-phase` 返回 0 matches,无 reviewed-but-deferred。

</deferred>

---

*Phase: 02-persistence-zustand-persist-sqlite*
*Context gathered: 2026-08-08 (--auto mode, all gray areas auto-resolved with recommended defaults)*
