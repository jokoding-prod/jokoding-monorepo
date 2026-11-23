import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { todayLocal } from '../format.js'

const field =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 disabled:bg-gray-100'
const label = 'block text-sm font-medium text-gray-700'

function Form({ order }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user.role === 'admin'
  const originalAssignee = order?.assignee?.id ?? null

  const [f, setF] = useState({
    projectName: order?.projectName ?? '',
    clientName: order?.clientName ?? '',
    clientPhone: order?.clientPhone ?? '',
    receivedAt: order?.receivedAt ?? todayLocal(),
    deadline: order?.deadline ?? '',
    price: order ? String(order.price) : '',
    scopeOfWork: order?.scopeOfWork ?? ''
  })
  const [self, setSelf] = useState(isAdmin && originalAssignee === user.id)
  const [assignee, setAssignee] = useState(
    originalAssignee && !(isAdmin && originalAssignee === user.id) ? String(originalAssignee) : ''
  )
  const [touched, setTouched] = useState(false)
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api('/api/users/assignable')
      .then((u) => active && setUsers(u.filter((x) => x.role !== 'admin')))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const priceDigits = f.price.replace(/\D/g, '')
  const asg = order?.assignee
  const missingAssignee =
    asg && !(isAdmin && asg.id === user.id) && !users.some((u) => u.id === asg.id) ? asg : null

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const body = {
      projectName: f.projectName.trim(),
      clientName: f.clientName.trim(),
      clientPhone: f.clientPhone.trim(),
      receivedAt: f.receivedAt,
      deadline: f.deadline || null,
      price: priceDigits === '' ? '' : Number(priceDigits),
      scopeOfWork: f.scopeOfWork
    }
    if (!order || touched) {
      body.assigneeId = self ? user.id : assignee ? Number(assignee) : null
    }
    try {
      const saved = order
        ? await api(`/api/orders/${order.id}`, { method: 'PATCH', body })
        : await api('/api/orders', { method: 'POST', body })
      navigate(`/order/${saved.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900">{order ? 'Edit order' : 'Tambah order'}</h2>
      <div>
        <label htmlFor="projectName" className={label}>Nama project</label>
        <input id="projectName" className={field} value={f.projectName} onChange={set('projectName')} required />
      </div>
      <div>
        <label htmlFor="clientName" className={label}>Nama klien</label>
        <input id="clientName" className={field} value={f.clientName} onChange={set('clientName')} required />
      </div>
      <div>
        <label htmlFor="clientPhone" className={label}>No. HP klien</label>
        <input id="clientPhone" className={field} value={f.clientPhone} onChange={set('clientPhone')} inputMode="tel" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="receivedAt" className={label}>Tanggal masuk</label>
          <input id="receivedAt" type="date" className={field} value={f.receivedAt} onChange={set('receivedAt')} required />
        </div>
        <div>
          <label htmlFor="deadline" className={label}>Deadline</label>
          <input id="deadline" type="date" className={field} value={f.deadline} onChange={set('deadline')} />
        </div>
      </div>
      <div>
        <label htmlFor="price" className={label}>Harga</label>
        <input
          id="price"
          className={field}
          inputMode="numeric"
          value={priceDigits === '' ? '' : new Intl.NumberFormat('id-ID').format(Number(priceDigits))}
          onChange={(e) => setF((p) => ({ ...p, price: e.target.value.replace(/\D/g, '') }))}
          placeholder="0"
          required
        />
      </div>
      <div>
        <label htmlFor="scopeOfWork" className={label}>Scope of work</label>
        <textarea id="scopeOfWork" rows={5} className={field} value={f.scopeOfWork} onChange={set('scopeOfWork')} />
      </div>
      <div>
        <label htmlFor="assignee" className={label}>Dikerjakan oleh</label>
        <select
          id="assignee"
          className={field}
          value={self ? '' : assignee}
          onChange={(e) => {
            setTouched(true)
            setAssignee(e.target.value)
          }}
          disabled={self}
        >
          <option value="">- Belum ditentukan -</option>
          {missingAssignee && (
            <option value={missingAssignee.id} disabled>
              {missingAssignee.active ? missingAssignee.name : `${missingAssignee.name} (nonaktif)`}
            </option>
          )}
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        {isAdmin && (
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={self}
              onChange={(e) => {
                setTouched(true)
                setSelf(e.target.checked)
              }}
            />
            Saya sendiri (admin)
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          Simpan
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          Batal
        </button>
      </div>
    </form>
  )
}

export default function OrderForm() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let active = true
    api(`/api/orders/${id}`)
      .then((o) => active && setOrder(o))
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [id])

  if (!id) return <Form />
  if (error) return <p role="alert" className="text-red-700">{error}</p>
  if (!order) return <p className="text-gray-600">Memuat...</p>
  return <Form order={order} />
}
