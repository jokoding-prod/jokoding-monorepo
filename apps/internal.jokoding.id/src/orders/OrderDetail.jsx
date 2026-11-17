import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PAYMENT_STATUS, WORK_STATUS, formatRupiah, formatTanggal } from '../format.js'
import StatusBadge from './StatusBadge.jsx'

const btn = 'rounded-lg border px-3 py-2 text-sm font-medium'
const sel =
  'mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-500/40'

function Row({ label, children }) {
  return (
    <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">{children}</dd>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api(`/api/orders/${id}`)
      .then((o) => active && setOrder(o))
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [id])

  if (error && !order) return <p role="alert" className="text-red-700">{error}</p>
  if (!order) return <p className="text-gray-600">Memuat...</p>

  const isAdmin = user.role === 'admin'
  const canEdit = isAdmin || (order.createdBy.id === user.id && !order.invoice)

  async function patch(body) {
    setError('')
    try {
      setOrder(await api(`/api/orders/${id}`, { method: 'PATCH', body }))
    } catch (e) {
      setError(e.message)
    }
  }

  async function remove() {
    setError('')
    if (!window.confirm('Hapus order ini? Tindakan ini tidak bisa dibatalkan.')) return
    try {
      await api(`/api/orders/${id}`, { method: 'DELETE' })
      navigate('/order')
    } catch (e) {
      setError(e.message)
    }
  }

  const assignee = order.assignee
    ? order.assignee.active
      ? order.assignee.name
      : `${order.assignee.name} (nonaktif)`
    : '-'

  return (
    <div className="max-w-3xl">
      <Link to="/order" className="text-sm text-green-700 hover:underline">&larr; Semua order</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">{order.projectName}</h1>
        <div className="flex gap-2">
          {canEdit && (
            <Link to={`/order/${order.id}/edit`} className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-100`}>
              Edit
            </Link>
          )}
          {isAdmin && !order.invoice && (
            <button type="button" onClick={remove} className={`${btn} border-red-300 text-red-700 hover:bg-red-50`}>
              Hapus
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <dl className="mt-4 divide-y divide-gray-100 rounded-xl bg-white px-5 py-2 shadow-sm">
        <Row label="Tanggal masuk">{formatTanggal(order.receivedAt)}</Row>
        <Row label="Nama klien">{order.clientName}</Row>
        <Row label="No. HP klien">{order.clientPhone || '-'}</Row>
        <Row label="Deadline">{formatTanggal(order.deadline)}</Row>
        <Row label="Harga">{formatRupiah(order.price)}</Row>
        <Row label="Dikerjakan oleh">{assignee}</Row>
        <Row label="Dibuat oleh">{order.createdBy.name}</Row>
        <Row label="Scope of work">
          <p className="whitespace-pre-line">{order.scopeOfWork || '-'}</p>
        </Row>
        {isAdmin ? (
          <>
            <Row label="Status pengerjaan">
              <select
                aria-label="Status pengerjaan"
                className={sel}
                value={order.workStatus}
                onChange={(e) => patch({ workStatus: e.target.value })}
              >
                {Object.entries(WORK_STATUS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Row>
            <Row label="Status pembayaran">
              <select
                aria-label="Status pembayaran"
                className={sel}
                value={order.paymentStatus}
                onChange={(e) => patch({ paymentStatus: e.target.value })}
              >
                {Object.entries(PAYMENT_STATUS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Row>
          </>
        ) : (
          <Row label="Status">
            <span className="space-x-1">
              <StatusBadge value={order.workStatus} label={WORK_STATUS[order.workStatus]} />
              <StatusBadge value={order.paymentStatus} label={PAYMENT_STATUS[order.paymentStatus]} />
            </span>
          </Row>
        )}
        {isAdmin && (
          <Row label="Invoice">
            {order.invoice ? (
              <span className="flex flex-wrap items-center gap-3">
                <span>{order.invoice.number}</span>
                <Link to={`/invoice/${order.invoice.id}`} className="text-green-700 hover:underline">
                  Lihat invoice
                </Link>
              </span>
            ) : (
              <Link
                to={`/invoice/new?order=${order.id}`}
                className={`${btn} inline-block border-green-700 text-green-700 hover:bg-green-50`}
              >
                Buat invoice
              </Link>
            )}
          </Row>
        )}
      </dl>
    </div>
  )
}
