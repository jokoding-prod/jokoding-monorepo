import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = useLocation().state?.from
  const dest = typeof from?.pathname === 'string' && from.pathname !== '/login' ? `${from.pathname}${from.search || ''}` : '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-500/40'

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md">
        <h1 className="text-2xl font-bold text-green-700">Jokoding Internal</h1>
        <p className="mt-1 text-sm text-gray-600">Masuk untuk melanjutkan.</p>
        <label htmlFor="username" className="mt-5 block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          id="username"
          className={field}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="password" className="mt-4 block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          Masuk
        </button>
      </form>
    </div>
  )
}
