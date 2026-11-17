import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, skipReason } from './helpers.js';
import { commands } from '../src/cli.js';
import { verifyPassword } from '../src/password.js';

test('create-admin / add-user hash the password and set role', { skip: skipReason }, async () => {
  const { pool, cleanup } = await freshDb();
  try {
    await commands['create-admin'](pool, ['boss', 'The Boss'], { password: 'pw1' });
    await commands['add-user'](pool, ['joko', 'Joko'], { password: 'pw2' });
    const { rows } = await pool.query('select * from users order by id');
    assert.deepEqual(rows.map((r) => [r.username, r.name, r.role, r.active]), [
      ['boss', 'The Boss', 'admin', true],
      ['joko', 'Joko', 'member', true],
    ]);
    assert.equal(await verifyPassword('pw1', rows[0].password_hash), true);
    await assert.rejects(commands['add-user'](pool, ['joko', 'Dup'], { password: 'x' }), /sudah ada|exists/i);
    await assert.rejects(commands['add-user'](pool, ['x'], { password: 'x' }), /usage/i);
    await assert.rejects(commands['add-user'](pool, ['y', 'Y'], { password: '' }), /password/i);
  } finally {
    await cleanup();
  }
});

test('set-bank upserts by slot; --default is exclusive', { skip: skipReason }, async () => {
  const { pool, cleanup } = await freshDb();
  try {
    await commands['set-bank'](pool, ['1', 'BCA', '111', 'Joko', '--default']);
    await commands['set-bank'](pool, ['2', 'BNI', '222', 'Joko']);
    await commands['set-bank'](pool, ['1', 'BCA', '999', 'Joko']);
    let { rows } = await pool.query('select * from bank_accounts order by slot');
    assert.deepEqual(rows.map((r) => [r.slot, r.account_number, r.is_default]), [
      [1, '999', true],
      [2, '222', false],
    ]);
    await commands['set-bank'](pool, ['2', 'BNI', '222', 'Joko', '--default']);
    ({ rows } = await pool.query('select slot,is_default from bank_accounts order by slot'));
    assert.deepEqual(rows.map((r) => r.is_default), [false, true]);
    await assert.rejects(commands['set-bank'](pool, ['3', 'B', '1', 'H']), /slot/i);
  } finally {
    await cleanup();
  }
});

test('deactivate sets inactive and deletes sessions', { skip: skipReason }, async () => {
  const { pool, cleanup } = await freshDb();
  try {
    await commands['add-user'](pool, ['joko', 'Joko'], { password: 'p' });
    const { rows } = await pool.query('select id from users');
    await pool.query(`insert into sessions(id,user_id,expires_at) values('s1',$1, now() + interval '1 day')`, [rows[0].id]);
    await commands['deactivate'](pool, ['joko']);
    assert.equal((await pool.query('select active from users')).rows[0].active, false);
    assert.equal((await pool.query('select 1 from sessions')).rowCount, 0);
    await assert.rejects(commands['deactivate'](pool, ['nobody']), /tidak ditemukan|not found/i);
  } finally {
    await cleanup();
  }
});
