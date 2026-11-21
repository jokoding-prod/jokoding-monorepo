import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = useLocation().state?.from
  const p = from?.pathname
  const safe = typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') && p !== '/login'
  const dest = safe ? `${p}${typeof from.search === 'string' ? from.search : ''}` : '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={dest} replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 text-base text-gray-900 placeholder:text-gray-400 transition focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/15'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 -right-32 h-96 w-96 rounded-full bg-brand-100/80 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-brand-50 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-jokoding-only.png" alt="Jokoding" className="h-16 w-auto object-contain" />
          <span className="mt-3 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
            Internal
          </span>
        </div>

        <form onSubmit={onSubmit} className="rounded-3xl border border-gray-100 bg-white p-7 shadow-xl shadow-brand-900/5 sm:p-9">
          <h1 className="font-display text-2xl font-bold text-gray-900">Selamat datang kembali</h1>
          <p className="mt-1.5 text-sm text-gray-500">Masuk untuk mengelola order dan invoice.</p>

          <label htmlFor="username" className="mt-7 block text-sm font-medium text-gray-700">
            Username
          </label>
          <div className="relative mt-1.5">
            <User size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gray-400" />
            <input
              id="username"
              className={`${field} pr-4`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="username"
              required
            />
          </div>

          <label htmlFor="password" className="mt-5 block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="relative mt-1.5">
            <Lock size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gray-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className={`${field} pr-12`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-7 w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:opacity-60"
          >
            {busy ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">© {new Date().getFullYear()} Jokoding</p>
      </div>
    </div>
  )
}
