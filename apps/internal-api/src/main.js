import { serve } from '@hono/node-server';
import { createPool, migrate } from './db.js';
import { createApp } from './app.js';

const env = process.env;
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');

function parseBool(value, fallback) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(v)) return true;
  if (['false', '0', 'no'].includes(v)) return false;
  return fallback;
}

const config = {
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
  cookieDomain: env.COOKIE_DOMAIN || null,
  secureCookies: parseBool(env.SECURE_COOKIES, env.NODE_ENV === 'production'),
};
const port = Number(env.PORT || 3300);
const hostname = env.HOST || '127.0.0.1';

const pool = createPool(env.DATABASE_URL);
const applied = await migrate(pool);
if (applied.length) console.log('migrations applied:', applied.join(', '));

const app = createApp({ pool, config });
serve({ fetch: app.fetch, port, hostname }, (i) => console.log(`internal-api on http://${hostname}:${i.port}`));
