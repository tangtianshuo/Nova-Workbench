---
phase: 21-session-list
plan: "02"
subsystem: ai-session-titling
tags: [title, llm, session-repo, zustand]
requires: [21-01]
provides: [generateSessionTitle, maybeGenerateTitle, sessionListVersion]
affects: [src/stores/chatConsoleStore.ts, src/ai/titleGenerator.ts]
tech-stack:
  added: []
  patterns: [llm-injection-for-tests (compaction summarizer pattern), fire-and-forget-with-captured-id]
key-files:
  created:
    - src/ai/titleGenerator.ts
    - src/stores/__tests__/phase21Title.test.ts
  modified:
    - src/stores/chatConsoleStore.ts
decisions:
  - "maybeGenerateTitle exposes optional llm injection param (tests pass mock; production passes none)"
metrics:
  duration: 12m
  completed: 2026-08-19
  tasks: 2
  files: 3
---

# Phase 21 Plan 02: Session Auto-Titling Summary

One-liner: LLM auto-naming (≤20-char Chinese title via chatWithTools) with first-user-message fallback, wired fire-and-forget into submit's finally, write-once via updateTitle's NULL guard, plus sessionListVersion counter for silent list refresh.

## What Was Built

1. **src/ai/titleGenerator.ts** — `generateSessionTitle` mirroring `defaultCompactionSummarizer`: custom Chinese system prompt, `TITLE_MAX_CHARS = 20` truncation on both paths, `llm` injectable for tests, never throws (throw/empty → fallback source).
2. **chatConsoleStore.ts** — `sessionListVersion: 0` state field; `maybeGenerateTitle(sessionId, llm?)` internal action: early-return if `meta?.title`, gathers firstUserMessage + 4000-char transcript from the event store for THAT sessionId, generates, writes via guarded `updateTitle(sessionId, title, source)`, bumps `sessionListVersion`, console.error-only catch. Trigger added in `submit`'s finally next to `void refreshForkable()` — no other finally blocks touched.

## Key Decisions

- **llm injection param on maybeGenerateTitle**: plan specified injection only in generateSessionTitle; store tests needed deterministic LLM behavior without network, so the optional `llm` param threads through. Zero production impact.
- **sessionId captured as parameter** — never read from `get()` after an await; cross-session write impossible even if user switches mid-generation.

## Verification

- `npx tsx --test src/stores/__tests__/phase21Title.test.ts src/stores/__tests__/phase19Runtime.test.ts src/stores/__tests__/phase20Fork.test.ts` — 17 pass, 0 fail
- `npm run lint` (tsc --noEmit) — clean

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
