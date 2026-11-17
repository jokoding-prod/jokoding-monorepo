import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '../api.js'
import { PAYMENT_STATUS, WORK_STATUS, formatRupiah, formatTanggal } from '../format.js'
import StatusBadge from './StatusBadge.jsx'

export default function OrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api('/api/orders')
      .then((d) => active && setOrders(d))
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [])

  const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500'

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Order</h1>
        <Link
          to="/order/new"
          className="flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          <Plus size={16} aria-hidden="true" />
          Tambah order
        </Link>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!orders && !error && <p className="mt-4 text-gray-600">Memuat...</p>}
      {orders && orders.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
          Belum ada order.
        </p>
      )}
      {orders && orders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Tanggal masuk</th>
                <th className={th}>Nama project</th>
                <th className={th}>Nama klien</th>
                <th className={th}>Deadline</th>
                <th className={th}>Harga</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/order/${o.id}`)}
                  className="cursor-pointer hover:bg-green-50"
                >
                  <td className="whitespace-nowrap px-3 py-2">{formatTanggal(o.receivedAt)}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    <Link
                      to={`/order/${o.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline focus:underline"
                    >
                      {o.projectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{o.clientName}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatTanggal(o.deadline)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatRupiah(o.price)}</td>
                  <td className="space-x-1 whitespace-nowrap px-3 py-2">
                    <StatusBadge value={o.workStatus} label={WORK_STATUS[o.workStatus]} />
                    <StatusBadge value={o.paymentStatus} label={PAYMENT_STATUS[o.paymentStatus]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
