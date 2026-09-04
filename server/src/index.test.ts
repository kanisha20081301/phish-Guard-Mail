import { test } from 'node:test';
import assert from 'node:assert';

test('basic test suite', async (t) => {
  await t.test('should pass', () => {
    assert.strictEqual(1, 1);
  });
});
