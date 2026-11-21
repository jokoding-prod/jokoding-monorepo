import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { api } from '../api.js'
import { formatRupiah, formatTanggal } from '../format.js'
import { Pager } from '../dashboard/LedgerList.jsx'

const LIMIT = 20

export default function InvoicesPage() {
  const [search, setSearch] = useSearchParams()
  const page = Math.max(1, Number(search.get('page')) || 1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    setError('')
    api(`/api/invoices?page=${page}&limit=${LIMIT}`)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [page])

  if (error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    )
  if (!data) return <p className="text-gray-600">Memuat...</p>

  const { rows, total } = data
  return (
    <div className="space-y-4">
      <h2 className="sr-only">Invoice</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-600">Belum ada invoice. Buat invoice dari halaman detail order.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{total}</span> invoice
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200/70 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Nomor</th>
                  <th className="px-4 py-3 font-medium">Klien</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/invoice/${r.id}`)}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{r.number}</td>
                    <td className="px-4 py-3">{r.client || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatTanggal(r.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatRupiah(r.total)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <Link
                        to={`/invoice/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Lihat invoice ${r.number}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-600/30 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        <Eye size={14} aria-hidden="true" />
                        Lihat
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            total={total}
            limit={LIMIT}
            onPage={(n) => setSearch(n === 1 ? {} : { page: String(n) })}
          />
        </>
      )}
    </div>
  )
}
