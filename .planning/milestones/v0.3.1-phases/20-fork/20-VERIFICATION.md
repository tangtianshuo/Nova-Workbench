---
phase: 20-fork
verified: 2026-08-18T00:00:00Z
status: passed
score: 11/11 must-haves verified
human_verification:
  - test: "Hover assistant 消息卡片，点击分支 icon"
    expected: "跳转新 session，顶部出现 '来自 {parentTitle}' 徽章，原会话切回后逐字完整"
    why_human: "视觉浮现/交互手感无法程序化验证"
  - test: "Hover assistant 消息，点击复制 icon"
    expected: "消息全文进剪贴板，success toast；packaged build 中失败路径弹 error toast"
    why_human: "剪贴板行为需真实 OS 环境（Pitfall 5: packaged-build clipboard）"
  - test: "Streaming 进行中 hover 分支 icon"
    expected: "分支按钮 disabled（半透明）"
    why_human: "实时 streaming 状态需运行中的 LLM 会话"
---

# Phase 20: Fork Verification Report

**Phase Goal:** 用户可以从任意 assistant 消息创建引用式分支并一键复制消息 — 最高风险纯逻辑(buildForkEventStream)先于 UI 隔离交付
**Verified:** 2026-08-18
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | buildForkEventStream 前缀恒等、子事件偏移、输出连续流 | ✓ VERIFIED | src/ai/fork.ts:30 + fork.test.ts 全过 |
| 2 | mid-turn / NO_PREFIX_TURN / UNBALANCED 拒绝 | ✓ VERIFIED | fork.test.ts:131-151 显式断言三态 |
| 3 | compaction 载荷 remap 规则 | ✓ VERIFIED | fork.test.ts 测试组 3 + round-trip 用例 9 |
| 4 | fork-of-fork 递归解析 + 双接线 | ✓ VERIFIED | fork.ts:72 resolveSessionEvents;sessionRestore.ts:97,124;compaction.ts:131 均已接线，旧 listEvents(targetSessionId) 调用已移除 |
| 5 | sessionRepo createForkSession + parentTitle | ✓ VERIFIED | sessionRepo.ts:32,104,182（内存+SQL 双实现，LEFT JOIN 语义） |
| 6 | hover 浮出分支/复制 icon | ✓ VERIFIED | AgentConsole.tsx:178 group-hover:opacity-100 + group-focus-within:opacity-100 |
| 7 | 点击分支 → createForkSession → switchSession，原会话不动 | ✓ VERIFIED | chatConsoleStore.ts:274-314 forkFromMessage 全链路（resolveSessionEvents → findForkCutSeq → createForkSession → session_forked marker → switchSession），catch 回 error toast |
| 8 | store-only ack 消息无分支 icon（复制可用） | ✓ VERIFIED | AgentConsole.tsx:179 `{forkableIds.has(message.id) && ...}` 条件渲染分支 icon，Copy 恒渲染 (:201) |
| 9 | 复制进剪贴板，失败弹 error toast | ✓ VERIFIED | AgentConsole.tsx:133-135 navigator.clipboard.writeText 带 success/error 双 toast，不静默 |
| 10 | 来源徽章 '来自 {parentTitle}' | ✓ VERIFIED | AgentConsole.tsx:145-149 bg-accent-subtle recipe + max-w-[160px] truncate + '来自 ' 前缀 |
| 11 | streaming 中分支 disabled | ✓ VERIFIED | chatConsoleStore.ts:277 loading 守卫（warning toast）+ AgentConsole 分支按钮 disabled={loading} |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `src/ai/fork.ts` | ✓ VERIFIED | 83 行，三个导出函数齐全 |
| `src/ai/__tests__/fork.test.ts` | ✓ VERIFIED | 10 类用例齐全（含 fork-of-fork、SQL parity），11 tests pass |
| `src/ai/sessionRepo.ts` | ✓ VERIFIED | createForkSession/getSession/parentTitle 内存+SQL 双实现 |
| `src/stores/chatConsoleStore.ts` | ✓ VERIFIED | forkFromMessage + forkableIds + parentTitle 状态 |
| `src/components/AgentConsole.tsx` | ✓ VERIFIED | hover 工具栏 + 徽章 + copy toast |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| sessionRestore.ts | fork.ts | resolveSessionEvents | ✓ WIRED (:19 import, :97/:124 调用) |
| compaction.ts | fork.ts | resolveSessionEvents | ✓ WIRED (:12 import, :131 调用) |
| chatConsoleStore.ts | fork.ts | findForkCutSeq + resolveSessionEvents | ✓ WIRED (:25, :281, :289) |
| chatConsoleStore.ts | sessionRepo.ts | createForkSession | ✓ WIRED (:295) |
| AgentConsole.tsx | navigator.clipboard | writeText + toast | ✓ WIRED (:133-135) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| fork 测试套件 | `npx tsx --test src/ai/__tests__/fork.test.ts` | 11 pass / 0 fail | ✓ PASS |
| 全量测试 | `npm test` | 204 pass / 0 fail | ✓ PASS |
| 类型检查 | `npm run lint` (tsc --noEmit) | 退出码 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| FORK-01 | 20-02 | hover 浮出分支/复制 icon | ✓ SATISFIED | AgentConsole.tsx:178 |
| FORK-02 | 20-01, 20-02 | 引用式 fork，切点 turn_ended，UI 跳转 | ✓ SATISFIED | fork.ts + chatConsoleStore.forkFromMessage |
| FORK-03 | 20-02 | 复制进剪贴板 | ✓ SATISFIED | AgentConsole.tsx:133 |
| LIST-03 | 20-01, 20-02 | 分支 session 显示来源徽章 | ✓ SATISFIED | in-console 徽章 AgentConsole.tsx:145 + parentTitle 数据就绪（完整列表 UI 属 Phase 21） |

无 ORPHANED 需求（REQUIREMENTS.md 四条 ID 全部被 plan 声明且验证通过）。

### Anti-Patterns Found

无 blocker。forkFromMessage 的 catch 块含 console.error (:313) — 与 error toast 并存，属可接受日志。

### Gaps Summary

无 gap。纯逻辑层（TDD 先行、11 测试通过）与 UI 层全部验证通过，204 测试全绿，tsc 通过。剩余为 3 项人工 UAT（hover 交互、真实剪贴板、streaming disable），已列于 frontmatter。

---

_Verified: 2026-08-18_
_Verifier: Claude (gsd-verifier)_
