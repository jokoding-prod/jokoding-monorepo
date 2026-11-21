import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import { change } from './StatCards.jsx'
import { periodRange } from './periods.js'
import { readCache, writeCache } from './cache.js'

function json(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

function mockFetch(handlers) {
  const f = vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`
    const h = handlers[key]
    return h ? h(opts, url) : json(404, { error: 'Tidak ditemukan' })
  })
  vi.stubGlobal('fetch', f)
  return f
}

const me = (role) => ({ 'GET /api/auth/me': () => json(200, { id: 1, name: 'Budi', username: 'budi', role }) })

const adminStats = {
  orders: 4,
  gross: 2000000,
  net: 1500000,
  profit: 900000,
  prev: { orders: 2, gross: 2500000, net: 0, profit: 1000000 }
}

const ledger = {
  rows: [
    { kind: 'order', id: 5, date: '2026-11-16', type: 'income', category: 'order', amount: '350000', label: 'Skripsi CV — Siti', orderId: 5 },
    { kind: 'transaction', id: 9, date: '2026-11-15', type: 'expense', category: 'domain_hosting', amount: '120000', label: '', orderId: null }
  ],
  total: 2
}

const adminHandlers = (over = {}) => ({
  ...me('admin'),
  'GET /api/stats': () => json(200, adminStats),
  'GET /api/stats/monthly': () => json(200, [{ month: '2026-11', income: '2000000', expense: '500000' }]),
  'GET /api/ledger': () => json(200, ledger),
  'GET /api/orders': () => json(200, { rows: [], total: 0 }),
  ...over
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

describe('helpers', () => {
  it('change() returns null when previous is zero', () => {
    expect(change(5, 0)).toBeNull()
    expect(change(0, 0)).toBeNull()
    expect(change(150, 100)).toBe(50)
    expect(change(50, 100)).toBe(-50)
  })

  it('periodRange covers whole calendar months up to today', () => {
    expect(periodRange('1', '2026-11-21')).toEqual({ from: '2026-11-01', to: '2026-11-21' })
    expect(periodRange('3', '2026-02-10')).toEqual({ from: '2025-12-01', to: '2026-02-10' })
    expect(periodRange('all', '2026-11-21')).toEqual({ from: null, to: null })
  })

  it('cache survives a throwing sessionStorage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeCache('k', 1)).not.toThrow()
    expect(readCache('k')).toBeNull()
  })
})

describe('Admin Beranda', () => {
  it('renders greeting, 4 card values and badge colors by sign', async () => {
    mockFetch(adminHandlers())
    renderApp('/')
    expect(await screen.findByText(/Hey, Budi/)).toBeInTheDocument()
    expect(await screen.findByTestId('stat-orders')).toHaveTextContent('4')
    expect(screen.getByTestId('stat-gross')).toHaveTextContent('Rp2.000.000')
    expect(screen.getByTestId('stat-net')).toHaveTextContent('Rp1.500.000')
    expect(screen.getByTestId('stat-profit')).toHaveTextContent('Rp900.000')
    const badge = (id) => screen.getByTestId(`stat-${id}`).closest('li').querySelector('[data-testid="change-badge"]')
    expect(badge('orders')).toHaveAttribute('data-trend', 'up')
    expect(badge('orders').className).toContain('emerald')
    expect(badge('gross')).toHaveAttribute('data-trend', 'down')
    expect(badge('gross').className).toContain('red')
    expect(badge('net')).toBeNull() // prev 0 -> no badge
  })

  it('period chips request matching from/to; Semua sends none', async () => {
    const f = mockFetch(adminHandlers())
    renderApp('/')
    await screen.findByTestId('stat-orders')
    const statUrls = () => f.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/api/stats?') || u === '/api/stats')
    expect(statUrls().at(-1)).toMatch(/^\/api\/stats\?from=\d{4}-\d{2}-01&to=/)
    await userEvent.click(screen.getByRole('button', { name: 'Semua' }))
    await waitFor(() => expect(statUrls().at(-1)).toBe('/api/stats'))
    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ledger arrows follow the type and empty labels fall back to category', async () => {
    mockFetch(adminHandlers())
    renderApp('/')
    const rows = await screen.findAllByTestId('ledger-row')
    expect(rows).toHaveLength(2)
    const inIcon = within(rows[0]).getByLabelText('Pemasukan')
    expect(inIcon).toHaveAttribute('data-type', 'income')
    expect(inIcon.className).toContain('emerald')
    expect(within(rows[0]).getByRole('link', { name: 'Skripsi CV — Siti' })).toHaveAttribute('href', '/order/5')
    const outIcon = within(rows[1]).getByLabelText('Pengeluaran')
    expect(outIcon.className).toContain('red')
    expect(within(rows[1]).getAllByText(/Domain & hosting/).length).toBeGreaterThan(0)
    expect(rows[1]).toHaveTextContent('−Rp120.000')
  })

  it('transaction form posts the right body and refreshes', async () => {
    let posted
    const f = mockFetch(
      adminHandlers({
        'POST /api/transactions': (o) => {
          posted = JSON.parse(o.body)
          return json(201, { id: 10, ...posted })
        }
      })
    )
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: /Tambah transaksi/ }))
    const form = screen.getByRole('form', { name: 'Form transaksi' })
    await userEvent.clear(within(form).getByLabelText('Tanggal'))
    await userEvent.type(within(form).getByLabelText('Tanggal'), '2026-11-20')
    await userEvent.selectOptions(within(form).getByLabelText('Kategori'), 'ads')
    await userEvent.type(within(form).getByLabelText('Jumlah (Rp)'), '250000')
    await userEvent.type(within(form).getByLabelText('Catatan'), ' Iklan IG ')
    const before = f.mock.calls.length
    await userEvent.click(within(form).getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(posted).toBeDefined())
    expect(posted).toEqual({ date: '2026-11-20', type: 'expense', category: 'ads', amount: 250000, note: 'Iklan IG' })
    await waitFor(() => expect(f.mock.calls.slice(before).some(([u]) => u.startsWith('/api/stats?'))).toBe(true))
  })

  it('income type only offers lainnya; amount must be > 0', async () => {
    let posted = false
    mockFetch(adminHandlers({ 'POST /api/transactions': () => ((posted = true), json(201, {})) }))
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: /Tambah transaksi/ }))
    const form = screen.getByRole('form', { name: 'Form transaksi' })
    await userEvent.selectOptions(within(form).getByLabelText('Jenis'), 'income')
    expect(within(within(form).getByLabelText('Kategori')).getAllByRole('option').map((o) => o.value)).toEqual(['lainnya'])
    await userEvent.type(within(form).getByLabelText('Jumlah (Rp)'), '0')
    await userEvent.click(within(form).getByRole('button', { name: 'Simpan' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('> 0')
    expect(posted).toBe(false)
  })

  it('second visit uses the session cache and shows the cache note', async () => {
    const f = mockFetch(adminHandlers())
    const { unmount } = renderApp('/')
    await screen.findByTestId('stat-orders')
    unmount()
    const n = f.mock.calls.filter(([u]) => u.startsWith('/api/stats?')).length
    renderApp('/')
    await screen.findByTestId('stat-orders')
    expect(await screen.findByText(/Data dari cache/)).toBeInTheDocument()
    expect(f.mock.calls.filter(([u]) => u.startsWith('/api/stats?')).length).toBe(n)
    await userEvent.click(screen.getByRole('button', { name: /refresh/ }))
    await waitFor(() => expect(f.mock.calls.filter(([u]) => u.startsWith('/api/stats?')).length).toBe(n + 1))
  })

  it('shows nearest upcoming deadlines, skipping finished and past ones', async () => {
    const o = (id, deadline, workStatus = 'baru') => ({ id, projectName: `P${id}`, clientName: 'K', deadline, workStatus })
    mockFetch(
      adminHandlers({
        'GET /api/orders': () =>
          json(200, { rows: [o(1, '2099-12-31'), o(2, '2099-01-02', 'selesai'), o(3, '2099-01-01'), o(4, '2000-01-01')], total: 4 })
      })
    )
    renderApp('/')
    const section = (await screen.findByText('Deadline terdekat')).closest('section')
    await within(section).findByText('P3')
    const names = within(section).getAllByText(/^P\d$/).map((e) => e.textContent)
    expect(names).toEqual(['P3', 'P1'])
  })
})

describe('Member Beranda', () => {
  it('shows only 2 cards, no net/profit, no ledger or chart', async () => {
    const f = mockFetch({
      ...me('member'),
      'GET /api/stats': () => json(200, { orders: 2, gross: 700000, prev: { orders: 0, gross: 0 } }),
      'GET /api/orders': () => json(200, { rows: [], total: 0 })
    })
    renderApp('/')
    expect(await screen.findByTestId('stat-orders')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-gross')).toHaveTextContent('Rp700.000')
    expect(screen.getByText('Total harga')).toBeInTheDocument()
    expect(screen.queryByTestId('stat-net')).toBeNull()
    expect(screen.queryByTestId('stat-profit')).toBeNull()
    expect(screen.queryByText(/Omset bersih|Keuntungan/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Tambah transaksi/ })).toBeNull()
    expect(screen.queryAllByTestId('change-badge')).toHaveLength(0)
    const urls = f.mock.calls.map(([u]) => u)
    expect(urls.some((u) => u.includes('/api/ledger') || u.includes('/api/stats/monthly'))).toBe(false)
  })
})
