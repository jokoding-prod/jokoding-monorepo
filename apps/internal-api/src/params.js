// Query-string parsing shared by list/stats endpoints. Throws ParamError -> 400.
export class ParamError extends Error {}

export function isoDate(v, field) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ParamError(`${field} harus YYYY-MM-DD`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new ParamError(`${field} tidak valid`);
  return v;
}

function intParam(v, field, { def, min, max }) {
  if (v === undefined || v === '') return def;
  if (!/^\d{1,6}$/.test(v)) throw new ParamError(`${field} tidak valid`);
  const n = Number(v);
  if (n < min || n > max) throw new ParamError(`${field} harus ${min}..${max}`);
  return n;
}

export const pageParams = (c) => {
  const limit = intParam(c.req.query('limit'), 'limit', { def: 20, min: 1, max: 100 });
  const page = intParam(c.req.query('page'), 'page', { def: 1, min: 1, max: 999999 });
  return { limit, offset: (page - 1) * limit };
};

export const monthsParam = (c) => intParam(c.req.query('months'), 'months', { def: 12, min: 1, max: 36 });

// Optional inclusive range; each bound independent. Returns { from, to } with nulls when absent.
export function rangeParams(c) {
  const f = c.req.query('from');
  const t = c.req.query('to');
  const from = f ? isoDate(f, 'from') : null;
  const to = t ? isoDate(t, 'to') : null;
  if (from && to && from > to) throw new ParamError('from harus ≤ to');
  return { from, to };
}

export function enumParam(v, list, field) {
  if (v === undefined || v === '') return list[0];
  if (!list.includes(v)) throw new ParamError(`${field} tidak valid`);
  return v;
}

export const paramErrors = (err, c) => {
  if (err instanceof ParamError) return c.json({ error: err.message }, 400);
  throw err;
};
