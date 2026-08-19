import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidFsName } from './fsName.ts';

describe('isValidFsName', () => {
  it('accepts normal names', () => {
    assert.ok(isValidFsName('PRD v3.2.md'));
    assert.ok(isValidFsName('a'));
  });
  it('rejects empty/whitespace/illegal', () => {
    assert.ok(!isValidFsName(''));
    assert.ok(!isValidFsName('  '));
    assert.ok(!isValidFsName('a/b'));
    assert.ok(!isValidFsName('a\\b'));
    assert.ok(!isValidFsName('..x'));
    assert.ok(!isValidFsName('a..b/x'));
    assert.ok(!isValidFsName('a:b'));
    assert.ok(!isValidFsName('a?.md'));
    assert.ok(!isValidFsName('a<b'));
    assert.ok(!isValidFsName('a|b'));
  });
});
