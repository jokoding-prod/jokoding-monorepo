// Settings (admin only): team members and the two bank-account templates.
import { Hono } from 'hono';
import { requireUser, requireAdmin } from './auth.js';
import { AccountError, createUser, setActive, setBank, setName, setPassword } from './accounts.js';

const MAX_INT = 2147483647;
const parseId = (s) => (/^\d{1,10}$/.test(s) && Number(s) <= MAX_INT ? Number(s) : null);
const toMember = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active });
export const toBank = (b) => ({
  slot: b.slot,
  bankName: b.bank_name,
  accountNumber: b.account_number,
  accountHolder: b.account_holder,
  isDefault: b.is_default,
});

const fail = (c, err) => {
  if (err instanceof AccountError) return c.json({ error: err.message }, err.status);
  throw err;
};

// Mounted under /api/users next to usersRoutes (/assignable), so admin checks are per route.
export function membersRoutes() {
  const r = new Hono();
  const admin = [requireUser, requireAdmin];

  r.get('/', ...admin, async (c) => {
    const { rows } = await c.get('pool').query(
      'select id, username, name, role, active from users order by active desc, name, id',
    );
    return c.json(rows.map(toMember));
  });

  r.post('/', ...admin, async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') return c.json({ error: 'Body tidak valid' }, 400);
    try {
      const u = await createUser(c.get('pool'), {
        username: typeof body.username === 'string' ? body.username.trim() : body.username,
        name: body.name,
        password: body.password,
        role: 'member',
      });
      return c.json(toMember(u), 201);
    } catch (err) {
      return fail(c, err);
    }
  });

  r.patch('/:id', ...admin, async (c) => {
    const pool = c.get('pool');
    const id = parseId(c.req.param('id'));
    if (!id) return c.json({ error: 'User tidak ditemukan' }, 404);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') return c.json({ error: 'Body tidak valid' }, 400);
    if ('role' in body) return c.json({ error: 'Role tidak bisa diubah' }, 400);
    if (body.active !== undefined && typeof body.active !== 'boolean') {
      return c.json({ error: 'active tidak valid' }, 400);
    }
    const self = c.get('user').id === id;
    if (self && body.active === false) return c.json({ error: 'Tidak bisa menonaktifkan akun sendiri' }, 400);
    const { rows } = await pool.query('select 1 from users where id = $1', [id]);
    if (!rows[0]) return c.json({ error: 'User tidak ditemukan' }, 404);
    try {
      if (body.name !== undefined) await setName(pool, id, body.name);
      if (body.password !== undefined) await setPassword(pool, id, body.password, { keepSessions: self });
      if (body.active !== undefined) await setActive(pool, id, body.active);
    } catch (err) {
      return fail(c, err);
    }
    const { rows: out } = await pool.query('select id, username, name, role, active from users where id = $1', [id]);
    return c.json(toMember(out[0]));
  });

  return r;
}

// PUT /api/banks/:slot; mounted with banksRoutes, which already requires admin.
export async function putBank(c) {
  const slot = c.req.param('slot');
  if (slot !== '1' && slot !== '2') return c.json({ error: 'slot harus 1 atau 2' }, 400);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Body tidak valid' }, 400);
  if (body.isDefault !== undefined && typeof body.isDefault !== 'boolean') {
    return c.json({ error: 'isDefault tidak valid' }, 400);
  }
  try {
    const b = await setBank(c.get('pool'), {
      slot: Number(slot),
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      accountHolder: body.accountHolder,
      isDefault: body.isDefault,
    });
    return c.json(toBank(b));
  } catch (err) {
    return fail(c, err);
  }
}
