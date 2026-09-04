// Phase 32 Plan 03 — code_edit projection cases (CP-4 double-sided lock).
// The same projection-cases-code-edit.json replays through the Rust engine
// (parity.rs parity_projection_cases); this file locks the TS-side
// ChatSession.fromEvents projection shape for the coding tools:
//   - code_read/code_grep results project as plain tool messages
//   - code_edit awaiting-confirmation tool_result carries the HITL payload
//   - code_edit_auto_rejected / reject_reason audit events add NO message
//   - stale apply failure surfaces the retry guidance in modelText
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ChatSession } from '../chatSession';

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/projection-cases-code-edit.json'), 'utf8'),
) as Array<{
  name: string;
  events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  expectedMessages: Array<{ role: string; content: string }>;
}>;

function case_(name: string) {
  const c = fixture.find((x) => x.name === name);
  assert.ok(c, `fixture case ${name}`);
  return c;
}

test('code_read/code_grep recon results project as tool messages with modelText verbatim', () => {
  const c = case_('code-recon-read-grep');
  const session = ChatSession.fromEvents(c.events as never, { tokenBudget: 8000 });
  const msgs = session.getMessagesForLLM();
  assert.deepEqual(
    msgs.map((m) => ({ role: m.role, content: m.content })),
    c.expectedMessages,
  );
  const grep = msgs.find((m) => m.content.includes('[tool_result code_grep]'));
  assert.ok(grep, 'code_grep tool message present');
  assert.ok(grep.content.includes('"file":"src.rs"') && grep.content.includes('"line":2'));
});

test('code_edit awaiting-confirmation tool_result projects; auto-reject audit adds no message', () => {
  const c = case_('code-edit-awaits-confirmation-then-cancel-cascade');
  const session = ChatSession.fromEvents(c.events as never, { tokenBudget: 8000 });
  const msgs = session.getMessagesForLLM();
  assert.deepEqual(
    msgs.map((m) => ({ role: m.role, content: m.content })),
    c.expectedMessages,
  );
  // the auto-reject audit event (with reject_reason) contributed zero messages
  assert.ok(msgs.every((m) => !m.content.includes('code_edit_auto_rejected')));
  // raw event still carries the audit payload for the HITL card projection
  const audit = c.events.find((e) => e.eventType === 'code_edit_auto_rejected');
  assert.equal((audit!.payload as { reject_reason?: string }).reject_reason, 'run 已取消');
});

test('stale apply failure keeps the retry guidance (now at line) in modelText', () => {
  const c = case_('code-edit-stale-apply-failure');
  const session = ChatSession.fromEvents(c.events as never, { tokenBudget: 8000 });
  const msgs = session.getMessagesForLLM();
  const stale = msgs.find((m) => m.content.includes('file changed since the edit was proposed'));
  assert.ok(stale, 'stale guidance projected');
  assert.ok(stale.content.includes('now at line 4'));
  assert.ok(stale.content.includes('re-read the file and retry'));
});
