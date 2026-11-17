import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

// DATE (OID 1082) stays a raw 'YYYY-MM-DD' string to avoid timezone shifts.
pg.types.setTypeParser(1082, (v) => v);
// BIGINT (OID 20) -> number (rupiah stays well below 2^53).
pg.types.setTypeParser(20, Number);

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function createPool(databaseUrl, opts = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl, ...opts });
  pool.on('error', (err) => console.error('pg pool error:', err));
  return pool;
}

const MIGRATION_LOCK_KEY = 727401; // arbitrary constant: serialises migrate() across instances

export async function migrate(pool) {
  const client = await pool.connect();
  let unlockFailed = null;
  try {
    // Session-level advisory lock on one connection, so two instances never migrate at once.
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await client.query(
        'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
      );
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
      const { rows } = await client.query('select name from schema_migrations');
      const done = new Set(rows.map((r) => r.name));
      const applied = [];
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        try {
          await client.query('begin');
          await client.query(sql);
          await client.query('insert into schema_migrations(name) values($1)', [file]);
          await client.query('commit');
          applied.push(file);
        } catch (err) {
          await client.query('rollback').catch(() => {});
          throw err;
        }
      }
      return applied;
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch((e) => {
        unlockFailed = e;
      });
    }
  } finally {
    // A failed unlock may leave the lock held: destroy the connection instead of pooling it.
    client.release(unlockFailed || undefined);
  }
}
