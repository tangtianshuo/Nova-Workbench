---
phase: 01-dark-mode-wiring
plan: 02
subsystem: ui-wiring
tags: [theme, settings, header, segmented-control]
requires:
  - 01-01-SUMMARY  # themeStore + Linux GTK detection
provides:
  - SettingsView 外观主题 section bound to themeStore
  - Header theme quick-toggle icon button (light <-> dark cycle)
affects:
  - src/views/SettingsView.tsx
  - src/components/layout/Header.tsx
tech-stack:
  added: []
  patterns:
    - SegmentedControl bound to themeStore via useTheme() wrapper
    - Ghost icon Button with dynamic aria-label
key-files:
  created: []
  modified:
    - src/views/SettingsView.tsx
    - src/components/layout/Header.tsx
decisions:
  - D-01 honored — SegmentedControl (not Switch/Select) for Settings three-way toggle
  - D-02 honored — Header cycle excludes System (System is Settings-only)
  - Theme icon shows action TARGET (Sun when dark = click goes light), not current state
metrics:
  duration: ~1 min
  completed: 2026-08-08
---

# Phase 01 Plan 02: UI Wiring (Settings + Header) Summary

Replaced SettingsView's "深色模式" Switch placeholder with a three-way SegmentedControl (浅色/深色/系统) and added a Header ghost icon button cycling light↔dark — both consume themeStore via the useTheme() wrapper from Plan 01, so they sync without manual coordination.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Replace SettingsView Switch placeholder with SegmentedControl | dd3450f | Added AppearanceSection component, conditional rendering for activeSection === 'appearance', removed old 深色模式 Switch |
| 2 | Add Header theme quick-toggle icon button | 53bc864 | Inserted ghost Button between Search and Bell, Sun/Moon swap on resolved theme |
| 3 | Checkpoint: Verify Settings + Header wiring (DARK-01 + DARK-02) | (auto-approved) | — Auto-approved under --auto mode; end-of-phase verifier runs smoke matrix |

## Task Details

### Task 1 — SettingsView SegmentedControl (DARK-01)

**File:** `src/views/SettingsView.tsx`

- Added imports: `SegmentedControl`, `useTheme`, Phosphor `Sun`, `Moon`, `Desktop`.
- Wrapped existing 账号信息 content in `activeSection === 'account' && (...)` branch.
- Added `activeSection === 'appearance' && (...)` branch that renders `<AppearanceSection />`.
- Added fall-through placeholder (`即将上线`) for unrouted nav items (notifications/privacy/layout/locale).
- New `AppearanceSection` component (bottom of file) isolates `useTheme()` call site — SegmentedControl binds `value={theme}` and `onChange={(id) => setTheme(id as 'light' | 'dark' | 'system')}`.
- Removed the old "深色模式" `<Switch />` block (RESEARCH §8 Q3 — keep one control, not two). The 桌面通知 Switch is preserved.
- Segments: `{ light: 浅色/Sun, dark: 深色/Moon, system: 系统/Desktop }`, all `weight="duotone" size={14}`.

### Task 2 — Header theme quick-toggle (DARK-02)

**File:** `src/components/layout/Header.tsx`

- Added imports: Phosphor `Sun`, `Moon`; `useTheme` from `@/src/hooks/useTheme`.
- Called `const { resolved, toggle } = useTheme();` after existing `useState` calls.
- Inserted new ghost Button **between** the existing Search button and the Notifications (Bell) button — existing order preserved.
- `onClick={toggle}` — useTheme's toggle already cycles light↔dark (no System per D-02).
- Icon: `Sun` when `resolved === 'dark'` (clicking goes to light), `Moon` otherwise (clicking goes to dark) — represents action TARGET, not current state.
- `weight="duotone" size={16}` — matches Bell button's action-button tier convention.
- Dynamic `aria-label` (`切换到浅色模式` / `切换到深色模式`) for screen reader accessibility.

### Task 3 — Checkpoint (auto-approved)

Per `--auto` mode, the human-verify checkpoint on Task 3 was auto-approved. The manual smoke test matrix (Test 1-4 in the plan) is delegated to the phase verifier.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the plan's step-by-step instructions verbatim. No Rule 1-3 fixes needed.

## Verification

- `npm run lint`: zero TypeScript errors in touched files (`src/views/SettingsView.tsx`, `src/components/layout/Header.tsx`). Pre-existing `src-tauri/target/` build-artifact errors are out of scope (ponytail scope boundary).
- Header and Settings stay in sync via the shared `themeStore` (Plan 01) — no manual coordination logic.
- Cycle excludes System (D-02) — `useTheme().toggle()` already implements `next = resolved === 'dark' ? 'light' : 'dark'`.
- SegmentedControl uses `theme` (NOT `resolved`) for `value` — user sees their Light/Dark/System choice, not the OS-resolved value.

## Success Criteria Check

- [x] SettingsView 外观主题 section uses SegmentedControl bound to themeStore (3 segments: light/dark/system)
- [x] Header has ghost icon button cycling light↔dark (no System in cycle)
- [x] Both stay in sync via themeStore (no manual coordination)
- [x] Old Switch placeholder removed (桌面通知 Switch preserved)
- [x] No new components created (SegmentedControl + Button + Phosphor icons all existing)
- [x] Phosphor icons use `weight="duotone"`, sizes match conventions (14 in Settings, 16 in Header)
- [x] Both consume themeStore via useTheme() wrapper — no direct store access

## Self-Check: PASSED

Files verified to exist:
- FOUND: src/views/SettingsView.tsx
- FOUND: src/components/layout/Header.tsx

Commits verified in git log:
- FOUND: dd3450f (feat(01-02): replace SettingsView switch placeholder with SegmentedControl)
- FOUND: 53bc864 (feat(01-02): add Header theme quick-toggle icon button)
