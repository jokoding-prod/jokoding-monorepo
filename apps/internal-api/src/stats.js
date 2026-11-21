import { Hono } from 'hono';
import { requireUser, requireAdmin } from './auth.js';
import { ParamError, paramErrors, rangeParams, pageParams, monthsParam, enumParam } from './params.js';

const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// Sums for one inclusive period; null bounds mean unbounded. Member: own orders only, no transactions.
async function periodStats(pool, user, from, to) {
  const params = [from, to];
  const range = (col) => `($1::date is null or ${col} >= $1) and ($2::date is null or ${col} <= $2)`;
  if (user.role !== 'admin') {
    params.push(user.id);
    const { rows } = await pool.query(
      `select count(*)::int as orders, coalesce(sum(price), 0)::bigint as gross
         from orders o where ${range('o.received_at')} and (o.assignee_id = $3 or o.created_by = $3)`,
      params,
    );
    return rows[0];
  }
  const { rows } = await pool.query(
    `select o.orders, o.gross + t.income as gross, t.expense_ops, t.fee_tim
       from (select count(*)::int as orders, coalesce(sum(price), 0)::bigint as gross
               from orders where ${range('received_at')}) o,
            (select coalesce(sum(amount) filter (where type = 'income'), 0)::bigint as income,
                    coalesce(sum(amount) filter (where type = 'expense' and category <> 'fee_tim'), 0)::bigint as expense_ops,
                    coalesce(sum(amount) filter (where type = 'expense' and category = 'fee_tim'), 0)::bigint as fee_tim
               from transactions where ${range('date')}) t`,
    params,
  );
  const r = rows[0];
  const gross = Number(r.gross);
  const net = gross - r.expense_ops;
  return { orders: r.orders, gross, net, profit: net - r.fee_tim };
}

const zero = (s) => Object.fromEntries(Object.keys(s).map((k) => [k, 0]));

export function statsRoutes() {
  const r = new Hono();
  r.use('*', requireUser);
  r.onError(paramErrors);

  // Both bounds or neither ("Semua"; prev is then all zeros).
  r.get('/', async (c) => {
    const { from, to } = rangeParams(c);
    if (!from !== !to) throw new ParamError('from dan to harus diisi bersama');
    const pool = c.get('pool');
    const user = c.get('user');
    const cur = await periodStats(pool, user, from, to);
    let prev;
    if (from) {
      const len = (Date.parse(to) - Date.parse(from)) / DAY + 1;
      prev = await periodStats(pool, user, addDays(from, -len), addDays(from, -1));
    } else prev = zero(cur);
    return c.json({ ...cur, prev });
  });

  r.get('/monthly', requireAdmin, async (c) => {
    const months = monthsParam(c);
    const { rows } = await c.get('pool').query(
      `with m as (
         select generate_series(
           date_trunc('month', now() at time zone 'Asia/Jakarta') - ($1::int - 1) * interval '1 month',
           date_trunc('month', now() at time zone 'Asia/Jakarta'),
           interval '1 month')::date as start)
       select to_char(m.start, 'YYYY-MM') as month,
              (coalesce((select sum(price) from orders
                          where received_at >= m.start and received_at < m.start + interval '1 month'), 0)
               + coalesce((select sum(amount) from transactions where type = 'income'
                          and date >= m.start and date < m.start + interval '1 month'), 0))::bigint as income,
              coalesce((select sum(amount) from transactions where type = 'expense'
                          and date >= m.start and date < m.start + interval '1 month'), 0)::bigint as expense
         from m order by m.start`,
      [months],
    );
    return c.json(rows);
  });

  return r;
}

const LEDGER_SORTS = { date_desc: 'desc', date_asc: 'asc' };

export function ledgerRoutes() {
  const r = new Hono();
  r.use('*', requireUser, requireAdmin);
  r.onError(paramErrors);

  r.get('/', async (c) => {
    const dir = LEDGER_SORTS[enumParam(c.req.query('sort'), Object.keys(LEDGER_SORTS), 'sort')];
    const { from, to } = rangeParams(c);
    const { limit, offset } = pageParams(c);
    const range = (col) => `($1::date is null or ${col} >= $1) and ($2::date is null or ${col} <= $2)`;
    const union = `
      select 'order' as kind, id, received_at as date, 'income' as type, 'order' as category, price as amount,
             project_name || ' — ' || client_name as label, id as order_id
        from orders where ${range('received_at')}
      union all
      select 'transaction', id, date, type, category, amount, note, order_id
        from transactions where ${range('date')}`;
    const pool = c.get('pool');
    const total = (await pool.query(`select count(*)::int as n from (${union}) u`, [from, to])).rows[0].n;
    const { rows } = await pool.query(
      `select * from (${union}) u order by date ${dir}, kind ${dir}, id ${dir} limit $3 offset $4`,
      [from, to, limit, offset],
    );
    return c.json({
      rows: rows.map((x) => ({
        kind: x.kind, id: x.id, date: x.date, type: x.type, category: x.category,
        amount: x.amount, label: x.label, orderId: x.order_id,
      })),
      total,
    });
  });

  return r;
}
