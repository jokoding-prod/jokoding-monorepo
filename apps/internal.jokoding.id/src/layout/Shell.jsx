import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ChevronDown,
  ClipboardList,
  FileText,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

const COLLAPSE_KEY = 'jk-internal:sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(v) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  } catch {
    // penyimpanan tidak tersedia
  }
}

const TITLES = { '': 'Beranda', order: 'Order', invoice: 'Invoice', pengaturan: 'Pengaturan' }

export function pageTitle(pathname) {
  return TITLES[pathname.split('/')[1] || ''] || 'Beranda'
}

function Sidebar({ sections, collapsed, onToggle, open, onClose }) {
  const item = ({ isActive }) =>
    `group flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-50 text-brand-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    } ${collapsed ? 'md:justify-center' : ''}`
  const tile = (active) =>
    `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
      active ? 'bg-brand-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 group-hover:bg-white'
    }`
  return (
    <aside
      aria-label="Sidebar"
      className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white pt-16 transition-transform md:sticky md:top-16 md:z-0 md:h-[calc(100vh-4rem)] md:translate-x-0 md:pt-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } ${collapsed ? 'md:w-20' : 'md:w-64'}`}
    >
      <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((s) => (
          <div key={s.label} className="mb-5">
            <p
              className={`mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${
                collapsed ? 'md:sr-only' : ''
              }`}
            >
              {s.label}
            </p>
            <ul className="space-y-1">
              {s.items.map(({ to, label, end, Icon }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className={item} onClick={onClose} title={label}>
                    {({ isActive }) => (
                      <>
                        <span className={tile(isActive)}>
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className={collapsed ? 'md:sr-only' : ''}>{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="hidden border-t border-gray-100 p-3 md:block">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={collapsed}
          title={collapsed ? 'Perluas menu' : 'Minimize Menu'}
          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          <span className={collapsed ? 'sr-only' : ''}>{collapsed ? 'Perluas menu' : 'Minimize Menu'}</span>
        </button>
      </div>
    </aside>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const initial = (user.name || '?').trim().charAt(0).toUpperCase()
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-gray-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-gray-800 sm:inline">{user.name}</span>
        <ChevronDown size={16} aria-hidden="true" className="text-gray-500" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-gray-500">
            {user.name} · {user.role === 'admin' ? 'Admin' : 'Member'}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={16} aria-hidden="true" />
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}

export default function Shell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)

  useEffect(() => setDrawer(false), [location.pathname])

  const sections = [
    {
      label: 'Menu Utama',
      items: [
        { to: '/', label: 'Beranda', end: true, Icon: House },
        { to: '/order', label: 'Order', Icon: ClipboardList }
      ]
    },
    ...(user.role === 'admin'
      ? [
          {
            label: 'Admin',
            items: [
              { to: '/invoice', label: 'Invoice', Icon: FileText },
              { to: '/pengaturan', label: 'Pengaturan', Icon: Settings }
            ]
          }
        ]
      : [])
  ]

  function toggle() {
    setCollapsed((v) => {
      writeCollapsed(!v)
      return !v
    })
  }

  const title = pageTitle(location.pathname)

  return (
    <div className="print-root min-h-screen bg-canvas font-sans text-gray-900">
      <header className="no-print sticky top-0 z-50 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => setDrawer((v) => !v)}
          aria-label={drawer ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={drawer}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
        >
          {drawer ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <Link to="/" className="flex items-center gap-2.5" aria-label="Jokoding Internal, ke Beranda">
          <img src="/logo-jokoding-only.png" alt="Jokoding" className="h-10 w-auto object-contain sm:h-11" />
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            Internal
          </span>
        </Link>
        <div className="ml-auto">
          <UserMenu user={user} onLogout={() => logout().catch(() => {})} />
        </div>
      </header>
      {drawer && (
        <div className="no-print fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />
      )}
      <div className="md:flex">
        <Sidebar
          sections={sections}
          collapsed={collapsed}
          onToggle={toggle}
          open={drawer}
          onClose={() => setDrawer(false)}
        />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="no-print mb-5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
              <nav aria-label="Breadcrumb" className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <LayoutGrid size={14} aria-hidden="true" />
                <span>/</span>
                <Link to="/" className="hover:text-brand-700">Beranda</Link>
                {title !== 'Beranda' && (
                  <>
                    <span>/</span>
                    <span className="text-gray-700">{title}</span>
                  </>
                )}
              </nav>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
