import { useState } from 'react'
import { api } from '../api.js'
import { todayLocal } from '../format.js'
import { CATEGORIES, CATEGORY_LABEL } from './periods.js'

const input =
  'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30'
const label = 'block text-sm font-medium text-gray-700'

export default function TransactionForm({ orderId = null, defaultType = 'expense', defaultCategory, onSaved, onCancel }) {
  const [date, setDate] = useState(todayLocal())
  const [type, setType] = useState(defaultType)
  const [category, setCategory] = useState(defaultCategory || CATEGORIES[defaultType][0])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function changeType(t) {
    setType(t)
    if (!CATEGORIES[t].includes(category)) setCategory(CATEGORIES[t][0])
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const n = Number(amount.replace(/\D/g, ''))
    if (!Number.isSafeInteger(n) || n <= 0) return setError('Jumlah harus angka bulat > 0')
    const body = { date, type, category, amount: n, note: note.trim() }
    if (orderId) body.orderId = orderId
    setSaving(true)
    try {
      const row = await api('/api/transactions', { method: 'POST', body })
      onSaved?.(row)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label="Form transaksi">
      <div>
        <label className={label} htmlFor="tx-date">Tanggal</label>
        <input id="tx-date" type="date" required className={input} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="tx-type">Jenis</label>
        <select id="tx-type" className={input} value={type} onChange={(e) => changeType(e.target.value)}>
          <option value="income">Pemasukan</option>
          <option value="expense">Pengeluaran</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="tx-category">Kategori</label>
        <select id="tx-category" className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES[type].map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="tx-amount">Jumlah (Rp)</label>
        <input
          id="tx-amount"
          inputMode="numeric"
          required
          className={input}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="150000"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="tx-note">Catatan</label>
        <input id="tx-note" className={input} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Batal
          </button>
        )}
      </div>
    </form>
  )
}
