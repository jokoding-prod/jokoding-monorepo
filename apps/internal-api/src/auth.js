import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { verifyPassword, hashPassword } from './password.js';

export const COOKIE_NAME = 'jki_session';
const SESSION_SECONDS = 30 * 24 * 3600;
const MAX_FAILS = 10;
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

export function clientIp(c) {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return c.env?.incoming?.socket?.remoteAddress || 'unknown';
}

function createLimiter() {
  const fails = new Map(); // key -> { count, resetAt }
  const live = (key) => {
    const e = fails.get(key);
    if (e && e.resetAt <= Date.now()) {
      fails.delete(key);
      return null;
    }
    return e || null;
  };
  return {
    blocked: (key) => (live(key)?.count || 0) >= MAX_FAILS,
    fail(key) {
      const e = live(key);
      if (e) e.count++;
      else fails.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    },
    reset: (key) => fails.delete(key),
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
    if (limiter.blocked(key)) return c.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429);

    const { rows } = await pool.query(
      'select id, name, username, role, password_hash, active from users where username = $1',
      [username],
    );
    const u = rows[0];
    const ok = await verifyPassword(password, u ? u.password_hash : await DUMMY_HASH);
    if (!u || !u.active || !ok) {
      limiter.fail(key);
      return c.json({ error: 'Username atau password salah' }, 401);
    }
    limiter.reset(key);
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
