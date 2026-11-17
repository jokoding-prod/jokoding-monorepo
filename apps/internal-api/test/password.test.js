import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/password.js';

test('hash/verify round trip and format', async () => {
  const h = await hashPassword('rahasia123');
  assert.match(h, /^scrypt\$\d+\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword('rahasia123', h), true);
  assert.equal(await verifyPassword('salah', h), false);
});

test('hashes are salted; malformed stored value is false', async () => {
  assert.notEqual(await hashPassword('x'), await hashPassword('x'));
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.equal(await verifyPassword('x', ''), false);
});
