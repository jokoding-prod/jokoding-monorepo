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
  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`
    const h = handlers[key]
    if (!h) return json(404, { error: 'Tidak ditemukan' })
    return h(opts)
    })
  )
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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
    expect(await screen.findByText(/Hey, Budi/)).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: /Budi/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Keluar/ }))
    expect(await screen.findByRole('button', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('returns to the page that required login after signing in', async () => {
    let loggedIn = false
    mockFetch({
      'GET /api/auth/me': () =>
        loggedIn ? json(200, { id: 1, name: 'Budi', username: 'budi', role: 'admin' }) : json(401, { error: 'Belum login' }),
      'POST /api/auth/login': () => {
        loggedIn = true
        return json(200, { id: 1, name: 'Budi', username: 'budi', role: 'admin' })
      },
      'GET /api/orders/5': () => json(404, { error: 'Order tidak ditemukan' })
    })
    renderApp('/order/5')
    await userEvent.type(await screen.findByLabelText('Username'), 'budi')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByText('Order tidak ditemukan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Masuk' })).toBeNull()
  })

  it('logout failure does not leave an unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    mockFetch({ ...as('admin'), 'POST /api/auth/logout': () => json(500, { error: 'boom' }) })
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: /Budi/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Keluar/ }))
    expect(await screen.findByRole('button', { name: 'Masuk' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it.each(['//evil.com/x', '/\\evil.com'])('ignores unsafe return-to %s and lands on /', async (bad) => {
    let loggedIn = false
    const me = { id: 1, name: 'Budi', username: 'budi', role: 'admin' }
    mockFetch({
      'GET /api/auth/me': () => (loggedIn ? json(200, me) : json(401, { error: 'Belum login' })),
      'POST /api/auth/login': () => {
        loggedIn = true
        return json(200, me)
      }
    })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: bad, search: '' } } }]}>
        <App />
      </MemoryRouter>
    )
    await userEvent.type(await screen.findByLabelText('Username'), 'budi')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByText(/Hey, Budi/)).toBeInTheDocument()
  })
})
