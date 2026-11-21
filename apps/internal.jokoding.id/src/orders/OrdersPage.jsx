import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react'
import { api } from '../api.js'
import { PAYMENT_STATUS, WORK_STATUS, formatRupiah, formatTanggal } from '../format.js'
import { Pager } from '../dashboard/LedgerList.jsx'
import { PERIODS, periodRange, rangeQuery } from '../dashboard/periods.js'
import StatusBadge from './StatusBadge.jsx'

const LIMIT = 20
const SORTS = ['received_desc', 'received_asc', 'deadline_asc', 'deadline_desc']

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.startsWith(field)
  const asc = sort.endsWith('_asc')
  const Icon = !active ? ArrowUpDown : asc ? ArrowUp : ArrowDown
  return (
    <th
      aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
    >
      <button
        type="button"
        onClick={() => onSort(active ? `${field}_${asc ? 'desc' : 'asc'}` : `${field}_${field === 'received' ? 'desc' : 'asc'}`)}
        className={`inline-flex items-center gap-1 uppercase hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    </th>
  )
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'received_desc'
  const period = PERIODS.some((p) => p.id === params.get('periode')) ? params.get('periode') : 'all'
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const q = rangeQuery(periodRange(period))
  const path = `/api/orders?sort=${sort}&page=${page}&limit=${LIMIT}${q ? `&${q}` : ''}`

  useEffect(() => {
    let active = true
    setError('')
    api(path)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [path])

  function update(next) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500'
  const orders = data?.rows

  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sr-only">Order</h2>
        <div>
          <label htmlFor="order-period" className="sr-only">Periode</label>
          <select
            id="order-period"
            value={period}
            onChange={(e) => update({ periode: e.target.value === 'all' ? null : e.target.value, page: null })}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>{p.id === 'all' ? 'Semua periode' : p.label}</option>
            ))}
          </select>
        </div>
        <Link
          to="/order/new"
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
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
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-600">
          Belum ada order.
        </p>
      )}
      {orders && orders.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader label="Tanggal masuk" field="received" sort={sort} onSort={(s) => update({ sort: s, page: null })} />
                  <th className={th}>Nama project</th>
                  <th className={th}>Nama klien</th>
                  <SortHeader label="Deadline" field="deadline" sort={sort} onSort={(s) => update({ sort: s, page: null })} />
                  <th className={th}>Harga</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/order/${o.id}`)} className="cursor-pointer hover:bg-brand-50">
                    <td className="whitespace-nowrap px-3 py-2">{formatTanggal(o.receivedAt)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <Link to={`/order/${o.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline focus:underline">
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
          <Pager page={page} total={data.total} limit={LIMIT} onPage={(n) => update({ page: n === 1 ? null : String(n) })} />
        </>
      )}
    </div>
  )
}
