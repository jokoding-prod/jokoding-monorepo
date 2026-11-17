import { Hono } from 'hono';
import { requireUser, requireAdmin } from './auth.js';

const PRICE_ERR = 'Harga harus angka bulat ≥ 0';
const NOT_FOUND = { error: 'Order tidak ditemukan' };
const WORK = ['baru', 'dikerjakan', 'selesai'];
const PAYMENT = ['belum', 'dp', 'lunas'];
const MAX_INT = 2147483647;

class BadRequest extends Error {}

const SELECT = `
  select o.id, o.received_at, o.project_name, o.client_name, o.client_phone, o.deadline, o.price,
         o.scope_of_work, o.work_status, o.payment_status,
         a.id as a_id, a.name as a_name, a.active as a_active,
         cb.id as cb_id, cb.name as cb_name,
         i.id as inv_id, i.number as inv_number
    from orders o
    left join users a on a.id = o.assignee_id
    join users cb on cb.id = o.created_by
    left join invoices i on i.order_id = o.id`;

const toOrder = (r) => ({
  id: r.id,
  receivedAt: r.received_at,
  projectName: r.project_name,
  clientName: r.client_name,
  clientPhone: r.client_phone,
  deadline: r.deadline,
  price: r.price,
  scopeOfWork: r.scope_of_work,
  assignee: r.a_id == null ? null : { id: r.a_id, name: r.a_name, active: r.a_active },
  createdBy: { id: r.cb_id, name: r.cb_name },
  workStatus: r.work_status,
  paymentStatus: r.payment_status,
  invoice: r.inv_id == null ? null : { id: r.inv_id, number: r.inv_number },
});

const parseId = (s) => (/^\d{1,10}$/.test(s) && Number(s) <= MAX_INT ? Number(s) : null);

function str(v, field, { max, required }) {
  if (v === undefined || v === null) {
    if (required) throw new BadRequest(`${field} wajib diisi`);
    return '';
  }
  if (typeof v !== 'string') throw new BadRequest(`${field} tidak valid`);
  const s = v.trim();
  if (required && !s) throw new BadRequest(`${field} wajib diisi`);
  if (s.length > max) throw new BadRequest(`${field} maksimal ${max} karakter`);
  return s;
}

function date(v, field, { required }) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequest(`${field} wajib diisi`);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequest(`${field} harus YYYY-MM-DD`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new BadRequest(`${field} tidak valid`);
  return v;
}

function price(v) {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,15}$/.test(v)) n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new BadRequest(PRICE_ERR);
  return n;
}

function enumVal(v, list, field) {
  if (!list.includes(v)) throw new BadRequest(`${field} tidak valid`);
  return v;
}

async function assignee(pool, v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_INT) {
    const { rows } = await pool.query('select 1 from users where id = $1 and active', [v]);
    if (rows[0]) return v;
  }
  throw new BadRequest('Assignee tidak valid');
}

// Body field -> [column, validator(pool, value)]. Validators may be async.
const FIELDS = {
  projectName: ['project_name', (p, v) => str(v, 'Nama project', { max: 200, required: true })],
  clientName: ['client_name', (p, v) => str(v, 'Nama klien', { max: 200, required: true })],
  clientPhone: ['client_phone', (p, v) => str(v, 'No. HP klien', { max: 50 })],
  receivedAt: ['received_at', (p, v) => date(v, 'Tanggal masuk', { required: true })],
  deadline: ['deadline', (p, v) => date(v, 'Deadline', { required: false })],
  price: ['price', (p, v) => price(v)],
  scopeOfWork: ['scope_of_work', (p, v) => str(v, 'Scope of work', { max: 5000 })],
  assigneeId: ['assignee_id', assignee],
  workStatus: ['work_status', (p, v) => enumVal(v, WORK, 'Status pengerjaan')],
  paymentStatus: ['payment_status', (p, v) => enumVal(v, PAYMENT, 'Status pembayaran')],
};
const ADMIN_ONLY = ['workStatus', 'paymentStatus'];
const hasStatus = (body) => ADMIN_ONLY.some((k) => body[k] !== undefined);

async function readBody(c) {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('Body tidak valid');
  return body;
}

// Admin sees everything; a member only orders assigned to or created by them.
const visible = (user) => (user.role === 'admin' ? ['true', []] : ['(o.assignee_id = $1 or o.created_by = $1)', [user.id]]);

async function load(pool, user, id) {
  const [cond, params] = visible(user);
  const { rows } = await pool.query(`${SELECT} where o.id = $${params.length + 1} and ${cond}`, [...params, id]);
  return rows[0] || null;
}

export function ordersRoutes() {
  const r = new Hono();
  r.use('*', requireUser);

  r.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    throw err;
  });

  r.get('/', async (c) => {
    const [cond, params] = visible(c.get('user'));
    const { rows } = await c.get('pool').query(`${SELECT} where ${cond} order by o.received_at desc, o.id desc`, params);
    return c.json(rows.map(toOrder));
  });

  r.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const row = id && (await load(c.get('pool'), c.get('user'), id));
    return row ? c.json(toOrder(row)) : c.json(NOT_FOUND, 404);
  });

  r.post('/', async (c) => {
    const pool = c.get('pool');
    const user = c.get('user');
    const body = await readBody(c);
    if (user.role !== 'admin' && hasStatus(body)) return c.json({ error: 'Tidak boleh mengatur status order' }, 403);
    const vals = {};
    for (const [key, [col, fn]] of Object.entries(FIELDS)) {
      if (ADMIN_ONLY.includes(key) && body[key] === undefined) continue;
      vals[col] = await fn(pool, body[key]);
    }
    vals.created_by = user.id;
    const cols = Object.keys(vals);
    const { rows } = await pool.query(
      `insert into orders(${cols.join(',')}) values(${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      cols.map((k) => vals[k]),
    );
    return c.json(toOrder(await load(pool, user, rows[0].id)), 201);
  });

  r.patch('/:id', async (c) => {
    const pool = c.get('pool');
    const user = c.get('user');
    const id = parseId(c.req.param('id'));
    const row = id && (await load(pool, user, id));
    if (!row) return c.json(NOT_FOUND, 404);
    const body = await readBody(c);
    if (user.role !== 'admin') {
      if (row.cb_id !== user.id || row.inv_id != null) return c.json({ error: 'Tidak boleh mengubah order ini' }, 403);
      if (hasStatus(body)) return c.json({ error: 'Tidak boleh mengubah status order' }, 403);
    }
    const sets = [];
    const params = [];
    for (const [key, [col, fn]] of Object.entries(FIELDS)) {
      if (body[key] === undefined) continue;
      params.push(await fn(pool, body[key]));
      sets.push(`${col} = $${params.length}`);
    }
    if (sets.length) {
      params.push(id);
      await pool.query(`update orders set ${sets.join(', ')}, updated_at = now() where id = $${params.length}`, params);
    }
    return c.json(toOrder(await load(pool, user, id)));
  });

  r.delete('/:id', requireAdmin, async (c) => {
    const pool = c.get('pool');
    const id = parseId(c.req.param('id'));
    const row = id && (await load(pool, c.get('user'), id));
    if (!row) return c.json(NOT_FOUND, 404);
    if (row.inv_id != null) return c.json({ error: 'Order sudah punya invoice' }, 409);
    try {
      await pool.query('delete from orders where id = $1', [id]);
    } catch (err) {
      if (err.code === '23503') return c.json({ error: 'Order sudah punya invoice' }, 409);
      throw err;
    }
    return c.body(null, 204);
  });

  return r;
}

export function usersRoutes() {
  const r = new Hono();
  r.get('/assignable', requireUser, async (c) => {
    const { rows } = await c.get('pool').query('select id, name, role from users where active order by name, id');
    return c.json(rows);
  });
  return r;
}
