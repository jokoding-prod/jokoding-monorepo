import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth.js';
import { ordersRoutes, usersRoutes } from './orders.js';
import { banksRoutes, invoiceDraftRoutes, invoicesRoutes } from './invoices.js';

export function createApp({ pool, config }) {
  const app = new Hono();
  app.use('*', cors({ origin: config.corsOrigin, credentials: true }));
  app.use('*', async (c, next) => {
    c.set('pool', pool);
    await next();
  });
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/auth', authRoutes({ pool, config }));
  app.route('/api/orders', invoiceDraftRoutes());
  app.route('/api/orders', ordersRoutes());
  app.route('/api/banks', banksRoutes());
  app.route('/api/invoices', invoicesRoutes());
  app.route('/api/users', usersRoutes());
  return app;
}
