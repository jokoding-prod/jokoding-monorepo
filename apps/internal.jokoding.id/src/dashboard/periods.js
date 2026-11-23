import { todayLocal } from '../format.js'

export const PERIODS = [
  { id: '1', label: '1 Bulan', months: 1 },
  { id: '3', label: '3 Bulan', months: 3 },
  { id: '6', label: '6 Bulan', months: 6 },
  { id: 'all', label: 'Semua', months: null }
]

// Calendar months ending in the current one: from = first day `months-1` months back, to = today.
export function periodRange(id, today = todayLocal()) {
  const p = PERIODS.find((x) => x.id === id)
  if (!p || !p.months) return { from: null, to: null }
  const [y, m] = today.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - (p.months - 1), 1))
  return { from: d.toISOString().slice(0, 10), to: today }
}

export function rangeQuery({ from, to }) {
  return from && to ? `from=${from}&to=${to}` : ''
}

export const CATEGORY_LABEL = {
  order: 'Order',
  alat: 'Alat',
  domain_hosting: 'Domain & hosting',
  ads: 'Iklan (ads)',
  fee_tim: 'Fee tim',
  lainnya: 'Lainnya'
}

export const CATEGORIES = {
  expense: ['alat', 'domain_hosting', 'ads', 'fee_tim', 'lainnya'],
  income: ['lainnya']
}
