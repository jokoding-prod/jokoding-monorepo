import { Hono } from 'hono';
import { requireUser, requireAdmin } from './auth.js';
import { isoDate, ParamError, paramErrors } from './params.js';

const MAX_INT = 2147483647;
const NOT_FOUND = { error: 'Transaksi tidak ditemukan' };
export const CATEGORIES = {
  expense: ['alat', 'domain_hosting', 'ads', 'fee_tim', 'lainnya'],
  income: ['lainnya'],
};

const COLS = 'id, date, type, category, amount, note, order_id, created_by';
const toTx = (r) => ({
  id: r.id,
  date: r.date,
  type: r.type,
  category: r.category,
  amount: r.amount,
  note: r.note,
  orderId: r.order_id,
  createdBy: r.created_by,
});

const parseId = (s) => (/^\d{1,10}$/.test(s) && Number(s) <= MAX_INT ? Number(s) : null);

function amount(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new ParamError('Jumlah harus angka bulat > 0');
  return n;
}

function note(v) {
  if (v === null) return '';
  if (typeof v !== 'string') throw new ParamError('Catatan tidak valid');
  const s = v.trim();
  if (s.length > 2000) throw new ParamError('Catatan maksimal 2000 karakter');
  return s;
}

async function orderId(pool, v) {
  if (v === null) return null;
  if (Number.isInteger(v) && v > 0 && v <= MAX_INT) {
    const { rows } = await pool.query('select 1 from orders where id = $1', [v]);
    if (rows[0]) return v;
  }
  throw new ParamError('Order tidak valid');
}

// Validates body merged over the current row (PATCH) or alone (POST); returns columns to write.
async function validate(pool, body, current = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ParamError('Body tidak valid');
  const vals = {};
  if (!current || body.date !== undefined) vals.date = isoDate(body.date, 'Tanggal');
  const type = body.type ?? current?.type;
  if (!Object.hasOwn(CATEGORIES, type ?? '')) throw new ParamError('Tipe tidak valid');
  const category = body.category ?? current?.category;
  if (!CATEGORIES[type].includes(category)) throw new ParamError('Kategori tidak valid');
  if (!current || body.type !== undefined || body.category !== undefined) {
    vals.type = type;
    vals.category = category;
  }
  if (!current || body.amount !== undefined) vals.amount = amount(body.amount);
  if (body.note !== undefined) vals.note = note(body.note);
  if (body.orderId !== undefined) vals.order_id = await orderId(pool, body.orderId);
  return vals;
}

const readBody = (c) => c.req.json().catch(() => null);

export function transactionsRoutes() {
  const r = new Hono();
  r.use('*', requireUser, requireAdmin);
  r.onError(paramErrors);

  r.post('/', async (c) => {
    const pool = c.get('pool');
    const vals = await validate(pool, await readBody(c));
    vals.created_by = c.get('user').id;
    const cols = Object.keys(vals);
    const { rows } = await pool.query(
      `insert into transactions(${cols.join(',')}) values(${cols.map((_, i) => `$${i + 1}`).join(',')}) returning ${COLS}`,
      cols.map((k) => vals[k]),
    );
    return c.json(toTx(rows[0]), 201);
  });

  r.patch('/:id', async (c) => {
    const pool = c.get('pool');
    const id = parseId(c.req.param('id'));
    const cur = id && (await pool.query(`select ${COLS} from transactions where id = $1`, [id])).rows[0];
    if (!cur) return c.json(NOT_FOUND, 404);
    const vals = await validate(pool, await readBody(c), cur);
    const cols = Object.keys(vals);
    if (!cols.length) return c.json(toTx(cur));
    const { rows } = await pool.query(
      `update transactions set ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now()
        where id = $${cols.length + 1} returning ${COLS}`,
      [...cols.map((k) => vals[k]), id],
    );
    return rows[0] ? c.json(toTx(rows[0])) : c.json(NOT_FOUND, 404);
  });

  r.delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const res = id && (await c.get('pool').query('delete from transactions where id = $1', [id]));
    return res && res.rowCount ? c.body(null, 204) : c.json(NOT_FOUND, 404);
  });

  return r;
}

// Mounted under /api/orders: GET /:id/transactions (admin).
export function orderTransactionsRoutes() {
  const r = new Hono();
  r.get('/:id/transactions', requireUser, requireAdmin, async (c) => {
    const id = parseId(c.req.param('id'));
    if (!id) return c.json({ error: 'Order tidak ditemukan' }, 404);
    const { rows } = await c
      .get('pool')
      .query(`select ${COLS} from transactions where order_id = $1 order by date desc, id desc`, [id]);
    return c.json(rows.map(toTx));
  });
  return r;
}
