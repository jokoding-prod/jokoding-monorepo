// Admin CLI. Usage (DATABASE_URL required):
//   node src/cli.js create-admin <username> <name>
//   node src/cli.js add-user <username> <name>
//   node src/cli.js set-bank <slot 1|2> <bank> <number> <holder> [--default]
//   node src/cli.js deactivate <username>
// Password is prompted without echo. For scripts/tests set INTERNAL_PASSWORD to skip the prompt.
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createPool, migrate } from './db.js';
import { hashPassword } from './password.js';

const USAGE = {
  'create-admin': 'create-admin <username> <name>',
  'add-user': 'add-user <username> <name>',
  'set-bank': 'set-bank <slot 1|2> <bank> <number> <holder> [--default]',
  deactivate: 'deactivate <username>',
};

function usage(cmd) {
  return new Error(`Usage: node src/cli.js ${USAGE[cmd]}`);
}

async function insertUser(pool, cmd, role, args, opts) {
  const [username, name] = args;
  if (!username || !name || args.length !== 2) throw usage(cmd);
  const password = opts.password ?? process.env.INTERNAL_PASSWORD ?? (await promptHidden('Password: '));
  if (!password) throw new Error('Password tidak boleh kosong');
  try {
    await pool.query('insert into users(name, username, password_hash, role) values($1,$2,$3,$4)', [
      name,
      username,
      await hashPassword(password),
      role,
    ]);
  } catch (err) {
    if (err.code === '23505') throw new Error(`Username "${username}" sudah ada`);
    throw err;
  }
  return `${role} "${username}" dibuat`;
}

export const commands = {
  'create-admin': (pool, args, opts = {}) => insertUser(pool, 'create-admin', 'admin', args, opts),
  'add-user': (pool, args, opts = {}) => insertUser(pool, 'add-user', 'member', args, opts),

  async 'set-bank'(pool, args) {
    const isDefault = args.includes('--default');
    const pos = args.filter((a) => a !== '--default');
    const [slotRaw, bank, number, holder] = pos;
    if (pos.length !== 4) throw usage('set-bank');
    const slot = Number(slotRaw);
    if (slot !== 1 && slot !== 2) throw new Error('slot harus 1 atau 2');
    const client = await pool.connect();
    try {
      await client.query('begin');
      if (isDefault) await client.query('update bank_accounts set is_default = false');
      await client.query(
        `insert into bank_accounts(slot, bank_name, account_number, account_holder, is_default)
         values($1,$2,$3,$4,$5)
         on conflict (slot) do update set bank_name = excluded.bank_name,
           account_number = excluded.account_number, account_holder = excluded.account_holder,
           is_default = case when $5 then true else bank_accounts.is_default end`,
        [slot, bank, number, holder, isDefault],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return `bank slot ${slot} disimpan${isDefault ? ' (default)' : ''}`;
  },

  async deactivate(pool, args) {
    if (args.length !== 1) throw usage('deactivate');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query('update users set active = false where username = $1 returning id', [args[0]]);
      if (!rows[0]) throw new Error(`User "${args[0]}" tidak ditemukan`);
      await client.query('delete from sessions where user_id = $1', [rows[0].id]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return `user "${args[0]}" dinonaktifkan`;
  },
};

function promptHidden(question) {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!commands[cmd]) {
    console.error(`Usage: node src/cli.js <${Object.keys(commands).join('|')}> ...`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = createPool(process.env.DATABASE_URL);
  let code = 0;
  try {
    await migrate(pool);
    console.log(await commands[cmd](pool, args));
  } catch (err) {
    console.error(err.message);
    code = 1;
  } finally {
    await pool.end();
  }
  process.exit(code);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
