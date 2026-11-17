import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createPool, migrate } from '../src/db.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const skipReason = TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL is not set (e.g. postgres://user@localhost:5432/internal_test)';

export async function freshDb() {
  if (!TEST_DATABASE_URL) throw new Error(skipReason);
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(TEST_DATABASE_URL, { options: `-c search_path=${schema}` });
  await migrate(pool);
  return {
    pool,
    async cleanup() {
      await pool.end();
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`DROP SCHEMA ${schema} CASCADE`);
      await c.end();
    },
  };
}

export const login = (app, username, password, ip = '1.1.1.1', extra = {}) =>
  app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...extra },
    body: JSON.stringify({ username, password }),
  });

export const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];
