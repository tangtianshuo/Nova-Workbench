---
phase: 01-dark-mode-wiring
verified: 2026-08-08T00:00:00Z
status: human_needed
score: 5/5 must-haves verified statically (runtime UAT deferred)
re_verification: false
human_verification:
  - test: "Visual dark-mode audit across 47 components per D-09"
    expected: "All Card variants + 11 views + 16 product components render with correct contrast (no white-on-white, invisible borders, vanishing hero panels). Accent-tinted hero gradient visible against dark --bg-app."
    why_human: "Static grep sweep confirmed zero literal slate-950/indigo-950/amber-950/teal-950/blue-600 + zero alpha-overlay leaks inside Card variant='dark' blocks. Visual contrast still needs eyeballing in a running browser/Tauri."
  - test: "Settings three-way SegmentedControl toggle"
    expected: "User picks 浅色/深色/系统 in Settings → 外观主题, entire app reflects choice immediately with 200ms color transition."
    why_human: "Wiring verified (SegmentedControl bound to useTheme().theme, themeStore as single source of truth). Runtime click behavior + transition feel needs human eyes."
  - test: "Header theme quick-toggle cycle"
    expected: "Clicking Header icon toggles light↔dark only (never System). Icon shows Sun when currently dark (target=light), Moon when currently light (target=dark). Stays in sync with Settings selection."
    why_human: "Wiring verified (ghost Button between Search and Bell, onClick={toggle}, Sun/Moon swap on resolved). Runtime cycle behavior + sync needs human click test."
  - test: "Linux GNOME/KDE live theme-follow in System mode"
    expected: "On Linux with GNOME 42+, user changes org.gnome.desktop.interface color-scheme → Nova follows within ~2s. Manual Light/Dark override wins over detection. KDE without gsettings falls back to prefers-color-scheme."
    why_human: "Rust command + JS polling branch verified statically (cfg gate, 2s setInterval, .includes('dark') parse, manual-override early-return). Cannot run Linux runtime verification from this Windows environment."
  - test: "Smooth theme-switch color transition (no flash)"
    expected: "Toggling theme animates background-color/color/border-color/fill/stroke over 200ms cubic-bezier(0.4,0,0.2,1). No layout shift. Reduced-motion users see instant switch."
    why_human: "CSS rule exact-match verified (200ms / cubic-bezier / 5-property list). Reduced-motion override preserved at lines 158-168. Runtime animation feel + flash-free behavior needs human observation."
---

# Phase 1: Dark Mode Wiring Verification Report

**Phase Goal:** Users get a working three-way dark mode across the whole app, clearing the v0.1.0 Phase 7 tech debt
**Verified:** 2026-08-08
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can switch theme to Light/Dark/System from Settings — entire app reflects choice immediately | ✓ VERIFIED | `src/views/SettingsView.tsx:144-152` renders SegmentedControl with `value={theme}` + `onChange={(id) => setTheme(id as 'light'\|'dark'\|'system')}`, bound to `useTheme()` from themeStore. Three segments (light/dark/system) with Phosphor icons. Settings↔Header sync via shared Zustand store (`useThemeStore`). Runtime click feel deferred to human UAT. |
| 2 | User can quick-toggle theme from Header with one click (cycles light/dark, no System) | ✓ VERIFIED | `src/components/layout/Header.tsx:56-65` ghost Button between Search and Bell, `onClick={toggle}`, Sun when `resolved==='dark'`, Moon otherwise. `toggle()` in themeStore:38 is `next = current === 'dark' ? 'light' : 'dark'` — System excluded by construction. |
| 3 | OS theme change in System mode follows live (no restart) — incl. Linux GNOME/KDE via GTK shim | ✓ VERIFIED | `src/hooks/useTheme.ts:52-58` matchMedia change listener for macOS/Windows, gated on `theme === 'system'` (D-04 manual-override priority). `useTheme.ts:63-76` Linux GTK branch: 2s `setInterval`, `.includes('dark')` GVariant-tolerant parse, `clearInterval` cleanup. `src-tauri/src/lib.rs:7-26` dual `#[cfg]` `get_gnome_color_scheme` command (gsettings on Linux, stub `None` elsewhere), registered in `invoke_handler`. Manual override priority verified in both effects. |
| 4 | Every Card variant + 11 views + 16 product components render with correct contrast in dark mode | ✓ VERIFIED | Card dark variant reworked at `src/components/ui/Card.tsx:22` to `from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary border border-accent/20`. All 5 variants now use semantic tokens. Grep sweep across `src/components/product/` returns **1 match** for `from-slate-950\|via-indigo-950\|from-blue-600\|from-amber-950\|from-teal-950\|via-slate-900\|to-slate-950` — `UIPrototypeTab.tsx:91` `themeColors.dark.bg` (intentional user-selectable prototype preview, not app chrome). Zero matches for `text-white/40\|text-white/60\|bg-white/10\|border-white/15` alpha-overlay leaks. All 3 literal-override heroes (CompetitorAnalysis/TestManagement/ProductSkills) reworked to `bg-bg-tertiary` base + accent at 20%/10% opacity. View hero banners (ProductManagementView:157, RndCenterView:88) reworked to same accent-tinted pattern. 4 modal overlays swapped to `bg-bg-overlay`. 3 P0 toast fixes (`bg-slate-900 text-text-inverted` → `bg-bg-primary text-text-primary`) applied. Runtime visual UAT deferred to human per --auto. |
| 5 | Theme switches animate smoothly with no flash | ✓ VERIFIED | `src/styles/tokens.css:223-227` appends `* { transition-property: background-color, color, border-color, fill, stroke; transition-duration: 200ms; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }`. Geometry properties excluded by construction (no layout shift). Existing reduced-motion override preserved at lines 158-168 (`transition-duration: 0.01ms !important`). `transition: all` absent as actual CSS rule (only inside line 221 warning comment). |

**Score:** 5/5 truths verified statically

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/stores/themeStore.ts` | Zustand store as single source of truth | ✓ VERIFIED | 41 lines, exports `Theme`, `getResolvedTheme`, `applyTheme`, `useThemeStore`. STORAGE_KEY='nova-theme' preserved. `toggle()` skips System. |
| `src/hooks/useTheme.ts` | Thin wrapper + Linux GTK detection | ✓ VERIFIED | 80 lines, imports from `@/src/stores/themeStore`, has `invoke<string\|null>('get_gnome_color_scheme')`, `.includes('dark')` parse, `setInterval(check, 2000)`, `clearInterval`, manual-override guards in BOTH effects. |
| `src-tauri/src/lib.rs` | `get_gnome_color_scheme` command with cfg gate | ✓ VERIFIED | 44 lines, two `#[tauri::command]` definitions gated by `#[cfg(target_os = "linux")]` and `#[cfg(not(...))]`, `Command::new("gsettings")` scoped inside Linux fn body, registered in `invoke_handler`. |
| `src/views/SettingsView.tsx` | SegmentedControl bound to useTheme | ✓ VERIFIED | AppearanceSection component at line 135 calls `useTheme()`, renders SegmentedControl with `value={theme}` + 3 segments (light/dark/system, Phosphor Sun/Moon/Desktop icons). Old Switch removed; 桌面通知 Switch preserved. |
| `src/components/layout/Header.tsx` | Ghost icon button calling toggle | ✓ VERIFIED | Lines 56-65: ghost Button between Search and Bell, `onClick={toggle}`, Sun/Moon swap on `resolved`, dynamic aria-label. |
| `src/styles/tokens.css` | Color transition rule at bottom | ✓ VERIFIED | Lines 218-227: 5-property transition (background-color, color, border-color, fill, stroke), 200ms duration, cubic-bezier(0.4,0,0.2,1). Existing reduced-motion block at 158-168 preserved. |
| `src/components/ui/Card.tsx` | Reworked dark variant | ✓ VERIFIED | Line 22: `from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary border border-accent/20`. Other 4 variants untouched. No `from-slate-950` or `via-indigo-950` remaining. |
| 10 product sub-components | Semantic-token overlays + 3 literal-override reworks | ✓ VERIFIED | All 10 files contain `variant="dark"`. CompetitorAnalysis/TestManagement/ProductSkills hero lines reworked (amber/teal/blue at 20%/10% opacity over `to-bg-tertiary`). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/hooks/useTheme.ts` | `src/stores/themeStore.ts` | `useThemeStore()` Zustand hook | ✓ WIRED | Line 3 imports, lines 39-41 select `theme`/`setTheme`/`toggle`. |
| `src/hooks/useTheme.ts` | `src-tauri/src/lib.rs` | `invoke('get_gnome_color_scheme')` | ✓ WIRED | Line 25 `invoke<string\|null>('get_gnome_color_scheme')`. |
| `src-tauri/src/lib.rs` | gsettings CLI | `Command::new("gsettings")` | ✓ WIRED | Line 11, args `["get", "org.gnome.desktop.interface", "color-scheme"]`. |
| `src/views/SettingsView.tsx` | `src/stores/themeStore.ts` | `useTheme()` wrapper | ✓ WIRED | AppearanceSection:136 calls `useTheme()`, destructures `theme`, `setTheme`. |
| `src/components/layout/Header.tsx` | `src/stores/themeStore.ts` | `useTheme()` wrapper | ✓ WIRED | Line 8 import, line 18 destructures `resolved`, `toggle`. |
| `src/components/ui/Card.tsx` | `src/styles/tokens.css` | accent token refs in dark variant | ✓ WIRED | Line 22 contains `from-accent/20 via-accent-hover/10 to-bg-tertiary`. |
| 10 product `*.tsx` consumers | `src/components/ui/Card.tsx` | `variant="dark"` consumer | ✓ WIRED | All 10 files contain `variant="dark"`; 3 with reworked literal-override gradients. |
| `src/styles/tokens.css` | `src/index.css` | `@import './styles/tokens.css'` | (not checked — tokens.css is loaded by Vite as part of the Tailwind plugin chain; pre-existing working integration) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `SettingsView` SegmentedControl | `theme` (from `useTheme()`) | `useThemeStore` Zustand selector | Yes — store seeded from `localStorage.getItem('nova-theme')` | ✓ FLOWING |
| `Header` icon Button | `resolved`, `toggle` (from `useTheme()`) | `useThemeStore` + `getResolvedTheme` | Yes — same store instance | ✓ FLOWING |
| `useTheme` Linux GTK effect | `detectGtkTheme()` result | Tauri `invoke('get_gnome_color_scheme')` → Rust gsettings subprocess | Yes (on Linux) / no-op elsewhere | ✓ FLOWING (Linux-only by design) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Card dark variant contains accent gradient | Grep `from-accent/20\|via-accent-hover/10\|to-bg-tertiary` in `Card.tsx` | 1 match at line 22 | ✓ PASS |
| Literal slate-950/indigo-950/blue-600/amber-950/teal-950 purged from product components | Grep across `src/components/product/` | 1 match (`UIPrototypeTab.tsx:91` intentional preview literal) | ✓ PASS |
| Alpha-overlay leaks purged from product Card dark blocks | Grep `text-white/40\|text-white/60\|bg-white/10\|border-white/15` in `src/components/product/` | 0 matches | ✓ PASS |
| `transition: all` not present as actual CSS rule | Grep in `src/` | Only 1 match — inside line 221 warning comment in tokens.css | ✓ PASS |
| All 10 product Card dark consumers exist | Grep `variant="dark"` in `src/components/product/` | 10 files match (matches audit claim) | ✓ PASS |
| Modal overlays swapped to semantic token | Grep `bg-bg-overlay` in product components | 4 matches (FullDeliverablesTab:346, ProductDocsTab:248, ProductKnowledgeTab:375, ProductSkillsTab:239) | ✓ PASS |
| P0 toast bugs fixed (no `bg-slate-900 text-text-inverted` pattern) | Grep in product components | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DARK-01 | 01-02 | Settings three-way toggle (Light/Dark/System) | ✓ SATISFIED | SettingsView:144-152 SegmentedControl bound to useTheme |
| DARK-02 | 01-02 | Header quick-toggle icon button | ✓ SATISFIED | Header:56-65 ghost Button with toggle, Sun/Moon swap |
| DARK-03 | 01-01 | System mode follows OS theme changes live (no restart) | ✓ SATISFIED | useTheme.ts:52-58 matchMedia change listener with D-04 manual-override guard |
| DARK-04 | 01-01 | Linux GTK detection shim avoids Tauri#9427 | ✓ SATISFIED | lib.rs cfg-gated gsettings command + useTheme.ts:63-76 Linux branch with 2s polling + manual override priority |
| DARK-05 | 01-04 | All 5 Card variants dark-correct | ✓ SATISFIED | Card.tsx:22 dark variant reworked; other 4 already semantic (static audit) |
| DARK-06 | 01-04 | All 11 views + 16 product components no token gaps | ✓ SATISFIED | Static grep sweep across `src/components/product/` returns 0 alpha-overlay leaks + only 1 intentional preview literal. 2 view heroes + 4 modal overlays + 3 toast bugs fixed inline. Runtime UAT deferred. |
| DARK-07 | 01-03 | Smooth color transition on theme switch | ✓ SATISFIED | tokens.css:223-227 5-property transition over 200ms cubic-bezier; reduced-motion override at 158-168 preserved |

**Orphaned requirements:** None — all 7 DARK IDs from REQUIREMENTS.md are claimed by plans and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `UIPrototypeTab.tsx` | 91 | `themeColors.dark.bg = 'from-slate-950 to-slate-900'` literal | ℹ️ Info | Intentional — user-selectable dark theme for the *displayed prototype sandbox* (preview of what the user is designing), not app chrome. Documented in `deferred-items.md` as P2 "leave as-is". |
| `UIPrototypeTab.tsx` | 83-106 | All `themeColors.*` entries use literal slate-X gradients | ℹ️ Info | Same intentional preview block (4 theme presets for sandbox). Out of dark-mode scope by design. |
| `UIPrototypeTab.tsx` | 149, 158, 181 | `bg-slate-800/80 text-slate-300` hero-inset literals | ⚠️ Warning (P2) | Readable in both modes (slate-800/900 is dark inset on tinted gradient). Aesthetic inconsistency only — deferred per `deferred-items.md`. |
| `AIRequirementsTab.tsx` | 164, 181, 198 | `bg-slate-800/90 text-slate-100` version pill, scenario buttons, prompt textarea | ⚠️ Warning (P2) | Same pattern. Deferred. |
| `CompetitorAnalysisTab.tsx` | 116 | `bg-slate-900/80 text-slate-200` prompt input | ⚠️ Warning (P2) | Same pattern. Deferred. |
| `TestManagementTab.tsx` | 146, 151, 156, 161 | `bg-slate-900/80` metric cards | ⚠️ Warning (P2) | Same pattern. Deferred. |
| `CodeManagementTab.tsx` | 182, 188, 192, 202, 212, 221 | `bg-slate-950` code viewer | ℹ️ Info | Intentional VS Code-style dark code editor aesthetic. Future `CodeBlock` component should own its tokens. Deferred. |
| `CONVENTIONS.md` (`.planning/codebase/`) | "Styling" section | Stale note claiming Card dark variant uses literal slate gradients | ℹ️ Info | Doc-only — no longer true after 01-04. Deferred (doc edit). |

No blocker or warning anti-patterns affecting goal achievement. All P0/P1 issues were fixed inline; remaining P2 items are documented in `deferred-items.md` for a future polish milestone.

### Human Verification Required

The following items are deferred to user UAT per `--auto` mode (manual checkpoints in plans 01-02 Task 3 and 01-04 Task 3 were auto-approved; static/code-level audit was performed instead, but runtime visual verification cannot be replaced by static checks).

### 1. Visual dark-mode audit across 47 components (D-09)

**Test:** Run `npm run dev`, navigate to http://localhost:3000, toggle dark mode via Header Sun/Moon button or Settings → 外观主题 → 深色. Click through every Card variant in every view + every product sub-component.
**Expected:** All surfaces render with correct contrast. Accent-tinted hero gradient visible against `--bg-app` (not a black hole). Per-tab accent identity preserved (amber for CompetitorAnalysis, teal for TestManagement, blue→indigo for ProductSkills). Toast text readable. Modal overlays provide correct scrim opacity.
**Why human:** Static grep sweep confirms zero literal slate-950 / zero alpha-overlay leaks, but contrast perception and "correct" visual weight need eyeballing.

**Highest-risk areas to eyeball:**
1. The 11 hero panels across ProductManagement / RndCenter / 9 product sub-tabs (accent-tinted gradient must be visible)
2. Toast notifications in AIRequirementsTab / ProductKnowledgeTab / UIPrototypeTab (text-on-bg readability after the `bg-bg-primary text-text-primary` swap)
3. Modal overlays in ProductKnowledge / ProductSkills / FullDeliverables / ProductDocs (`bg-bg-overlay` scrim opacity)
4. Settings SegmentedControl toggle (200ms color transition feel)

### 2. Settings three-way SegmentedControl runtime behavior (DARK-01)

**Test:** Settings → 外观主题. Click 浅色, 深色, 系统 in sequence.
**Expected:** App theme changes immediately with 200ms color transition. Selecting 系统 follows OS theme.
**Why human:** Wiring verified; click feel + transition smoothness needs runtime observation.

### 3. Header quick-toggle cycle behavior (DARK-02)

**Test:** Click Header theme icon repeatedly. Then check Settings → 外观主题.
**Expected:** Cycle is light↔dark only (never System). Icon shows Sun when currently dark (click → light), Moon when currently light (click → dark). Settings selection updates to match Header action.
**Why human:** Wiring verified (toggle logic + Sun/Moon swap); runtime sync + cycle behavior needs human click test.

### 4. Linux GNOME/KDE live theme-follow (DARK-04)

**Test:** On Linux VM with GNOME 42+, run `npm run tauri:dev`. Set theme to 系统. From terminal: `gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'`. Wait ≤2s. Then `'prefer-light'`. Then manually pick 浅色 in Settings → verify GTK listener does NOT override.
**Expected:** App follows gsettings within 2s. Manual override wins.
**Why human:** Cannot run Linux runtime verification from this Windows environment. Static verification confirms Rust command signature + JS polling branch + manual-override early-return; runtime behavior on real Linux GNOME is the only way to close the loop.

### 5. Theme-switch transition smoothness (DARK-07)

**Test:** Toggle theme via Header. Toggle OS reduced-motion preference (Windows: Settings → Accessibility → Visual effects → Animation effects OFF).
**Expected:** Theme switch animates 200ms cubic-bezier with no layout shift / no flash. With reduced-motion ON, transition is instant.
**Why human:** CSS rule exact-match verified; animation feel + flash-free behavior needs runtime observation.

### Gaps Summary

**No gaps found.** All 5 success criteria from ROADMAP.md are statically verified TRUE in the codebase. All 7 requirements (DARK-01 through DARK-07) are satisfied with concrete code evidence. All 4 SUMMARYs report Self-Check PASSED and were spot-checked against actual file contents.

The verification lands as `human_needed` rather than `passed` because Phase 1's nature is heavily visual (dark-mode contrast across 47 components) and platform-specific (Linux GTK runtime). The `--auto` mode auto-approved the two human-verify checkpoints in plans 01-02 (Task 3) and 01-04 (Task 3), delegating the actual eyeballing to this verifier's `human_verification` list. All static checks that CAN be done programmatically passed cleanly:

- 11/11 commits present in git log (273fa5e, b5ada20, fd6cc08, dd3450f, 53bc864, 795b054, 7b0ae33, 5124ca6 + 3 doc commits)
- All 8 required artifacts exist with claimed substantive content
- All 8 key links wired (imports + usage verified)
- Literal sweep across `src/components/product/` returns 1 match (intentional preview literal, documented)
- Alpha-overlay sweep returns 0 matches
- CSS rule exact-match (200ms, cubic-bezier, 5-property list)
- Tauri command signature correct with dual cfg gate
- Card dark variant swap landed at exact line 22

**P2 backlog** (slate literals in hero insets + code editor surfaces + stale CONVENTIONS.md note) is documented in `.planning/phases/01-dark-mode-wiring/deferred-items.md` for a future polish milestone. None block goal achievement.

---

_Verified: 2026-08-08_
_Verifier: Claude (gsd-verifier)_
