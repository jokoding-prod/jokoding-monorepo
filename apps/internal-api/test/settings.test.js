import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, skipReason, login, cookieOf } from './helpers.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/password.js';

const config = { corsOrigin: 'https://x.test', cookieDomain: null, secureCookies: false };

async function setup() {
  const db = await freshDb();
  const app = createApp({ pool: db.pool, config });
  const ids = {};
  const cookies = {};
  const hash = await hashPassword('password');
  for (const [u, role] of [['admin1', 'admin'], ['ma', 'member']]) {
    const { rows } = await db.pool.query(
      `insert into users(name,username,password_hash,role) values($1,$2,$3,$4) returning id`,
      [u.toUpperCase(), u, hash, role],
    );
    ids[u] = rows[0].id;
    cookies[u] = cookieOf(await login(app, u, 'password', `10.0.0.${rows[0].id}`));
  }
  const call = (who, method, path, body) =>
    app.request(path, {
      method,
      headers: { cookie: cookies[who], ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { ...db, app, ids, cookies, call };
}

const t = (name, fn) =>
  test(name, { skip: skipReason }, async () => {
    const s = await setup();
    try {
      await fn(s);
    } finally {
      await s.cleanup();
    }
  });

const bank = { bankName: 'BCA', accountNumber: '111', accountHolder: 'Joko' };

t('member gets 403 on all settings endpoints', async ({ call, ids }) => {
  for (const [m, p, b] of [
    ['GET', '/api/users'],
    ['POST', '/api/users', { username: 'newbie', name: 'N', password: 'password' }],
    ['PATCH', `/api/users/${ids.admin1}`, { active: false }],
    ['PATCH', `/api/users/${ids.ma}`, { password: 'password9' }],
    ['GET', '/api/banks'],
    ['PUT', '/api/banks/1', bank],
  ]) {
    assert.equal((await call('ma', m, p, b)).status, 403, `${m} ${p}`);
  }
  assert.equal((await call('ma', 'GET', '/api/users/assignable')).status, 200);
});

t('admin lists members and creates a member; duplicate is 409', async ({ call }) => {
  let res = await call('admin1', 'POST', '/api/users', { username: 'budi', name: ' Budi ', password: 'password1' });
  assert.equal(res.status, 201);
  const u = await res.json();
  assert.deepEqual({ ...u, id: 0 }, { id: 0, username: 'budi', name: 'Budi', role: 'member', active: true });
  res = await call('admin1', 'POST', '/api/users', { username: 'budi', name: 'X', password: 'password1' });
  assert.equal(res.status, 409);
  res = await call('admin1', 'POST', '/api/users', { username: 'Bad Name', name: 'X', password: 'password1' });
  assert.equal(res.status, 400);
  res = await call('admin1', 'POST', '/api/users', { username: 'okname', name: 'X', password: 'short' });
  assert.equal(res.status, 400);
  res = await call('admin1', 'POST', '/api/users', { username: 'boss2', name: 'X', password: 'password1', role: 'admin' });
  assert.equal((await res.json()).role, 'member');
  const list = await (await call('admin1', 'GET', '/api/users')).json();
  assert.deepEqual(list.map((x) => x.username).sort(), ['admin1', 'boss2', 'budi', 'ma']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['active', 'id', 'name', 'role', 'username']);
});

t('deactivate deletes sessions at once; reactivation allowed', async ({ call, ids }) => {
  assert.equal((await call('ma', 'GET', '/api/auth/me')).status, 200);
  let res = await call('admin1', 'PATCH', `/api/users/${ids.ma}`, { active: false });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).active, false);
  assert.equal((await call('ma', 'GET', '/api/auth/me')).status, 401);
  res = await call('admin1', 'PATCH', `/api/users/${ids.ma}`, { active: true });
  assert.equal((await res.json()).active, true);
});

t('admin cannot deactivate self or change role; unknown id 404', async ({ call, ids }) => {
  assert.equal((await call('admin1', 'PATCH', `/api/users/${ids.admin1}`, { active: false })).status, 400);
  assert.equal((await call('admin1', 'PATCH', `/api/users/${ids.ma}`, { role: 'admin' })).status, 400);
  assert.equal((await call('admin1', 'PATCH', '/api/users/99999', { active: false })).status, 404);
  assert.equal((await call('admin1', 'GET', '/api/auth/me')).status, 200);
});

t('reset password works for login and ends old sessions', async ({ app, call, ids }) => {
  assert.equal((await call('admin1', 'PATCH', `/api/users/${ids.ma}`, { password: 'short' })).status, 400);
  const res = await call('admin1', 'PATCH', `/api/users/${ids.ma}`, { password: 'newpassword', name: 'Ma Baru' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, 'Ma Baru');
  assert.equal((await call('ma', 'GET', '/api/auth/me')).status, 401);
  assert.equal((await login(app, 'ma', 'password', '9.9.9.9')).status, 401);
  assert.equal((await login(app, 'ma', 'newpassword', '9.9.9.9')).status, 200);
});

t('bank upsert by slot; default is exclusive; invalid slot 400', async ({ call }) => {
  let res = await call('admin1', 'PUT', '/api/banks/1', { ...bank, isDefault: true });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { slot: 1, ...bank, isDefault: true });
  await call('admin1', 'PUT', '/api/banks/2', { bankName: 'BNI', accountNumber: '222', accountHolder: 'Joko' });
  await call('admin1', 'PUT', '/api/banks/1', { ...bank, accountNumber: '999' });
  let list = await (await call('admin1', 'GET', '/api/banks')).json();
  assert.deepEqual(list.map((b) => [b.slot, b.accountNumber, b.isDefault]), [
    [1, '999', true],
    [2, '222', false],
  ]);
  await call('admin1', 'PUT', '/api/banks/2', { bankName: 'BNI', accountNumber: '222', accountHolder: 'Joko', isDefault: true });
  list = await (await call('admin1', 'GET', '/api/banks')).json();
  assert.deepEqual(list.map((b) => b.isDefault), [false, true]);
  assert.equal((await call('admin1', 'PUT', '/api/banks/3', bank)).status, 400);
  assert.equal((await call('admin1', 'PUT', '/api/banks/x', bank)).status, 400);
  assert.equal((await call('admin1', 'PUT', '/api/banks/1', { ...bank, bankName: ' ' })).status, 400);
});
