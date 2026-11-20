// Shared by the admin CLI (cli.js) and the Settings API (settings.js).
import { hashPassword } from './password.js';

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const PASSWORD_MIN = 8;

export class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function checkUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new AccountError(400, 'Username 3-32 karakter: huruf kecil, angka, titik, minus, garis bawah');
  }
}

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw new AccountError(400, `Password minimal ${PASSWORD_MIN} karakter`);
  }
  if (password.length > 200) throw new AccountError(400, 'Password terlalu panjang');
}

export function checkName(name) {
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s) throw new AccountError(400, 'Nama wajib diisi');
  if (s.length > 100) throw new AccountError(400, 'Nama maksimal 100 karakter');
  return s;
}

async function tx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function createUser(pool, { username, name, password, role }) {
  checkUsername(username);
  const n = checkName(name);
  checkPassword(password);
  try {
    const { rows } = await pool.query(
      `insert into users(name, username, password_hash, role) values($1,$2,$3,$4)
       returning id, username, name, role, active`,
      [n, username, await hashPassword(password), role],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AccountError(409, `Username "${username}" sudah ada`);
    throw err;
  }
}

// Deactivating also deletes the user's sessions, so they are logged out at once.
export function setActive(pool, id, active) {
  return tx(pool, async (client) => {
    const { rows } = await client.query(
      'update users set active = $2 where id = $1 returning id, username, name, role, active',
      [id, active],
    );
    if (!rows[0]) throw new AccountError(404, 'User tidak ditemukan');
    if (!active) await client.query('delete from sessions where user_id = $1', [id]);
    return rows[0];
  });
}

export async function findUserId(pool, username) {
  const { rows } = await pool.query('select id from users where username = $1', [username]);
  if (!rows[0]) throw new AccountError(404, `User "${username}" tidak ditemukan`);
  return rows[0].id;
}

export function setBank(pool, { slot, bankName, accountNumber, accountHolder, isDefault }) {
  if (slot !== 1 && slot !== 2) throw new AccountError(400, 'slot harus 1 atau 2');
  const fields = [bankName, accountNumber, accountHolder].map((v) => (typeof v === 'string' ? v.trim() : ''));
  if (fields.some((v) => !v)) throw new AccountError(400, 'Nama bank, nomor rekening, dan atas nama wajib diisi');
  if (fields.some((v) => v.length > 100)) throw new AccountError(400, 'Isian rekening maksimal 100 karakter');
  return tx(pool, async (client) => {
    if (isDefault) await client.query('update bank_accounts set is_default = false where slot <> $1', [slot]);
    const { rows } = await client.query(
      `insert into bank_accounts(slot, bank_name, account_number, account_holder, is_default)
       values($1,$2,$3,$4,$5)
       on conflict (slot) do update set bank_name = excluded.bank_name,
         account_number = excluded.account_number, account_holder = excluded.account_holder,
         is_default = case when $5 then true else bank_accounts.is_default end
       returning slot, bank_name, account_number, account_holder, is_default`,
      [slot, ...fields, Boolean(isDefault)],
    );
    return rows[0];
  });
}

// Other sessions of the user are ended; pass keepSessions when the user resets their own password.
export function setPassword(pool, id, password, { keepSessions = false } = {}) {
  checkPassword(password);
  return tx(pool, async (client) => {
    const { rowCount } = await client.query('update users set password_hash = $2 where id = $1', [
      id,
      await hashPassword(password),
    ]);
    if (!rowCount) throw new AccountError(404, 'User tidak ditemukan');
    if (!keepSessions) await client.query('delete from sessions where user_id = $1', [id]);
  });
}

export function setName(pool, id, name) {
  return pool.query('update users set name = $2 where id = $1', [id, checkName(name)]);
}
