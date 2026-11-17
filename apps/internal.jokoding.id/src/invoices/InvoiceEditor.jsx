import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../api.js'
import InvoiceSheet from './InvoiceSheet.jsx'

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none'
const label = 'grid gap-1 text-sm font-medium text-gray-700'

function Field({ text, children, className = '' }) {
  return (
    <label className={`${label} ${className}`}>
      {text}
      {children}
    </label>
  )
}

export default function InvoiceEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const orderId = Number(params.get('order'))
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [number, setNumber] = useState('')
  const [autoNumber, setAutoNumber] = useState(true)
  const [data, setData] = useState(null)
  const [banks, setBanks] = useState([])
  const [slot, setSlot] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    const source = isEdit
      ? api(`/api/invoices/${id}`).then((inv) => ({ number: inv.number, draft: inv.data }))
      : api(`/api/orders/${orderId}/invoice-draft`)
    Promise.all([source, api('/api/banks').catch(() => [])])
      .then(([res, bankList]) => {
        if (!alive) return
        setNumber(res.number || '')
        setData({ ...res.draft, items: res.draft.items?.length ? res.draft.items : [{ name: '', quantity: 1, price: 0 }] })
        setBanks(bankList || [])
        const match = (bankList || []).find(
          (b) => b.bankName === res.draft.bankName && b.accountNumber === res.draft.accountNumber
        )
        setSlot(match ? String(match.slot) : '')
      })
      .catch((err) => alive && setLoadError(err.message))
    return () => {
      alive = false
    }
  }, [id, isEdit, orderId])

  if (loadError)
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {loadError}
        </p>
        <Link to={isEdit ? `/invoice/${id}` : `/order/${orderId}`} className="text-sm text-green-700 hover:underline">
          Kembali
        </Link>
      </div>
    )
  if (!data) return <p className="text-gray-600">Memuat...</p>

  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setData((d) => ({ ...d, [key]: v }))
  }
  const setNum = (key) => (e) => setData((d) => ({ ...d, [key]: e.target.value === '' ? '' : Number(e.target.value) }))
  const setItem = (index, key, value) =>
    setData((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)) }))
  const addItem = () => setData((d) => ({ ...d, items: [...d.items, { name: '', quantity: 1, price: 0 }] }))
  const removeItem = (index) =>
    setData((d) => ({
      ...d,
      items: d.items.length > 1 ? d.items.filter((_, i) => i !== index) : [{ name: '', quantity: 1, price: 0 }]
    }))

  const pickBank = (e) => {
    setSlot(e.target.value)
    const b = banks.find((x) => String(x.slot) === e.target.value)
    if (b) setData((d) => ({ ...d, bankName: b.bankName, accountNumber: b.accountNumber, accountHolder: b.accountHolder }))
  }

  const clean = () => ({
    ...data,
    discountValue: Number(data.discountValue) || 0,
    depositPercent: Number(data.depositPercent) || 0,
    items: data.items.map((it) => ({ name: it.name, quantity: Number(it.quantity) || 0, price: Number(it.price) || 0 }))
  })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const saved = isEdit
        ? await api(`/api/invoices/${id}`, { method: 'PUT', body: { number, data: clean() } })
        : await api('/api/invoices', { method: 'POST', body: { orderId, number, autoNumber, data: clean() } })
      navigate(`/invoice/${saved?.id ?? id}`)
    } catch (err) {
      setSaveError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <form onSubmit={submit} className="no-print space-y-4">
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit invoice' : 'Buat invoice'}</h1>
        <Field text="Nomor invoice">
          <input
            className={input}
            required
            value={number}
            onChange={(e) => {
              setNumber(e.target.value)
              setAutoNumber(false)
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Tanggal">
            <input type="date" className={input} required value={data.date || ''} onChange={set('date')} />
          </Field>
          <Field text="Jatuh tempo">
            <input type="date" className={input} required value={data.dueDate || ''} onChange={set('dueDate')} />
          </Field>
        </div>
        <Field text="Klien">
          <input className={input} value={data.client || ''} onChange={set('client')} />
        </Field>
        <Field text="No. HP klien">
          <input className={input} value={data.clientPhone || ''} onChange={set('clientPhone')} />
        </Field>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">Item</legend>
          {data.items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-gray-200 p-3">
              <div className="grid gap-2">
                <Field text={`Nama item ${i + 1}`}>
                  <textarea
                    className={input}
                    rows={2}
                    value={item.name}
                    onChange={(e) => setItem(i, 'name', e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <Field text="Jumlah">
                    <input
                      type="number"
                      min="0"
                      className={input}
                      value={item.quantity}
                      onChange={(e) => setItem(i, 'quantity', e.target.value)}
                    />
                  </Field>
                  <Field text="Harga satuan">
                    <input
                      type="number"
                      min="0"
                      className={input}
                      value={item.price}
                      onChange={(e) => setItem(i, 'price', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Hapus item ${i + 1}`}
                onClick={() => removeItem(i)}
                className="self-start rounded-lg bg-red-50 p-2 text-red-700 hover:bg-red-100"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1 text-sm font-semibold text-green-700 hover:underline"
          >
            <Plus size={16} aria-hidden="true" />
            Tambah item
          </button>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field text="Jenis diskon">
            <select className={input} value={data.discountType || 'percent'} onChange={set('discountType')}>
              <option value="percent">Persen (%)</option>
              <option value="amount">Nominal (Rp)</option>
            </select>
          </Field>
          <Field text="Diskon">
            <input type="number" min="0" className={input} value={data.discountValue} onChange={setNum('discountValue')} />
          </Field>
        </div>
        <Field text="DP (%)">
          <input
            type="number"
            min="0"
            max="100"
            className={input}
            value={data.depositPercent}
            onChange={setNum('depositPercent')}
          />
        </Field>
        <Field text="Rekening bank">
          <select className={input} value={slot} onChange={pickBank}>
            {!slot && <option value="">{data.bankName ? `${data.bankName} - ${data.accountNumber}` : 'Pilih rekening'}</option>}
            {banks.map((b) => (
              <option key={b.slot} value={String(b.slot)}>
                {`${b.bankName} - ${b.accountNumber} (${b.accountHolder})`}
              </option>
            ))}
          </select>
        </Field>
        <Field text="Catatan">
          <textarea className={input} rows={4} value={data.notes || ''} onChange={set('notes')} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={Boolean(data.paid)} onChange={set('paid')} />
          Lunas (tampilkan cap PAID)
        </label>

        {saveError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
          >
            Simpan
          </button>
          <Link
            to={isEdit ? `/invoice/${id}` : `/order/${orderId}`}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Batal
          </Link>
        </div>
      </form>
      <div className="min-w-0">
        <InvoiceSheet number={number} data={data} />
      </div>
    </div>
  )
}
