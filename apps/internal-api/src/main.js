import { serve } from '@hono/node-server';
import { createPool, migrate } from './db.js';
import { createApp } from './app.js';

const env = process.env;
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const config = {
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
  cookieDomain: env.COOKIE_DOMAIN || null,
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : env.NODE_ENV === 'production',
};
const port = Number(env.PORT || 3300);
const hostname = env.HOST || '127.0.0.1';

const pool = createPool(env.DATABASE_URL);
const applied = await migrate(pool);
if (applied.length) console.log('migrations applied:', applied.join(', '));

const app = createApp({ pool, config });
serve({ fetch: app.fetch, port, hostname }, (i) => console.log(`internal-api on http://${hostname}:${i.port}`));
