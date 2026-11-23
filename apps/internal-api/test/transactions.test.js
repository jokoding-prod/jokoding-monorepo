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

t('POST creates transaction in camelCase', async ({ tx, order, ids }) => {
  const o = await order('admin1');
  const r = await tx({ amount: 250000, note: ' sewa ', orderId: o.id, category: 'fee_tim' });
  assert.deepEqual(Object.keys(r).sort(), ['amount', 'category', 'createdBy', 'date', 'id', 'note', 'orderId', 'type']);
  assert.equal(r.amount, 250000);
  assert.equal(r.date, '2026-11-10');
  assert.equal(r.note, 'sewa');
  assert.equal(r.orderId, o.id);
  assert.equal(r.createdBy, ids.admin1);
  const inc = await tx({ type: 'income', category: 'lainnya' });
  assert.equal(inc.orderId, null);
  assert.equal(inc.note, '');
});

t('POST validation 400s', async ({ call }) => {
  const base = { date: '2026-11-10', type: 'expense', category: 'alat', amount: 1000 };
  for (const patch of [
    { type: 'x' }, { type: undefined }, { category: 'bogus' }, { type: 'income', category: 'alat' },
    { amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: 'abc' }, { amount: undefined },
    { date: '2026-02-30' }, { date: '10-11-2026' }, { date: undefined }, { orderId: 99999 }, { orderId: 'x' },
    { note: 'n'.repeat(2001) },
  ]) {
    const res = await call('admin1', 'POST', '/api/transactions', { ...base, ...patch });
    assert.equal(res.status, 400, JSON.stringify(patch));
  }
});

t('PATCH updates partially, revalidates type/category; DELETE 204', async ({ tx, call }) => {
  const r = await tx({});
  let res = await call('admin1', 'PATCH', `/api/transactions/${r.id}`, { amount: 5000, note: 'x' });
  assert.equal(res.status, 200);
  const u = await res.json();
  assert.equal(u.amount, 5000);
  assert.equal(u.category, 'alat');
  assert.equal((await call('admin1', 'PATCH', `/api/transactions/${r.id}`, { type: 'income' })).status, 400);
  assert.equal((await call('admin1', 'PATCH', `/api/transactions/${r.id}`, { type: 'income', category: 'lainnya' })).status, 200);
  assert.equal((await call('admin1', 'PATCH', `/api/transactions/${r.id}`, { amount: 0 })).status, 400);
  assert.equal((await call('admin1', 'PATCH', '/api/transactions/99999', { amount: 1 })).status, 404);
  assert.equal((await call('admin1', 'DELETE', `/api/transactions/${r.id}`)).status, 204);
  assert.equal((await call('admin1', 'DELETE', `/api/transactions/${r.id}`)).status, 404);
});

t('member gets 403 on transactions endpoints', async ({ tx, call, order }) => {
  const r = await tx({});
  const o = await order('ma');
  assert.equal((await call('ma', 'POST', '/api/transactions', { date: '2026-11-10', type: 'expense', category: 'alat', amount: 1 })).status, 403);
  assert.equal((await call('ma', 'PATCH', `/api/transactions/${r.id}`, { amount: 1 })).status, 403);
  assert.equal((await call('ma', 'DELETE', `/api/transactions/${r.id}`)).status, 403);
  assert.equal((await call('ma', 'GET', `/api/orders/${o.id}/transactions`)).status, 403);
});

t('GET /api/orders/:id/transactions lists linked rows; deleting order keeps expense with null orderId', async ({ tx, order, call, json }) => {
  const o = await order('admin1');
  const a = await tx({ orderId: o.id, category: 'fee_tim' });
  await tx({});
  const list = await json('admin1', 'GET', `/api/orders/${o.id}/transactions`);
  assert.deepEqual(list.map((x) => x.id), [a.id]);
  assert.equal((await call('admin1', 'DELETE', `/api/orders/${o.id}`)).status, 204);
  const { rows } = await call('admin1', 'GET', '/api/ledger').then((r) => r.json());
  const kept = rows.find((x) => x.kind === 'transaction' && x.id === a.id);
  assert.ok(kept);
  assert.equal(kept.orderId, null);
});
