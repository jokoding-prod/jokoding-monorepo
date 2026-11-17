import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { formatRupiah, formatTanggal } from '../format.js'

export default function InvoicesPage() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api('/api/invoices').then(setRows).catch((err) => setError(err.message))
  }, [])

  if (error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    )
  if (!rows) return <p className="text-gray-600">Memuat...</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Invoice</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">Belum ada invoice. Buat invoice dari halaman detail order.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Nomor</th>
                <th className="px-3 py-2 font-medium">Klien</th>
                <th className="px-3 py-2 font-medium">Tanggal</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => navigate(`/invoice/${r.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/invoice/${r.id}`)}
                  className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{r.number}</td>
                  <td className="px-3 py-2">{r.client || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatTanggal(r.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatRupiah(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
