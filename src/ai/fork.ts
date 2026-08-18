// src/ai/fork.ts
// Phase 20 (v0.3.1 FORK-02) — reference-style session forking, projection-time
// normalization. The child session stores ZERO copied parent events; its own
// agent_events rows start at seq 1. buildForkEventStream concatenates the
// parent prefix (already contiguous 1..cut) with the child's own rows
// (+cut offset) into a normalized 1..N stream, so fromEvents / crash-tail /
// orphan logic downstream stay untouched.
//
// fork_cut_seq stored on the sessions row is in the PARENT's raw seq space and
// is used ONLY as input to buildForkEventStream (Pitfall 6).
import { getEventStore } from './events/eventStore';
import { checkEventStream } from './events/invariants';
import type { AgentEvent } from './events/types';
import { getSessionRepo } from './sessionRepo';

export type ForkInvalidReason = 'MID_TURN' | 'NO_PREFIX_TURN' | 'UNBALANCED';

export interface ForkStreamResult {
  events: AgentEvent[];
  invalid?: ForkInvalidReason;
}

/** The only payload fields in the event vocabulary that store seq numbers
 * (verified against compaction.ts). Two-case remap rule — never a general map:
 * prefix events: identity (parent space == normalized space for seq <= cut);
 * child events: += prefix.length (child space -> normalized space). */
const SEQ_PAYLOAD_FIELDS = ['splitSeq', 'coveredSeqStart', 'coveredSeqEnd'] as const;

/** Build the fork session's effective event stream. Pure. */
export function buildForkEventStream(
  parentEvents: AgentEvent[],
  cutSeq: number,
  childEvents: AgentEvent[],
): ForkStreamResult {
  const prefix = parentEvents.filter((e) => e.seq <= cutSeq);
  // Gate 2 first: the cut point must have at least one complete turn at/before it.
  if (!prefix.some((e) => e.eventType === 'turn_ended')) return { events: [], invalid: 'NO_PREFIX_TURN' };
  // Gate 1: the cut event itself must exist and be a turn_ended boundary.
  const cutEvent = parentEvents.find((e) => e.seq === cutSeq);
  if (!cutEvent || cutEvent.eventType !== 'turn_ended') return { events: [], invalid: 'MID_TURN' };
  // Gate 3: prefix pairing + seq invariants clean (no orphan tool_call enters the child).
  if (checkEventStream(prefix).length > 0) return { events: [], invalid: 'UNBALANCED' };

  // Normalization: prefix keeps 1..cut (parent prefix starts at 1 => identity),
  // child rows shift by +prefix.length.
  const out: AgentEvent[] = prefix.map((e, i) => ({ ...e, payload: { ...e.payload }, seq: i + 1 }));
  const offset = prefix.length;
  childEvents.forEach((e, i) => {
    const payload = { ...e.payload };
    for (const field of SEQ_PAYLOAD_FIELDS) {
      if (typeof payload[field] === 'number') payload[field] = (payload[field] as number) + offset;
    }
    out.push({ ...e, payload, seq: offset + i + 1 });
  });
  return { events: out };
}

/** First turn_ended seq after the target assistant_message seq; null when the
 * assistant message has no completed turn yet (mid-turn). */
export function findForkCutSeq(events: AgentEvent[], assistantSeq: number): number | null {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  for (const event of sorted) {
    if (event.seq > assistantSeq && event.eventType === 'turn_ended') return event.seq;
  }
  return null;
}

/** Fork-aware listEvents: returns the session's own rows when it is not a fork,
 * otherwise recursively resolves the parent chain and merges at projection time.
 * Recursion handles fork-of-fork for free. Degrades to own events (with a loud
 * log) when the stored fork cut is invalid — never throws mid-restore. */
export async function resolveSessionEvents(sessionId: string): Promise<AgentEvent[]> {
  const own = await getEventStore().listEvents(sessionId);
  const meta = await getSessionRepo().getSession(sessionId);
  if (!meta?.parentSessionId || meta.forkCutSeq == null) return own;
  const parent = await resolveSessionEvents(meta.parentSessionId);
  const result = buildForkEventStream(parent, meta.forkCutSeq, own);
  if (result.invalid) {
    console.error(`[fork] invalid cut for session ${sessionId}: ${result.invalid}; falling back to own events`);
    return own;
  }
  return result.events;
}
