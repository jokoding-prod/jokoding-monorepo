import { Hono } from 'hono';
import { putBank, toBank } from './settings.js';
import { calcTotals, invoiceDraftFromOrder, nextInvoiceNumber } from '@jokoding/invoice-core';
import { requireUser, requireAdmin } from './auth.js';

const MAX_INT = 2147483647;
const MAX_TRIES = 3; // auto-number insert attempts
const ORDER_TAKEN = { error: 'Order sudah punya invoice' };
const NUMBER_TAKEN = { error: 'Nomor invoice sudah dipakai' };
const INVOICE_404 = { error: 'Invoice tidak ditemukan' };
const ORDER_404 = { error: 'Order tidak ditemukan' };

class BadRequest extends Error {}

const parseId = (s) => (/^\d{1,10}$/.test(s) && Number(s) <= MAX_INT ? Number(s) : null);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkData(v) {
  if (!isObj(v) || !Array.isArray(v.items) || !v.items.every(isObj)) throw new BadRequest('Data invoice tidak valid');
  return v;
}

function checkNumber(v, { required }) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequest('Nomor invoice wajib diisi');
    return null;
  }
  if (typeof v !== 'string') throw new BadRequest('Nomor invoice tidak valid');
  const s = v.trim();
  if (!s) throw new BadRequest('Nomor invoice wajib diisi');
  if (s.length > 100) throw new BadRequest('Nomor invoice maksimal 100 karakter');
  return s;
}

async function readBody(c) {
  const body = await c.req.json().catch(() => null);
  if (!isObj(body)) throw new BadRequest('Body tidak valid');
  return body;
}

const toInvoice = (r) => ({ id: r.id, number: r.number, orderId: r.order_id, data: r.data });

function safeTotal(data) {
  try {
    return calcTotals(data).total;
  } catch (err) {
    console.error('invoice total failed:', err);
    return 0;
  }
}

const toListItem = (r) => ({
  id: r.id,
  number: r.number,
  orderId: r.order_id,
  client: r.data?.client ?? '',
  total: safeTotal(r.data ?? { items: [] }),
  date: r.data?.date ?? null,
  createdAt: r.created_at,
});

async function suggestNumber(pool) {
  const { rows } = await pool.query('select number from invoices');
  return nextInvoiceNumber(rows.map((r) => r.number), new Date());
}

export function banksRoutes() {
  const r = new Hono();
  r.use('*', requireUser, requireAdmin);
  r.get('/', async (c) => {
    const { rows } = await c.get('pool').query(
      'select slot, bank_name, account_number, account_holder, is_default from bank_accounts order by slot',
    );
    return c.json(rows.map(toBank));
  });
  r.put('/:slot', putBank);
  return r;
}

// GET /api/orders/:id/invoice-draft; mounted under /api/orders before ordersRoutes.
export function invoiceDraftRoutes() {
  const r = new Hono();
  r.get('/:id/invoice-draft', requireUser, requireAdmin, async (c) => {
    const pool = c.get('pool');
    const id = parseId(c.req.param('id'));
    if (!id) return c.json(ORDER_404, 404);
    const { rows } = await pool.query(
      `select o.project_name, o.client_name, o.client_phone, o.price, o.deadline, o.scope_of_work,
              exists(select 1 from invoices i where i.order_id = o.id) as has_invoice
         from orders o where o.id = $1`,
      [id],
    );
    if (!rows[0]) return c.json(ORDER_404, 404);
    if (rows[0].has_invoice) return c.json(ORDER_TAKEN, 409);
    const { rows: banks } = await pool.query(
      'select bank_name, account_number, account_holder from bank_accounts order by is_default desc, slot limit 1',
    );
    const today = new Date();
    return c.json({
      number: await suggestNumber(pool),
      draft: invoiceDraftFromOrder(rows[0], banks[0] ?? null, today),
    });
  });
  return r;
}

export function invoicesRoutes() {
  const r = new Hono();
  r.use('*', requireUser, requireAdmin);

  r.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    throw err;
  });

  r.get('/', async (c) => {
    const { rows } = await c.get('pool').query(
      'select id, number, order_id, data, created_at from invoices order by created_at desc, id desc',
    );
    return c.json(rows.map(toListItem));
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const { rows } = id
      ? await c.get('pool').query('select id, number, order_id, data from invoices where id = $1', [id])
      : { rows: [] };
    return rows[0] ? c.json(toInvoice(rows[0])) : c.json(INVOICE_404, 404);
  });

  r.post('/', async (c) => {
    const pool = c.get('pool');
    const body = await readBody(c);
    const orderId = typeof body.orderId === 'number' && Number.isInteger(body.orderId) && body.orderId > 0 && body.orderId <= MAX_INT
      ? body.orderId
      : null;
    if (!orderId) throw new BadRequest('orderId tidak valid');
    const clientNumber = checkNumber(body.number, { required: false });
    const data = checkData(body.data);

    const { rows: found } = await pool.query('select 1 from orders where id = $1', [orderId]);
    if (!found[0]) return c.json(ORDER_404, 404);

    if (body.autoNumber !== undefined && typeof body.autoNumber !== 'boolean') throw new BadRequest('autoNumber tidak valid');
    // Auto: ignore the client's number and assign one at insert time.
    const auto = body.autoNumber === true || clientNumber === null;
    let number = auto ? await suggestNumber(pool) : clientNumber;
    for (let attempt = 0; ; attempt++) {
      try {
        const { rows } = await pool.query(
          'insert into invoices(order_id, number, data) values($1,$2,$3::jsonb) returning id, number, order_id, data',
          [orderId, number, JSON.stringify(data)],
        );
        return c.json(toInvoice(rows[0]), 201);
      } catch (err) {
        if (err.code === '23503') return c.json(ORDER_404, 404);
        if (err.code !== '23505') throw err;
        if (err.constraint === 'invoices_order_id_key') return c.json(ORDER_TAKEN, 409);
        if (err.constraint !== 'invoices_number_key') throw err;
        if (!auto || attempt + 1 >= MAX_TRIES) return c.json(NUMBER_TAKEN, 409);
        number = await suggestNumber(pool);
      }
    }
  });

  r.put('/:id', async (c) => {
    const pool = c.get('pool');
    const id = parseId(c.req.param('id'));
    if (!id) return c.json(INVOICE_404, 404);
    const body = await readBody(c);
    const number = checkNumber(body.number, { required: true });
    const data = checkData(body.data);
    try {
      const { rows } = await pool.query(
        'update invoices set number = $1, data = $2::jsonb where id = $3 returning id, number, order_id, data',
        [number, JSON.stringify(data), id],
      );
      return rows[0] ? c.json(toInvoice(rows[0])) : c.json(INVOICE_404, 404);
    } catch (err) {
      if (err.code === '23505') return c.json(NUMBER_TAKEN, 409);
      throw err;
    }
  });

  return r;
}
