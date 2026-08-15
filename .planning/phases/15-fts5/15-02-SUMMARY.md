---
phase: 15-fts5
plan: 02
subsystem: memory-candidate-flow
tags: [memory, proposeMemory, context-injection, fts5, audit-event, toolLoop]
requires:
  - "src/ai/memoryStore.ts (15-01): propose with user_directed auto-confirm chain, listPending/listRejected/listActiveMemories"
  - "src/ai/ftsTokens.ts (15-01): toFtsTokens / toFtsMatchString"
  - "src/ai/tokenEstimate.ts (EVT-07): estimateTokens"
  - "src/ai/toolLoop.ts systemPrompt assembly point + ChatSession enqueue event chain (Phase 13/14)"
provides:
  - "src/ai/tools/proposeMemory.ts: proposeMemory tool — model_inferred -> pending candidate (dialog continues), user_directed -> autoConfirmed straight into memories"
  - "src/ai/contextAssembler.ts: assembleInjectedContext — five-segment priority assembly with per-segment audit {name, items, tokens, truncated}"
  - "ChatSession.appendAuxEvent(eventType, payload): non-message event through the existing enqueue chain (seq contiguous, replay-safe)"
  - "toolLoop wiring: systemPromptOverride short-circuit preserved; assembled path emits context_injected event"
affects:
  - "src/ai/toolLoop.ts (:101 systemPrompt assembly replaced by explicit if/else; lazy knowledgeRepo import)"
  - "src/ai/chatSession.ts (appendAuxEvent added next to recordTurnEnd — no projection changes)"
  - "src/ai/events/types.ts (AGENT_EVENT_TYPES + 'context_injected')"
  - "src/ai/index.ts (registers proposeMemory tool)"
  - "src/ai/__tests__/registry.test.ts (tool list +1 — the one allowed existing-test touch)"
tech-stack:
  added: []
  patterns:
    - "fetch-stub seam for runToolLoop tests: chatWithTools' non-Tauri path POSTs /api/chat with NDJSON streaming — stub globalThis.fetch, capture request body (systemPrompt), stream token chunks back"
    - "lazy dynamic import + catch-degradation for same-wave plan dependency (knowledgeRepo via 15-03)"
    - "binary-search prefix clamp for token quotas (estimateTokens monotone in length)"
key-files:
  created:
    - src/ai/tools/proposeMemory.ts
    - src/ai/contextAssembler.ts
    - src/ai/__tests__/phase15ProposeMemory.test.ts
    - src/ai/__tests__/phase15ContextAssembler.test.ts
    - src/ai/__tests__/phase15ToolLoopInjection.test.ts
  modified:
    - src/ai/toolLoop.ts
    - src/ai/chatSession.ts
    - src/ai/events/types.ts
    - src/ai/index.ts
    - src/ai/__tests__/registry.test.ts
decisions:
  - "Test seam: no module mocking exists under tsx ESM (frozen namespaces, no mock.module flag) — globalThis.fetch stub exercises the REAL chatWithTools and captures systemPrompt from the request body"
  - "recent_dialog audit reports both tokens=300 (its share of the 2000 hard cap) and reservedTokens=1200 (15% of the 8000 session budget) — both locked-decision numbers, tests pin each"
  - "ts-ignore on the knowledgeRepo dynamic import: literal specifier keeps vite/runtimes resolvable post-merge; ignore is dropped when 15-03 lands (deliberately NOT ts-expect-error, which would break 15-03's lint once the module exists)"
  - "Rejected list renders FIRST inside the pending segment (short, high-value do-not-repropose guard) before candidate lines; overflow clamp then drops from the tail"
metrics:
  duration: ~13 min
  completed: 2026-08-15
---

# Phase 15 Plan 02: 记忆候选流 + 五段上下文组装 Summary

**One-liner:** proposeMemory tool（不打断对话流；user_directed 直接入库）+ 五段优先级 contextAssembler（2000-token 硬顶、旧条目截断、FTS 降级）+ toolLoop 注入接线与 context_injected 审计事件。

## What Was Built

### Task 1 — proposeMemory tool (`src/ai/tools/proposeMemory.ts`)
- `model_inferred`（默认）：候选入 pending 队列（含全部防轰炸标记透传：deduplicated / reason / evictedOldest），对话继续 —— 绝不 import / 抛 `ConfirmationRequiredError`（红线，grep 计数 0），不碰 `agent_confirmation_candidates`。
- `userDirected: true`：透传 store 内 confirm+consume 链结果（`autoConfirmed: true` + `memoryRowid`），pending 队列不进 —— 锁定决策后半句，UI 二次确认不发生。
- sessionId 留 undefined（候选恢复走 listPending / listRecentUserDirected 全量，UI spec Surface 1 行为）。

### Task 2 — contextAssembler (`src/ai/contextAssembler.ts`)
- 五段组装：core（buildCore 注入）→ pending（候选 + 「不要再提出以下记忆（用户已拒绝）」段，MEM-02）→ memories（listActiveMemories）→ fts_topk（top-5，每条 `来源: {title} v{version} {updatedAt}` 溯源行，MEM-07）→ recent_dialog（仅预算预留，无内容注入）。
- 配额 [600/200/500/400/300] = 2000 硬顶（25% of 8000，保持 30/10/25/20/15 比例）；段内溢出从最旧条目丢弃并标 truncated；core 段二分搜索前缀截断。
- 纯函数：buildCore / searchKnowledge 注入；context_injected 事件不在本模块落。
- `AGENT_EVENT_TYPES` 增加 `'context_injected'`。

### Task 3 — toolLoop 接线 (`src/ai/toolLoop.ts` + `chatSession.ts`)
- `systemPromptOverride` 显式 if 短路（byte-compatible）；组装路径 buildSystemPrompt({ coreContext: assembled.coreContext }) 并经新增 `ChatSession.appendAuxEvent('context_injected', audit)` 落事件 —— 走既有 per-session enqueue 链，seq 连续，rebuildMessages default:break 保证 replay 零消息。
- knowledgeRepo 惰性动态 import + catch 降级 `[]`（15-03 同 wave，未合并时 FTS 段检索为空）。
- RunToolLoopArgs / ToolLoopResult / ToolLoopCallbacks 字段零增删（Phase 13 锁定）。

## Test Results

- `npm test`: **114/114 pass**（15-01 后 96 → +6 proposeMemory +8 contextAssembler +4 toolLoopInjection；phase13/14 既有测试零回归、零修改，唯一触碰的既有测试是 registry.test.ts 工具列表 +1，plan 明确允许）
- `npm run lint`: 通过（tsc --noEmit 干净）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] `assert.doesNotThrow` 不 await async 函数**
- **Found during:** Task 1 GREEN 阶段
- **Issue:** plan 行为 Test 4 的 `assert.doesNotThrow(async fn)` 不等待 promise，导致 (a) 断言在 propose 完成前执行，(b) in-flight propose 污染后续测试的 store reset（Test 6 假失败）
- **Fix:** 直接 `await callPropose(...)` 断言返回值无 `pendingConfirmation`
- **Files modified:** `src/ai/__tests__/phase15ProposeMemory.test.ts`
- **Commit:** a05b46f

**2. [Rule 3 - Blocking] tsc 无法解析未存在的 './knowledgeRepo'**
- **Found during:** Task 3 lint
- **Issue:** plan 规定的字面量动态 import 在 15-03 合并前使 `npm run lint`（tsc --noEmit）失败；@ts-ignore 放在多行声明首行盖不住初始化表达式内的错误
- **Fix:** import 表达式收成单行 + 行级 `@ts-ignore`（选 ignore 而非 expect-error：15-03 合并后 expect-error 会反向报 TS2578）；字面量 specifier 保留，合并后 vite/运行时可解析
- **Files modified:** `src/ai/toolLoop.ts`
- **Commit:** f9f02ee

**3. [Rule 1 - Test data] 溢出测试数据未超配额**
- **Found during:** Task 2 GREEN 阶段
- **Issue:** 30 条 × ~13 tokens ≈ 382 < 500 配额，truncated 断言假失败
- **Fix:** 每条内容 pad 到 ~30 tokens
- **Files modified:** `src/ai/__tests__/phase15ContextAssembler.test.ts`
- **Commit:** ecf97d8

### Plan-vs-implementation adjustments（非缺陷）
- plan Task 3 说「照 phase13ToolLoopEvents 的 mock chatWithTools 模式」——实际上 phase13 测试从不运行 runToolLoop（只直接模拟 session 事件链），且 tsx ESM 命名空间冻结使 mock.method 不可行。改用 globalThis.fetch stub 走真实 chatWithTools 非回退路径（捕获 /api/chat 请求体中的 systemPrompt），见 decisions。

## 15-03 合并确认（软前向引用闭环）

15-02 先于 15-03（同 wave 并行）执行：本 worktree 中 `src/ai/knowledgeRepo.ts` 不存在，toolLoop 的惰性 `import('./knowledgeRepo')` **有意降级返回 `[]`** —— fts_topk 段注入为空但流程不中断（phase15ToolLoopInjection Test 4 已固化该降级行为）。

**15-03 合并后需确认：**
1. 删除 `src/ai/toolLoop.ts` 中 searchKnowledgeLazy 内的 `// @ts-ignore` 注释行（模块已存在，忽略指令成为冗余；用的是 ts-ignore 故不删也不报错，但应清理）
2. 确认 `knowledgeRepo.searchKnowledgeHybrid(query, limit)` 签名匹配（返回 `KnowledgeSearchHit[]`：{ title, version, updatedAt, summary }）；若 15-03 签名不同，以 15-03 SUMMARY 为准调整 toolLoop 侧调用
3. 验证 FTS 注入段不再为空（真实检索生效）——由 15-04 UAT 步骤 1/4 兜底覆盖

## Known Stubs

无阻塞性 stub。唯一的「未接线」是上节描述的 knowledgeRepo 惰性降级 —— 计划内的跨 plan 宽松耦合，15-03 落地后自动生效。

## Self-Check: PASSED

- 文件存在：src/ai/tools/proposeMemory.ts / src/ai/contextAssembler.ts / src/ai/__tests__/phase15ProposeMemory.test.ts / src/ai/__tests__/phase15ContextAssembler.test.ts / src/ai/__tests__/phase15ToolLoopInjection.test.ts — 全部 FOUND
- 提交存在：c89af7e / a05b46f / ecce5cb / ecf97d8 / d802636 / f9f02ee — 全部 FOUND
