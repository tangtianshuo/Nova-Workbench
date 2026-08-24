// Phase 22 Plan 07 — PERMANENT replay parity, TS side (ENG-03). Do not delete.
//
// 双侧单源: the SAME fixture files under src/ai/__tests__/fixtures/
// (projection-cases*.json + realdb-sample-*.json) are replayed here via
// ChatSession.fromEvents and by the Rust engine
// (src-tauri/src/engine/parity.rs parity_projection_cases). expectedMessages
// is generated from the REAL TS projection — Rust must match it after
// canonical normalization (键序 + 时间戳/ID 白名单).
//
// Convention: 新语义分支 = 在 fixtures/ 加用例(双侧自动纳入)。
// 真实 v0.3.x 存量日志抽样(realdb-sample-*.json)锁定向后兼容回放。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ChatSession } from '../chatSession';
import { buildForkEventStream } from '../fork';
import type { AgentEvent } from '../events/types';

interface ProjectionCase {
  name: string;
  fork: { parentSessionId: string; cutSeq: number } | null;
  budget?: number;
  events: AgentEvent[];
  expectedMessages: Array<{ role: string; content: string }>;
}

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = readdirSync(fixturesDir)
  .filter((f) => /^(projection-cases|realdb-sample).*\.json$/.test(f))
  .sort();
assert.ok(files.length >= 3, `expected projection fixtures, found ${files.join(', ')}`);

let totalCases = 0;
for (const file of files) {
  const cases: ProjectionCase[] = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  for (const fixture of cases) {
    totalCases += 1;
    test(`parity ${file} :: ${fixture.name} (TS projection matches fixture)`, () => {
      let stream = fixture.events;
      if (fixture.fork) {
        const parent = stream.filter((e) => e.sessionId === fixture.fork!.parentSessionId);
        const child = stream.filter((e) => e.sessionId !== fixture.fork!.parentSessionId);
        const built = buildForkEventStream(parent, fixture.fork.cutSeq, child);
        assert.ok(!built.invalid, `fork case invalid: ${built.invalid}`);
        stream = built.events;
      }
      const got = ChatSession.fromEvents(stream, { tokenBudget: fixture.budget })
        .getMessagesForLLM()
        .map((m) => ({ role: m.role, content: m.content }));
      assert.deepEqual(got, fixture.expectedMessages);
    });
  }
}

test('parity fixture corpus shape (>=8 synthetic cases + realdb samples present)', () => {
  const synthetic = JSON.parse(readFileSync(join(fixturesDir, 'projection-cases.json'), 'utf8')) as unknown[];
  assert.ok(synthetic.length >= 8, `expected >=8 synthetic cases, got ${synthetic.length}`);
  assert.ok(files.some((f) => f.startsWith('realdb-sample-')), 'realdb sample fixtures missing');
  assert.ok(totalCases >= synthetic.length + 2);
});
