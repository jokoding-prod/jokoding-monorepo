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

test('verifyPassword returns false (does not throw) when derive fails', async () => {
  // n = 3 is not a power of two, so scrypt rejects it.
  assert.equal(await verifyPassword('x', `scrypt$3$${Buffer.from('salt').toString('base64')}$${Buffer.from('k').toString('base64')}`), false);
});

test('verifyPassword works at N = 2^16 (needs maxmem)', async () => {
  const salt = Buffer.alloc(16, 1);
  const { scryptSync } = await import('node:crypto');
  const key = scryptSync('pw', salt, 64, { N: 1 << 16, maxmem: 128 * (1 << 16) * 8 * 2 });
  assert.equal(await verifyPassword('pw', `scrypt$65536$${salt.toString('base64')}$${key.toString('base64')}`), true);
});
