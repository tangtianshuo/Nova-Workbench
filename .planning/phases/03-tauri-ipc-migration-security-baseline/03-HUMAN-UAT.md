---
status: partial
phase: 03-tauri-ipc-migration-security-baseline
source: [03-03-PLAN.md]
started: 2026-08-08T00:00:00Z
updated: 2026-08-08T00:00:00Z
---

# Phase 3 Plan 3: UI Wiring (Streaming + API Key) — Human UAT

22 items deferred to user UAT per `--auto` mode (checkpoint:human-verify with
gate="blocking" was auto-deferred per orchestrator instructions; autonomous:true).
All code-level checks PASSED (zero tsc errors from ProjectCreateModal.tsx,
SettingsApiKeySection.tsx, SettingsView.tsx).

These items require a running Tauri desktop binary + human interaction (paste
real API key, type prompts, click Stop mid-stream, restart app for keychain
persistence check).

## Current Test

[awaiting human testing — run `npm run tauri:dev` to begin]

## Tests

### 1. API key flow — first launch + persistence (D-07 + SEC-06)

- **expected:** Navigate to Settings → 隐私与安全. First launch shows "Stored in OS keychain. Never written to app files." copy + "Save key" button. After saving and full app restart, copy swaps to "API key is set. Update below to replace." + "Update key" button — keychain persisted across restarts.
- **how to test:**
  1. Navigate to Settings → 隐私与安全 (Shield icon in left nav)
  2. Verify "Stored in OS keychain. Never written to app files." copy + "Save key" button label
  3. Paste a real Gemini API key (or test string) → click Save key
  4. Verify toast "API key 已保存 / 存储于系统钥匙串,重启后依然有效"
  5. Close Nova entirely, reopen, navigate back to Settings → 隐私与安全
  6. Verify "API key is set. Update below to replace." copy + "Update key" button label (keychain persisted)
- **result:** [pending]

### 2. Streaming + cancellation (IPC-03, IPC-04, IPC-05)

- **expected:** ProjectCreateModal streams tokens live into 实时生成预览 area; Stop button visible only during generation and halts stream within 1s; Generate button disabled mid-generation so no request stacking.
- **how to test:**
  7. Click "AI 智能创建项目" (or wherever ProjectCreateModal opens)
  8. Type a real prompt in the textarea (e.g. "Build a CRM for small businesses")
  9. Click "生成项目计划"
  10. Verify tokens stream LIVE into the 实时生成预览 area (not waiting for full response)
  11. Verify Generate button is disabled (cannot click again mid-generation — IPC-05)
  12. Click "停止生成" mid-stream
  13. Verify generation halts within 1 second
  14. Verify NO error toast (D-14: Cancelled is silent)
- **result:** [pending]

### 3. Error handling (IPC-06 + D-14)

- **expected:** When API key is invalid, the generate flow surfaces a Chinese toast "API key 无效,请到 Settings 更新" mapped by the adapter's humanizeAIError function. Other errors (network, rate limit) get their own mapped messages.
- **how to test:**
  15. In Settings → 隐私与安全 → Update key → enter an INVALID key → Save
  16. Trigger generation again
  17. Verify toast "API key 无效,请到 Settings 更新" (D-14 AuthError mapping)
- **result:** [pending]

### 4. Dev parity — web fallback (IPC-02)

- **expected:** Running `npm run dev` (web mode) still works — adapter branches on isTauri() and falls back to Express fetch. Tokens are NOT streamed live in web mode (per Deferred D-16); the fetch replay synthesizes tokens at the end. The flow should complete without crashes.
- **how to test:**
  18. Stop tauri:dev, run `npm run dev` (web mode)
  19. Open http://localhost:3000
  20. Repeat step 7-9 in browser
  21. Verify generation completes (via Express fetch fallback, no live streaming tokens — that's expected per Deferred)
  22. Verify NO crashes (adapter branches on isTauri() correctly)
- **note:** Tauri desktop build is the production target. Web dev fallback is best-effort per D-21/D-16; "no live tokens in browser" is NOT a blocker.
- **result:** [pending]

## Summary

total: 22
passed: 0
issues: 0
pending: 22
skipped: 0
blocked: 0

## Gaps

[none yet — populate after running UAT]

---

_To resolve: run `/gsd:verify-work 3` after manual testing, or mark individual tests as passed/issues inline above._
