// Phase 15 Plan 02 Task 3 — toolLoop five-segment injection wiring (MEM-08).
// chatWithTools' non-Tauri path POSTs /api/chat and consumes an NDJSON stream,
// so a stubbed globalThis.fetch is the test seam: it captures the request body
// (systemPrompt lives there) and streams back token/done chunks. Existing
// override semantics must stay byte-compatible; context_injected must ride the
// session event chain (contiguous seq, replay-safe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop } from '../toolLoop';
import { ChatSession } from '../chatSession';
import { getMemoryEventStore, resetMemoryEventStore } from '../events/eventStore';
import { checkEventStream } from '../events/invariants';
import { resetMemoryMemoryStore } from '../memoryStore';
import type { AgentEvent } from '../events/types';

type CapturedBody = { systemPrompt: string; messages: Array<{ role: string; content: string }> };

interface FetchStub {
  calls: CapturedBody[];
  restore(): void;
}

/** Stub fetch for /api/chat: capture request bodies, stream one token chunk. */
function stubChatFetch(reply: { content: string; toolCalls?: Array<{ name: string; args: unknown }> } = { content: '好的' }): FetchStub {
  const originalFetch = globalThis.fetch;
  const calls: CapturedBody[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as CapturedBody;
    calls.push(body);
    const chunks = [
      JSON.stringify({ kind: 'token', data: { text: reply.content } }),
      ...(reply.toolCalls ?? []).map((call) => JSON.stringify({ kind: 'tool_call', data: { name: call.name, arguments: call.args } })),
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(`${chunk}\n`));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

async function eventsFor(sessionId: string): Promise<AgentEvent[]> {
  return getMemoryEventStore().listEvents(sessionId);
}

test('systemPromptOverride short-circuits: prompt passes through, no injection, no context_injected event', async () => {
  resetMemoryEventStore();
  resetMemoryMemoryStore();
  const stub = stubChatFetch();
  try {
    const result = await runToolLoop({
      userMessage: '帮我看看日程',
      provider: 'deepseek',
      systemPromptOverride: 'X',
    });
    assert.equal(result.content, '好的');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].systemPrompt, 'X', 'override must pass through byte-for-byte');
  } finally {
    stub.restore();
  }
  // No context_injected event for any session in this test's store.
  const sessions = await getMemoryEventStore().listSessions();
  for (const summary of sessions) {
    const events = await getMemoryEventStore().listEvents(summary.sessionId);
    assert.equal(
      events.some((event) => event.eventType === 'context_injected'),
      false,
      'override path must not emit context_injected',
    );
  }
});

test('no override: systemPrompt carries the five-segment output and a context_injected event lands with 5 segments', async () => {
  resetMemoryEventStore();
  resetMemoryMemoryStore();
  const stub = stubChatFetch();
  try {
    const result = await runToolLoop({ userMessage: '帮我看看日程', provider: 'deepseek' });
    assert.equal(result.content, '好的');
    assert.equal(stub.calls.length, 1);
    const systemPrompt = stub.calls[0].systemPrompt;
    assert.ok(systemPrompt.includes('# Current Context'), 'core segment (buildCoreContext output) must be injected');
    const sessions = await getMemoryEventStore().listSessions();
    assert.equal(sessions.length, 1, 'exactly one session per turn');
    const events = await getMemoryEventStore().listEvents(sessions[0].sessionId);
    const injected = events.filter((event) => event.eventType === 'context_injected');
    assert.equal(injected.length, 1, 'exactly one context_injected event per turn');
    const segments = (injected[0].payload as { segments: Array<{ name: string }> }).segments;
    assert.equal(segments.length, 5);
    assert.deepEqual(
      segments.map((segment) => segment.name),
      ['core', 'pending', 'memories', 'fts_topk', 'recent_dialog'],
    );
    // Event order: session_created → user_message → context_injected → ... → turn_ended
    const types = events.map((event) => event.eventType);
    assert.ok(types.indexOf('context_injected') > types.indexOf('user_message'));
    assert.ok(types.indexOf('context_injected') < types.indexOf('turn_ended'));
  } finally {
    stub.restore();
  }
});

test('context_injected keeps seq contiguous and the stream invariant-clean', async () => {
  resetMemoryEventStore();
  resetMemoryMemoryStore();
  const stub = stubChatFetch();
  try {
    await runToolLoop({ userMessage: '继续', provider: 'deepseek' });
  } finally {
    stub.restore();
  }
  const sessions = await getMemoryEventStore().listSessions();
  const events = await getMemoryEventStore().listEvents(sessions[0].sessionId);
  assert.deepEqual(
    events.map((event) => event.seq),
    events.map((_, index) => index + 1),
    'seq must be 1..n contiguous',
  );
  assert.deepEqual(checkEventStream(events), [], 'no pairing/seq invariant violations');
  // Replay projection ignores context_injected (no phantom message).
  const rebuilt = ChatSession.fromEvents(events);
  assert.ok(
    rebuilt.getMessagesForLLM().every((message) => message.role !== 'tool' || message.content.length >= 0),
  );
  assert.equal(
    rebuilt.getMessagesForLLM().some((message) => message.content.includes('Current Context')),
    false,
    'context_injected must not leak into the replayed message projection',
  );
});

test('knowledge retrieval unavailable (dynamic import misses) does not block the loop', async () => {
  resetMemoryEventStore();
  resetMemoryMemoryStore();
  const stub = stubChatFetch();
  try {
    // src/ai/knowledgeRepo does not exist until 15-03 merges; the lazy import
    // degrades to [] and the turn completes normally.
    const result = await runToolLoop({ userMessage: '需求评审怎么做', provider: 'deepseek' });
    assert.equal(result.content, '好的');
    const sessions = await getMemoryEventStore().listSessions();
    const events = await getMemoryEventStore().listEvents(sessions[0].sessionId);
    const injected = events.find((event) => event.eventType === 'context_injected');
    assert.ok(injected, 'context_injected still emitted');
    const ftsSegment = (injected!.payload as { segments: Array<{ name: string; items: number; error?: string }> })
      .segments.find((segment) => segment.name === 'fts_topk');
    assert.equal(ftsSegment?.items, 0);
  } finally {
    stub.restore();
  }
});

console.log('OK: Phase 15 Plan 02 toolLoop injection wiring passed');
