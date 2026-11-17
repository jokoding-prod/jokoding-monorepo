import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

function json(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  })
}

function mockFetch(handlers) {
  global.fetch = vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`
    const h = handlers[key]
    if (!h) return json(404, { error: 'Tidak ditemukan' })
    return h(opts)
  })
}

const unauth = { 'GET /api/auth/me': () => json(401, { error: 'Belum login' }) }
const as = (role) => ({
  'GET /api/auth/me': () => json(200, { id: 1, name: 'Budi', username: 'budi', role })
})

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it('shows Login when unauthenticated', async () => {
    mockFetch(unauth)
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('admin sees Invoice tab', async () => {
    mockFetch(as('admin'))
    renderApp('/')
    expect(await screen.findAllByRole('link', { name: 'Invoice' })).not.toHaveLength(0)
  })

  it('member does not see Invoice tab and is redirected from /invoice', async () => {
    mockFetch(as('member'))
    renderApp('/invoice')
    expect((await screen.findAllByRole('link', { name: 'Order' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Invoice' })).toBeNull()
    expect(screen.getByText(/Halo, Budi/)).toBeInTheDocument()
  })

  it('shows API error on failed login', async () => {
    mockFetch({
      ...unauth,
      'POST /api/auth/login': () => json(401, { error: 'Username atau password salah' })
    })
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Username'), 'x')
    await userEvent.type(screen.getByLabelText('Password'), 'y')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Username atau password salah')
    )
  })

  it('logout returns to Login', async () => {
    mockFetch({ ...as('admin'), 'POST /api/auth/logout': () => json(204, null) })
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: /Keluar/ }))
    expect(await screen.findByRole('button', { name: 'Masuk' })).toBeInTheDocument()
  })
})
