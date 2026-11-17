// Admin CLI. Usage (DATABASE_URL required):
//   node src/cli.js create-admin <username> <name>
//   node src/cli.js add-user <username> <name>
//   node src/cli.js set-bank <slot 1|2> <bank> <number> <holder> [--default]
//   node src/cli.js deactivate <username>
// Username: 3-32 chars [a-z0-9._-]; password min 8 chars, prompted without echo. For scripts/tests set INTERNAL_PASSWORD to skip the prompt.
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createPool, migrate } from './db.js';
import { checkUsername, createUser, findUserId, setActive, setBank } from './accounts.js';

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
  checkUsername(username);
  const password = opts.password ?? process.env.INTERNAL_PASSWORD ?? (await promptHidden('Password: '));
  await createUser(pool, { username, name, password, role });
  return `${role} "${username}" dibuat`;
}

export const commands = {
  'create-admin': (pool, args, opts = {}) => insertUser(pool, 'create-admin', 'admin', args, opts),
  'add-user': (pool, args, opts = {}) => insertUser(pool, 'add-user', 'member', args, opts),

  async 'set-bank'(pool, args) {
    const isDefault = args.includes('--default');
    const pos = args.filter((a) => a !== '--default');
    const [slotRaw, bankName, accountNumber, accountHolder] = pos;
    if (pos.length !== 4) throw usage('set-bank');
    const slot = Number(slotRaw);
    await setBank(pool, { slot, bankName, accountNumber, accountHolder, isDefault });
    return `bank slot ${slot} disimpan${isDefault ? ' (default)' : ''}`;
  },

  async deactivate(pool, args) {
    if (args.length !== 1) throw usage('deactivate');
    await setActive(pool, await findUserId(pool, args[0]), false);
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
