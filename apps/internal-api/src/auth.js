import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { verifyPassword, hashPassword } from './password.js';

export const COOKIE_NAME = 'jki_session';
const SESSION_SECONDS = 30 * 24 * 3600;
const MAX_FAILS = 10;
const MAX_FAILS_PER_USER = 30;
const WINDOW_MS = 15 * 60 * 1000;

// Verified against when the username is unknown, so timing does not reveal it.
const DUMMY_HASH = hashPassword('dummy-password');

function cookieOpts(config) {
  return {
    httpOnly: true,
    secure: Boolean(config.secureCookies),
    sameSite: 'Lax',
    path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

// Behind nginx (`proxy_set_header X-Real-IP $remote_addr`). X-Forwarded-For is client-controlled: ignored.
export function clientIp(c) {
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  return c.env?.incoming?.socket?.remoteAddress || 'unknown';
}

const SWEEP_AT = 10000;

function createLimiter() {
  const attempts = new Map(); // key -> { count, resetAt }
  const live = (key) => {
    const e = attempts.get(key);
    if (e && e.resetAt <= Date.now()) {
      attempts.delete(key);
      return null;
    }
    return e || null;
  };
  const sweep = () => {
    const now = Date.now();
    for (const [k, e] of attempts) if (e.resetAt <= now) attempts.delete(k);
  };
  return {
    // Counts an attempt before verification; false when the limit is already reached.
    reserve(key, max) {
      const e = live(key);
      if (e) {
        if (e.count >= max) return false;
        e.count++;
        return true;
      }
      if (attempts.size > SWEEP_AT) sweep();
      attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
      return true;
    },
    release(key) {
      const e = live(key);
      if (e && --e.count <= 0) attempts.delete(key);
    },
    reset: (key) => attempts.delete(key),
  };
}

const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role });

// Needs c.get('pool'), which createApp sets for every request.
export async function requireUser(c, next) {
  const sid = getCookie(c, COOKIE_NAME);
  if (sid) {
    const { rows } = await c.get('pool').query(
      `select u.id, u.name, u.username, u.role
         from sessions s join users u on u.id = s.user_id
        where s.id = $1 and s.expires_at > now() and u.active`,
      [sid],
    );
    if (rows[0]) {
      c.set('user', publicUser(rows[0]));
      return next();
    }
  }
  return c.json({ error: 'unauthorized' }, 401);
}

export async function requireAdmin(c, next) {
  if (c.get('user')?.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  return next();
}

export function authRoutes({ pool, config }) {
  const r = new Hono();
  const limiter = createLimiter();

  r.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const key = `${username.toLowerCase()}|${clientIp(c)}`;
    const userKey = `user|${username.toLowerCase()}`;
    if (!limiter.reserve(key, MAX_FAILS)) return c.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429);
    if (!limiter.reserve(userKey, MAX_FAILS_PER_USER)) {
      limiter.release(key);
      return c.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429);
    }

    const { rows } = await pool.query(
      'select id, name, username, role, password_hash, active from users where username = $1',
      [username],
    );
    const u = rows[0];
    const ok = await verifyPassword(password, u ? u.password_hash : await DUMMY_HASH);
    if (!u || !u.active || !ok) {
      return c.json({ error: 'Username atau password salah' }, 401);
    }
    limiter.reset(key);
    limiter.release(userKey);
    const sid = randomBytes(32).toString('base64url');
    await pool.query('insert into sessions(id, user_id, expires_at) values($1,$2, now() + $3 * interval \'1 second\')', [
      sid,
      u.id,
      SESSION_SECONDS,
    ]);
    setCookie(c, COOKIE_NAME, sid, { ...cookieOpts(config), maxAge: SESSION_SECONDS });
    return c.json(publicUser(u));
  });

  r.post('/logout', async (c) => {
    const sid = getCookie(c, COOKIE_NAME);
    if (sid) await pool.query('delete from sessions where id = $1', [sid]);
    deleteCookie(c, COOKIE_NAME, cookieOpts(config));
    return c.body(null, 204);
  });

  r.get('/me', requireUser, (c) => c.json(c.get('user')));
  return r;
}
