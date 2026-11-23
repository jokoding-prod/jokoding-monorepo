import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const field =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 disabled:bg-gray-100'
const label = 'block text-sm font-medium text-gray-700'
const primary =
  'rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60'
const secondary = 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60'

const emptyBank = (slot) => ({ slot, bankName: '', accountNumber: '', accountHolder: '', isDefault: false })

function Alert({ children }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  )
}

function BankCard({ bank, onSaved }) {
  const [f, setF] = useState(bank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => setF(bank), [bank])
  const id = (k) => `bank${bank.slot}-${k}`
  const set = (k) => (e) => {
    setSaved(false)
    setF({ ...f, [k]: e.target.value })
  }

  async function save(isDefault) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/banks/${bank.slot}`, {
        method: 'PUT',
        body: {
          bankName: f.bankName,
          accountNumber: f.accountNumber,
          accountHolder: f.accountHolder,
          isDefault
        }
      })
      setSaved(true)
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      aria-label={`Rekening ${bank.slot}`}
      onSubmit={(e) => {
        e.preventDefault()
        save(false)
      }}
      className="space-y-3 rounded-xl bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Rekening {bank.slot}</h3>
        {bank.isDefault && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Default</span>
        )}
      </div>
      <div>
        <label htmlFor={id('bank')} className={label}>Nama bank</label>
        <input id={id('bank')} className={field} value={f.bankName} onChange={set('bankName')} required />
      </div>
      <div>
        <label htmlFor={id('number')} className={label}>Nomor rekening</label>
        <input id={id('number')} className={field} value={f.accountNumber} onChange={set('accountNumber')} required />
      </div>
      <div>
        <label htmlFor={id('holder')} className={label}>Atas nama</label>
        <input id={id('holder')} className={field} value={f.accountHolder} onChange={set('accountHolder')} required />
      </div>
      {error && <Alert>{error}</Alert>}
      {saved && <p className="text-sm text-green-700">Tersimpan</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primary}>Simpan</button>
        {!bank.isDefault && (
          <button
            type="button"
            disabled={busy}
            className={secondary}
            onClick={(e) => {
              if (e.currentTarget.form.reportValidity()) save(true)
            }}
          >
            Jadikan default
          </button>
        )}
      </div>
    </form>
  )
}

function AddMember({ onAdded }) {
  const blank = { username: '', name: '', password: '' }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/users', { method: 'POST', body: f })
      setF(blank)
      await onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label="Tambah anggota" className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900">Tambah anggota</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="new-name" className={label}>Nama</label>
          <input id="new-name" className={field} value={f.name} onChange={set('name')} required />
        </div>
        <div>
          <label htmlFor="new-username" className={label}>Username</label>
          <input
            id="new-username"
            className={field}
            value={f.username}
            onChange={set('username')}
            autoCapitalize="none"
            pattern="[a-z0-9._\-]{3,32}"
            title="3-32 karakter: huruf kecil, angka, titik, minus, garis bawah"
            required
          />
        </div>
        <div>
          <label htmlFor="new-password" className={label}>Password</label>
          <input
            id="new-password"
            type="password"
            className={field}
            value={f.password}
            onChange={set('password')}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <button type="submit" disabled={busy} className={primary}>Tambah</button>
    </form>
  )
}

function ResetPassword({ member, onDone, onCancel }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(`/api/users/${member.id}`, { method: 'PATCH', body: { password } })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Reset password ${member.username}`} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={`pw-${member.id}`} className={label}>Password baru</label>
        <input
          id={`pw-${member.id}`}
          type="password"
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          autoComplete="new-password"
          required
          autoFocus
        />
      </div>
      <button type="submit" disabled={busy} className={primary}>Simpan password</button>
      <button type="button" onClick={onCancel} className={secondary}>Batal</button>
      {error && <div className="w-full"><Alert>{error}</Alert></div>}
    </form>
  )
}

function Members() {
  const { user } = useAuth()
  const [members, setMembers] = useState(null)
  const [error, setError] = useState('')
  const [resetId, setResetId] = useState(null)
  const [notice, setNotice] = useState('')

  const load = () => api('/api/users').then(setMembers, (err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])

  async function toggle(m) {
    setError('')
    setNotice('')
    try {
      await api(`/api/users/${m.id}`, { method: 'PATCH', body: { active: !m.active } })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Anggota tim</h2>
      {error && <Alert>{error}</Alert>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      {!members ? (
        !error && <p className="text-gray-600">Memuat...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Username</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-4 py-2 text-gray-900">
                    {m.name}
                    {m.role === 'admin' && <span className="ml-2 text-xs text-gray-500">(admin)</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{m.username}</td>
                  <td className="px-4 py-2">
                    <span className={m.active ? 'text-green-700' : 'text-gray-500'}>{m.active ? 'Aktif' : 'Nonaktif'}</span>
                  </td>
                  <td className="px-4 py-2">
                    {resetId === m.id ? (
                      <ResetPassword
                        member={m}
                        onCancel={() => setResetId(null)}
                        onDone={() => {
                          setResetId(null)
                          setNotice(`Password ${m.username} diganti`)
                        }}
                      />
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.id !== user.id && (
                          <button type="button" className={secondary} onClick={() => toggle(m)}>
                            {m.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        )}
                        <button
                          type="button"
                          className={secondary}
                          onClick={() => {
                            setNotice('')
                            setResetId(m.id)
                          }}
                        >
                          Reset password
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddMember onAdded={load} />
    </section>
  )
}

function Banks() {
  const [banks, setBanks] = useState(null)
  const [error, setError] = useState('')
  const load = () =>
    api('/api/banks').then(
      (rows) => setBanks([1, 2].map((s) => rows.find((b) => b.slot === s) || emptyBank(s))),
      (err) => setError(err.message)
    )
  useEffect(() => {
    load()
  }, [])

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Rekening</h2>
      <p className="text-sm text-gray-600">Rekening default dipakai otomatis saat membuat invoice.</p>
      {error && <Alert>{error}</Alert>}
      {!banks ? (
        !error && <p className="text-gray-600">Memuat...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {banks.map((b) => (
            <BankCard key={b.slot} bank={b} onSaved={load} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h2 className="sr-only">Pengaturan</h2>
      <Banks />
      <Members />
    </div>
  )
}
