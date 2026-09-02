---
phase: 30-workflow-templates
plan: 01
subsystem: data
tags: [catalog, json, include_str, lazylock, single-source, deliverables]

requires:
  - phase: 26-pm-deliverables
    provides: FULL_LIFECYCLE_DELIVERABLES_CATALOG 双侧硬编码 (本次退役)
provides:
  - src/data/deliverables-catalog.json — 交付物 catalog 唯一真相源 (TS import 与 Rust include_str! 同一文件)
  - DELIVERABLES_CATALOG typed loader (src/data/deliverableCatalog.ts)
  - Rust CATALOG LazyLock + deliverable_codes() — tools.rs 零硬编码 DEL-*
affects: [30-02 (模板 CRUD), 30-03 (工作流视图), 999.4 垂类隔离]

tech-stack:
  added: [] # 无新依赖 — tsconfig resolveJsonModule + Rust include_str!/LazyLock/serde 既有
  patterns:
    - "跨语言单源数据: 同一 JSON 由 TS import 与 Rust include_str! 消费,换垂类只换 JSON"

key-files:
  created:
    - src/data/deliverables-catalog.json
    - src/data/deliverableCatalog.ts
  modified:
    - src-tauri/src/engine/tools.rs
    - src/ai/tools/generateDeliverable.ts
    - src/ai/confirmations.ts
    - src/stores/rndStore.ts
    - src/components/product/FullDeliverablesTab.tsx
    - src/data/mockRndData.ts
    - tsconfig.json

key-decisions:
  - "catalog 实为 16 条而非 plan 所写 18 — 16 一直是 mockRndData 与 tools.rs SLOT_BY_CODE 的真实数量,plan 计数陈旧"
  - "defaultContent 函数模板直接退役(无消费方,grep 实证),不做字符串模板降级"

patterns-established:
  - "单源 JSON + 双语言消费: include_str! + LazyLock serde 解析 (Rust) / resolveJsonModule import (TS)"

requirements-completed: [SC-4]

duration: 25min
completed: 2026-09-02
---

# Phase 30 Plan 01: Deliverables Catalog 单源化 Summary

**16 交付物 catalog 抽成单一 JSON,TS import 与 Rust include_str! 同读一文件,双侧硬编码(SLOT_BY_CODE / FULL_LIFECYCLE_DELIVERABLES_CATALOG)全部退役**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 9 (2 created, 7 modified)
- **Verification:** npm run lint 0 errors · npm test 223 pass · cargo test 214 pass (含新 catalog_single_source_shape)

## Accomplishments
- src/data/deliverables-catalog.json 成为 catalog 唯一真相源;mockRndData.ts 删除 511 行 (catalog + defaultContent)
- tools.rs 删除 const SLOT_BY_CODE,slot_by_code 与 generate_deliverable code enum 全部由 CATALOG 派生
- 新 Rust 单测锁定 JSON 形状(条数、去重、prd 别名、无别名键混入)
- grep FULL_LIFECYCLE_DELIVERABLES_CATALOG / defaultContent 在 src/ 下零命中

## Task Commits

1. **Task 1: catalog JSON 单源 + TS 侧切换** - `89cdf5c` (feat)
2. **Task 2: Rust include_str! 单源 + 单测锁 parity** - `447942a` (feat)

## Decisions Made
- catalog 条数按真实 16 执行,不凑 18(两侧原硬编码本来就是 16)
- defaultContent 直接删除,不降级为字符串模板(零消费方)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] plan 计数 18 与现实不符**
- **Found during:** Task 1 (JSON 创建时)
- **Issue:** plan/注释多处写 "18 catalog slots",但 mockRndData.ts 与 tools.rs SLOT_BY_CODE 实际均为 16 条 (4 REQ + 2 DES + 3 DEV + 3 TST + 4 REL)
- **Fix:** JSON 照抄真实 16 条;Rust 单测断言 16;顺手修正 confirmations.ts 注释中的 "18"
- **Files modified:** src/ai/confirmations.ts (注释), src-tauri/src/engine/tools.rs (单测)
- **Verification:** cargo test catalog_single_source_shape ok
- **Committed in:** 89cdf5c / 447942a

---

**Total deviations:** 1 auto-fixed (plan 数据陈旧)
**Impact on plan:** 无行为变化 — catalog 内容与切换前逐字段一致。

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- catalog 只读层就绪,30-02 (模板 CRUD / SQLite 表) 可直接以 deliverables-catalog.json 为种子
- 换垂类路径已打通: 只改 JSON,Rust/TS 零改动

## Self-Check: PASSED
