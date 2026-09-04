# Phase 21 — UI Review

**Audited:** 2026-08-19
**Baseline:** 21-UI-SPEC.md
**Screenshots:** not captured (no dev server on :3000)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All contract strings present verbatim; no generic labels |
| 2. Visuals | 4/4 | Active-row tint is sole focal signal; hierarchy per spec |
| 3. Color | 4/4 | Semantic tokens only; accent confined to reserved elements |
| 4. Typography | 4/4 | Only declared roles used (text-sm/500, text-[11px], text-[10px]) |
| 5. Spacing | 4/4 | Existing compact scale reused; no arbitrary values added |
| 6. Experience Design | 3/4 | States well covered; minor a11y gaps on list rows |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **Session rows are not keyboard accessible** — `motion.div` with onClick, no `role="button"`/`tabIndex`/Enter handler (`AgentWorkspaceView.tsx:115-125`) — keyboard users cannot restore sessions from the list — add `role="button" tabIndex={0}` + onKeyDown Enter/Space, or swap to a real `<button>`.
2. **Streaming-disable loses screen-reader signal** — `opacity-50 pointer-events-none` (AgentWorkspaceView.tsx:124) is visual-only — add `aria-disabled={disabledByStreaming}` so AT users perceive the locked state (Selects already use native `disabled`, rows don't).
3. **List refetches on every session switch** — effect deps include `activeSessionId` (`AgentWorkspaceView.tsx:60`), spec keyed on `[activeWorkspaceId, sessionListVersion]` — every switch triggers a redundant repo round-trip; drop `activeSessionId` from deps (active tint is render-derived, doesn't need refetch).

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- Empty list: `还没有对话，在左侧开始第一句吧` (AgentWorkspaceView.tsx:108) — exact contract match.
- Session Select empty: `该工作区暂无会话` disabled item (ChatPanel.tsx:90-92).
- Placeholders `工作区` / `会话` (ChatPanel.tsx:58, 79); CTA `+ 新对话` with Plus icon (ChatPanel.tsx:83-87).
- Fork tooltip `分支自: {parentTitle ?? '未知会话'}` (AgentWorkspaceView.tsx:134) — sensible null fallback not in spec, good defensive copy.
- Untitled fallback `新对话` in both list (L140) and Select (L96) — consistent.
- No generic Submit/OK/Cancel strings introduced.

### Pillar 2: Visuals (4/4)
- Focal point per spec: active row `bg-accent-subtle/50` tint only, no border/icon-swap (AgentWorkspaceView.tsx:123). Click no-op on active row (L120).
- Row layout matches spec skeleton: Clock 12px → time w-16 → GitBranch 12px (conditional, title attr) → truncate title flex-1 → hover Badge (L127-144).
- Time column widened to `w-16 shrink-0` per auto-accepted decision #2.
- Icon-only interactive elements: none new without labels (GitBranch has tooltip).
- Scoped selector row: single row below DrawerHeader, pure mode renders zero DOM via `{chatPanelMode === 'scoped' && <ScopedSelectorRow />}` (ChatPanel.tsx:120) — QUICK-03 satisfied structurally.

### Pillar 3: Color (4/4)
- Accent usage in phase files: GitBranch `text-accent` (AgentWorkspaceView.tsx:136), Plus `text-accent` (ChatPanel.tsx:85) — both on the reserved list.
- Active tint `bg-accent-subtle/50` — the declared reserved use.
- All other color via tokens: `text-text-tertiary`, `text-text-primary`, `hover:bg-bg-secondary`, `border-border-subtle`. Zero hardcoded hex/rgb in the diff.

### Pillar 4: Typography (4/4)
- List title: `text-sm font-medium` (AgentWorkspaceView.tsx:139) — matches declared role.
- Meta time: `text-[11px]` (L128); count badge `text-[10px]` (L142, spec-mandated existing pattern).
- Select triggers use existing h-9 default. No new sizes/weights beyond the two declared roles.

### Pillar 5: Spacing (4/4)
- Selector row `flex gap-2 px-4 py-2 border-b border-border-subtle` (ChatPanel.tsx:47) — exact spec string.
- Rows keep `px-2 py-2 -mx-2` (AgentWorkspaceView.tsx:122); card `p-5`; sidebar `w-[380px]` — all per spec exceptions list. No arbitrary values added.

### Pillar 6: Experience Design (3/4)
- Empty state handled (list + Select both), streaming disable on rows and both Select triggers, silent refresh via `sessionListVersion` in both effect dep arrays, stagger keyed by `session.sessionId` so title swaps don't re-animate — TITLE-02 met.
- `查看全部` correctly hidden when list empty (AgentWorkspaceView.tsx:155), retained as inert placeholder otherwise — per plan.
- `-1` for: rows lack keyboard/ARIA affordances (fixes 1-2 above). No error boundary or toast needed this phase per spec (silent fallback by design).

---

## Files Audited
- src/views/AgentWorkspaceView.tsx
- src/components/ChatPanel.tsx
- src/hooks/useCmdK.ts
- src/stores/uiStore.ts
- src/lib/utils.ts (formatRelativeTime)
