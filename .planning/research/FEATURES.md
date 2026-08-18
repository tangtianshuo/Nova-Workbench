# Feature Landscape — v0.3.1 多 Session 会话体系

**Domain:** Multi-session chat in a desktop AI agent (Tauri v2 + React 19)
**Researched:** 2026-08-18
**Scope:** ONLY new v0.3.1 features: per-workspace session list, on-demand restore, default-new-session on entry, quick-assistant workspace+session pickers, message-card hover fork/copy, branch badges, clipboard copy. Existing single-conversation runtime, restore-of-latest, pending cards, ⌘K, morning report are dependencies.

## How Comparables Actually Behave (evidence base)

| Product | Relevant behavior | Confidence |
|---------|------------------|------------|
| **Claude Desktop** | Sidebar lists conversations reverse-chronologically with auto-generated titles; title fallback chain: user name → AI title → summary → first prompt (Claude Code docs use exactly this chain). No rename/favorites in Desktop (top community complaint). | HIGH (official docs + GitHub issue) |
| **ChatGPT** | Auto-title appears after first assistant response, silently replaces "New chat"; rename/pin/delete via per-row hover menu; pinned chats leave the recents list. | MEDIUM (training + Reddit comparison) |
| **Cursor chat** | Two fork patterns: (1) edit an earlier user message → implicit branch from that point; (2) message "..." menu → "Duplicate Chat" → copy branches from that message, original intact. Community friction: message-level fork controls low-discoverability; some were removed in newer UIs. | HIGH (official forum/docs) |
| **Raycast AI** | Quick assistant is ephemeral-by-default with a chat list picker in the window header; conversations saved to a "Chats" section with auto-titles; no forking. | MEDIUM (training data, unverified) |
| **Claude Code desktop** | Sessions sidebar: each row = name → AI title → summary → first prompt, plus relative time ("2h ago"). | HIGH (official docs) |

## Table Stakes

Missing any of these makes multi-session feel broken.

| Feature | Why Expected | Complexity | Dependencies (existing Nova) |
|---------|--------------|------------|------------------------------|
| Session list: title + relative time + message count | Every comparable shows title+time; message count is Claude Code's pattern and cheap from event log | Low | sessions metadata table (migration 0007) |
| Reverse-chronological ordering, filtered by current workspace | Table stakes in all comparables; Nova's workspace filter replaces ChatGPT's pinning as the scoping mechanism | Low | workspace_id on events |
| Click-to-restore session (full history projection) | Users expect the restored transcript to be byte-identical to before | Low-Med | ChatSession projection already replay-based (v0.3.0) — this is nearly free |
| Auto-title after first turn, with fallback | Claude/ChatGPT behavior: title silently appears after first exchange. Nova's locked decision: LLM title → fallback to truncated first user message. Fallback chain is the industry norm | Med | llm.rs provider; needs a tiny title prompt |
| Hover "copy message" on assistant cards | Universal (ChatGPT hover toolbar, Cursor, Claude). Web `navigator.clipboard.writeText` — one line | Low | none |
| Fork creates new session and navigates to it | Cursor "Duplicate Chat": after fork, UI jumps to the new branch with original untouched. Nova: reference fork (parent prefix projection, `fork_cut_seq`) — cheaper than Cursor's copy | Med | parent_session_id + fork_cut_seq columns |
| New session on app entry (not auto-resume old) | Locked decision; matches ChatGPT (opens New Chat) vs Claude Desktop (restores last). Nova previously restored-latest; changing to default-new is deliberate | Low | activeWorkspaceId already persisted |
| Branch identity badge in lists | Forked sessions must be visually distinguishable or users can't tell original from branch. Claude Code does this with summary/description; Nova needs a small "分支自 X" badge | Low | parent_session_id join for parent title |
| Lock session switching during streaming | Prevents projecting a different session's events mid-stream; Nova locked this. Comparables hide/disable switching chats mid-generation | Low-Med | tool loop streaming state |

## Differentiators

Not expected by users coming from ChatGPT/Claude, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Reference fork (zero-copy, parent event prefix projection) | O(1) fork vs Cursor's full chat copy; audit trail preserved (append-only log untouched) | Med-High | Nova-specific; replay parity tests must cover fork projection |
| Workspace + session dual dropdown in Ctrl+Shift+K quick assistant | Raycast-like scoping; lets users route a quick question to a specific workspace's context without leaving current view | Med | Workspace Select filters session Select; Ctrl+K stays pure (locked) |
| Pending confirmation cards filtered by session | HITL cards belong to the session that created them — comparables have no analog (they lack HITL) | Low | candidates already persisted with correlation; add session scope |
| Branch-from-any-assistant-message (hover fork icon) | Cursor restricts to edit-or-duplicate; hover-on-any-assistant-card is simpler to discover than Cursor's "..." menu | Med | fork_cut_seq = that message's event seq |

## Anti-Features

Explicitly NOT building (locked out of scope or industry cautionary tales).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Session rename (manual) | Out of scope per PROJECT.md; Claude Desktop's lack of it is a complaint but not a blocker | Good LLM auto-title + first-message fallback |
| Session delete/pin/favorite | Out of scope; ChatGPT's pinning adds list-management surface | Workspace filter is the scoping tool |
| Edit-message-to-fork (Cursor classic pattern) | Requires inline editing of historical turns + ambiguity about what happens to the original turn; higher complexity than hover-fork | Hover fork icon on assistant cards only |
| In-thread branch tree visualization (tree/graph of branches) | No major product does this well; users don't miss it; big UI cost | Linear list + badge pointing at parent title |
| Cross-workspace strict isolation (memory/knowledge) | Locked decision: list-level filtering only; memory stays global | Filter lists by workspace_id |
| Streaming-into-background-session (switch away mid-stream, stream keeps going) | Big runtime complexity (multi-active sessions); comparables serialize generation | Lock switching during streaming |

## Feature Dependencies

```
sessions metadata table (0007) ─→ session list ─→ branch badges ─→ fork navigation
event log workspaceId scope ─→ workspace-filtered list ─→ Ctrl+Shift+K session Select
tool loop streaming lock ─→ session switching
first turn completion ─→ LLM auto-title ─→ (fallback) first-message truncation
assistant message card render ─→ hover fork icon + copy icon
```

## MVP Recommendation

Prioritize (matches locked decisions — this ordering minimizes rework):
1. Sessions data model + runtime activeSessionId (everything depends on it)
2. Session list on Agent page with restore + streaming lock
3. Reference fork + hover actions (fork + copy) + branch badge
4. Ctrl+Shift+K dual dropdowns
5. LLM auto-title last (needs a working multi-session world to title within)

Defer: rename/delete/pin (out of scope), branch tree UI, background streaming.

## Sources

- [Cursor "Fork Chat" forum thread](https://forum.cursor.com/t/fork-chat-support-for-cursor-agents-new-ui/158692) — fork/duplicate-chat behavior
- [Claude Code sessions docs](https://code.claude.com/docs/en/sessions) — title fallback chain, list metadata (HIGH)
- [Claude Desktop rename/favorites issue](https://github.com/anthropics/claude-code/issues/35185) — sidebar auto-titles, missing rename as known gap
- [Claude sidebar vs ChatGPT pinning (Reddit)](https://www.reddit.com/r/ClaudeAI/comments/1ozi79k/claude_sidebar_recent_chats/) — list ordering/pinning comparison
- Raycast AI behavior: MEDIUM confidence (training data only, unverified)
