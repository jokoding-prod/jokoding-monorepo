import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import { formatRupiah, formatTanggal } from '../format.js'

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

const me = (role, id = 1) => ({
  'GET /api/auth/me': () => json(200, { id, name: 'Budi', username: 'budi', role })
})

const order = (over = {}) => ({
  id: 5,
  receivedAt: '2026-11-16',
  projectName: 'Skripsi CV',
  clientName: 'Siti',
  clientPhone: '0812',
  deadline: '2026-12-01',
  price: 350000,
  scopeOfWork: 'Baris satu\nBaris dua',
  assignee: { id: 2, name: 'Andi', active: true },
  createdBy: { id: 1, name: 'Budi' },
  workStatus: 'baru',
  paymentStatus: 'belum',
  invoice: null,
  ...over
})

const assignable = {
  'GET /api/users/assignable': () =>
    json(200, [
      { id: 1, name: 'Budi', role: 'admin' },
      { id: 2, name: 'Andi', role: 'member' }
    ])
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('format', () => {
  it('formatRupiah', () => {
    expect(formatRupiah(350000)).toBe('Rp350.000')
    expect(formatRupiah(0)).toBe('Rp0')
  })
  it('formatTanggal', () => {
    expect(formatTanggal('2026-11-16')).toBe('16 Nov 2026')
    expect(formatTanggal(null)).toBe('-')
  })
})

describe('OrdersPage', () => {
  it('renders columns in order with formatted price and badges', async () => {
    mockFetch({ ...me('admin'), 'GET /api/orders': () => json(200, [order()]) })
    renderApp('/order')
    const table = await screen.findByRole('table')
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads.slice(0, 5)).toEqual(['Tanggal masuk', 'Nama project', 'Nama klien', 'Deadline', 'Harga'])
    const row = within(table).getByText('Skripsi CV').closest('tr')
    expect(row).toHaveTextContent('Rp350.000')
    expect(row).toHaveTextContent('16 Nov 2026')
    expect(row).toHaveTextContent('Baru')
    expect(row).toHaveTextContent('Belum bayar')
  })

  it('shows empty state', async () => {
    mockFetch({ ...me('member'), 'GET /api/orders': () => json(200, []) })
    renderApp('/order')
    expect(await screen.findByText('Belum ada order.')).toBeInTheDocument()
  })

  it('row click opens detail', async () => {
    mockFetch({
      ...me('admin'),
      'GET /api/orders': () => json(200, [order()]),
      'GET /api/orders/5': () => json(200, order())
    })
    renderApp('/order')
    await userEvent.click(await screen.findByText('Skripsi CV'))
    expect(await screen.findByRole('heading', { name: 'Skripsi CV' })).toBeInTheDocument()
  })
})

describe('OrderForm', () => {
  it('admin checkbox sets assignee to self (number) in POST body', async () => {
    let posted
    mockFetch({
      ...me('admin', 1),
      ...assignable,
      'POST /api/orders': (o) => {
        posted = JSON.parse(o.body)
        return json(201, order({ id: 9 }))
      },
      'GET /api/orders/9': () => json(200, order({ id: 9 }))
    })
    renderApp('/order/new')
    await userEvent.type(await screen.findByLabelText('Nama project'), 'Web')
    await userEvent.type(screen.getByLabelText('Nama klien'), 'Siti')
    await userEvent.type(screen.getByLabelText('Harga'), '35a0000')
    expect(screen.getByLabelText('Harga')).toHaveValue('350.000')
    await userEvent.click(screen.getByLabelText('Saya sendiri (admin)'))
    expect(screen.getByLabelText('Dikerjakan oleh')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(posted).toBeDefined())
    expect(posted.assigneeId).toBe(1)
    expect(posted.price).toBe(350000)
    expect(posted.projectName).toBe('Web')
    expect(posted.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(posted).not.toHaveProperty('workStatus')
    expect(posted).not.toHaveProperty('paymentStatus')
  })

  it('member: no self checkbox, select sends numeric id, no status fields', async () => {
    let posted
    mockFetch({
      ...me('member', 3),
      ...assignable,
      'POST /api/orders': (o) => {
        posted = JSON.parse(o.body)
        return json(201, order({ id: 9 }))
      },
      'GET /api/orders/9': () => json(200, order({ id: 9 }))
    })
    renderApp('/order/new')
    await userEvent.type(await screen.findByLabelText('Nama project'), 'Web')
    await userEvent.type(screen.getByLabelText('Nama klien'), 'Siti')
    await userEvent.type(screen.getByLabelText('Harga'), '1000')
    expect(screen.queryByLabelText('Saya sendiri (admin)')).toBeNull()
    const select = screen.getByLabelText('Dikerjakan oleh')
    await within(select).findByRole('option', { name: 'Andi' })
    expect(within(select).queryByRole('option', { name: 'Budi' })).toBeNull()
    await userEvent.selectOptions(select, 'Andi')
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(posted).toBeDefined())
    expect(posted.assigneeId).toBe(2)
    expect(posted).not.toHaveProperty('workStatus')
    expect(posted).not.toHaveProperty('paymentStatus')
  })

  it('shows API 400 message', async () => {
    mockFetch({
      ...me('member', 3),
      ...assignable,
      'POST /api/orders': () => json(400, { error: 'Harga tidak valid' })
    })
    renderApp('/order/new')
    await userEvent.type(await screen.findByLabelText('Nama project'), 'Web')
    await userEvent.type(screen.getByLabelText('Nama klien'), 'Siti')
    await userEvent.type(screen.getByLabelText('Harga'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Harga tidak valid')
  })
})

describe('OrderDetail', () => {
  it('member sees no Buat invoice, no status selects', async () => {
    mockFetch({ ...me('member', 1), 'GET /api/orders/5': () => json(200, order()) })
    renderApp('/order/5')
    expect(await screen.findByRole('heading', { name: 'Skripsi CV' })).toBeInTheDocument()
    expect(screen.queryByText('Buat invoice')).toBeNull()
    expect(screen.queryByLabelText('Status pengerjaan')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hapus' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
  })

  it('member cannot edit order with invoice or created by others', async () => {
    mockFetch({
      ...me('member', 1),
      'GET /api/orders/5': () => json(200, order({ createdBy: { id: 7, name: 'X' } }))
    })
    renderApp('/order/5')
    await screen.findByRole('heading', { name: 'Skripsi CV' })
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('admin sees Buat invoice link, delete, preserved line breaks, inactive assignee', async () => {
    mockFetch({
      ...me('admin'),
      'GET /api/orders/5': () =>
        json(200, order({ assignee: { id: 2, name: 'Andi', active: false } }))
    })
    renderApp('/order/5')
    const link = await screen.findByRole('link', { name: 'Buat invoice' })
    expect(link).toHaveAttribute('href', '/invoice/new?order=5')
    expect(screen.getByText('Andi (nonaktif)')).toBeInTheDocument()
    expect(screen.getByText(/Baris satu/)).toHaveClass('whitespace-pre-line')
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeInTheDocument()
  })

  it('admin with invoice sees number, no delete', async () => {
    mockFetch({
      ...me('admin'),
      'GET /api/orders/5': () => json(200, order({ invoice: { id: 3, number: 'INV-004/JKD/XI/2026' } }))
    })
    renderApp('/order/5')
    expect(await screen.findByText('INV-004/JKD/XI/2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lihat invoice' })).toHaveAttribute('href', '/invoice/3')
    expect(screen.queryByRole('button', { name: 'Hapus' })).toBeNull()
    expect(screen.queryByText('Buat invoice')).toBeNull()
  })

  it('admin changes payment status via PATCH', async () => {
    let patched
    mockFetch({
      ...me('admin'),
      'GET /api/orders/5': () => json(200, order()),
      'PATCH /api/orders/5': (o) => {
        patched = JSON.parse(o.body)
        return json(200, order({ paymentStatus: 'lunas' }))
      }
    })
    renderApp('/order/5')
    await userEvent.selectOptions(await screen.findByLabelText('Status pembayaran'), 'Lunas')
    await waitFor(() => expect(patched).toEqual({ paymentStatus: 'lunas' }))
  })

  it('admin delete asks confirm then DELETEs', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const del = vi.fn(() => json(204, null))
    mockFetch({
      ...me('admin'),
      'GET /api/orders/5': () => json(200, order()),
      'GET /api/orders': () => json(200, []),
      'DELETE /api/orders/5': del
    })
    renderApp('/order/5')
    await userEvent.click(await screen.findByRole('button', { name: 'Hapus' }))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(del).toHaveBeenCalled())
    expect(await screen.findByText('Belum ada order.')).toBeInTheDocument()
  })
})
