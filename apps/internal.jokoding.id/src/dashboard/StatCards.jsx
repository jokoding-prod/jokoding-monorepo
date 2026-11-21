import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { formatRupiah } from '../format.js'

// Percent change vs previous period; null when there is nothing to compare against.
export function change(cur, prev) {
  const c = Number(cur) || 0
  const p = Number(prev) || 0
  if (p === 0) return null
  return ((c - p) / Math.abs(p)) * 100
}

export function ChangeBadge({ value }) {
  if (value === null || !Number.isFinite(value)) return null
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const text = `${up ? '+' : '−'}${Math.abs(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
  return (
    <span
      data-testid="change-badge"
      data-trend={up ? 'up' : 'down'}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        up ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
      }`}
      title="Dibanding periode sebelumnya"
    >
      <Icon size={12} aria-hidden="true" />
      {text}
    </span>
  )
}

export default function StatCards({ items }) {
  return (
    <ul className={`grid grid-cols-2 gap-3 ${items.length > 2 ? 'lg:grid-cols-4' : ''}`}>
      {items.map((it) => {
        const v = Number(it.value) || 0
        return (
          <li
            key={it.label}
            className="min-w-0 rounded-2xl border border-white/20 bg-white/15 p-3 text-white backdrop-blur-sm sm:p-4"
          >
            <p className="text-xs font-medium text-white/80">{it.label}</p>
            <p className="mt-1 truncate font-display text-lg font-bold sm:text-2xl" data-testid={`stat-${it.id}`}>
              {it.money ? formatRupiah(v) : v.toLocaleString('id-ID')}
            </p>
            <div className="mt-1.5 h-5">
              <ChangeBadge value={change(v, it.prev)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
