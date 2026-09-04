---
phase: 20
slug: fork
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-18
---

# Phase 20 — UI Design Contract

> Visual and interaction contract for hover fork/copy toolbar, fork provenance badge, and copy toast. Surface is small and surgical: one render site (AgentConsole.tsx:136), one badge, one toast. All values inherit the existing tokens.css design system — this contract only locks the NEW deltas.
>
> Autonomous mode: recommendations auto-accepted, rationale noted inline.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (custom token system — shadcn gate N/A, not a shadcn project) |
| Preset | not applicable |
| Component library | Radix primitives (existing `src/components/ui/`) |
| Icon library | @phosphor-icons/react, `weight="duotone"` default |
| Font | Geist / Geist Mono (@fontsource, existing) |

No new dependencies. No new components — only additions inside `AgentConsole.tsx` and existing `useToast`.

---

## Spacing Scale

Project compact scale (unchanged, from CLAUDE.md). New elements this phase:

| Element | Spacing |
|---------|---------|
| Hover toolbar vs card | `mt-1` (4px) below the bubble |
| Icon-button gap | `gap-1` (4px) between 分支 and 复制 buttons |
| Icon-button hit area | `p-1` (4px padding) around 14px icon → 22px target; acceptable for desktop hover-affordance (mouse-only interaction, no touch) |
| Badge padding | `px-2 py-0.5` (matches carry-chip pattern at AgentConsole.tsx:247) |
| Badge gap to console top | `mb-2` (8px) — matches carry row |

Exceptions: none beyond the desktop-hover hit area noted above.

---

## Typography

Unchanged from project base (14px desktop base). New text this phase:

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Badge/tertiary label | 12px (`text-xs`) | 400 | 1.5 | Fork provenance badge, toast description |
| Toast title | 14px (`text-sm`) | 500 (`font-medium`) | 1.5 | Copy success/failure title |

---

## Color

Uses semantic tokens only (no hex in components — project rule).

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg-app` | Console background |
| Secondary (30%) | `--bg-secondary` + `--border-subtle` | Assistant message bubbles (existing) |
| Accent (10%) | `--accent` | Provenance badge icon + text (`text-accent`, `border-accent/20`, `bg-accent-subtle`) — exact same chip recipe as the carry chips |
| Destructive | `--color-danger` | Not used this phase (fork is non-destructive; original session untouched) |

**Icon buttons:** idle `text-text-tertiary`, hover `text-text-primary` (auto-accepted: quiet affordance that doesn't compete with the bubble; matches "hover reveals action" Apple pattern).

Accent reserved for: provenance badge, existing app accent surfaces. The hover toolbar itself is neutral (tertiary→primary), NOT accent — icons are per-message utilities, accent would create 10 accent rows per conversation.

---

## Interaction Contract (NEW this phase)

### 1. Hover toolbar (FORK-01)

- Placement: **below the card** (auto-accepted; rejected inline-trailing — bubbles are `max-w-[88%]` rounded rects, inline icons would break the rounded silhouette and collide with text wrapping).
- Trigger: CSS-only reveal — wrap message row in `group`, toolbar `opacity-0 group-hover:opacity-100 transition-opacity duration-150`. No `motion` component needed (auto-accepted: research Pattern 4; CSS opacity is the lightest correct tool, motion/react adds nothing for a 2-icon reveal).
- Alignment: assistant messages are `justify-start`, toolbar sits left-aligned under the bubble, `mt-1 flex gap-1`.
- Icons: `GitBranch size={14}` and `Copy size={14}`, default duotone weight (project convention), inside `<button>` with `title` + `aria-label`.
- Order: 分支 first, 复制 second (fork is the phase headline action).
- Title text: 分支 = "从这里创建分支"; 复制 = "复制".

### 2. Forkable state (store-only ack messages)

- Non-forkable assistant messages (no backing event): **fork icon not rendered at all** (not disabled-gray — auto-accepted; a permanently-disabled icon on every ack message is visual noise and confuses "why can't I click this"). Copy icon always rendered.
- During `loading` (streaming): fork button `disabled` + `cursor-not-allowed opacity-50` (SESS-04 lock consistency).
- Auto-accepted rationale: hidden vs disabled distinction — hidden = "action doesn't apply to this message"; disabled = "action applies but is temporarily locked".

### 3. Fork click (FORK-02)

- No confirmation dialog — fork is non-destructive and reversible (switch back via session). Immediate `forkFromMessage` → `switchSession(childId)`.
- Failure path: toast (see Copywriting).

### 4. Provenance badge (LIST-03, in-console portion)

- Location: top of the messages list area (first child of the scroll container), above the first message — same visual zone as the carry chips row, `mb-2`.
- Only rendered when current session has `parentSessionId`.
- Visual: pill chip matching carry-chip recipe — `inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent-subtle px-2 py-0.5 text-xs text-accent`, `GitBranch size={12} weight="fill"` leading icon.
- Text: `来自 {parentTitle}` with parentTitle truncated via `max-w-[160px] truncate` (auto-accepted width: fits drawer + page hosts without wrapping; tooltip `title={parentTitle}` for full title). Fallback when parent title null: `来自原会话`.
- Static (no hover motion) — it's an identity label, not an action.

### 5. Copy (FORK-03)

- `navigator.clipboard.writeText(content)`; success → success toast; failure → error toast. Never silent.
- Copy icon has no disabled state (always available for assistant messages).

---

## Copywriting Contract (中文, matching existing console tone)

| Element | Copy |
|---------|------|
| Primary action tooltip | 分支: "从这里创建分支" / 复制: "复制" |
| Empty state | (unchanged, existing: "今天需要处理什么？") |
| Copy success toast | Title: "已复制" / Description: "消息已复制到剪贴板" |
| Copy failure toast | Title: "复制失败" / Description: "无法访问剪贴板，请重试" (type: error) |
| Fork failure toast | Title: "创建分支失败" / Description: specific reason — mid-turn/streaming: "当前回复尚未完成，请稍后再试"; other: "创建分支时出错，原会话未受影响" |
| Fork success | No toast — the `switchSession` jump + provenance badge IS the feedback (auto-accepted: a toast plus a view transition is redundant) |
| Provenance badge | "来自 {parentTitle}" / fallback "来自原会话" |
| Destructive confirmation | None this phase — fork is additive, zero writes to parent session |

Toast duration: default 4s (existing useToast default).

---

## Component Inventory (delta only)

| Item | Source | Notes |
|------|--------|-------|
| `GitBranch` icon | @phosphor-icons/react | size 14 (toolbar), 12 fill (badge) |
| `Copy` icon | @phosphor-icons/react | size 14 |
| Hover toolbar | NEW inline in AgentConsole.tsx | `<div className="mt-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">` — plain `<button>`, not ui/Button (auto-accepted: icon-only ghost affordance; ui/Button has bg/border styles that would over-weight it) |
| Provenance chip | NEW inline in AgentConsole.tsx | carry-chip recipe, non-interactive |
| Toast | existing `useToast` / `bindToast` | no changes |

---

## Motion

- Hover reveal: CSS `transition-opacity duration-150` only. No spring, no y-translate (auto-accepted: a 4px y-shift on reveal makes message rows below jitter as opacity toggles do not affect layout — keeping it opacity-only guarantees zero layout shift).
- No new motion/react usage this phase.

---

## Accessibility

- Both toolbar buttons: `aria-label` ("从这里创建分支" / "复制这条回复") + `title`.
- Reveal is hover-only; keyboard users reach the buttons via Tab (they remain focusable when invisible — acceptable for this surface; note: `group-focus-within:opacity-100` should be added alongside group-hover so keyboard focus also reveals the toolbar — REQUIRED, not optional).
- Badge is text, not icon-only — screen-reader readable.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not applicable — no shadcn, zero new deps |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
