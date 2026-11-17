import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, skipReason } from './helpers.js';
import { migrate } from '../src/db.js';
import { createApp } from '../src/app.js';

test('migrate is idempotent and creates tables', { skip: skipReason }, async () => {
  const { pool, cleanup } = await freshDb();
  try {
    assert.deepEqual(await migrate(pool), []);
    const { rows } = await pool.query(
      `select table_name from information_schema.tables where table_schema = current_schema()`,
    );
    const names = rows.map((r) => r.table_name);
    for (const t of ['users', 'sessions', 'bank_accounts', 'orders', 'invoices', 'schema_migrations']) {
      assert.ok(names.includes(t), `missing ${t}`);
    }
  } finally {
    await cleanup();
  }
});

test('first migrate returns applied file list', { skip: skipReason }, async () => {
  const { pool, cleanup } = await freshDb();
  try {
    const { rows } = await pool.query('select name from schema_migrations order by name');
    assert.deepEqual(rows.map((r) => r.name), ['001_init.sql']);
  } finally {
    await cleanup();
  }
});

test('one invoice per order; DATE returned as string', { skip: skipReason }, async () => {
  const { pool, cleanup } = await freshDb();
  try {
    const u = await pool.query(
      `insert into users(name,username,password_hash,role) values('A','a','x','admin') returning id`,
    );
    const o = await pool.query(
      `insert into orders(received_at,project_name,client_name,price,created_by)
       values('2026-11-17','P','C',1000,$1) returning id, received_at`,
      [u.rows[0].id],
    );
    assert.equal(o.rows[0].received_at, '2026-11-17');
    const ins = () =>
      pool.query(`insert into invoices(order_id,number,data) values($1,$2,'{}')`, [
        o.rows[0].id,
        `INV-${Math.random()}`,
      ]);
    await ins();
    await assert.rejects(ins, { code: '23505' });
  } finally {
    await cleanup();
  }
});

test('GET /api/health', async () => {
  const app = createApp({ pool: null, config: { corsOrigin: 'https://x.test', cookieDomain: null, secureCookies: false } });
  const res = await app.request('/api/health', { headers: { Origin: 'https://x.test' } });
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://x.test');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});
