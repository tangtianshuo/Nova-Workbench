---
phase: 31-doc-workspace
plan: 05
subsystem: testing
tags: [uat, milkdown, doc-workspace, human-verification]

requires:
  - phase: 31-doc-workspace
    provides: 全部 01-04/06-09 实现(编辑器/面板/数据层/UX 调整/gap 收口)
provides:
  - 31-HUMAN-UAT.md 9/9 全 pass 用户签核(2026-09-04)
  - 5 gap 修复经两轮真机复测 resolved
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: [.planning/phases/31-doc-workspace/31-HUMAN-UAT.md]
  modified: []

key-decisions:
  - "UAT 驱动三轮迭代:round-0 诊断(5 gaps)→ 31-08/31-09 修复 → round-1 复测暴露 2 个新引入缺陷 → 57a92a7 根因修复(codeBlock contentDOM / 表格行 <br> guard)→ round-2 全过"
  - "toolbar 锚定悬浮按用户要求补齐(e9772af),超出原清单,记为 polish"

patterns-established: []

## Self-Check: PASSED

- 9/9 tests pass,用户逐项签核("approved" 2026-09-04)
- 5 gaps 全部 status: resolved;5 个 debug session 归档 resolved/
- 回归:lint 零错误、234 TS 测试通过、build 通过、enter-slash/table repros 全 PASS

## What Was Done

1. Task 1(清单执行):9 组用例真机执行,round-0 结果 7 pass / 2 issue(5 gaps),诊断 + gap closure 计划(31-08/31-09)
2. Task 2(签核):三轮复测后 9/9 全过,用户 approved

## Issues & Notes

- 31-09 首轮实现引入 2 缺陷(codeBlock 不可输入 = 缺 contentDOM;表格损坏 = normalizeMarkdown 改写表格行内 `<br />`),round-2 修复并复测通过 —— 根因与复现脚本见 .planning/debug/(repro-table-roundtrip.mjs 4 断言)
- REQUIREMENTS.md 从未登记 DOC-xx/SC 锚点(ROADMAP 标 TBD),verifier 记为流程债
