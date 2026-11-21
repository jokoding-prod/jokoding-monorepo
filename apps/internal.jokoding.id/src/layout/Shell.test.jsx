import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logout = vi.fn(() => Promise.resolve())
let currentUser
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: currentUser, logout }) }))

import Shell, { pageTitle } from './Shell.jsx'

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="*" element={<p>isi</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
  logout.mockClear()
})
afterEach(() => vi.restoreAllMocks())

describe('Shell', () => {
  it('admin sees all menu links', () => {
    currentUser = { id: 1, name: 'Budi', role: 'admin' }
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Menu utama' })
    for (const n of ['Beranda', 'Order', 'Invoice', 'Pengaturan'])
      expect(within(nav).getByRole('link', { name: n })).toBeInTheDocument()
  })

  it('member does not see Invoice/Pengaturan', () => {
    currentUser = { id: 2, name: 'Andi', role: 'member' }
    renderShell()
    expect(screen.getByRole('link', { name: 'Order' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Invoice' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Pengaturan' })).toBeNull()
  })

  it('collapse toggle works and is remembered', async () => {
    currentUser = { id: 1, name: 'Budi', role: 'admin' }
    const { unmount } = renderShell()
    const btn = screen.getByRole('button', { name: 'Minimize Menu' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Perluas menu', pressed: true })).toBeInTheDocument()
    expect(localStorage.getItem('jk-internal:sidebar-collapsed')).toBe('1')
    unmount()
    renderShell()
    expect(screen.getByRole('button', { name: 'Perluas menu', pressed: true })).toBeInTheDocument()
  })

  it('survives localStorage throwing', () => {
    currentUser = { id: 1, name: 'Budi', role: 'admin' }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderShell()
    expect(screen.getByRole('button', { name: 'Minimize Menu' })).toBeInTheDocument()
  })

  it('user menu calls logout', async () => {
    currentUser = { id: 1, name: 'Budi', role: 'admin' }
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: /Budi/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Keluar/ }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('hamburger toggles the drawer', async () => {
    currentUser = { id: 1, name: 'Budi', role: 'admin' }
    renderShell()
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
    expect(sidebar.className).toContain('-translate-x-full')
    await userEvent.click(screen.getByRole('button', { name: 'Buka menu', expanded: false }))
    expect(sidebar.className).not.toContain('-translate-x-full')
  })

  it('shows title and breadcrumb', () => {
    currentUser = { id: 1, name: 'Budi', role: 'admin' }
    renderShell('/order/5')
    expect(screen.getByRole('heading', { level: 1, name: 'Order' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Order')).toBeInTheDocument()
    expect(pageTitle('/pengaturan')).toBe('Pengaturan')
  })
})
