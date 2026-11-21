import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../api.js'
import { formatRupiah, formatTanggal } from '../format.js'
import { clearCache } from '../dashboard/cache.js'
import { CATEGORY_LABEL } from '../dashboard/periods.js'
import TransactionForm from '../dashboard/TransactionForm.jsx'

// Admin-only: transactions linked to one order (e.g. fee tim, tools bought for it).
export default function OrderExpenses({ orderId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    let active = true
    api(`/api/orders/${orderId}/transactions`)
      .then((r) => active && setRows(r))
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [orderId])

  useEffect(() => load(), [load])

  const total = (rows || []).filter((r) => r.type === 'expense').reduce((a, r) => a + (Number(r.amount) || 0), 0)

  return (
    <section className="mt-5 rounded-xl bg-white px-5 py-4 shadow-sm" aria-label="Transaksi terkait">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-bold text-gray-900">Transaksi terkait</h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus size={15} aria-hidden="true" />
            Tambah pengeluaran
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-3">
          <TransactionForm
            orderId={Number(orderId)}
            defaultType="expense"
            defaultCategory="fee_tim"
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false)
              clearCache()
              load()
            }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {rows && rows.length === 0 && <p className="mt-2 text-sm text-gray-500">Belum ada transaksi untuk order ini.</p>}
      {rows && rows.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{r.note || CATEGORY_LABEL[r.category]}</span>
                  <span className="text-xs text-gray-500">
                    {formatTanggal(r.date)} · {CATEGORY_LABEL[r.category] || r.category}
                  </span>
                </span>
                <span className={`whitespace-nowrap font-semibold ${r.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {r.type === 'income' ? '+' : '−'}
                  {formatRupiah(Number(r.amount) || 0)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-right text-sm text-gray-600">
            Total pengeluaran: <span className="font-semibold text-gray-900">{formatRupiah(total)}</span>
          </p>
        </>
      )}
    </section>
  )
}
