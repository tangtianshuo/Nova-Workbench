---
phase: quick-260818-di5
plan: 01
subsystem: ai-knowledge
tags: [knowledge, sourceType, agent, store]
key-files:
  modified: [src/stores/rndStore.ts, src/ai/tools/knowledgeWrite.ts, src/ai/__tests__/knowledgeWrite.test.ts]
decisions:
  - "sourceType 作为可选第 4 参 opts 传入,默认 'user' 保持所有既有调用方零改动"
  - "类型直接复用 KnowledgeDocInput['sourceType'],不新建类型"
metrics:
  duration: 6 min
  completed: 2026-08-18
  tasks: 2
  files: 3
---

# Quick Task 260818-di5: AI 写入知识文档 sourceType='agent' Summary

AI 通过 writeKnowledgeArticle 工具创建/更新的知识文档在 repo 中正确标记 `sourceType: 'agent'`,UI 手动入口默认仍为 `'user'`,由两条新测试断言锁定。

## Changes

- `src/stores/rndStore.ts` — `addKnowledgeItem` / `updateKnowledgeItem` 增加可选 `opts?: { sourceType?: KnowledgeDocInput['sourceType'] }` 参数,upsertDoc 处 `sourceType: opts?.sourceType ?? 'user'`(接口 L103-104 + 实现)
- `src/ai/tools/knowledgeWrite.ts` — `writeConfirmedArticle` 两处调用(update + create)均传 `{ sourceType: 'agent' as const }`
- `src/ai/__tests__/knowledgeWrite.test.ts` — create 与 update 两条测试各加 repo 侧断言 `doc?.sourceType === 'agent'`

## Verification

- `npx tsc --noEmit` 通过
- `npx tsx --test src/ai/__tests__/knowledgeWrite.test.ts` — 6/6 pass
- `npm test` 全量 — 161/161 pass,无回归

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
