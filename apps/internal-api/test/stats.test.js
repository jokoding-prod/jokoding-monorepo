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
  const hash = await hashPassword('pw');
  for (const [u, role] of [['admin1', 'admin'], ['ma', 'member'], ['mb', 'member']]) {
    const { rows } = await db.pool.query(
      `insert into users(name,username,password_hash,role) values($1,$2,$3,$4) returning id`,
      [u.toUpperCase(), u, hash, role],
    );
    ids[u] = rows[0].id;
    cookies[u] = cookieOf(await login(app, u, 'pw', `10.0.0.${rows[0].id}`));
  }
  const call = (who, method, path, body) =>
    app.request(path, {
      method,
      headers: { cookie: cookies[who], ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const json = async (who, method, path, body) => (await call(who, method, path, body)).json();
  const order = async (who, extra = {}) => {
    const res = await call(who, 'POST', '/api/orders', { projectName: 'P', clientName: 'C', receivedAt: '2026-11-01', price: 100000, ...extra });
    assert.equal(res.status, 201);
    return res.json();
  };
  const tx = async (body) => {
    const res = await call('admin1', 'POST', '/api/transactions', { date: '2026-11-10', type: 'expense', category: 'alat', amount: 1000, ...body });
    assert.equal(res.status, 201, await res.clone().text());
    return res.json();
  };
  return { ...db, app, ids, call, json, order, tx };
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

t('empty period returns zeros, including prev', async ({ json }) => {
  const s = await json('admin1', 'GET', '/api/stats?from=2026-11-01&to=2026-11-30');
  assert.deepEqual(s, { orders: 0, gross: 0, net: 0, profit: 0, prev: { orders: 0, gross: 0, net: 0, profit: 0 } });
  const all = await json('admin1', 'GET', '/api/stats');
  assert.deepEqual(all, { orders: 0, gross: 0, net: 0, profit: 0, prev: { orders: 0, gross: 0, net: 0, profit: 0 } });
});

t('gross/net/profit; fee_tim counted once; prev = equal-length period before', async ({ json, order, tx }) => {
  await order('admin1', { receivedAt: '2026-11-01', price: 1000000 });
  await order('ma', { receivedAt: '2026-11-30', price: 500000 });
  await order('admin1', { receivedAt: '2026-12-01', price: 9 }); // outside
  await tx({ date: '2026-11-15', type: 'income', category: 'lainnya', amount: 100000 });
  await tx({ date: '2026-11-15', category: 'alat', amount: 200000 });
  await tx({ date: '2026-11-16', category: 'fee_tim', amount: 300000 });
  // prev period: 2026-10-02 .. 2026-10-31 (30 days)
  await order('admin1', { receivedAt: '2026-10-02', price: 70000 });
  await order('admin1', { receivedAt: '2026-10-01', price: 1 }); // outside prev
  await tx({ date: '2026-10-31', category: 'fee_tim', amount: 20000 });
  const s = await json('admin1', 'GET', '/api/stats?from=2026-11-01&to=2026-11-30');
  assert.deepEqual(s, {
    orders: 2, gross: 1600000, net: 1400000, profit: 1100000,
    prev: { orders: 1, gross: 70000, net: 70000, profit: 50000 },
  });
});

t('member stats: only own orders, no net/profit', async ({ json, order, ids, tx }) => {
  await order('ma', { price: 100 });
  await order('admin1', { price: 200, assigneeId: ids.ma });
  await order('mb', { price: 400 });
  await tx({ amount: 5 });
  const s = await json('ma', 'GET', '/api/stats?from=2026-11-01&to=2026-11-30');
  assert.deepEqual(s, { orders: 2, gross: 300, prev: { orders: 0, gross: 0 } });
});

t('stats bad params -> 400', async ({ call }) => {
  for (const q of ['from=2026-11-31&to=2026-12-01', 'from=2026-12-01&to=2026-11-01', 'from=x&to=2026-11-01', 'from=2026-11-01']) {
    assert.equal((await call('admin1', 'GET', `/api/stats?${q}`)).status, 400, q);
  }
});

t('monthly: oldest first, zero months included, admin only', async ({ json, call, order, tx }) => {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const ym = (back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return d.toISOString().slice(0, 7);
  };
  await order('admin1', { receivedAt: `${ym(0)}-01`, price: 1000 });
  await tx({ date: `${ym(0)}-01`, type: 'income', category: 'lainnya', amount: 50 });
  await tx({ date: `${ym(2)}-01`, category: 'fee_tim', amount: 300 });
  await tx({ date: `${ym(5)}-01`, category: 'alat', amount: 7 }); // outside months=3
  const m = await json('admin1', 'GET', '/api/stats/monthly?months=3');
  assert.deepEqual(m, [
    { month: ym(2), income: 0, expense: 300 },
    { month: ym(1), income: 0, expense: 0 },
    { month: ym(0), income: 1050, expense: 0 },
  ]);
  assert.equal((await json('admin1', 'GET', '/api/stats/monthly')).length, 12);
  for (const q of ['months=0', 'months=37', 'months=x']) assert.equal((await call('admin1', 'GET', `/api/stats/monthly?${q}`)).status, 400, q);
  assert.equal((await call('ma', 'GET', '/api/stats/monthly')).status, 403);
});

t('ledger: union, labels, sort, pagination, admin only', async ({ json, call, order, tx }) => {
  const o = await order('admin1', { receivedAt: '2026-11-05', price: 1000, projectName: 'Web', clientName: 'Budi' });
  const a = await tx({ date: '2026-11-01', category: 'ads', amount: 10, note: 'iklan', orderId: o.id });
  const b = await tx({ date: '2026-11-09', type: 'income', category: 'lainnya', amount: 20 });
  await tx({ date: '2026-12-01', amount: 30 });
  const desc = await json('admin1', 'GET', '/api/ledger?from=2026-11-01&to=2026-11-30');
  assert.equal(desc.total, 3);
  assert.deepEqual(desc.rows.map((r) => [r.kind, r.id]), [['transaction', b.id], ['order', o.id], ['transaction', a.id]]);
  assert.deepEqual(desc.rows[1], { kind: 'order', id: o.id, date: '2026-11-05', type: 'income', category: 'order', amount: 1000, label: 'Web — Budi', orderId: o.id });
  assert.deepEqual(desc.rows[2], { kind: 'transaction', id: a.id, date: '2026-11-01', type: 'expense', category: 'ads', amount: 10, label: 'iklan', orderId: o.id });
  const asc = await json('admin1', 'GET', '/api/ledger?from=2026-11-01&to=2026-11-30&sort=date_asc&limit=2&page=2');
  assert.equal(asc.total, 3);
  assert.deepEqual(asc.rows.map((r) => r.id), [b.id]);
  assert.equal((await json('admin1', 'GET', '/api/ledger')).total, 4);
  for (const q of ['sort=x', 'limit=101', 'page=0']) assert.equal((await call('admin1', 'GET', `/api/ledger?${q}`)).status, 400, q);
  assert.equal((await call('ma', 'GET', '/api/ledger')).status, 403);
});
