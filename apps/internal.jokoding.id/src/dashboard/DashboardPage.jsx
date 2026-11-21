import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Plus, RefreshCw, X } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { formatRupiah, formatTanggal, todayLocal, WORK_STATUS } from '../format.js'
import { clearCache, formatJam, useCachedApi } from './cache.js'
import LedgerList, { Pager } from './LedgerList.jsx'
import StatCards from './StatCards.jsx'
import TransactionForm from './TransactionForm.jsx'
import { PERIODS, periodRange, rangeQuery } from './periods.js'

const MonthlyChart = lazy(() => import('./MonthlyChart.jsx'))
const LEDGER_LIMIT = 10
const card = 'rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm sm:p-5'

function Banner({ user, period, onPeriod, children }) {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-500 p-4 text-white shadow-md sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/80">{today}</p>
          <h2 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Hey, {user.name} 👋</h2>
          <p className="mt-1 text-sm text-white/80">Ringkasan order dan keuangan Jokoding.</p>
        </div>
        <div role="group" aria-label="Periode" className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => onPeriod(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                period === p.id ? 'bg-white text-brand-800' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function CacheNote({ at, fromCache, onRefresh }) {
  if (!at) return null
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-white/80">
      {fromCache ? 'Data dari cache · ' : ''}diperbarui {formatJam(at)} ·
      <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
        <RefreshCw size={12} aria-hidden="true" />
        refresh
      </button>
    </p>
  )
}

function Deadlines({ scope, bust }) {
  const { data, error, loading } = useCachedApi('/api/orders?sort=deadline_desc&limit=100', scope, bust)
  const today = todayLocal()
  const rows = (data?.rows || [])
    .filter((o) => o.deadline && o.deadline >= today && o.workStatus !== 'selesai')
    .reverse()
    .slice(0, 5)
  return (
    <section className={card}>
      <h3 className="flex items-center gap-2 font-display font-bold text-gray-900">
        <CalendarClock size={18} aria-hidden="true" className="text-brand-600" />
        Deadline terdekat
      </h3>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {loading && !data && <p className="mt-3 text-sm text-gray-500">Memuat...</p>}
      {data && rows.length === 0 && <p className="mt-3 text-sm text-gray-500">Tidak ada deadline mendatang.</p>}
      <ul className="mt-2 divide-y divide-gray-100">
        {rows.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
            <Link to={`/order/${o.id}`} className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 hover:underline">{o.projectName}</p>
              <p className="truncate text-xs text-gray-500">{o.clientName} · {WORK_STATUS[o.workStatus]}</p>
            </Link>
            <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {formatTanggal(o.deadline)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Ledger({ scope, bust, q, onChanged, onAdd }) {
  const [sort, setSort] = useState('date_desc')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const path = `/api/ledger?${q ? `${q}&` : ''}sort=${sort}&page=${page}&limit=${LEDGER_LIMIT}`
  const { data, error: loadError, loading } = useCachedApi(path, scope, bust)

  async function remove(r) {
    if (!window.confirm('Hapus transaksi ini?')) return
    setError('')
    try {
      await api(`/api/transactions/${r.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-bold text-gray-900">Arus kas</h3>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="ledger-sort">Urutkan</label>
          <select
            id="ledger-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="date_desc">Terbaru</option>
            <option value="date_asc">Terlama</option>
          </select>
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={16} aria-hidden="true" />
            Tambah transaksi
          </button>
        </div>
      </div>
      {(error || loadError) && <p role="alert" className="mt-3 text-sm text-red-700">{error || loadError}</p>}
      {loading && !data && <p className="mt-3 text-sm text-gray-500">Memuat...</p>}
      {data && (
        <>
          <div className="mt-2">
            <LedgerList rows={data.rows} onDelete={remove} />
          </div>
          <Pager page={page} total={data.total} limit={LEDGER_LIMIT} onPage={setPage} />
        </>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const scope = String(user.id)
  const [period, setPeriod] = useState('1')
  const [bust, setBust] = useState(0)
  const [adding, setAdding] = useState(false)
  const q = rangeQuery(periodRange(period))
  const stats = useCachedApi(`/api/stats${q ? `?${q}` : ''}`, scope, bust)
  const monthly = useCachedApi(isAdmin ? '/api/stats/monthly?months=12' : null, scope, bust)

  function refreshAll() {
    clearCache()
    setBust((b) => b + 1)
  }

  const s = stats.data
  const prev = s?.prev || {}
  const items = s
    ? [
        { id: 'orders', label: 'Jumlah order', value: s.orders, prev: prev.orders },
        { id: 'gross', label: isAdmin ? 'Omset kotor' : 'Total harga', value: s.gross, prev: prev.gross, money: true },
        ...(isAdmin
          ? [
              { id: 'net', label: 'Omset bersih', value: s.net, prev: prev.net, money: true },
              { id: 'profit', label: 'Keuntungan', value: s.profit, prev: prev.profit, money: true }
            ]
          : [])
      ]
    : []

  return (
    <div className="space-y-5">
      <Banner user={user} period={period} onPeriod={setPeriod}>
        {stats.error && <p role="alert" className="rounded-lg bg-white/15 px-3 py-2 text-sm">{stats.error}</p>}
        {!s && !stats.error && <p className="text-sm text-white/80">Memuat...</p>}
        {s && <StatCards items={items} />}
        <CacheNote at={stats.at} fromCache={stats.fromCache} onRefresh={refreshAll} />
      </Banner>

      {isAdmin && adding && (
        <section className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display font-bold text-gray-900">Tambah transaksi</h3>
            <button type="button" onClick={() => setAdding(false)} aria-label="Tutup" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <TransactionForm
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false)
              refreshAll()
            }}
          />
        </section>
      )}

      <div className={isAdmin ? 'grid gap-5 lg:grid-cols-3' : ''}>
        {isAdmin && (
          <section className={`${card} lg:col-span-2`}>
            <h3 className="font-display font-bold text-gray-900">Pemasukan vs pengeluaran</h3>
            <p className="text-xs text-gray-500">12 bulan terakhir · total {formatRupiah((monthly.data || []).reduce((a, r) => a + (Number(r.income) || 0), 0))} masuk</p>
            {monthly.error && <p className="mt-3 text-sm text-red-700">{monthly.error}</p>}
            {monthly.data && (
              <Suspense fallback={<div className="h-64" />}>
                <MonthlyChart rows={monthly.data} />
              </Suspense>
            )}
          </section>
        )}
        <Deadlines scope={scope} bust={bust} />
      </div>

      {isAdmin && <Ledger key={q} scope={scope} bust={bust} q={q} onChanged={refreshAll} onAdd={() => setAdding(true)} />}
    </div>
  )
}
