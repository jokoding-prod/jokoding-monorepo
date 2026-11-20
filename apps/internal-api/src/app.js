import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth.js';
import { ordersRoutes, usersRoutes } from './orders.js';
import { membersRoutes } from './settings.js';
import { banksRoutes, invoiceDraftRoutes, invoicesRoutes } from './invoices.js';

export function createApp({ pool, config }) {
  const app = new Hono();
  app.use('*', cors({ origin: config.corsOrigin, credentials: true }));
  // CSRF: sibling *.jokoding.id sites are same-site, so the Lax cookie is sent; a text/plain POST skips preflight.
  app.use('/api/*', async (c, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return next();
    const origin = c.req.header('origin');
    if (origin !== undefined && origin !== config.corsOrigin) return c.json({ error: 'forbidden' }, 403);
    const type = c.req.header('content-type');
    const len = c.req.header('content-length');
    const hasBody = (len !== undefined && len !== '0') || c.req.header('transfer-encoding') !== undefined;
    // No body (logout, DELETE) needs no content type; anything that declares or carries a body must be JSON.
    const needsJson = c.req.method !== 'DELETE' && (type !== undefined || hasBody);
    if (needsJson && !/^application\/json(\s*;|$)/i.test(type || '')) {
      return c.json({ error: 'Content-Type harus application/json' }, 415);
    }
    return next();
  });
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
  app.route('/api/users', membersRoutes());
  return app;
}
