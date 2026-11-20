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
  for (const [u, role, active] of [['admin1', 'admin', true], ['ma', 'member', true], ['mb', 'member', true], ['gone', 'member', false]]) {
    const { rows } = await db.pool.query(
      `insert into users(name,username,password_hash,role,active) values($1,$2,$3,$4,$5) returning id`,
      [u.toUpperCase(), u, hash, role, active],
    );
    ids[u] = rows[0].id;
    if (active) cookies[u] = cookieOf(await login(app, u, 'pw', `10.0.0.${rows[0].id}`));
  }
  const call = (who, method, path, body) =>
    app.request(path, {
      method,
      headers: { cookie: cookies[who], ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const base = { projectName: 'P', clientName: 'C', receivedAt: '2026-11-01', price: 100000 };
  const create = async (who, extra = {}) => {
    const res = await call(who, 'POST', '/api/orders', { ...base, ...extra });
    assert.equal(res.status, 201);
    return res.json();
  };
  const addInvoice = (orderId) =>
    db.pool.query(`insert into invoices(order_id, number, data) values($1,$2,'{}')`, [orderId, `INV-${orderId}/JKD/XI/2026`]);
  return { ...db, app, ids, cookies, call, create, addInvoice, base };
}

const wrap = (fn) => async () => {
  const s = await setup();
  try {
    await fn(s);
  } finally {
    await s.cleanup();
  }
};
const t = (name, fn) => test(name, { skip: skipReason }, wrap(fn));

t('requires login', async ({ app }) => {
  assert.equal((await app.request('/api/orders')).status, 401);
  assert.equal((await app.request('/api/users/assignable')).status, 401);
});

t('POST creates order with Order shape; createdBy = me', async ({ create, ids }) => {
  const o = await create('ma', { clientPhone: '0812', deadline: '2026-12-01', scopeOfWork: 'x', assigneeId: ids.mb });
  assert.deepEqual(Object.keys(o).sort(), [
    'assignee', 'clientName', 'clientPhone', 'createdBy', 'deadline', 'id', 'invoice', 'paymentStatus',
    'price', 'projectName', 'receivedAt', 'scopeOfWork', 'workStatus',
  ]);
  assert.equal(o.price, 100000);
  assert.equal(o.receivedAt, '2026-11-01');
  assert.equal(o.deadline, '2026-12-01');
  assert.deepEqual(o.assignee, { id: ids.mb, name: 'MB', active: true });
  assert.deepEqual(o.createdBy, { id: ids.ma, name: 'MA' });
  assert.equal(o.invoice, null);
  assert.equal(o.workStatus, 'baru');
  assert.equal(o.paymentStatus, 'belum');
  const o2 = await create('ma');
  assert.equal(o2.assignee, null);
  assert.equal(o2.deadline, null);
});

t('POST accepts digit-only string price; trims strings', async ({ call, base }) => {
  const res = await call('ma', 'POST', '/api/orders', { ...base, price: '350000', projectName: '  Foo  ' });
  assert.equal(res.status, 201);
  const o = await res.json();
  assert.equal(o.price, 350000);
  assert.equal(o.projectName, 'Foo');
});

t('invalid price -> 400', async ({ call, base }) => {
  for (const price of ['350.000', -1, 1.5, 'abc', '', null, undefined, '-5', 1e21]) {
    const res = await call('ma', 'POST', '/api/orders', { ...base, price });
    assert.equal(res.status, 400, String(price));
    if (price !== undefined && price !== null) assert.deepEqual(await res.json(), { error: 'Harga harus angka bulat ≥ 0' });
  }
  assert.equal((await call('ma', 'POST', '/api/orders', { ...base, price: 0 })).status, 201);
});

t('POST validation: required, dates, lengths, assignee, statuses', async ({ call, base, ids }) => {
  const bad = async (patch) => assert.equal((await call('ma', 'POST', '/api/orders', { ...base, ...patch })).status, 400, JSON.stringify(patch));
  await bad({ projectName: '   ' });
  await bad({ clientName: undefined });
  await bad({ receivedAt: '01-11-2026' });
  await bad({ receivedAt: '2026-02-30' });
  await bad({ deadline: 'soon' });
  await bad({ projectName: 'x'.repeat(201) });
  await bad({ clientName: 'x'.repeat(201) });
  await bad({ scopeOfWork: 'x'.repeat(5001) });
  await bad({ assigneeId: 9999 });
  await bad({ assigneeId: ids.gone });
  await bad({ assigneeId: 'abc' });
  await bad({ assigneeId: '12x' });
  await bad({ assigneeId: '' });
  assert.equal((await call('ma', 'POST', '/api/orders', { ...base, projectName: 'x'.repeat(200), scopeOfWork: 'y'.repeat(5000) })).status, 201);
  const res = await call('ma', 'POST', '/api/orders', 'not-json-object');
  assert.equal(res.status, 400);
});

t('POST: member cannot set statuses; admin can', async ({ call, base }) => {
  assert.equal((await call('ma', 'POST', '/api/orders', { ...base, paymentStatus: 'lunas' })).status, 403);
  assert.equal((await call('ma', 'POST', '/api/orders', { ...base, workStatus: 'selesai' })).status, 403);
  const res = await call('admin1', 'POST', '/api/orders', { ...base, paymentStatus: 'dp', workStatus: 'dikerjakan' });
  assert.equal(res.status, 201);
  const o = await res.json();
  assert.equal(o.paymentStatus, 'dp');
  assert.equal(o.workStatus, 'dikerjakan');
  assert.equal((await call('admin1', 'POST', '/api/orders', { ...base, paymentStatus: 'bogus' })).status, 400);
});

t('admin lists all, sorted received_at desc, id desc', async ({ create, call }) => {
  const a = await create('ma', { receivedAt: '2026-11-01' });
  const b = await create('mb', { receivedAt: '2026-11-05' });
  const c = await create('ma', { receivedAt: '2026-11-05' });
  const list = await (await call('admin1', 'GET', '/api/orders')).json();
  assert.deepEqual(list.map((o) => o.id), [c.id, b.id, a.id]);
});

t('member lists only assigned-or-created', async ({ create, call, ids }) => {
  const own = await create('ma');
  const assigned = await create('admin1', { assigneeId: ids.ma });
  await create('mb');
  await create('admin1');
  const list = await (await call('ma', 'GET', '/api/orders')).json();
  assert.deepEqual(list.map((o) => o.id).sort(), [own.id, assigned.id].sort());
});

t('member creates order assigned to B and still sees it', async ({ create, call, ids }) => {
  const o = await create('ma', { assigneeId: ids.mb });
  assert.equal((await call('ma', 'GET', `/api/orders/${o.id}`)).status, 200);
  assert.equal((await call('mb', 'GET', `/api/orders/${o.id}`)).status, 200);
  const list = await (await call('ma', 'GET', '/api/orders')).json();
  assert.ok(list.some((x) => x.id === o.id));
});

t('member A GET/PATCH member B order -> 404', async ({ create, call }) => {
  const o = await create('mb');
  let res = await call('ma', 'GET', `/api/orders/${o.id}`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Order tidak ditemukan' });
  res = await call('ma', 'PATCH', `/api/orders/${o.id}`, { projectName: 'hack' });
  assert.equal(res.status, 404);
  assert.equal((await call('ma', 'DELETE', `/api/orders/${o.id}`)).status, 403);
  const after = await (await call('admin1', 'GET', `/api/orders/${o.id}`)).json();
  assert.equal(after.projectName, 'P');
});

t('GET unknown / non-numeric id -> 404', async ({ call }) => {
  assert.equal((await call('admin1', 'GET', '/api/orders/99999')).status, 404);
  assert.equal((await call('admin1', 'GET', '/api/orders/abc')).status, 404);
  assert.equal((await call('admin1', 'GET', '/api/orders/99999999999999')).status, 404);
});

t('member PATCH own order without invoice works; updates updated fields', async ({ create, call, ids }) => {
  const o = await create('ma');
  const res = await call('ma', 'PATCH', `/api/orders/${o.id}`, { projectName: 'New', price: '5000', assigneeId: ids.mb, deadline: null });
  assert.equal(res.status, 200);
  const u = await res.json();
  assert.equal(u.projectName, 'New');
  assert.equal(u.price, 5000);
  assert.equal(u.assignee.id, ids.mb);
  assert.equal(u.clientName, 'C');
  // can unassign
  const r2 = await (await call('ma', 'PATCH', `/api/orders/${o.id}`, { assigneeId: null })).json();
  assert.equal(r2.assignee, null);
});

t('member PATCH own order after invoice -> 403', async ({ create, call, addInvoice }) => {
  const o = await create('ma');
  await addInvoice(o.id);
  const res = await call('ma', 'PATCH', `/api/orders/${o.id}`, { projectName: 'x' });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Tidak boleh mengubah order ini' });
  const got = await (await call('ma', 'GET', `/api/orders/${o.id}`)).json();
  assert.deepEqual(got.invoice, { exists: true });
});

t('member PATCH order only assigned to him (not created) -> 403', async ({ create, call, ids }) => {
  const o = await create('admin1', { assigneeId: ids.ma });
  const res = await call('ma', 'PATCH', `/api/orders/${o.id}`, { projectName: 'x' });
  assert.equal(res.status, 403);
});

t('member PATCH paymentStatus/workStatus -> 403; admin allowed', async ({ create, call }) => {
  const o = await create('ma');
  assert.equal((await call('ma', 'PATCH', `/api/orders/${o.id}`, { paymentStatus: 'lunas' })).status, 403);
  assert.equal((await call('ma', 'PATCH', `/api/orders/${o.id}`, { workStatus: 'selesai' })).status, 403);
  const res = await call('admin1', 'PATCH', `/api/orders/${o.id}`, { paymentStatus: 'lunas', workStatus: 'selesai' });
  assert.equal(res.status, 200);
  const u = await res.json();
  assert.equal(u.paymentStatus, 'lunas');
  assert.equal(u.workStatus, 'selesai');
  assert.equal((await call('admin1', 'PATCH', `/api/orders/${o.id}`, { paymentStatus: 'x' })).status, 400);
});

t('admin PATCH any order, even with invoice; validation applies', async ({ create, call, addInvoice }) => {
  const o = await create('ma');
  await addInvoice(o.id);
  assert.equal((await call('admin1', 'PATCH', `/api/orders/${o.id}`, { clientName: 'Z' })).status, 200);
  assert.equal((await call('admin1', 'PATCH', `/api/orders/${o.id}`, { price: '1.5' })).status, 400);
  assert.equal((await call('admin1', 'PATCH', `/api/orders/${o.id}`, { projectName: '' })).status, 400);
  assert.equal((await call('admin1', 'PATCH', `/api/orders/${o.id}`, { assigneeId: 9999 })).status, 400);
  assert.equal((await call('admin1', 'PATCH', `/api/orders/99999`, { clientName: 'Z' })).status, 404);
});

t('PATCH ignores unknown/immutable fields (createdBy)', async ({ create, call, ids }) => {
  const o = await create('ma');
  const u = await (await call('ma', 'PATCH', `/api/orders/${o.id}`, { createdBy: ids.mb, id: 999 })).json();
  assert.equal(u.createdBy.id, ids.ma);
  assert.equal(u.id, o.id);
});

t('DELETE: admin only; 409 with invoice; 204 otherwise', async ({ create, call, addInvoice }) => {
  const o = await create('ma');
  assert.equal((await call('ma', 'DELETE', `/api/orders/${o.id}`)).status, 403);
  await addInvoice(o.id);
  const res = await call('admin1', 'DELETE', `/api/orders/${o.id}`);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'Order sudah punya invoice' });
  const o2 = await create('ma');
  assert.equal((await call('admin1', 'DELETE', `/api/orders/${o2.id}`)).status, 204);
  assert.equal((await call('admin1', 'GET', `/api/orders/${o2.id}`)).status, 404);
  assert.equal((await call('admin1', 'DELETE', `/api/orders/${o2.id}`)).status, 404);
});

t('GET /api/users/assignable: active users only, any role', async ({ call, ids }) => {
  const res = await call('ma', 'GET', '/api/users/assignable');
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.deepEqual(list.map((u) => u.id).sort(), [ids.admin1, ids.ma, ids.mb].sort());
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'name', 'role']);
});

t('member GET of invoiced order exposes no invoice number; admin does', async ({ create, call, addInvoice }) => {
  const o = await create('ma');
  await addInvoice(o.id);
  const m = await (await call('ma', 'GET', `/api/orders/${o.id}`)).json();
  assert.deepEqual(m.invoice, { exists: true });
  const list = await (await call('ma', 'GET', '/api/orders')).json();
  assert.deepEqual(list[0].invoice, { exists: true });
  const a = await (await call('admin1', 'GET', `/api/orders/${o.id}`)).json();
  assert.equal(a.invoice.number, `INV-${o.id}/JKD/XI/2026`);
});

t('member PATCH UPDATE is guarded against an invoice created after the pre-check', async ({ pool, create, call, cookies }) => {
  const o = await create('ma');
  const racing = {
    query(text, params) {
      if (/^\s*update orders/i.test(text)) {
        return pool
          .query(`insert into invoices(order_id, number, data) values($1,'RACE-1','{}')`, [o.id])
          .then(() => pool.query(text, params));
      }
      return pool.query(text, params);
    },
  };
  const app2 = createApp({ pool: racing, config });
  const res = await app2.request(`/api/orders/${o.id}`, {
    method: 'PATCH',
    headers: { cookie: cookies.ma, 'content-type': 'application/json' },
    body: JSON.stringify({ projectName: 'hacked' }),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'Tidak boleh mengubah order ini' });
  const got = await (await call('admin1', 'GET', `/api/orders/${o.id}`)).json();
  assert.equal(got.projectName, 'P');
});

t('CSRF: foreign Origin 403, text/plain 415, right Origin ok, no Origin ok', async ({ app, base }) => {
  const ck = (await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '9.9.9.9' },
    body: JSON.stringify({ username: 'ma', password: 'pw' }),
  })).headers.get('set-cookie').split(';')[0];
  const post = (headers) =>
    app.request('/api/orders', { method: 'POST', headers: { cookie: ck, ...headers }, body: JSON.stringify(base) });
  let res = await post({ origin: 'https://evil.jokoding.id', 'content-type': 'application/json' });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'forbidden' });
  res = await post({ 'content-type': 'text/plain' });
  assert.equal(res.status, 415);
  assert.deepEqual(await res.json(), { error: 'Content-Type harus application/json' });
  assert.equal((await post({ origin: 'https://x.test', 'content-type': 'application/json' })).status, 201);
  assert.equal((await post({ 'content-type': 'application/json' })).status, 201);
  res = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie: ck, origin: 'https://evil.test' } });
  assert.equal(res.status, 403);
  res = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie: ck, origin: 'https://x.test' } });
  assert.equal(res.status, 204);
});

t('assigneeId accepts a digit-only string', async ({ create, call, ids }) => {
  const o = await create('ma', { assigneeId: String(ids.mb) });
  assert.equal(o.assignee.id, ids.mb);
  const r = await (await call('ma', 'PATCH', `/api/orders/${o.id}`, { assigneeId: String(ids.ma) })).json();
  assert.equal(r.assignee.id, ids.ma);
});

t('admin PATCH of an order deleted mid-request -> 404, not 403', async ({ create, pool, cookies }) => {
  const o = await create('ma');
  const racing = {
    query(text, params) {
      if (/^\s*update orders/i.test(text)) return pool.query('delete from orders where id = $1', [o.id]).then(() => pool.query(text, params));
      return pool.query(text, params);
    },
  };
  const res = await createApp({ pool: racing, config }).request(`/api/orders/${o.id}`, {
    method: 'PATCH',
    headers: { cookie: cookies.admin1, 'content-type': 'application/json' },
    body: JSON.stringify({ projectName: 'x' }),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Order tidak ditemukan' });
});
