---
phase: 21
slug: session-list
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-18
---

# Phase 21 — UI Design Contract

> Session 列表与快捷入口 + 自动命名。Autonomous mode: all open questions auto-accepted with rationale.
> Design system: existing project tokens (src/styles/tokens.css), no shadcn — project has its own Radix-based `src/components/ui/` primitives. Reuse only; no new primitives.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (project-native token system, locked by CLAUDE.md) |
| Preset | not applicable |
| Component library | Radix via `src/components/ui/` (Select, Badge, Button, SegmentedControl, Drawer) |
| Icon library | @phosphor-icons/react, `weight="duotone"` default |
| Font | Geist (@fontsource), base 14px |

---

## Spacing Scale

Existing project scale (compact desktop). No new values introduced.

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Icon-to-text gap in list items, badge padding |
| sm | 8px | List row gap (`space-y-1` + `py-2`), Select row gap |
| md | 16px | Card content padding supplement (`p-5` existing) |
| lg | 20px | Card padding (existing `p-5`) |
| xl | 24px | Right sidebar gap (`gap-4` existing = 16px; sidebar column width 380px fixed) |

Exceptions: none. Sidebar column stays `w-[380px]`; Card `p-5`; list rows keep `px-2 py-2 -mx-2`.

---

## Typography

Existing compact scale; this phase uses only two roles.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| List item title | 14px (`text-sm`) | 500 (`font-medium`) | 1.4 (default) |
| Meta text (time, message count, fork parent) | 11px (`text-[11px]`) | 400 | 1.4 |
| Select trigger text | 14px (`text-sm`) | 400 | default (h-9 trigger) |

Truncation: single line `truncate` on title and fork-parent title; full title via `title` attribute tooltip only.

---

## Color

All via semantic tokens. No new colors.

| Role | Value | Usage |
|----------|-------|-------|
| Dominant (60%) | `--bg-app` / `--bg-primary` | Page background, Card default |
| Secondary (30%) | `--bg-secondary` | List item hover (`hover:bg-bg-secondary`), Select item focus |
| Accent (10%) | `--accent` / `--bg-accent-subtle` | See reserved list below |
| Destructive | n/a | No destructive actions in this phase |

Accent reserved for:
- Active session indicator in list (2px left bar or `bg-accent-subtle` row tint on the currently-open session — auto-accepted: subtle row tint `bg-accent-subtle/50`, no left bar, matches Apple restraint)
- Fork badge icon color (`text-accent`)
- Select check indicator (existing `text-accent` in SelectItem)

Text: title `text-text-primary`, meta `text-text-tertiary`, disabled rows `opacity-50`.

---

## Interaction Contracts

### 1. 最近任务 list (AgentWorkspaceView, replaces mock at lines 27-33 / 83-101)

**Focal point:** active session row (`bg-accent-subtle/50` tint) is the primary visual anchor; row titles are secondary. Do not add any stronger signal (no icon fill swap, no border) — the tint alone marks "current".

**Row layout** (keep existing motion.div skeleton, extend content):
```
[Clock 12px] [time 11px w-12] [GitBranch 12px + tooltip?] [title truncate flex-1] [N 条 Badge] 
```
- Fork badge: `GitBranch` icon (12px, `text-accent`, duotone) placed immediately before title, with `title="分支自: {parentTitle}"` native tooltip. Parent title NOT rendered inline (auto-accepted: inline parent title doubles row height; tooltip satisfies "可识别其来源会话" from LIST-03 without layout cost). LIST-03 badge itself shipped in Phase 20 — this spec only confirms placement stays.
- Message count Badge: keep existing pattern (`variant="neutral"`, `text-[10px]`, `opacity-0 group-hover:opacity-100`).
- Time column: fixed `w-12` (fits "刚刚" to "59 分钟前"? No — "X 分钟前" exceeds w-12). Auto-accepted: change to `w-16 shrink-0` to fit "59 分钟前"; beyond that formatRelativeTime falls to "X 小时前"/"X 天前"/date, all ≤ 6 chars.
- Click target: entire row (`cursor-pointer` already present). `onClick={() => void switchSession(session.id)}`.
- Hover: `hover:bg-bg-secondary transition-colors` (existing).
- Active session row: `bg-accent-subtle/50`, still hoverable but click is a no-op (already active) — do not disable cursor.
- Stagger animation: keep `delay: idx * 0.04` fade-in, keyed by `session.id` (not idx).
- Max length + scroll: cap at 10 items, no in-card scroll (auto-accepted: card sits in scrollable sidebar; "查看全部" button stays but is a no-op placeholder this phase — keep existing ghost button unchanged).
- Disabled during streaming: rows other than active session get `opacity-50 pointer-events-none` when `isStreaming` (SESS-04 visual parity; store guard is the real enforcement). Active row stays normal.
- Silent refresh: subscribe `sessionListVersion` from chatConsoleStore; on change re-query list. No toast, no animation restart (keyed by id so only changed rows animate).

**Relative time rules (formatRelativeTime, new in src/lib/utils.ts):**
| Age | Display |
|-----|---------|
| < 60s | 刚刚 |
| < 60min | X 分钟前 |
| < 24h | X 小时前 |
| < 7d | X 天前 |
| ≥ 7d | M月D日 |

### 2. Empty state (recent tab, no sessions)

- Single centered line, matching existing "暂无定时任务" pattern: `text-center text-sm text-text-tertiary py-6`
- Copy: `还没有对话，在左侧开始第一句吧`
- "查看全部" footer button hidden when list is empty (auto-accepted: button pointing at nothing is noise).

### 3. ChatPanel scoped mode (QUICK-01/02/03)

- `DrawerHeader` unchanged (title "AI 助手", provider description). Below header, one row:
```
<div className="flex gap-2 px-4 py-2 border-b border-border-subtle">
  <Select workspace />  // flex-1, min-w-0
  <Select session />   // flex-[1.4], min-w-0 (session titles are longer)
</div>
```
- Drawer width 480 stays; effective Select widths ≈ 190px / 266px minus padding. Trigger values truncate (`min-w-0` + inner `truncate` on SelectValue wrapper span).
- No visible labels above Selects (auto-accepted: placeholder text carries the label — workspace Select placeholder `工作区`, session Select placeholder `会话`; drawer header space is scarce).
- Workspace Select: items = workspace names; value = activeWorkspaceId. Change → guarded `setActiveWorkspaceId`.
- Session Select: items filtered by selected workspace, ordered `last_active_at DESC`, item text = `{title} · {relative time}` truncated by Radix. Value = `activeSessionId`.
- First item pinned above a `SelectSeparator`: `+ 新对话` with `Plus` icon → `startNewSession` (auto-accepted: pinned first item over footer button — one affordance, keyboard reachable, matches command-palette convention).
- Session Select empty (workspace has no sessions): single disabled item `该工作区暂无会话`, plus the pinned `+ 新对话`.
- Pure mode (Ctrl+K): zero DOM added — the selector row renders only when `chatPanelMode === 'scoped'`. QUICK-03 verified by DOM absence.
- Streaming: both Select triggers `disabled` while `isStreaming` (existing `disabled:opacity-50 disabled:cursor-not-allowed` styles apply). Guarded store actions are the enforcement; disabled is the affordance.

### 4. Silent title update (TITLE-02)

No dedicated UI. Observable behavior: list row title text swaps in place on next `sessionListVersion` bump; row does not re-mount (stable key), no flash/animation on the title itself. Session Select value label also reflects new title on next render.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (this phase) | `+ 新对话`(Select 首项，开始新 session) |
| Empty state (list) | 还没有对话，在左侧开始第一句吧 |
| Empty state (session Select) | 该工作区暂无会话(disabled item) |
| Select placeholders | `工作区` / `会话` |
| Error state | 无用户可见错误路径：标题生成失败静默回退截断;switchSession 被守卫拒绝时 UI 已因 streaming 禁用，无 toast |
| Destructive actions | none in this phase |
| Fork tooltip | `分支自: {parentTitle}` |

---

## Component Inventory (planner: scope tasks to these)

| Surface | File | Change |
|---------|------|--------|
| Recent list real data | `src/views/AgentWorkspaceView.tsx` | delete mock recentTasks; render sessions from repo; empty state; streaming disable; active-row tint; time col w-16 |
| formatRelativeTime | `src/lib/utils.ts` | new helper per table above |
| Scoped selector row | `src/components/ChatPanel.tsx` | conditional row of two Selects + 新对话 pinned item |
| chatPanelMode | `src/stores/uiStore.ts` | new state `'pure' \| 'scoped'` |
| Shortcut split | `src/hooks/useCmdK.ts` | Ctrl+Shift+K → scoped, Ctrl+K → pure |
| sessionListVersion | `src/stores/chatConsoleStore.ts` | counter + bump on title write |
| Message-count SQL | `src-tauri` sessionRepo | one aggregate SQL, batch (no UI) |

No new ui/ primitives. Icons used: `Clock`, `GitBranch`, `Plus` (all @phosphor-icons/react, duotone).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not applicable — no shadcn, no third-party registries |

---

## Auto-Accepted Decisions (autonomous mode rationale)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Fork parent via tooltip, not inline | Keeps row single-line; LIST-03 wording only requires identifiability |
| 2 | Time column w-12 → w-16 | "59 分钟前" overflows w-12 |
| 3 | 新对话 as pinned first Select item | Single affordance, keyboard nav, no footer button duplication |
| 4 | No visible Select labels; placeholder-as-label | Header vertical space scarce in 480px drawer |
| 5 | List cap 10, no in-card scroll | Sidebar already scrolls; "查看全部" retained as inert placeholder |
| 6 | Active row tint instead of left bar | Quieter, matches token system; hover still distinguishes |
| 7 | Title update = in-place text swap, no animation | TITLE-02 "不打断用户" |
| 8 | Streaming disables via opacity-50 + pointer-events-none on rows, `disabled` on triggers | Matches existing disabled token styles; store guard remains enforcement |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
