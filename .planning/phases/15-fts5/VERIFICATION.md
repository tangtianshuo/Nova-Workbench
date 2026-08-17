---
phase: 15-fts5
verified: 2026-08-17
status: passed
score: 8/8 MEM requirements field-verified (audit_backfill)
source: audit_backfill
re_verification:
  previous_status: missing
  previous_score: N/A
  gaps_closed: [missing VERIFICATION.md — 15-02/15-03 parallel waves merged without verifier run]
  gaps_remaining: []
  regressions: []
---

# Phase 15: 长期记忆 + 知识文档 + FTS5 检索 Verification Report

**Phase Goal:** PM 拥有可管理的第二大脑 — 记忆需确认才入库、知识带版本与来源、中文关键词可命中、上下文按优先级投影注入
**Verified:** 2026-08-17 (milestone audit backfill)
**Status:** passed
**Re-verification:** N/A — initial VERIFICATION.md backfilled from v0.3.0 milestone audit integration check

## Verification Source

This report is backfilled from the v0.3.0 milestone audit integration checker (2026-08-17). Phase 15 的 4 个 plan 以并行 wave 执行,15-02/15-03 合并关闭时漏跑 verifier(git a60cdd7),VERIFICATION.md 缺失被记为文档债(MILESTONE_SUMMARY §6)。本次审计对 MEM-01..08 做了代码级现场验证 + 测试套件全量回归 + 间接 UAT 证据交叉,结论 PASS。

## Requirements Verification

| Req | Verdict | Evidence |
|-----|---------|----------|
| MEM-01 (候选确认流;模型只能提议,用户「记住」= user_directed 直接入库) | SATISFIED | `memoryStore.ts:8-9,19,256,311-317`;tests `phase15MemoryStore.test.ts:62,153`(user_directed auto-confirm 路径) |
| MEM-02 (被拒候选永不进检索、不重复提议) | SATISFIED | `memoryStore.ts:189-194`(rejected → `previously_rejected` 静默去重);test :48;assembler anti-repropose 段测试 `phase15ContextAssembler.test.ts:35` |
| MEM-03 (防轰炸:paramsHash 去重 + cap-20 让位 + TTL 过期) | SATISFIED | `memoryStore.ts:16-17,180-194`(TTL 7d / CAP 20 / hash 去重);tests :15,27,101,116;paramsHash 复用 Phase 14 `computeParamsHash`(memoryStore.ts:14) |
| MEM-04 (知识文档版本+来源;旧版本可审计;无 stale index) | SATISFIED | `knowledgeRepo.ts` upsertDoc 版本链 Step 1/2、`listVersions`、superseded 查询期过滤;tests `phase15KnowledgeRepo.test.ts:31,48` |
| MEM-05 (supersedes 链替换 + 来源/版本保留) | SATISFIED | `memoryStore.ts:51,87` `supersedesRowid`;test :80 |
| MEM-06 (FTS5 混合检索;中文 2 字命中;索引/查询同源切分) | SATISFIED | `ftsTokens.ts` 单一切分器双侧共用;tests `phase15FtsTokens.test.ts:7-39`(2 字 CJK + 索引/查询 parity);混合检索 `knowledgeRepo.ts:330-334` |
| MEM-07 (检索结果带来源元数据) | SATISFIED | 每条命中带 provenance 行;test `phase15ContextAssembler.test.ts:82` |
| MEM-08 (五段优先级组装 + context_injected 审计) | SATISFIED | `toolLoop.ts:121-133` + `contextAssembler.ts`;payload `{name, items, tokens, truncated}`,2000-token cap;tests :20,133,151 |

**8/8 MEM requirements verified.**

## Cross-Phase Wiring (verified by audit integration checker)

- 14→15: paramsHash 复用 EVT-05 底座(`memoryStore.ts:14` import `computeParamsHash`)
- 15→16: `knowledgeRepo.upsertDoc` 单一写 API 被 deliverable 落槽复用(`generateDeliverable.ts:15,57`),stable docId `deliverable-{productId}-{slotCode}` → 重复落槽成版本链
- 15→17: `listPending` 记忆候选喂晨报 selectors(`MorningReport.tsx:11,47,139-147` + `reportSelectors.ts`);`buildCoreContext` 经 toolLoop 注入并落 `context_injected`(`toolLoop.ts:11,121-133`)

## Indirect UAT Evidence (unified session, 2026-08-17)

- 16-HUMAN-UAT Tests 3/5/6/8:落槽 PRD 版本链(v1 superseded / v2 current)、FTS5 立即命中(ftsImmediateHit:true ×2)、审计事件 payload 完整
- 17-HUMAN-UAT Test 5:记忆候选经 DB 两条 model_inferred 消费记录证实;晨报候选跳转(Test 3)

## Test Suite

8 个 phase15 测试文件全绿(Cascade / ToolLoopInjection / ProposeMemory / ContextAssembler ×2 / MemoryStore / KnowledgeRepo / FtsTokens);全量 `npm test` 161/161 pass(audit 当日)。

## Caveats / Follow-ups

1. **FTS5 runtime probe on packaged build**(STATE TODO 遗留):开发模式 SQLite 已验证 FTS5 可用;打包产物的 runtime probe 仍未执行,列为发布前检查项。
2. **DELIV-04/MEM-04 事务语义近似**:"同一事务"实际为单写 API + 立即索引 + 查询期过滤的补偿控制(tauri-plugin-sql 无跨 execute 事务),操作上已满足「立即命中」,详见 v0.3.0-MILESTONE-AUDIT。
3. **中文 PM 词汇 recall 质量决策点**(STATE TODO 遗留):2 字 CJK 命中已验证,PM 领域长尾词汇质量留观察。

## Gaps Summary

无 code-level gap。8/8 需求满足,接线完整,测试全绿。

---

_Backfilled: 2026-08-17 from v0.3.0 milestone audit (gsd-integration-checker field verification)_
