import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package is ESM and pins the house stack', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.match(pkg.dependencies.next, /^\^16\./);
});
