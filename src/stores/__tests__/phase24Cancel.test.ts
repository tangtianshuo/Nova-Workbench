// Phase 24 Plan 05 (SCHED-04) — user cancel wiring: cancelRun invokes
// engineCancel (injected mock) with the active runId and resets run state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useChatConsoleStore } from '../chatConsoleStore';
import type { ToolTraceItem } from '../chatConsoleStore';

function seedActiveRun() {
  useChatConsoleStore.setState({
    activeSessionId: 'cancel-s',
    activeRunId: 'run-1',
    loading: true,
    isQueued: true,
    streamingResponse: '部分输出',
    streamingTrace: [{ id: 1, name: 'search', status: 'running' }] as ToolTraceItem[],
  });
}

test('CANCEL: cancelRun invokes engineCancel with activeRunId and resets run state', async () => {
  seedActiveRun();
  const calls: string[] = [];
  await useChatConsoleStore.getState().cancelRun(
    'cancel-s',
    async (runId) => { calls.push(runId); },
  );
  const state = useChatConsoleStore.getState();
  assert.deepEqual(calls, ['run-1']);
  assert.equal(state.activeRunId, null);
  assert.equal(state.loading, false);
  assert.equal(state.isQueued, false);
  assert.equal(state.streamingResponse, '');
  assert.deepEqual(state.streamingTrace, []);
});

test('CANCEL: cancel failure still resets local run state (engine idempotent retry safe)', async () => {
  seedActiveRun();
  await useChatConsoleStore.getState().cancelRun('cancel-s', async () => { throw new Error('ipc down'); });
  const state = useChatConsoleStore.getState();
  assert.equal(state.activeRunId, null);
  assert.equal(state.loading, false);
});

test('CANCEL: no activeRunId -> no-op, cancel never invoked', async () => {
  useChatConsoleStore.setState({ activeSessionId: 'idle-s', activeRunId: null, loading: false });
  let invoked = false;
  await useChatConsoleStore.getState().cancelRun('idle-s', async () => { invoked = true; });
  assert.equal(invoked, false);
});

test('CANCEL: other session id -> no-op (only the active session cancels)', async () => {
  seedActiveRun();
  let invoked = false;
  await useChatConsoleStore.getState().cancelRun('other-s', async () => { invoked = true; });
  assert.equal(invoked, false);
  assert.equal(useChatConsoleStore.getState().activeRunId, 'run-1');
});
