# Phase 2: Persistence (Zustand persist + SQLite) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 02-persistence-zustand-persist-sqlite
**Mode:** --auto (recommended defaults auto-selected, no interactive AskUserQuestion)
**Areas discussed:** Storage backend, Adapter shape, Schema versioning, Bug-fix prerequisite, Seeding flow, Hydration gating, Partialize scope, Capabilities file

---

## Storage backend (PERSIST-04)

| Option | Description | Selected |
|--------|-------------|----------|
| `tauri-plugin-sql` (sqlx-based, official) | Tauri 官方插件,SQLx 原生,与 GraphFlow SqliteSaver 同引擎,未来零迁移成本 | ✓ |
| `rusqlite` via custom Tauri command | 直接绑 rusqlite crate,自定义 command | |
| `better-sqlite3` (Node sidecar) | 违反"零 Sidecar"约束 | |
| localStorage only (zustand persist default) | 5-10MB 配额,大 R&D 数据会溢出 | |
| IndexedDB via `idb-keyval` | 浏览器 API 在 Tauri WebView 可用但 SQLite 更原生 | |

**Auto-choice:** tauri-plugin-sql — 官方、与 GraphFlow 同栈、本地优先原则。
**Captured as:** D-01

---

## Adapter shape (PERSIST-05)

| Option | Description | Selected |
|--------|-------------|----------|
| `createJSONStorage(() => StateStorage)` + lazy singleton | Zustand 官方桥接模式,async getItem/setItem/removeItem 直接调用 db.select/execute | ✓ |
| Custom middleware (手写 persist) | 重复轮子,Zustand persist 已成熟 | |
| Per-store SQL tables (no JSON) | 表结构死板,Store schema 变动需要 migration;JSON 字段更灵活 | |
| In-memory cache + debounced flush | 增加复杂度,SQLite 自身已经快 | |

**Auto-choice:** createJSONStorage + lazy singleton — Zustand 官方推荐模式,最小适配代码。
**Captured as:** D-02

---

## Schema versioning (PERSIST-07)

| Option | Description | Selected |
|--------|-------------|----------|
| `meta` 表 + `schema_version` row | 单行 KV,version=1 起步,未来 migration 时比对+upgrade SQL | ✓ |
| 单独 migration 文件 + 状态机 | 过度工程,版本 1 无需 | |
| 无版本控制(随加随改) | 升级时 schema 冲突无回退路径 | |

**Auto-choice:** meta 表 + schema_version='1' — YAGNI 原则,版本 1 最简,但留升级钩子。
**Captured as:** D-03 + D-05

---

## rndStore INITIAL.p1 fallback bug (CONCERNS.md HIGH)

| Option | Description | Selected |
|--------|-------------|----------|
| 强制先修:删除 INITIAL.p1,所有访问器改用空对象+空 selector | 修在源头,避免持久化冻结 bug;每个 `INITIAL.p1` 调用点审计 | ✓ |
| 持久化后再修 | 风险:刷新后旧 productId 数据被错误加载,bug 被永久化 | |
| 在 partialize 中过滤 INITIAL.p1 | 治标不治本,访问器链仍坏 | |

**Auto-choice:** 强制先修 — PITFALLS Pitfall 3 "Silent migration failure",修在源头零成本。
**Captured as:** D-04

---

## Seeding flow (PERSIST-06)

| Option | Description | Selected |
|--------|-------------|----------|
| 一次性 `has_seeded` meta flag + first-run seeding | 启动检查 flag,false → 从 mock*.ts 灌入 SQLite,设 true;true → 跳过 | ✓ |
| 每次启动都 seed (覆盖用户改动) | 数据丢失风险 | |
| 用户手动 seed (按钮触发) | UX 差,首次启动白屏 | |
| 自动 seed 但保留用户改动 (UPSERT) | 复杂、且违背"首次"语义 | |

**Auto-choice:** has_seeded 一次性门控 — 简单、明确、YAGNI。
**Captured as:** D-06

---

## Hydration gating (PERSIST-08)

| Option | Description | Selected |
|--------|-------------|----------|
| 每 store `_hasHydrated` boolean + `onRehydrateStorage` callback | Zustand persist 官方模式,UI 用 `useXxxStore(s => s._hasHydrated)` 等待 | ✓ |
| 顶层 `<Suspense>` 兼容(throw promise) | React 19 Suspense 模式,但 zustand persist 不原生支持 | |
| 全局 hydration state(单 store) | 跨 store 协调复杂 | |
| 不 gate(接受短暂 stale UI) | 已持久化的旧数据 + 新 mock 数据混合 = 视觉跳变 | |

**Auto-choice:** per-store `_hasHydrated` — 标准模式、UI 灵活选择 gate 哪个 store。
**Captured as:** D-07

---

## Partialize scope (PERSIST-09)

| Option | Description | Selected |
|--------|-------------|----------|
| 每 store 自定义 partialize,排除 transient UI state(activeTab, selectedProductId, modal flags 等) | 字段级控制,避免刷新后 modal 还开着 | ✓ |
| 全 store 持久化(不过滤) | UX 噩梦:刷新后选中的产品/打开的 modal 都被冻结 | |
| 单一黑名单(全局规则) | 跨 store 不一致,维护成本高 | |

**Auto-choice:** per-store partialize — 精确控制、符合 Zustand 官方建议。
**Captured as:** D-08

---

## Capabilities file (PERSIST-10)

| Option | Description | Selected |
|--------|-------------|----------|
| 单独 `sql.json` capability,scoped 到 main window,显式 4 个 permissions | Tauri v2 capabilities 标准,最小权限原则 | ✓ |
| 加入现有 default.json | 范围扩散,违反 default.json 通用语义 | |
| 全开 sql:default | 权限泛滥 | |

**Auto-choice:** 独立 sql.json — 最小权限、可审计。
**Captured as:** D-14

---

## Claude's Discretion

- 适配器内部实现细节(getItem 异步签名、错误处理)
- partialize 中各 store 具体排除哪些字段(留待 planner 决定)
- seeding 数据范围(全 mock vs 仅必要 seed)
- `_hasHydrated` 在 UI 层的具体使用方式(每个 view 单独 gate vs 顶层 loader)
- migration 脚本目录结构(版本 1 不需要,但留位置)
- 错误处理策略(console.error vs toast vs silent)

## Deferred Ideas

- rndStore 按 productId sharding(当前单文档型 KV 已够)
- AppContext.tsx 全量移除(沿用 PROJECT.md Out of Scope)
- themeStore 统一到 uiStore(Phase 1 决定保留独立,YAGNI)
- 测试基础设施(vitest/playwright,本 phase 不引入)
- 多窗口同步(zustand persist 默认无 BroadcastChannel,需时再加)
- 加密敏感字段(目前无敏感数据,Phase 3 安全基线时评估)
- SQL migration runner(drizzle/knex)—— 版本 1 手写,后续按需
- 部分 store 用 localStorage、部分用 SQLite 的混合(全 SQLite 统一)
