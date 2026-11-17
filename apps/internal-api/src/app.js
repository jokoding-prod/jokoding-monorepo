import { Hono } from 'hono';
import { cors } from 'hono/cors';

export function createApp({ pool, config }) {
  const app = new Hono();
  app.use('*', cors({ origin: config.corsOrigin, credentials: true }));
  app.get('/api/health', (c) => c.json({ ok: true }));
  return app;
}
