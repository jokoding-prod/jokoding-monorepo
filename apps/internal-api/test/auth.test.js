import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, skipReason } from './helpers.js';
import { createApp } from '../src/app.js';
import { requireUser, requireAdmin } from '../src/auth.js';
import { hashPassword } from '../src/password.js';

const config = { corsOrigin: 'https://x.test', cookieDomain: null, secureCookies: false };

async function setup() {
  const db = await freshDb();
  const app = createApp({ pool: db.pool, config });
  app.get('/test/admin-only', requireUser, requireAdmin, (c) => c.json({ ok: true }));
  const mk = async (username, role, active = true) =>
    db.pool.query(
      `insert into users(name,username,password_hash,role,active) values($1,$2,$3,$4,$5) returning id`,
      [username.toUpperCase(), username, await hashPassword('pw-' + username), role, active],
    );
  await mk('admin1', 'admin');
  await mk('member1', 'member');
  await mk('gone', 'member', false);
  return { ...db, app, mk };
}

const login = (app, username, password, ip = '1.1.1.1') =>
  app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ username, password }),
  });

const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

test('login success sets HttpOnly SameSite=Lax jki_session cookie', { skip: skipReason }, async () => {
  const { app, cleanup } = await setup();
  try {
    const res = await login(app, 'admin1', 'pw-admin1');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(await res.json()).sort(), ['id', 'name', 'role', 'username']);
    const sc = res.headers.get('set-cookie');
    assert.match(sc, /^jki_session=[A-Za-z0-9_-]{43}/);
    assert.match(sc, /HttpOnly/i);
    assert.match(sc, /SameSite=Lax/i);
    assert.match(sc, /Max-Age=2592000/i);
    assert.doesNotMatch(sc, /Secure/i);
    const me = await app.request('/api/auth/me', { headers: { cookie: cookieOf(res) } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).username, 'admin1');
  } finally {
    await cleanup();
  }
});

test('prod cookie flags: Secure + Domain', { skip: skipReason }, async () => {
  const db = await freshDb();
  try {
    const app = createApp({
      pool: db.pool,
      config: { ...config, cookieDomain: '.internal.jokoding.id', secureCookies: true },
    });
    await db.pool.query(`insert into users(name,username,password_hash,role) values('A','a',$1,'admin')`, [
      await hashPassword('p'),
    ]);
    const sc = (await login(app, 'a', 'p')).headers.get('set-cookie');
    assert.match(sc, /Secure/i);
    assert.match(sc, /Domain=\.?internal\.jokoding\.id/i);
  } finally {
    await db.cleanup();
  }
});

test('wrong password and unknown user -> 401 same message', { skip: skipReason }, async () => {
  const { app, cleanup } = await setup();
  try {
    for (const [u, p] of [['admin1', 'nope'], ['ghost', 'nope'], ['gone', 'pw-gone']]) {
      const res = await login(app, u, p);
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: 'Username atau password salah' });
      assert.equal(res.headers.get('set-cookie'), null);
    }
  } finally {
    await cleanup();
  }
});

test('me without cookie / bogus cookie -> 401', { skip: skipReason }, async () => {
  const { app, cleanup } = await setup();
  try {
    let res = await app.request('/api/auth/me');
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'unauthorized' });
    res = await app.request('/api/auth/me', { headers: { cookie: 'jki_session=bogus' } });
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});

test('deactivated user with valid cookie -> 401', { skip: skipReason }, async () => {
  const { app, pool, cleanup } = await setup();
  try {
    const cookie = cookieOf(await login(app, 'member1', 'pw-member1'));
    assert.equal((await app.request('/api/auth/me', { headers: { cookie } })).status, 200);
    await pool.query(`update users set active=false where username='member1'`);
    assert.equal((await app.request('/api/auth/me', { headers: { cookie } })).status, 401);
  } finally {
    await cleanup();
  }
});

test('expired session -> 401', { skip: skipReason }, async () => {
  const { app, pool, cleanup } = await setup();
  try {
    const cookie = cookieOf(await login(app, 'member1', 'pw-member1'));
    await pool.query(`update sessions set expires_at = now() - interval '1 minute'`);
    assert.equal((await app.request('/api/auth/me', { headers: { cookie } })).status, 401);
  } finally {
    await cleanup();
  }
});

test('logout deletes session -> 204, cookie then useless', { skip: skipReason }, async () => {
  const { app, pool, cleanup } = await setup();
  try {
    const cookie = cookieOf(await login(app, 'member1', 'pw-member1'));
    const res = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } });
    assert.equal(res.status, 204);
    assert.equal((await pool.query('select 1 from sessions')).rowCount, 0);
    assert.equal((await app.request('/api/auth/me', { headers: { cookie } })).status, 401);
  } finally {
    await cleanup();
  }
});

test('11th bad login for same username+IP -> 429; other IP unaffected; success path unaffected', { skip: skipReason }, async () => {
  const { app, cleanup } = await setup();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await login(app, 'admin1', 'bad')).status, 401);
    assert.equal((await login(app, 'admin1', 'bad')).status, 429);
    assert.equal((await login(app, 'admin1', 'pw-admin1')).status, 429);
    assert.equal((await login(app, 'admin1', 'pw-admin1', '2.2.2.2')).status, 200);
  } finally {
    await cleanup();
  }
});

test('rate limiter state is per app instance', { skip: skipReason }, async () => {
  const { app, pool, cleanup } = await setup();
  try {
    for (let i = 0; i < 10; i++) await login(app, 'admin1', 'bad');
    assert.equal((await login(app, 'admin1', 'bad')).status, 429);
    const app2 = createApp({ pool, config });
    assert.equal((await login(app2, 'admin1', 'bad')).status, 401);
  } finally {
    await cleanup();
  }
});

test('requireAdmin: member 403, admin 200, anonymous 401', { skip: skipReason }, async () => {
  const { app, cleanup } = await setup();
  try {
    const m = cookieOf(await login(app, 'member1', 'pw-member1'));
    const a = cookieOf(await login(app, 'admin1', 'pw-admin1'));
    let res = await app.request('/test/admin-only', { headers: { cookie: m } });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'forbidden' });
    assert.equal((await app.request('/test/admin-only', { headers: { cookie: a } })).status, 200);
    assert.equal((await app.request('/test/admin-only')).status, 401);
  } finally {
    await cleanup();
  }
});
