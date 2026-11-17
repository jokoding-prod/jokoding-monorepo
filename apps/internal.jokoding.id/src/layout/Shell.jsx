import { NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Shell() {
  const { user, logout } = useAuth()
  const tabs = [
    { to: '/', label: 'Beranda', end: true },
    { to: '/order', label: 'Order' },
    ...(user.role === 'admin' ? [{ to: '/invoice', label: 'Invoice' }] : [])
  ]
  const tabClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="print-root min-h-screen bg-gray-50">
      <header className="no-print border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold text-green-700">Jokoding</span>
          <nav aria-label="Menu utama" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={tabClass}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              <LogOut size={16} aria-hidden="true" />
              Keluar
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
