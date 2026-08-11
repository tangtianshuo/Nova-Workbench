import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProvider, PROVIDER_OPTIONS } from '../../components/SettingsApiKeySection';

test('Settings provider contract exposes the five Rust providers in wire order', () => {
  assert.deepEqual(
    PROVIDER_OPTIONS.map((option) => option.id),
    ['deepseek', 'openai', 'anthropic', 'gemini', 'ollama'],
  );
});

test('Settings provider validation rejects unknown command values', () => {
  assert.equal(isProvider('deepseek'), true);
  assert.equal(isProvider('ollama'), true);
  assert.equal(isProvider('unknown'), false);
});
