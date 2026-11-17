import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, skipReason, login, cookieOf } from './helpers.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/password.js';

const config = { corsOrigin: 'https://x.test', cookieDomain: null, secureCookies: false };

async function setup() {
  const db = await freshDb();
  const app = createApp({ pool: db.pool, config });
  const cookies = {};
  const hash = await hashPassword('pw');
  for (const [u, role] of [['admin1', 'admin'], ['ma', 'member']]) {
    const { rows } = await db.pool.query(
      `insert into users(name,username,password_hash,role) values($1,$2,$3,$4) returning id`,
      [u, u, hash, role],
    );
    cookies[u] = cookieOf(await login(app, u, 'pw', `10.0.0.${rows[0].id}`));
  }
  const call = (who, method, path, body) =>
    app.request(path, {
      method,
      headers: { cookie: cookies[who], ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const order = async (extra = {}) => {
    const res = await call('admin1', 'POST', '/api/orders', {
      projectName: 'Skripsi CV', clientName: 'Budi', clientPhone: '0812', receivedAt: '2026-11-01',
      deadline: '2026-12-01', price: 500000, scopeOfWork: 'Bab 1-5', ...extra,
    });
    assert.equal(res.status, 201);
    return res.json();
  };
  const bank = (slot, def = false) =>
    db.pool.query(
      `insert into bank_accounts(slot, bank_name, account_number, account_holder, is_default) values($1,$2,$3,$4,$5)`,
      [slot, `Bank${slot}`, `${slot}${slot}${slot}`, `Holder${slot}`, def],
    );
  return { ...db, app, call, order, bank };
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

const data = (extra = {}) => ({
  date: '2026-11-17', client: 'Budi', items: [{ name: 'X', quantity: 2, price: 100000 }],
  discountType: 'percent', discountValue: 0, depositPercent: 50, ...extra,
});

t('member gets 403, anonymous 401, on all routes', async ({ app, call }) => {
  for (const [m, p] of [['GET', '/api/banks'], ['GET', '/api/invoices'], ['GET', '/api/invoices/1'], ['GET', '/api/orders/1/invoice-draft']]) {
    assert.equal((await call('ma', m, p)).status, 403, p);
    assert.equal((await app.request(p, { method: m })).status, 401, p);
  }
  assert.equal((await call('ma', 'POST', '/api/invoices', {})).status, 403);
  assert.equal((await call('ma', 'PUT', '/api/invoices/1', {})).status, 403);
});

t('GET /api/banks returns present slots only', async ({ call, bank }) => {
  assert.deepEqual(await (await call('admin1', 'GET', '/api/banks')).json(), []);
  await bank(2, true);
  assert.deepEqual(await (await call('admin1', 'GET', '/api/banks')).json(), [
    { slot: 2, bankName: 'Bank2', accountNumber: '222', accountHolder: 'Holder2', isDefault: true },
  ]);
});

t('draft uses order values and default bank', async ({ call, order, bank }) => {
  await bank(1);
  await bank(2, true);
  const o = await order();
  const res = await call('admin1', 'GET', `/api/orders/${o.id}/invoice-draft`);
  assert.equal(res.status, 200);
  const { number, draft } = await res.json();
  assert.match(number, /^INV-001\/JKD\/[IVX]+\/\d{4}$/);
  assert.equal(draft.client, 'Budi');
  assert.equal(draft.clientPhone, '0812');
  assert.equal(draft.dueDate, '2026-12-01');
  assert.equal(draft.items[0].name, 'Skripsi CV');
  assert.equal(draft.items[0].price, 500000);
  assert.equal(draft.bankName, 'Bank2');
  assert.equal(draft.accountNumber, '222');
});

t('draft falls back to slot 1, then empty bank; 404 / 409', async ({ call, order, bank, pool }) => {
  const o = await order();
  let d = (await (await call('admin1', 'GET', `/api/orders/${o.id}/invoice-draft`)).json()).draft;
  assert.equal(d.bankName, '');
  await bank(2);
  await bank(1);
  d = (await (await call('admin1', 'GET', `/api/orders/${o.id}/invoice-draft`)).json()).draft;
  assert.equal(d.bankName, 'Bank1');
  assert.equal((await call('admin1', 'GET', '/api/orders/9999/invoice-draft')).status, 404);
  await pool.query(`insert into invoices(order_id, number, data) values($1,'INV-009/JKD/XI/2026','{}')`, [o.id]);
  assert.equal((await call('admin1', 'GET', `/api/orders/${o.id}/invoice-draft`)).status, 409);
});

t('create succeeds, fills order.invoice, list/get/put work', async ({ call, order }) => {
  const o = await order();
  const res = await call('admin1', 'POST', '/api/invoices', { orderId: o.id, number: 'INV-001/JKD/XI/2026', data: data() });
  assert.equal(res.status, 201);
  const inv = await res.json();
  assert.deepEqual(Object.keys(inv).sort(), ['data', 'id', 'number', 'orderId']);
  assert.equal(inv.orderId, o.id);
  const ord = await (await call('admin1', 'GET', `/api/orders/${o.id}`)).json();
  assert.deepEqual(ord.invoice, { id: inv.id, number: 'INV-001/JKD/XI/2026' });

  const list = await (await call('admin1', 'GET', '/api/invoices')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].client, 'Budi');
  assert.equal(list[0].total, 200000);
  assert.equal(list[0].date, '2026-11-17');
  assert.equal(list[0].orderId, o.id);
  assert.ok(list[0].createdAt);

  assert.deepEqual(await (await call('admin1', 'GET', `/api/invoices/${inv.id}`)).json(), inv);
  const put = await call('admin1', 'PUT', `/api/invoices/${inv.id}`, { number: 'INV-002/JKD/XI/2026', data: data({ client: 'Ani' }) });
  assert.equal(put.status, 200);
  const upd = await put.json();
  assert.equal(upd.number, 'INV-002/JKD/XI/2026');
  assert.equal(upd.data.client, 'Ani');
  assert.equal((await call('admin1', 'GET', '/api/invoices/9999')).status, 404);
  assert.equal((await call('admin1', 'PUT', '/api/invoices/9999', { number: 'A', data: data() })).status, 404);
});

t('list is newest first', async ({ call, order }) => {
  const a = await order();
  const b = await order();
  await call('admin1', 'POST', '/api/invoices', { orderId: a.id, data: data({ client: 'A' }) });
  await call('admin1', 'POST', '/api/invoices', { orderId: b.id, data: data({ client: 'B' }) });
  const list = await (await call('admin1', 'GET', '/api/invoices')).json();
  assert.deepEqual(list.map((i) => i.client), ['B', 'A']);
});

t('POST validation and missing order', async ({ call, order }) => {
  const o = await order();
  assert.equal((await call('admin1', 'POST', '/api/invoices', { orderId: 9999, data: data() })).status, 404);
  assert.equal((await call('admin1', 'POST', '/api/invoices', { orderId: 'x', data: data() })).status, 400);
  assert.equal((await call('admin1', 'POST', '/api/invoices', { orderId: o.id, data: { items: 'no' } })).status, 400);
  assert.equal((await call('admin1', 'POST', '/api/invoices', { orderId: o.id })).status, 400);
  assert.equal((await call('admin1', 'POST', '/api/invoices', { orderId: o.id, number: 5, data: data() })).status, 400);
});

t('two concurrent POSTs for same order: one 201, one 409', async ({ call, order }) => {
  const o = await order();
  const res = await Promise.all([
    call('admin1', 'POST', '/api/invoices', { orderId: o.id, data: data() }),
    call('admin1', 'POST', '/api/invoices', { orderId: o.id, data: data() }),
  ]);
  assert.deepEqual(res.map((r) => r.status).sort(), [201, 409]);
  const bad = await res.find((r) => r.status === 409).json();
  assert.equal(bad.error, 'Order sudah punya invoice');
});

t('two orders invoiced concurrently without numbers get distinct numbers', async ({ call, order }) => {
  const a = await order();
  const b = await order();
  const res = await Promise.all([
    call('admin1', 'POST', '/api/invoices', { orderId: a.id, data: data() }),
    call('admin1', 'POST', '/api/invoices', { orderId: b.id, data: data() }),
  ]);
  assert.deepEqual(res.map((r) => r.status), [201, 201]);
  const nums = (await Promise.all(res.map((r) => r.json()))).map((i) => i.number);
  assert.equal(new Set(nums).size, 2);
});

t('same auto-suggested number from three concurrent drafts: all succeed via retry', async ({ call, order }) => {
  const orders = [await order(), await order(), await order()];
  const drafts = await Promise.all(orders.map(async (o) => (await call('admin1', 'GET', `/api/orders/${o.id}/invoice-draft`)).json()));
  assert.equal(new Set(drafts.map((d) => d.number)).size, 1);
  const res = await Promise.all(
    orders.map((o, i) => call('admin1', 'POST', '/api/invoices', { orderId: o.id, number: drafts[i].number, autoNumber: true, data: drafts[i].draft })),
  );
  assert.deepEqual(res.map((r) => r.status), [201, 201, 201]);
  const nums = (await Promise.all(res.map((r) => r.json()))).map((i) => i.number);
  assert.equal(new Set(nums).size, 3);
});

t('stale draft number with autoNumber gets a fresh number', async ({ call, order }) => {
  const a = await order();
  const b = await order();
  const da = await (await call('admin1', 'GET', `/api/orders/${a.id}/invoice-draft`)).json();
  const db_ = await (await call('admin1', 'GET', `/api/orders/${b.id}/invoice-draft`)).json();
  assert.equal(da.number, db_.number);
  const ra = await call('admin1', 'POST', '/api/invoices', { orderId: a.id, number: da.number, autoNumber: true, data: da.draft });
  assert.equal(ra.status, 201);
  const rb = await call('admin1', 'POST', '/api/invoices', { orderId: b.id, number: db_.number, autoNumber: true, data: db_.draft });
  assert.equal(rb.status, 201);
  assert.notEqual((await rb.json()).number, (await ra.json()).number);
});

t('autoNumber false with a taken number is a custom conflict', async ({ call, order }) => {
  const a = await order();
  const b = await order();
  const da = await (await call('admin1', 'GET', `/api/orders/${a.id}/invoice-draft`)).json();
  await call('admin1', 'POST', '/api/invoices', { orderId: a.id, number: da.number, autoNumber: false, data: da.draft });
  const res = await call('admin1', 'POST', '/api/invoices', { orderId: b.id, number: da.number, autoNumber: false, data: da.draft });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'Nomor invoice sudah dipakai');
});

t('custom duplicate number gives 409 Nomor invoice sudah dipakai', async ({ call, order }) => {
  const a = await order();
  const b = await order();
  assert.equal((await call('admin1', 'POST', '/api/invoices', { orderId: a.id, number: 'CUSTOM-1', data: data() })).status, 201);
  const res = await call('admin1', 'POST', '/api/invoices', { orderId: b.id, number: 'CUSTOM-1', data: data() });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'Nomor invoice sudah dipakai');
});

t('PUT to existing number gives 409', async ({ call, order }) => {
  const a = await order();
  const b = await order();
  await call('admin1', 'POST', '/api/invoices', { orderId: a.id, number: 'N-1', data: data() });
  const ib = await (await call('admin1', 'POST', '/api/invoices', { orderId: b.id, number: 'N-2', data: data() })).json();
  const res = await call('admin1', 'PUT', `/api/invoices/${ib.id}`, { number: 'N-1', data: data() });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'Nomor invoice sudah dipakai');
});

t('editing the order afterwards leaves invoice data unchanged', async ({ call, order }) => {
  const o = await order();
  const inv = await (await call('admin1', 'POST', '/api/invoices', { orderId: o.id, data: data() })).json();
  const patch = await call('admin1', 'PATCH', `/api/orders/${o.id}`, { clientName: 'Changed', price: 1 });
  assert.equal(patch.status, 200);
  assert.equal((await (await call('admin1', 'GET', `/api/orders/${o.id}`)).json()).clientName, 'Changed');
  const got = await (await call('admin1', 'GET', `/api/invoices/${inv.id}`)).json();
  assert.equal(got.data.client, 'Budi');
});
