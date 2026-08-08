---
phase: 03-tauri-ipc-migration-security-baseline
plan: 03
subsystem: ui
tags: [react, ipc-wiring, streaming, api-key, toast, tauri]
autonomous: true

# Dependency graph
requires:
  - phase: 03-tauri-ipc-migration-security-baseline
    plan: 02
    provides: src/lib/api.ts IPC adapter — streamGenerateProject / cancelGenerateProject / hasAPIKey / setAPIKey exports branching on isTauri() with dev fetch fallback
provides:
  - ProjectCreateModal streaming with live 实时生成预览 token preview + 停止生成 Stop button + toast on error (D-14 humanized messages)
  - SettingsApiKeySection component — first-launch key prompt per D-07, save/update flow wired to setAPIKey/hasAPIKey, keychain persistence
  - SettingsView 隐私与安全 nav renders SettingsApiKeySection instead of generic 即将上线 placeholder
affects: [03-04-PLAN]

# Tech tracking
tech-stack:
  added: [] # zero new deps — reuses Input, Button, useToast, Dialog primitives
  patterns:
    - "IPC wiring pattern: UI component imports streamGenerateProject from src/lib/api.ts, calls it with AbortController.signal, onToken callback appends to React state for live preview"
    - "Cancellation pattern: AbortController stored in component state, Stop button calls .abort(), useEffect cleanup on unmount also aborts (Pitfall 5)"
    - "Error surfacing pattern (D-14): adapter throws Error with humanizeAIError(msg), UI catches and toast({ type: 'error', title, description: msg }); AbortError / '已取消' silent"
    - "Settings section pattern: component checks hasAPIKey() in useEffect, returns null while loading, swaps copy + button label based on boolean state"

key-files:
  created:
    - src/components/SettingsApiKeySection.tsx
    - .planning/phases/03-tauri-ipc-migration-security-baseline/03-HUMAN-UAT.md
  modified:
    - src/components/ProjectCreateModal.tsx
    - src/views/SettingsView.tsx

key-decisions:
  - "Preserved existing newProject construction block (lines 51-143 of original ProjectCreateModal) verbatim — only swapped the fetch() call for streamGenerateProject() and wrapped JSON.parse in try/catch with raw-text fallback so non-JSON LLM output (e.g. plain markdown) still creates a project"
  - "JSON.parse fallback synthesizes a minimal shape { projectName: 'AI 协同产品工程', projectDescription: result.content, milestones: [], tasks: [] } — Ponytail: enough to keep the modal working when the LLM returns plain text instead of JSON; no schema validation (YAGNI for a single endpoint)"
  - "useEffect cleanup stores abortController in state and depends on [abortController] — Pitfall 5 fix. Each new controller re-runs the cleanup, previous one gets aborted. Modal unmount triggers final cleanup"
  - "SettingsApiKeySection returns null while hasKey === null (loading) rather than a Skeleton — Ponytail: the section is one of many in SettingsView, a flash of nothing is preferable to a flash of wrong copy. Resolves in < 1 frame on Tauri (sync IPC round-trip)"
  - "Used 'API key 已保存' (Chinese) as success toast title to match user's language; kept English 'Stored in OS keychain. Never written to app files.' + 'Save key' / 'Update key' / 'API key is set. Update below to replace.' per RESEARCH.md verbatim — these strings are developer-facing copy that's unlikely to change per locale in v0.1.0 (Ponytail: i18n is YAGNI)"

patterns-established:
  - "Pattern: IPC streaming UI — ProjectCreateModal is the canonical shape for any future streaming IPC call (Phase 4 RAG pipeline output, Phase 5 GraphFlow node status). State = idle → generating → done/error; AbortController + onToken callback + toast on error"
  - "Pattern: Settings sub-section component — self-contained <Section /> rendered conditionally in SettingsView based on activeSection, owns its own data fetch via useEffect, uses Toast for feedback"

requirements-completed: [IPC-06, SEC-06]

# Metrics
duration: 4min
completed: 2026-08-08
---

# Phase 3 Plan 3: UI Wiring (Streaming + API Key) Summary

**ProjectCreateModal rewritten to use streamGenerateProject() with live token preview + Stop button + toast errors; new SettingsApiKeySection rendered into SettingsView 隐私与安全 nav using existing Input/Button/useToast primitives — zero new dependencies, 22 human-verify items deferred to 03-HUMAN-UAT.md per --auto mode**

## Performance

- **Duration:** ~4 min
- **Tasks:** 3 (Task 1 = ProjectCreateModal rewrite; Task 2 = SettingsApiKeySection + SettingsView wiring; Task 3 = HUMAN-UAT.md deferral per --auto)
- **Files:** 4 (2 created + 2 modified)
  - Created: `src/components/SettingsApiKeySection.tsx`, `.planning/phases/03-tauri-ipc-migration-security-baseline/03-HUMAN-UAT.md`
  - Modified: `src/components/ProjectCreateModal.tsx`, `src/views/SettingsView.tsx`

## Final ProjectCreateModal Flow

**State machine:** idle → generating → done | error | cancelled

```
[idle]
  state: isGenerating=false, streamedText='', abortController=null
  UI: Generate button enabled (if prompt non-empty), no Stop button, no preview area
  action: user types prompt + clicks 生成项目计划

[generating]
  state: isGenerating=true, streamedText=<accumulating>, abortController=<set>
  UI: Generate button disabled (IPC-05 no stacking), 停止生成 button visible (variant="danger"), 实时生成预览 area renders streamedText in <pre className="font-mono">
  actions:
    - onToken → setStreamedText(prev => prev + token)
    - Stop click → abortController.abort() → adapter throws '已取消' / AbortError
    - Modal close (unmount) → useEffect cleanup aborts in-flight stream (Pitfall 5)

[done]
  trigger: streamGenerateProject resolves with { content: string }
  action: JSON.parse(content); on failure, fallback to { projectName: 'AI 协同产品工程', projectDescription: content, ... }
  then: construct newProject (lines 80-172 verbatim from original) → addProject → addCategory → addTask loop → onClose()
  finally: setIsGenerating(false), setAbortController(null)

[error]
  trigger: streamGenerateProject rejects with non-AbortError
  action: toast({ type: 'error', title: '生成失败', description: msg })
  finally: same as done

[cancelled]
  trigger: streamGenerateProject rejects with AbortError OR msg === '已取消'
  action: silent (no toast) per D-14
  finally: same as done
```

**Key invariants:**
- AbortController in state, cleaned up via useEffect[abortController] dependency (Pitfall 5)
- Generate button `disabled={!prompt.trim() || isGenerating}` (IPC-05)
- Stop button rendered conditionally `{isGenerating && <Button variant="danger">...}`
- AbortError caught: `if (msg === '已取消' || (error as Error).name === 'AbortError') return;` (covers both Tauri 'cancelled' and browser AbortController abort)

## Final SettingsApiKeySection Shape

```tsx
<SettingsApiKeySection />
  // On mount: hasAPIKey() → setHasKey(boolean) → render null while loading
  // Renders into SettingsView when activeSection === 'privacy'

  <h2>隐私与安全</h2>
  <div className="rounded-[var(--radius-lg)] border p-5">
    <p>Gemini API Key</p>
    <p className="text-xs text-text-tertiary">
      {hasKey
        ? 'API key is set. Update below to replace.'
        : 'Stored in OS keychain. Never written to app files.'}
    </p>
    <Input type="password" placeholder="Gemini API key" />
    <Button variant="primary" disabled={!input.trim() || isSaving}>
      {hasKey ? 'Update key' : 'Save key'}
    </Button>
  </div>
```

**handleSave flow:**
1. Validate non-empty (early-return if !input.trim() || isSaving)
2. setIsSaving(true) — prevents double-submit
3. await setAPIKey(input.trim()) → Tauri prod: writes OS keychain via keychain.rs; Dev: no-op (Express uses .env per D-09)
4. On success: setHasKey(true), setInput(''), toast({ type: 'success', title: 'API key 已保存', description: '存储于系统钥匙串,重启后依然有效' })
5. On failure: toast({ type: 'error', title: '保存失败', description: err.message })
6. finally: setIsSaving(false)

## HUMAN-UAT Items Deferred (22 items across 4 categories)

Per `--auto` mode, Task 3's `checkpoint:human-verify` with `gate="blocking"` was NOT paused — items appended to `03-HUMAN-UAT.md` instead:

1. **API key flow (D-07 + SEC-06) — 6 items (steps 1-6):** First-launch copy verification, save flow, toast confirmation, full app restart, keychain persistence check (copy swaps to "API key is set. Update below to replace." + "Update key" label)
2. **Streaming + cancellation (IPC-03, IPC-04, IPC-05) — 8 items (steps 7-14):** Open ProjectCreateModal, type prompt, click 生成项目计划, verify live token streaming into 实时生成预览 area, verify Generate button disabled mid-flight, click 停止生成 mid-stream, verify halt within 1s, verify NO error toast (D-14 cancel is silent)
3. **Error handling (IPC-06 + D-14) — 3 items (steps 15-17):** Set invalid API key in Settings → trigger generation → verify toast "API key 无效,请到 Settings 更新" mapped by adapter's humanizeAIError
4. **Dev parity (IPC-02) — 5 items (steps 18-22):** Stop tauri:dev, run `npm run dev`, repeat generate flow in browser, verify completion via fetch fallback (no live tokens — expected per Deferred D-16), verify no crashes (isTauri() branch works)

**Summary:** total: 22 / passed: 0 / pending: 22 / issues: 0

## Verification Results

### Task 1 (ProjectCreateModal)

All acceptance grep checks passed:

| Check | Count | Required |
|-------|-------|----------|
| `streamGenerateProject` | 2 | ≥1 ✓ |
| `fetch('/api/generate-project'` | 0 | 0 ✓ (old fetch removed) |
| `AbortController` | 4 | ≥1 ✓ |
| `abortController?.abort` | 2 | ≥2 ✓ (Stop button + unmount cleanup) |
| `停止生成` | 1 | ≥1 ✓ |
| `disabled=.*isGenerating` | 5 | ≥1 ✓ (button disabled during generation — IPC-05) |
| `实时生成预览` | 1 | ≥1 ✓ |
| `useToast` | 2 | ≥1 ✓ |
| `已取消` | 1 | ≥1 ✓ (D-14 cancel silent) |
| `AbortError` | 1 | ≥1 ✓ (browser-native cancel error also caught) |

### Task 2 (SettingsApiKeySection + SettingsView)

All acceptance checks passed:

- `test -f src/components/SettingsApiKeySection.tsx` ✓ (exists)
- `export function SettingsApiKeySection` in SettingsApiKeySection.tsx ✓
- `hasAPIKey` in SettingsApiKeySection.tsx (3 matches: import + useEffect + 1 reference) ✓
- `setAPIKey` in SettingsApiKeySection.tsx (2 matches: import + handleSave) ✓
- `type="password"` in SettingsApiKeySection.tsx ✓
- `useToast` in SettingsApiKeySection.tsx (2 matches: import + hook call) ✓
- `API key 已保存` in SettingsApiKeySection.tsx ✓
- `SettingsApiKeySection` in SettingsView.tsx (2 matches: import + render) ✓
- `activeSection === 'privacy'` in SettingsView.tsx ✓

### npm run lint

- `npm run lint` does NOT exit 0 — but ALL errors originate from `src-tauri/target/release/build/.../tauri-codegen-assets/*.js` (pre-existing tsconfig debt documented in deferred-items.md, NOT introduced by this plan)
- Targeted filter: `npm run lint 2>&1 | grep -E "(ProjectCreateModal|SettingsApiKeySection|SettingsView)"` → **zero matches** → zero new errors from this plan's 3 files

## Deviations from Plan

None. The plan executed exactly as written. The verbatim code examples in 03-03-PLAN.md Task 1 and Task 2 were applied without modification.

The only minor adjustment (NOT a deviation) was keeping the `fetch('/api/workspace-files')` call in ProjectCreateModal.tsx unchanged — the plan only called for replacing `fetch('/api/generate-project')`, not the workspace files fetch. The workspace files endpoint remains Express-only per existing architecture (no Tauri equivalent exists yet).

## Decisions Made

### JSON.parse fallback shape (Ponytail)

When `streamGenerateProject` returns `{ content: string }` and the content isn't valid JSON, the modal falls back to `{ projectName: 'AI 协同产品工程', projectDescription: result.content, milestones: [], tasks: [] }`. This is enough to keep the modal working — the existing newProject construction uses optional chaining (`data.projectName || 'AI 协同产品工程'`, `data.milestones?.[data.milestones.length - 1]?.date || '2025-12-31'`, etc.) so the empty arrays / fallback name slot in cleanly. Schema validation is YAGNI for a single AI endpoint.

### AbortController cleanup pattern

The useEffect depends on `[abortController]`, not `[]`. This means each new controller (one per generate call) re-runs the cleanup, which aborts the previous controller. Modal unmount triggers the final cleanup. Pattern:

```tsx
const [abortController, setAbortController] = useState<AbortController | null>(null);
useEffect(() => {
  return () => { abortController?.abort(); };
}, [abortController]);
```

This satisfies Pitfall 5 (Channel.onmessage after unmount → AbortSignal cleanup) without a ref-based dance.

### SettingsApiKeySection returns null while loading

Per Ponytail — the section is one of six nav items inside SettingsView. A flash of `null` (no content) for the ~1 frame it takes hasAPIKey() to resolve is preferable to a flash of incorrect copy ("Stored in OS keychain" when the key is actually set, or vice versa). The Tauri IPC round-trip for `has_api_key` is sub-millisecond in practice. A Skeleton loader here is YAGNI.

## Issues Encountered

None.

The pre-existing tsc lint failures from `src-tauri/target/release/build/...` continue to be out of scope (documented in `deferred-items.md` from 03-02). All three files modified/created by this plan produce zero new errors when filtered out from the src-tauri noise.

## User Setup Required

None for the autonomous portion — Wave 3 ships UI wiring only.

For the deferred 22 human-verify items (in `03-HUMAN-UAT.md`):
- A real Gemini API key for end-to-end testing (steps 3, 15)
- Tauri desktop binary running (`npm run tauri:dev`) for IPC path verification
- Web mode (`npm run dev`) for dev fallback verification (steps 18-22)

## Known Stubs

None. The UI wiring is complete — no placeholder values flow to the user.

**Note on dev mode (NOT a stub):** Per D-16 + D-21, the dev/web fallback in `streamGenerateProject` does NOT stream tokens live — it calls fetch() and replays the synthesized `data.projectDescription` via onToken after the full response arrives. This means in `npm run dev` (web mode), the 实时生成预览 area will populate all at once at the end of generation, not token-by-token. This is documented in CONTEXT.md Deferred "WebFallback 完善" and called out in 03-HUMAN-UAT.md step 21 as expected behavior. Not a blocker for plan completion.

## Self-Check: PASSED

**Files (4/4 found):**
- src/components/ProjectCreateModal.tsx ✓ (modified)
- src/components/SettingsApiKeySection.tsx ✓ (created)
- src/views/SettingsView.tsx ✓ (modified)
- .planning/phases/03-tauri-ipc-migration-security-baseline/03-HUMAN-UAT.md ✓ (created)

**Commits (2 task commits found; final docs commit pending):**
- e16fbd6 feat(03-03): ProjectCreateModal streaming + live preview + Stop button ✓
- 20848a1 feat(03-03): SettingsApiKeySection + SettingsView privacy wiring ✓

**Lint verification:**
- `npm run lint 2>&1 | grep -E "(ProjectCreateModal|SettingsApiKeySection|SettingsView)"` → zero matches (zero new errors from this plan's files)
