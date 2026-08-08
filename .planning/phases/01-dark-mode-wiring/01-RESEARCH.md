# Phase 1: Dark Mode Wiring - Research

**Researched:** 2026-08-08
**Domain:** Wiring existing `useTheme()` + `.dark` token set into UI + Linux GTK detection shim
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `SegmentedControl` (existing in `src/components/ui/SegmentedControl.tsx`) for Light / Dark / System three-way toggle in SettingsView. Not Radix Select, not RadioGroup.
- **D-02:** Single icon button in Header (Phosphor `Sun` / `Moon`, `weight="duotone"`, size 16). Click cycles light↔dark. System accessible only via Settings, NOT via the Header cycle (prevents "click and nothing happens").
- **D-03:** Linux GTK detection layered fallback: (1) `gsettings get org.gnome.desktop.interface color-scheme` primary, (2) `GTK_THEME` env var (contains `-dark` suffix = dark), (3) `prefers-color-scheme` last resort.
- **D-04:** Manual override ALWAYS wins over detection. GTK listener must not overwrite an explicit user choice.
- **D-05:** On Linux: detect at startup + poll every 2 seconds. (Marked `# ponytail: 2s polling on Linux; dconf notify is better but harder to wire — switch if perf or battery bites`.)
- **D-06:** Color transition on `html` / `body` / all elements: `background-color 200ms cubic-bezier(0.4, 0, 0.2, 1), color 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)`. (200ms matches `--duration-normal`.)
- **D-07:** No fade-out + fade-in on theme switch — only color transitions (Apple HIG reference).
- **D-08:** `prefers-reduced-motion` detection only in this phase. Explicit motion on/off toggle deferred.
- **D-09:** Manual dark palette audit on 20 UI primitives + 11 views + 16 product components = 47 components.
- **D-10:** Card `dark` variant (currently `from-slate-950 via-indigo-950/90` literals) gets re-evaluated. Likely switches to accent-tinted gradient.
- **D-11:** Audit findings triaged: P0 (unreadable/invisible) and P1 (WCAG AA fail) MUST fix in phase; P2 (minor hero polish) goes to backlog.

### Claude's Discretion
- SettingsView "外观主题" section layout (title/description/spacing) — match existing SettingsView section style.
- Linux platform detection implementation detail (Tauri command vs Node child_process) — see §2, recommendation: tiny Rust command.
- Polling implementation detail (setInterval vs requestIdleCallback) — `setInterval` is simplest.
- P0/P1 bug fix approach (token vs component) — decided per-bug during audit.

### Deferred Ideas (OUT OF SCOPE)
- Explicit motion on/off user toggle (only `prefers-reduced-motion` in this phase).
- Header right-click / long-press menu with System option (cycle only this phase).
- Time-based auto-switching (day = light, night = dark).
- Multiple theme presets (Solarized, Dracula, etc.).
- Per-view theme override.
- Storybook / Percy / automated visual regression.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DARK-01 | User can switch theme Light / Dark / System in Settings | §1 — `SegmentedControl` exists, `useTheme().setTheme` exists, SettingsView has `appearance` nav slot. Wiring only. |
| DARK-02 | Header quick-toggle button | §1, §5 — Phosphor `Sun`/`Moon` confirmed available; `useTheme().toggle()` already does the right cycle (light↔dark, skips System). Header has the action button row. |
| DARK-03 | System mode follows OS theme changes live | §3 — Existing `useTheme()` already wires `matchMedia('(prefers-color-scheme: dark)')` listener; works on macOS/Windows. |
| DARK-04 | Linux GTK detection shim (avoid Tauri#9427) | §2 — Recommended: tiny Rust `get_gnome_color_scheme` Tauri command (no new npm dep, no shell-scope config). Polling 2s via `setInterval`. |
| DARK-05 | All Card variants visually correct in dark | §6 — Card `dark` variant needs accent-tinted gradient rework (concrete classes provided). Other 4 variants use semantic tokens already. |
| DARK-06 | All 11 views + 16 product components have no token gaps in dark | §7 — 143 occurrences of literal palette tokens across 26 files; many are fine (`text-white` on accent buttons), some need audit. Manual checklist provided. |
| DARK-07 | Smooth color transition on theme switch, no flicker | §3 — CSS `transition` on `*` selector targeting only `background-color` / `color` / `border-color` (NOT `all`) avoids layout-shift properties. Reduced-motion override already in `tokens.css`. |
</phase_requirements>

## Summary

The dark mode foundation is **already complete** — `useTheme()` (58 lines) manages Light/Dark/System with localStorage persistence and `prefers-color-scheme` listener; `tokens.css` `.dark` block (40 lines) defines a complete dark palette; `SegmentedControl` and Phosphor `Sun`/`Moon` icons are installed. The work is **wiring + audit + one shim**, not building.

Three concrete deliverables:
1. **UI wiring** — Replace SettingsView's `Switch` placeholder with `SegmentedControl`, add a Header icon button calling `useTheme().toggle()`. Both are <50 line edits.
2. **Linux GTK detection shim** — Tauri#9427 means `prefers-color-scheme` is broken on Linux/WebKitGTK. Add a tiny Rust command `get_gnome_color_scheme()` returning the gsettings value, poll it on Linux every 2s. Manual override always wins.
3. **Dark palette audit** — Manual screenshot pass on 47 components. 143 occurrences of literal palette tokens across 26 source files (most are `text-white` on accent buttons which is correct in both modes). P0/P1 fixes mandatory; P2 to backlog.

**Primary recommendation:** Wire the two UI entry points first (smallest change), add the CSS transition (one rule in tokens.css), then implement Linux detection (small Rust command + JS branch in useTheme), then run the audit. The audit will surface the bulk of P0/P1 work — budget the most time there.

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.0.1 | UI runtime | Project standard |
| `@phosphor-icons/react` | 2.1.10 | `Sun`, `Moon`, `Desktop` icons | Project standard; verified `dist/csr/Sun.d.ts` + `Moon.d.ts` exist |
| `motion/react` | 12.23.24 | Spring animation for SegmentedControl indicator | Already used project-wide |
| Zustand | 5.0.14 | State (theme uses localStorage directly, not a store — keep it that way) | Project standard |
| Tailwind v4 | 4.1.14 | `@theme` directive bridges tokens to utilities | Project standard |
| Radix primitives | various | Underlying Switch / Select / Tabs | Already used |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/api` | 2.11.1 | `invoke()` for calling Rust commands | Linux GTK detection via custom Rust command |
| `tauri` (Rust) | 2.x | Define `get_gnome_color_scheme` command | Linux only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Rust command for gsettings | `@tauri-apps/plugin-shell` JS API + shell scope | Rust command is **fewer moving parts**: no npm install, no `tauri.conf.json` shell scope config, no capability file changes. Shell plugin would require: `npm install @tauri-apps/plugin-shell`, scope entry `gsettings` in capabilities, then `Command.create('gsettings', [...]).execute()`. Rust command = 1 file edit + capability entry. **Use Rust command.** |
| Polling 2s | `dconf notify` via Tauri event | Ponytail: 2s polling is simpler; `dconf notify` requires a long-running Rust task + event channel. Mark the simplification. |
| Single Header icon button | Three-button SegmentedControl in Header | CONTEXT.md D-02 locks the single icon button. Header space is tight. |
| `setInterval` polling | `requestIdleCallback` | `setInterval` is simpler and 2s cadence is cheap; `requestIdleCallback` throttles unpredictably. |

**Installation:** None. All dependencies already in `package.json` and `Cargo.toml`.

**Version verification:** Not required — no new packages introduced.

## Architecture Patterns

### Recommended Code Touchpoints

```
src/
├── hooks/
│   └── useTheme.ts             # EXTEND: add Linux GTK detection branch (keep API stable)
├── styles/
│   └── tokens.css              # EXTEND: add `*` color transition rule (3 properties, NOT `all`)
├── views/
│   └── SettingsView.tsx        # EDIT: replace Switch placeholder with SegmentedControl for "外观主题" section
├── components/
│   ├── layout/
│   │   └── Header.tsx          # EDIT: add theme icon button next to existing actions
│   └── ui/
│       └── Card.tsx            # EDIT: rework `dark` variant gradient from literals to accent-tinted
└── lib/
    └── platform.ts             # NEW (optional): extract `isTauri()` + `detectPlatform()` from TitleBar.tsx

src-tauri/
└── src/
    ├── lib.rs                  # EDIT: register `get_gnome_color_scheme` command + add `linux` cfg branch
    └── commands/               # NEW dir (optional): if extracting commands to a module
        └── theme.rs            # NEW (optional): `get_gnome_color_scheme` impl
```

### Pattern 1: Theme Hook Extension (keep API stable)

**What:** Add Linux branch to `useTheme()` without changing its public surface.
**When to use:** Always — the hook's `{ theme, resolved, setTheme, toggle }` API is the contract.

```typescript
// src/hooks/useTheme.ts (extended)
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'nova-theme';

// Existing helpers (getSystemTheme, getResolvedTheme, applyTheme) unchanged.

function isLinux(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /linux/i.test(navigator.platform) || /linux/i.test(navigator.userAgent);
}

async function detectGtkTheme(): Promise<'light' | 'dark' | null> {
  // Only call from Tauri context — falls through to prefers-color-scheme on web/dev.
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const raw = await invoke<string | null>('get_gnome_color_scheme');
      // Rust returns "'prefer-dark'" (single-quoted GVariant) or null if not Linux / gsettings missing.
      if (raw?.includes('dark')) return 'dark';
      if (raw?.includes('light')) return 'light';
    } catch {
      // gsettings not present (KDE, etc.) — fall through to env / prefers-color-scheme.
    }
  }
  // Fallback: GTK_THEME env (set on Linux for legacy GTK apps).
  const gtkTheme = (typeof process !== 'undefined' && process?.env?.GTK_THEME) || '';
  if (gtkTheme.includes('-dark') || gtkTheme.includes(':dark')) return 'dark';
  return null; // null = caller falls back to prefers-color-scheme.
}

export function useTheme() {
  // ... existing state + applyTheme effect ...

  // Existing matchMedia listener stays (works on macOS/Windows).
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // NEW: Linux GTK detection — only when theme === 'system'.
  // ponytail: 2s polling; dconf notify is better but harder to wire — switch if perf or battery bites.
  useEffect(() => {
    if (theme !== 'system' || !isLinux()) return;
    let cancelled = false;
    const check = async () => {
      const gtk = await detectGtkTheme();
      if (!cancelled && gtk) applyTheme(gtk);
    };
    check(); // run once on mount
    const id = setInterval(check, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [theme]);

  // ... existing setTheme / toggle / return unchanged ...
}
```

**Key points:**
- API unchanged — `useTheme()` still returns `{ theme, resolved, setTheme, toggle }`.
- Linux branch only activates when `theme === 'system'`. If user picks light/dark explicitly, this effect early-returns (D-04: manual override wins).
- `matchMedia` listener stays — on macOS/Windows it's the source of truth, on Linux it's the last resort.
- `invoke()` is a no-op when `isTauri()` is false (web dev mode), so this branch does nothing in `npm run dev`.

### Pattern 2: Rust Command (Linux only)

**What:** One Tauri command that runs `gsettings` and returns the raw string (or null).
**When to use:** Always on Linux; gated by `cfg(target_os = "linux")`.

```rust
// src-tauri/src/lib.rs (extend run())
use tauri::Manager;

#[cfg(target_os = "linux")]
#[tauri::command]
fn get_gnome_color_scheme() -> Option<String> {
    use std::process::Command;
    let out = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
        .ok()?;
    if !out.status.success() { return None; }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn get_gnome_color_scheme() -> Option<String> { None }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_gnome_color_scheme])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(1024, 680)));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Why a Rust command over the JS shell plugin:**
- `@tauri-apps/plugin-shell` is **not in `package.json`** (only `@tauri-apps/api` and `@tauri-apps/cli`). Installing it + configuring shell scope in capabilities is more moving parts than a 6-line Rust command.
- `Command::new("gsettings")` from Rust is stdlib `std::process::Command` — zero new dependencies on the Rust side.
- The `cfg(target_os = "linux")` gate means the command compiles to `None` on Windows/macOS, eliminating any platform-specific runtime branching in JS.
- No capability file changes needed beyond what `invoke_handler` already requires (Tauri commands are auto-allowed for the main window by default under `core:default`).

### Pattern 3: CSS Color Transition

**What:** One CSS rule in `tokens.css` that makes every color change animate over 200ms.
**When to use:** Always — applies to the whole app.

```css
/* src/styles/tokens.css — add at the BOTTOM of the file, after the Base Styles section. */

/* === Theme Switch Transitions === */
/* Apply only to color-related properties to avoid layout-shift on height/width/etc. */
/* The existing `prefers-reduced-motion` block (lines 158-168) overrides this to 0.01ms. */
* {
  transition-property: background-color, color, border-color, fill, stroke;
  transition-duration: 200ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Key points:**
- **NOT `transition: all 200ms`** — that would also animate `width`, `height`, `top`, `left`, causing layout shift on every UI state change. Restrict to `background-color, color, border-color, fill, stroke`.
- The existing `@media (prefers-reduced-motion: reduce)` block in `tokens.css` (lines 158-168) already overrides `transition-duration` to `0.01ms !important`, satisfying D-08 with zero additional code.
- 200ms matches the `--duration-normal` token (250ms is `--duration-normal`; CONTEXT.md says 200ms — use the CONTEXT value). Note: this is a deliberate departure from the `--duration-normal` literal to match the Apple HIG reference.

### Anti-Patterns to Avoid
- **Adding `transition: all` anywhere** — causes layout shift on hover/click state changes.
- **Skipping the `cancelled` flag in async polling** — React strict mode + unmount can fire `applyTheme` after cleanup.
- **Calling `applyTheme` from `setTheme`'s body AND from the resolved effect** — double DOM write. The existing hook already has this pattern (line 49 + the effect on line 33-35); keep it, it's idempotent.
- **Putting the `transition` rule on `html` / `body` only** — the `.dark` class is on `document.documentElement`, but the visible colors are on child elements. Apply to `*` so all children transition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme state machine (3-mode) | — | Existing `useTheme()` | Already implemented, localStorage, matchMedia listener. Don't rewrite. |
| Sliding segmented control indicator | Custom motion div | `SegmentedControl` (existing) | Already has `layoutId="segmented-indicator"` spring animation matching project motion conventions. |
| System theme detection (macOS/Windows) | — | `matchMedia('(prefers-color-scheme: dark)')` | Already in `useTheme()`. Works on macOS/Windows. |
| Cycle semantics (light↔dark, no System) | — | `useTheme().toggle()` (line 52-55) | Already implements `next = resolved === 'dark' ? 'light' : 'dark'`. No System in cycle. |
| Color transition CSS | JS-driven color animation | CSS `transition` rule | CSS is free, GPU-accelerated, declarative. JS animation here is slop. |
| `prefers-reduced-motion` override | JS detection + class swap | Existing `tokens.css` block (lines 158-168) | Already globals `transition-duration: 0.01ms !important`. |
| Tauri shell scope config | `@tauri-apps/plugin-shell` + capability scope | Custom Rust `#[tauri::command]` + `std::process::Command` | Avoids new npm dep + scope config + capability file. 6-line Rust command wins. |

**Key insight:** Every primitive needed for this phase already exists in the codebase. The phase is wiring + audit + one tiny Rust shim, not building.

## Runtime State Inventory

> Phase involves UI wiring of an existing system — no rename/migration. Light scan for runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage['nova-theme']` key (existing) | None — `useTheme()` already reads/writes this key. Key name unchanged. |
| Live service config | None — Express server has no theme concept | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

**Nothing found in OS-registered / secrets / build-artifacts categories** — verified by grepping the codebase for theme persistence (only `localStorage.setItem('nova-theme', ...)` in `useTheme.ts` line 48) and confirming `server.ts` has no theme code.

## Common Pitfalls

### Pitfall 1: Linux `prefers-color-scheme` is broken on Tauri (Tauri#9427)
**What goes wrong:** On Linux, `window.matchMedia('(prefers-color-scheme: dark)').matches` always returns `false`, and the `change` event never fires. "System" mode silently stays on whatever the app started in.
**Why it happens:** WebKitGTK (which Tauri's wry uses) has incomplete `prefers-color-scheme` support (WebKit bug #196685). Confirmed open in tauri#9427 + wry#884 as of research date.
**How to avoid:** §2 Pattern 2 — Rust `get_gnome_color_scheme` command + 2s polling on Linux when `theme === 'system'`.
**Warning signs:** Linux tester reports "theme never changes when I switch system theme" / `matchMedia('(prefers-color-scheme: dark)').matches === false` always in devtools.

### Pitfall 2: Manual override gets overwritten by GTK listener
**What goes wrong:** User picks "Dark" in Settings. 2s later, the GTK polling effect fires and resets the theme back to whatever gsettings says.
**Why it happens:** Both effects (matchMedia listener + GTK polling) run unconditionally.
**How to avoid:** Both Linux GTK effect and matchMedia listener early-return when `theme !== 'system'`. Already enforced in Pattern 1 above — `if (theme !== 'system' || !isLinux()) return;`.
**Warning signs:** User reports "I picked Dark but it switched back to Light after a few seconds."

### Pitfall 3: CSS `transition: all` causes layout shift on theme switch
**What goes wrong:** Every element animates `width`/`height`/`top`/`left` in addition to colors. The page jiggles violently on theme switch.
**Why it happens:** Lazy `* { transition: all 200ms; }` rule.
**How to avoid:** Restrict `transition-property` to `background-color, color, border-color, fill, stroke` only. See §3 Pattern 3.
**Warning signs:** Theme switch visibly repositions elements, not just recolors.

### Pitfall 4: Card `dark` variant vanishes against dark background
**What goes wrong:** The hero "dark" Card variant uses `from-slate-950 via-indigo-950/90` — a near-black gradient. Against the dark mode `--bg-app: 220 16% 8%` (also near-black), the Card loses all visual separation.
**Why it happens:** "Dark" variant was named for its appearance in light mode (a high-contrast hero panel). In dark mode it has no contrast against the surrounding dark surface.
**How to avoid:** §6 — Switch to accent-tinted gradient: `from-accent/20 via-accent-hover/10 to-bg-tertiary` or similar. The variant is a hero panel; it should remain visually distinct in both modes.
**Warning signs:** RndCenterView / ProductManagementView hero panels look like a black hole in dark mode.

### Pitfall 5: `text-white` on accent buttons looks correct but `text-white/60` overlays vanish
**What goes wrong:** Many hero panels use `text-white/60`, `text-white/40`, `bg-white/10` overlays on dark gradients. These alpha overlays work on the literal slate-950 gradient but become invisible on lighter accent-tinted gradients in dark mode.
**Why it happens:** Alpha-over-literal-dark was tuned for one background; changing the gradient breaks the alpha assumption.
**How to avoid:** Audit every `text-white/<alpha>` and `bg-white/<alpha>` overlay against the new Card `dark` variant gradient. May need to swap to `text-text-primary/<alpha>` or absolute `text-white` per case.
**Warning signs:** RndCenter stat labels (`text-white/40`, `text-white/60`) unreadable after Card dark variant rework.

### Pitfall 6: `useTheme` hook called from multiple places desynchronizes state
**What goes wrong:** Header calls `useTheme().toggle()`, SettingsView calls `useTheme().setTheme()`. Each hook instance has its own `useState`, so the two UI surfaces show different "current" themes.
**Why it happens:** `useTheme` is a custom hook, not a singleton store. Each call creates independent state.
**How to avoid:** Two options:
  - **(A) Lift to Zustand store** (preferred for consistency): Create `themeStore` via `create<ThemeStore>(...)`. All consumers subscribe to one source of truth. About 30 lines, follows project's Zustand convention.
  - **(B) Lift to React context** + provider in App.tsx: Fewer moving parts but breaks the Zustand convention.
  - **(C) Keep `useTheme` as a hook but have it subscribe to a module-level event emitter**: Hacky.
  - **Recommendation:** Migrate `useTheme` internals into a `themeStore` (Zustand) — keeps the project's state-management story consistent. The `useTheme()` hook can stay as a thin wrapper that reads the store. This is a deliberate Ponytail simplification: 30 lines of store + 5-line hook, vs. context provider + tree re-renders.
**Warning signs:** Header icon shows `Sun` while Settings says "Dark" (or vice versa) after one toggle.

### Pitfall 7: `setInterval` polling survives unmount
**What goes wrong:** Component unmounts but the 2s interval keeps firing `applyTheme`, leaking memory and writing to the DOM after the component is gone.
**Why it happens:** `setInterval` not cleared in useEffect cleanup.
**How to avoid:** Pattern 1 already has `return () => { cancelled = true; clearInterval(id); };` — keep this. The `cancelled` flag also guards the async `applyTheme` call inside.
**Warning signs:** React warnings about state updates on unmounted components.

### Pitfall 8: GVariant string parsing fragility
**What goes wrong:** `gsettings get` returns `'prefer-dark'` (with single quotes). Naive `=== 'dark'` comparison fails.
**Why it happens:** GVariant format wraps strings in single quotes; the value is `'prefer-dark'` not `prefer-dark`.
**How to avoid:** Use `.includes('dark')` / `.includes('light')` instead of strict equality. See Pattern 1 `detectGtkTheme`. Robust against quote variants and unknown future values.
**Warning signs:** Linux dark mode detection always returns light.

## Code Examples

### Example 1: SettingsView "外观主题" section replacement
```tsx
// src/views/SettingsView.tsx — replace the existing Switch placeholder (around line 99-103)
// with SegmentedControl when activeSection === 'appearance'
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { useTheme } from '@/src/hooks/useTheme';
import { Sun, Moon, Desktop } from '@phosphor-icons/react';

// Inside the SettingsView render, conditionally render an "appearance" section:
const { theme, setTheme } = useTheme();

// Replace the existing "深色模式" Switch block with:
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm font-medium text-text-primary">外观主题</p>
    <p className="text-xs text-text-tertiary">选择浅色、深色或跟随系统</p>
  </div>
  <SegmentedControl
    value={theme}
    onChange={(id) => setTheme(id as 'light' | 'dark' | 'system')}
    segments={[
      { id: 'light', label: '浅色', icon: <Sun size={14} weight="duotone" /> },
      { id: 'dark', label: '深色', icon: <Moon size={14} weight="duotone" /> },
      { id: 'system', label: '系统', icon: <Desktop size={14} weight="duotone" /> },
    ]}
  />
</div>
```

**Note:** The existing SettingsView renders one big "账号信息" content panel regardless of `activeSection`. The Planner should consider either:
- (Lazy) Replacing the existing Switch (line 99-103) inline with SegmentedControl + conditionally swapping the section header to "外观主题" when `activeSection === 'appearance'`.
- (Slightly more work) Adding a separate `<AppearanceSection />` component rendered when `activeSection === 'appearance'`, parallel to the account section.

Either works. The lazy path (replace Switch inline + swap header) is fewer lines.

### Example 2: Header quick-toggle button
```tsx
// src/components/layout/Header.tsx — add inside the actions row (right side)
import { useTheme } from '@/src/hooks/useTheme';
import { Sun, Moon } from '@phosphor-icons/react';
import { Button } from '@/src/components/ui/Button';

// Inside Header component:
const { resolved, toggle } = useTheme();

// Place between the existing 搜索 button and the Bell button:
<Button
  variant="ghost"
  size="sm"
  onClick={toggle}
  aria-label={resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
>
  {resolved === 'dark'
    ? <Sun size={16} weight="duotone" />
    : <Moon size={16} weight="duotone" />}
</Button>
```

**Note:** `useTheme().toggle()` already cycles light↔dark (no System in cycle) — no logic change needed in the hook. Just wire the click handler.

### Example 3: Card `dark` variant rework (D-10)
```tsx
// src/components/ui/Card.tsx — replace line 22 (the `dark` variant entry)
const variantStyles: Record<Variant, string> = {
  default:    'bg-bg-primary border border-border-subtle shadow-shadow-sm',
  elevated:   'bg-bg-primary border border-border-subtle shadow-shadow-md',
  glass:      'glass border border-white/20 shadow-shadow-glass',
  interactive:'bg-bg-primary border border-border-subtle shadow-shadow-sm hover:shadow-shadow-md hover:border-border transition-all duration-normal cursor-pointer',
  // OLD: 'bg-gradient-to-r from-slate-950 via-indigo-950/90 to-slate-900 text-white border border-indigo-500/20 shadow-shadow-lg',
  // NEW: Accent-tinted gradient — stays visible against dark --bg-app, retains "hero" feel in both modes.
  dark: 'bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary border border-accent/20 shadow-shadow-lg',
};
```

**Trade-off note:** Consumers of `<Card variant="dark">` (RndCenterView banner ~line 88, ProductManagementView banner ~line 157, plus product sub-component heroes) used `text-white`, `text-white/40`, `text-white/60`, `bg-white/10` overlays assuming the literal slate-950 background. With the new accent-tinted gradient, these become:
- `text-white` → still readable (gradient is mid-tone, white text works) — OR swap to `text-text-primary` for token purity.
- `text-white/60`, `text-white/40` → likely too faint on the lighter gradient. Audit + swap to `text-text-secondary` / `text-text-tertiary`.
- `bg-white/10` borders → may need `border-white/10` → `border-border-subtle` swap.

This is the bulk of the audit work for the Card `dark` variant consumers.

## §1 Component Inventory

### Already in place (zero work)
| Component | Status | Notes |
|-----------|--------|-------|
| `useTheme()` hook | ✓ Complete | Light/Dark/System, localStorage, matchMedia listener. Cycle already correct. |
| `.dark` token set in `tokens.css` | ✓ Complete | 40 lines (116-156). Full dark palette. |
| `SegmentedControl` | ✓ Complete | Has `layoutId` spring indicator. Direct use in SettingsView. |
| Phosphor `Sun` / `Moon` / `Desktop` | ✓ Available | Verified `dist/csr/Sun.d.ts` + `Moon.d.ts` exist. `Desktop` already aliased in `src/lib/icons.ts` line 85. |
| `prefers-reduced-motion` CSS override | ✓ Complete | `tokens.css` lines 158-168 — globals `transition-duration: 0.01ms !important`. |
| `isTauri()` detection | ✓ Inline in `TitleBar.tsx` line 7-11 | Pattern: `'__TAURI_INTERNALS__' in window`. |

### Needs creation / edit
| Component | Action | Effort |
|-----------|--------|--------|
| SettingsView appearance section | Replace Switch placeholder with SegmentedControl bound to `useTheme()` | ~20 lines |
| Header theme icon button | Add Button (ghost, sm) calling `useTheme().toggle()`, swap Sun/Moon icon based on resolved | ~15 lines |
| `useTheme()` Linux branch | Add `isLinux()` + GTK polling effect (Pattern 1) | ~30 lines |
| `get_gnome_color_scheme` Rust command | Add to `src-tauri/src/lib.rs` with `cfg(target_os = "linux")` gate (Pattern 2) | ~10 lines |
| CSS color transition | Add `* { transition-property: ... }` rule to bottom of `tokens.css` | ~6 lines |
| Card `dark` variant rework | Edit `variantStyles.dark` line 22 of `Card.tsx` (Pattern 3) | 1 line change |
| Dark palette audit (47 components) | Manual screenshot pass + P0/P1 fixes | Bulk of the work |

### Missing pieces to flag
| Gap | Action |
|-----|--------|
| No Zustand `themeStore` | `useTheme()` works as a hook but multiple call sites can desync (Pitfall 6). Recommend migrating to a `themeStore` (~30 lines) or accept the limitation if Header + Settings are the only two call sites. **Recommended:** lift to `themeStore`. |
| No central `isTauri()` util | Pattern duplicated in `TitleBar.tsx`. Optional: extract to `src/lib/platform.ts`. **Ponytail:** skip unless a third caller appears. |

## §2 Linux GTK Detection Strategy

### The truth (Tauri#9427 / wry#884 / WebKit bug #196685)
- `window.matchMedia('(prefers-color-scheme: dark)').matches` always returns `false` on Linux Tauri.
- The `change` event never fires when user toggles GNOME/KDE theme.
- macOS/Windows work as expected — no shim needed there.

### Implementation (Ponytail: simplest path)
**Rust side** (Pattern 2 above, ~10 lines in `src-tauri/src/lib.rs`):
- New `#[tauri::command] fn get_gnome_color_scheme() -> Option<String>`.
- `cfg(target_os = "linux")` variant uses `std::process::Command::new("gsettings").args(["get", "org.gnome.desktop.interface", "color-scheme"]).output()`.
- Returns `Some("'prefer-dark'")` / `Some("'default'")` / `Some("'prefer-light'")` / `None` (gsettings missing or not Linux).
- Register via `.invoke_handler(tauri::generate_handler![get_gnome_color_scheme])`.

**JS side** (Pattern 1 above, ~30 lines added to `useTheme.ts`):
- New `isLinux()` checks `navigator.platform` / `navigator.userAgent`.
- New `detectGtkTheme()` async — calls `invoke('get_gnome_color_scheme')`, parses with `.includes('dark')` / `.includes('light')` (robust to GVariant quoting), falls back to `GTK_THEME` env (`-dark` suffix → dark).
- New `useEffect` activates only when `theme === 'system' && isLinux()`. Runs once on mount + every 2s via `setInterval`. Cleanup cancels + clears interval.

### gsettings output format (verified)
```bash
$ gsettings get org.gnome.desktop.interface color-scheme
'prefer-dark'      # when user picked dark
'default'          # no preference
'prefer-light'     # when user picked light
```
Single-quoted GVariant string. Parse with `.includes()` not `===`. Key introduced in GNOME 42 (`gsettings-desktop-schemas`). Not present on KDE Plasma classic, XFCE, etc. — those fall through to `GTK_THEME` env or `prefers-color-scheme`.

### Why NOT `@tauri-apps/plugin-shell` JS API
- Package not currently in `package.json` (verified).
- Adding it requires: `npm install @tauri-apps/plugin-shell` + shell scope config in `capabilities/default.json` (`gsettings` allowlist with arg validation) + frontend import.
- Rust command path: zero npm changes, zero capability file changes (Tauri commands under `core:default` are auto-allowed), 10 Rust lines.
- **Decision: Rust command.** Mark as Ponytail simplification.

## §3 Color Transition Implementation

### Where to add
`src/styles/tokens.css` — at the bottom, after the existing Base Styles section (after line 217).

```css
/* === Theme Switch Color Transitions === */
/* Restrict to color props — `all` would animate width/height/top/left and cause layout shift. */
/* `prefers-reduced-motion` block above (lines 158-168) overrides to 0.01ms. */
* {
  transition-property: background-color, color, border-color, fill, stroke;
  transition-duration: 200ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Why this location
- `tokens.css` is imported by `index.css` line 10 (`@import './styles/tokens.css';`) before the Tailwind import. The transition rule cascades through all elements.
- Putting it in `tokens.css` (not `index.css`) keeps all "design system fundamentals" in one file.

### Why these properties
- `background-color, color, border-color` — the three properties the `.dark` token swap actually changes.
- `fill, stroke` — Phosphor icons use `currentColor` by default, but SVGs with explicit `fill`/`stroke` need these to transition with the rest.
- **Excluded:** `width, height, top, left, transform, opacity, box-shadow, margin, padding` — animating any of these causes layout shift, jank, or unintended hover-state transitions on adjacent rules.

### Reduced-motion override
The existing `@media (prefers-reduced-motion: reduce)` block (lines 158-168) already global-resets `transition-duration: 0.01ms !important` — no additional code needed for D-08.

## §4 Audit Methodology (47 components)

### The checklist
Print or keep open during the audit. One row per component. Mark P0/P1/P2 or ✓.

#### 20 UI primitives
| # | Component | File | Variants to test | Result |
|---|-----------|------|------------------|--------|
| 1 | Card | `components/ui/Card.tsx` | default, elevated, glass, interactive, **dark** | |
| 2 | Button | `components/ui/Button.tsx` | primary, secondary, ghost, danger, link | |
| 3 | Badge | `components/ui/Badge.tsx` | default, accent, success, warning, danger, neutral | |
| 4 | Dialog | `components/ui/Dialog.tsx` | default | |
| 5 | Input | `components/ui/Input.tsx` | default, error, with icon | |
| 6 | Textarea | `components/ui/Input.tsx` | default | |
| 7 | Select | `components/ui/Select.tsx` | trigger, content, item | |
| 8 | Tabs | `components/ui/Tabs.tsx` | list, trigger, content | |
| 9 | Switch | `components/ui/Switch.tsx` | on, off | |
| 10 | Checkbox | `components/ui/Checkbox.tsx` | checked, unchecked | |
| 11 | Tooltip | `components/ui/Tooltip.tsx` | default | |
| 12 | Popover | `components/ui/Popover.tsx` | default | |
| 13 | Toast | `components/ui/Toast.tsx` | success, error, warning, info | |
| 14 | Avatar | `components/ui/Avatar.tsx` | default, with image, fallback | |
| 15 | DropdownMenu | `components/ui/DropdownMenu.tsx` | trigger, content, item | |
| 16 | ProgressBar | `components/ui/ProgressBar.tsx` | default | |
| 17 | SegmentedControl | `components/ui/SegmentedControl.tsx` | segments, active | |
| 18 | Separator | `components/ui/Separator.tsx` | default | |
| 19 | Skeleton | `components/ui/Skeleton.tsx` | text, rect, card | |
| 20 | ScrollArea | `components/ui/ScrollArea.tsx` | default, scrollbar | |

#### 11 views
| # | View | File | Key states to test |
|---|------|------|--------------------|
| 21 | AgentWorkspace | `views/AgentWorkspaceView.tsx` | chat bubbles, sidebar |
| 22 | TaskManagement | `views/TaskManagementView.tsx` | kanban columns, cards |
| 23 | ProductManagement | `views/ProductManagementView.tsx` | banner (Card dark), tabs |
| 24 | RndCenter | `views/RndCenterView.tsx` | hero banner (Card dark), tab nav |
| 25 | Schedule | `views/ScheduleView.tsx` | calendar cells, today marker |
| 26 | FileArchive | `views/FileArchiveView.tsx` | file rows, type icons |
| 27 | KnowledgeBase | `views/KnowledgeBaseView.tsx` | article cards |
| 28 | Settings | `views/SettingsView.tsx` | new theme SegmentedControl + all sections |
| 29 | Placeholder | (if routed) | minimal case |
| 30 | ProjectOverview | (if routed) | |
| 31 | SmartAnalysis | (if routed) | |

#### 16 product sub-components (in `src/components/product/`)
| # | Component | Notes |
|---|-----------|-------|
| 32-47 | ProductOverviewTab, ProductDocumentsTab, ProductSkillsTab, ProductMilestonesTab, ProductGovernanceTab, ProductAnalyticsTab, AIRequirementsTab, FullDeliverablesTab, UIPrototypeTab, CodeManagementTab, TestManagementTab, ProductKnowledgeTab, CompetitorAnalysisTab, AddDocumentModal, CreateProductModal, etc. | Each has its own Card layouts, banners, tables |

### Audit execution process (per component)
1. `npm run tauri:dev` (or `npm run dev` for web).
2. Toggle theme via the new Header button (or Settings).
3. Watch the transition (should be smooth 200ms, no layout shift).
4. Verify: text readable, borders visible, no white-on-white / black-on-black.
5. If P0/P1: note the file + the offending class. Fix in code. Re-verify.
6. If P2: note in backlog. Move on.

### Known audit hotspots (highest risk first)
Based on the 143 occurrences of literal palette tokens across 26 files (grep result):
1. **Card `dark` variant** — §6 below. P0 risk.
2. **RndCenterView banner** (~line 88) — uses `text-white/40`, `text-white/60`, `bg-white/10` on Card `dark`. P0/P1 risk after Card rework.
3. **ProductManagementView banner** (~line 157) — same pattern. P0/P1 risk.
4. **AIRequirementsTab** — `bg-gradient-to-r from-indigo-600 to-accent` button, lots of `text-white` overlays. P1 risk.
5. **UIPrototypeTab** (18 occurrences), FullDeliverablesTab (16), ProductGovernanceTab (15) — heaviest literal-palette users. Audit all states.
6. **TitleBar** — `hover:bg-[#E81123]` (Windows close button red), and platform-specific text colors. Probably fine (Windows red is universal), verify.
7. **ProjectVisualizer / ProjectTimeline** — `text-white` overlays on gradient backgrounds. Audit each gradient.
8. **ScheduleView** — `day.isToday ? 'bg-accent text-white' : 'text-text-primary'` (line 76). Fine, but verify.

### Acceptable `text-white` cases (no action needed)
- `text-white` on `bg-accent` (Button primary variant) — accent swaps in dark, white-on-accent still readable.
- `text-white` on `bg-danger` (Button danger) — danger swaps, still readable.
- `text-white` on `bg-success` (calendar today marker) — success swaps, still readable.

### Triage rules (D-11)
- **P0 blocker:** text unreadable, border invisible, full black/white screen region. Must fix in phase.
- **P1 must-fix:** contrast < WCAG AA (4.5:1 for body, 3:1 for large text). Must fix in phase.
- **P2 backlog:** minor hue drift, hero panel aesthetic rework, optional polish. Document and defer.

## §5 Card Dark Variant Rework

### Current state (line 22 of `src/components/ui/Card.tsx`)
```tsx
dark: 'bg-gradient-to-r from-slate-950 via-indigo-950/90 to-slate-900 text-white border border-indigo-500/20 shadow-shadow-lg',
```

### Problem in dark mode
- `from-slate-950` is `#020617` (near-black).
- Dark mode `--bg-app: 220 16% 8%` is `hsl(220, 16%, 8%)` ≈ `#111317` (near-black).
- The Card vanishes — no visual separation from the page background.
- `via-indigo-950/90` (`#1e1b4b` at 90% opacity) becomes a barely-perceptible hue shift in the middle.
- `border-indigo-500/20` is faint in dark mode.

### Recommended rework
```tsx
dark: 'bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary border border-accent/20 shadow-shadow-lg',
```

**Why this works in both modes:**
- **Light mode:** `from-accent/20` is a subtle blue tint, `via-accent-hover/10` lighter, `to-bg-tertiary` blends to the warm-gray surface. Accent-tinted hero panel — retains the "premium" feel.
- **Dark mode:** `--accent: 211 100% 55%` (brighter blue in dark), at 20% opacity over the dark surface, gives a glowing hero panel. `to-bg-tertiary` (`220 12% 16%`) is visibly lighter than `--bg-app` (`220 16% 8%`), restoring visual separation.

**Trade-off:** Loses the literal "midnight indigo" aesthetic of the original. CONTEXT.md D-10 explicitly anticipated this — "切换到 accent 偏色而不是更深". The accent-tinted gradient is the recommended direction.

### Alternative (more conservative)
```tsx
dark: 'bg-gradient-to-r from-bg-tertiary via-bg-secondary to-bg-tertiary text-text-primary border border-accent/20 shadow-shadow-lg',
```
Pure surface tokens, no literal colors. Less visually distinctive as a "hero" panel but zero risk in either mode.

### Downstream consumer fixes needed after Card rework
Components that rendered `<Card variant="dark">` and styled children with `text-white` / `text-white/40` / `bg-white/10`:
- `views/RndCenterView.tsx` (~line 88-200) — hero banner.
- `views/ProductManagementView.tsx` (~line 157-200) — hero banner.
- Possibly others — grep for `variant="dark"` or `variant='dark'` to enumerate.

For each:
- `text-white` → keep OR change to `text-text-primary` (both readable, token-purity prefers the latter).
- `text-white/60`, `text-white/40` → change to `text-text-secondary` / `text-text-tertiary`.
- `bg-white/10`, `border-white/15` → change to `bg-bg-secondary`, `border-border-subtle`.

This is the bulk of the audit work — budget the most time here.

## §6 Manual Override Priority Logic (D-04)

### State machine
```
                  setTheme('light'|'dark')
                            │
                            ▼
              ┌──────────────────────────┐
              │  theme = 'light' | 'dark'│  ◄── MANUAL (pinned)
              │  no GTK polling          │
              │  no matchMedia listener  │
              │  applyTheme(theme)       │
              └──────────────────────────┘

                  setTheme('system')
                            │
                            ▼
              ┌──────────────────────────┐
              │  theme = 'system'        │  ◄── AUTO (follows detection)
              │  macOS/Windows:          │
              │    matchMedia listener   │
              │  Linux:                  │
              │    gsettings polling (2s)│
              │    + matchMedia last resort │
              └──────────────────────────┘
```

### How the existing `useTheme()` + Pattern 1 enforces this
- Both the matchMedia listener effect (existing line 38-44) and the new GTK polling effect (Pattern 1) early-return when `theme !== 'system'`.
- `setTheme('light')` writes `theme = 'light'` to state + localStorage. Both effects tear down their listeners on the next render.
- The detection listeners cannot fire `applyTheme` while a manual choice is active.
- ✅ D-04 satisfied by design.

## §7 Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `useTheme()` desync between Header and Settings call sites | HIGH if hook stays as-is | Medium (UI confusion) | Migrate to `themeStore` (Zustand). ~30 lines. (Pitfall 6) |
| Linux tester reports system mode still broken | MEDIUM (depends on gsettings presence) | High (Linux unusable in system mode) | Test on a GNOME 42+ VM. Fallback chain: gsettings → GTK_THEME → prefers-color-scheme. |
| Card `dark` variant rework breaks hero panel aesthetics | MEDIUM | Medium | Audit every `<Card variant="dark">` consumer. Plan for 2-3 follow-up edits per consumer. |
| `text-white/<alpha>` overlays vanish on new Card gradient | HIGH (likely) | Medium | Grep + audit every consumer of Card `dark` variant. Swap to `text-text-secondary` / `text-text-tertiary`. |
| CSS transition causes jank on low-end hardware | LOW | Low | 200ms is short, color-only properties are GPU-cheap. Reduced-motion override covers accessibility. |
| `setInterval` leaks across unmount | LOW (Pattern 1 has cleanup) | Low | Keep the `cancelled` flag + `clearInterval` in cleanup. Code review check. |
| SettingsView refactor scope creeps | MEDIUM | Low | Ponytail: replace the existing Switch inline, don't refactor the whole view. |
| Header button position collides with existing actions | LOW | Low | Header has a clear `gap-2` action row; icon button fits between Search and Bell. |

## §8 Open Questions

1. **Should `useTheme()` migrate to a Zustand `themeStore`?**
   - What we know: Multiple call sites (Header + Settings, possibly more) will call `useTheme()`. Each hook instance has independent state via `useState`. Toggling in Header won't update the Settings indicator until next render cycle / page reload.
   - Recommendation: **YES**, migrate. ~30 lines. Keeps the project's Zustand convention, single source of truth, no desync risk. The `useTheme()` hook becomes a thin wrapper: `const { theme } = useThemeStore(); ... return { theme, setTheme, toggle };`.
   - **Auto-resolve (--auto mode):** Migrate. The cost is tiny and the alternative (desync bug) is the most common theme-wiring footgun.

2. **Where to place the Rust command?**
   - What we know: `src-tauri/src/lib.rs` currently has all logic inline (the `run()` function only). No `commands/` directory exists.
   - Recommendation: Inline in `lib.rs` for now. Extract to `commands/theme.rs` if more commands appear (Phase 3 will add many). Ponytail: inline.

3. **Should the existing SettingsView "深色模式" Switch stay alongside the new SegmentedControl, or be removed?**
   - Recommendation: Remove. SegmentedControl replaces it. Two controls for the same setting is confusing.

4. **Should we extract `isTauri()` from `TitleBar.tsx` to a shared util?**
   - Recommendation: No. Only two callers (TitleBar + useTheme). Inline the check in `useTheme.ts`. Ponytail: skip until third caller appears.

## §9 Testing Surface

This phase is mostly visual; automated testing is minimal.

| Test Type | What | Command | Effort |
|-----------|------|---------|--------|
| Type-check | All TS edits | `npm run lint` (runs `tsc --noEmit`) | Required, fast |
| Build | Production bundle | `npm run build` | Required once at end |
| Tauri prod build | Native bundle | `npm run tauri:build` (Linux target if available) | Recommended for Linux GTK verification |
| Smoke: theme toggle (web dev) | Manual click cycle in `npm run dev` | Manual | Required per audit row |
| Smoke: theme toggle (Tauri dev) | Manual click cycle in `npm run tauri:dev` | Manual | Required on Linux |
| Smoke: Linux GTK detection | Toggle GNOME dark mode, verify Nova follows | Manual on Linux VM | Required for DARK-04 |
| Smoke: localStorage persistence | Refresh page, theme persists | Manual | Required for DARK-01 |
| Reduced motion | Toggle OS reduced-motion setting, verify transition duration drops to ~0 | Manual | Required for D-08 |

No automated visual regression (Storybook / Percy) — explicitly out of scope per CONTEXT.md deferred list.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `matchMedia('(prefers-color-scheme: dark)')` as sole system detection | Works on macOS/Windows; broken on Linux Tauri | Tauri#9427 (2024), still open | Must add GTK detection shim on Linux |
| CSS `transition: all 200ms` | Restricted `transition-property` list | Always | Layout shift avoided |
| Tailwind v3 `darkMode: 'class'` config | Tailwind v4 `@theme` + custom `.dark` class swap | Tailwind v4 release | No config change needed; `.dark` class on `<html>` is read directly by `tokens.css` |
| Per-component `dark:` variant utilities | Semantic tokens that swap values under `.dark` | Project convention | Most components need zero dark-mode-specific code — the tokens handle it |

**Deprecated/outdated:**
- `matchMedia('(prefers-color-scheme: dark)')` as the sole source on Linux — broken.
- Hardcoded `slate-950` / `indigo-950` literals in Card `dark` variant — being replaced this phase.

## Sources

### Primary (HIGH confidence)
- `src/hooks/useTheme.ts` (read directly) — confirms 58-line implementation, cycle already correct.
- `src/styles/tokens.css` lines 116-156 (read directly) — complete `.dark` token set.
- `src/components/ui/Card.tsx` line 22 (read directly) — current `dark` variant literals.
- `src/components/ui/SegmentedControl.tsx` (read directly) — existing control with `layoutId` indicator.
- `src/views/SettingsView.tsx` line 99-103 (read directly) — Switch placeholder to replace.
- `src/components/layout/Header.tsx` (read directly) — action row layout.
- `src-tauri/Cargo.toml` (read directly) — `tauri-plugin-shell` registered, `tauri 2` crate.
- `src-tauri/capabilities/default.json` (read directly) — `core:default` + window perms + `shell:allow-open`. No SQL/IPC capability changes needed for theme command.
- `node_modules/@phosphor-icons/react/dist/csr/Sun.d.ts` + `Moon.d.ts` + `Desktop.d.ts` (verified) — all three icons exist.
- [GNOME gsettings color-scheme documentation](https://gitlab.gnome.org/GNOME/gsettings-desktop-schemas) — `org.gnome.desktop.interface color-scheme` accepts `'default'` / `'prefer-dark'` / `'prefer-light'`. Single-quoted GVariant format. Introduced in GNOME 42.
- [tauri#9427 — Tauri does not detect system theme preference on Linux](https://github.com/tauri-apps/tauri/issues/9427) — confirms `prefers-color-scheme` is broken.
- [wry#884 — Tauri color scheme detection in Linux](https://github.com/tauri-apps/wry/issues/884) — upstream WebKitGTK root cause.
- [WebKit bug #196685 — prefers-color-scheme in GTK port](https://bugs.webkit.org/show_bug.cgi?id=196685) — root cause.

### Secondary (MEDIUM confidence)
- [Tauri v2 Shell Plugin docs](https://v2.tauri.app/plugin/shell/) — JS API exists via `@tauri-apps/plugin-shell`. **Verified NOT installed** in current `package.json` — this informed the recommendation to use a Rust `std::process::Command` instead.
- [Apple Human Interface Guidelines — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) — color transition (not fade) is the reference for D-07.
- `.planning/research/PITFALLS.md` §1 (read directly) — Linux detection shim strategy confirmed.

### Tertiary (LOW confidence)
- None. All claims verified against project source or primary external docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every component is already in the codebase, verified by reading files.
- Architecture: HIGH — concrete code patterns provided for all 4 touchpoints (hook, Rust command, CSS, Card variant).
- Pitfalls: HIGH — Linux issue tracked in 3 upstream bug trackers; gsettings output format verified through GNOME schema docs.
- Audit methodology: MEDIUM — checklist is concrete but the actual findings depend on running the audit (cannot pre-verify all 47 components).

**Research date:** 2026-08-08
**Valid until:** 2026-09-08 (30 days; dark-mode fundamentals are stable, but Tauri#9427 may close — recheck at Phase 1 kickoff if delayed)
