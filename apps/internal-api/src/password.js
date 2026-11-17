import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384;
const KEYLEN = 64;

function derive(plain, salt, n) {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, KEYLEN, { N: n }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await derive(plain, salt, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  if (!Number.isInteger(n) || n < 2 || n > 1 << 20) return false;
  const expected = Buffer.from(parts[3], 'base64');
  const actual = await derive(plain, Buffer.from(parts[2], 'base64'), n);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
