import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { formatRupiah, formatTanggal } from '../format.js'
import { CATEGORY_LABEL } from './periods.js'

export function Pager({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (pages <= 1) return null
  const b = 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40'
  return (
    <nav aria-label="Halaman" className="flex items-center justify-between gap-2 pt-3 text-sm text-gray-600">
      <button type="button" className={b} disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
      <span>Halaman {page} dari {pages}</span>
      <button type="button" className={b} disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
    </nav>
  )
}

export default function LedgerList({ rows, onDelete }) {
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-gray-500">Belum ada transaksi di periode ini.</p>
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((r) => {
        const income = r.type === 'income'
        const Icon = income ? ArrowUp : ArrowDown
        const label = r.label || CATEGORY_LABEL[r.category] || r.category
        return (
          <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 py-2.5" data-testid="ledger-row">
            <span
              data-type={r.type}
              aria-label={income ? 'Pemasukan' : 'Pengeluaran'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                income ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {r.kind === 'order' ? (
                  <Link to={`/order/${r.orderId}`} className="hover:underline">{label}</Link>
                ) : (
                  label
                )}
              </p>
              <p className="text-xs text-gray-500">
                {formatTanggal(r.date)} · {CATEGORY_LABEL[r.category] || r.category}
              </p>
            </div>
            <span className={`whitespace-nowrap text-sm font-semibold ${income ? 'text-emerald-700' : 'text-red-600'}`}>
              {income ? '+' : '−'}
              {formatRupiah(Number(r.amount) || 0)}
            </span>
            {r.kind === 'transaction' && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(r)}
                aria-label={`Hapus transaksi ${label}`}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
