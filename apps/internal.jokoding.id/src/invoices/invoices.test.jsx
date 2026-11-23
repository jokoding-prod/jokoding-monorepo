import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import InvoiceSheet from './InvoiceSheet.jsx'

function json(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
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

const me = { 'GET /api/auth/me': () => json(200, { id: 1, name: 'Budi', username: 'budi', role: 'admin' }) }

const deka = (over = {}) => ({
  date: '2026-11-16',
  dueDate: '2026-11-30',
  client: 'Deka Restu',
  clientPhone: '085150651021',
  items: [{ name: 'UTS pemrograman python', quantity: 1, price: 350000 }],
  discountType: 'percent',
  discountValue: 0,
  depositPercent: 50,
  currency: 'IDR',
  bankName: 'BSI',
  accountNumber: '7253435342',
  accountHolder: 'IRFAN QOBUS SALIM',
  notes: '- Menyiapkan dataset',
  paid: false,
  ...over
})

const banks = {
  'GET /api/banks': () =>
    json(200, [
      { slot: 1, bankName: 'BSI', accountNumber: '7253435342', accountHolder: 'IRFAN QOBUS SALIM', isDefault: true },
      { slot: 2, bankName: 'BCA', accountNumber: '111', accountHolder: 'IRFAN', isDefault: false }
    ])
}

function renderApp(path) {
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

describe('InvoiceSheet', () => {
  it('renders the Deka Restu sample like the old app', () => {
    const { container } = render(<InvoiceSheet number="INV-004/JKD/XI/2026" data={deka()} />)
    const sheet = within(container)
    expect(sheet.getByText('INVOICE')).toBeInTheDocument()
    expect(sheet.getByText('Deka Restu')).toBeInTheDocument()
    expect(sheet.getByText('16 November 2026')).toBeInTheDocument()
    expect(sheet.getByText('INV-004/JKD/XI/2026')).toBeInTheDocument()
    expect(sheet.getAllByText('Rp350.000').length).toBe(3)
    expect(sheet.getAllByText('Rp175.000').length).toBe(2)
    expect(sheet.getByText('30 NOVEMBER 2026')).toBeInTheDocument()
    expect(sheet.getByText('NOVEMBER 2026')).toBeInTheDocument()
    expect(sheet.getByText('BSI')).toBeInTheDocument()
    expect(sheet.getByText('Notes')).toBeInTheDocument()
    expect(sheet.queryByText('Subtotal')).not.toBeInTheDocument()
    expect(sheet.queryByText('PAID')).not.toBeInTheDocument()
    expect(sheet.getByText('Thank you for trusting us to develop your technology-related project.')).toBeInTheDocument()
    expect(sheet.getByText('Founder & CEO of Jokoding')).toBeInTheDocument()
  })

  it('hides notes when empty, shows discount rows and PAID stamp', () => {
    const { container } = render(
      <InvoiceSheet number="X" data={deka({ notes: '  ', discountValue: 10, paid: true })} />
    )
    const sheet = within(container)
    expect(sheet.queryByText('Notes')).not.toBeInTheDocument()
    expect(sheet.getByText('Discount (10%)')).toBeInTheDocument()
    expect(sheet.getByText('-Rp35.000')).toBeInTheDocument()
    expect(sheet.getByText('PAID')).toBeInTheDocument()
  })
})

describe('InvoiceEditor (new)', () => {
  it('POSTs with orderId and autoNumber, then opens the invoice', async () => {
    let posted
    mockFetch({
      ...me,
      ...banks,
      'GET /api/orders/5/invoice-draft': () => json(200, { number: 'INV-004/JKD/XI/2026', draft: deka() }),
      'POST /api/invoices': (o) => {
        posted = JSON.parse(o.body)
        return json(201, { id: 9, number: posted.number, orderId: 5, data: posted.data })
      },
      'GET /api/invoices/9': () => json(200, { id: 9, number: 'INV-004/JKD/XI/2026', orderId: 5, data: deka() })
    })
    renderApp('/invoice/new?order=5')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Rekening bank'), '2')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(posted).toBeDefined())
    expect(posted.orderId).toBe(5)
    expect(posted.autoNumber).toBe(true)
    expect(posted.number).toBe('INV-004/JKD/XI/2026')
    expect(posted.data.bankName).toBe('BCA')
    expect(posted.data.accountNumber).toBe('111')
    expect(await screen.findByRole('button', { name: /Download PDF/ })).toBeInTheDocument()
  })

  it('sends autoNumber false after editing number', async () => {
    let posted
    mockFetch({
      ...me,
      ...banks,
      'GET /api/orders/5/invoice-draft': () => json(200, { number: 'INV-004/JKD/XI/2026', draft: deka() }),
      'POST /api/invoices': (o) => {
        posted = JSON.parse(o.body)
        return json(201, { id: 9, number: posted.number, orderId: 5, data: posted.data })
      }
    })
    renderApp('/invoice/new?order=5')
    const user = userEvent.setup()
    const num = await screen.findByLabelText('Nomor invoice')
    await user.clear(num)
    await user.type(num, 'INV-010/JKD/XI/2026')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(posted).toBeDefined())
    expect(posted.autoNumber).toBe(false)
    expect(posted.number).toBe('INV-010/JKD/XI/2026')
  })

  it('shows the 409 message on save', async () => {
    mockFetch({
      ...me,
      ...banks,
      'GET /api/orders/5/invoice-draft': () => json(200, { number: 'INV-004/JKD/XI/2026', draft: deka() }),
      'POST /api/invoices': () => json(409, { error: 'Nomor invoice sudah dipakai' })
    })
    renderApp('/invoice/new?order=5')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nomor invoice sudah dipakai')
  })

  it('shows the 409 message when the order already has an invoice', async () => {
    mockFetch({
      ...me,
      ...banks,
      'GET /api/orders/5/invoice-draft': () => json(409, { error: 'Order sudah punya invoice' })
    })
    renderApp('/invoice/new?order=5')
    expect(await screen.findByRole('alert')).toHaveTextContent('Order sudah punya invoice')
  })

  it('shows an error when the bank list fails to load', async () => {
    mockFetch({
      ...me,
      'GET /api/banks': () => json(500, { error: 'boom' }),
      'GET /api/orders/5/invoice-draft': () => json(200, { number: 'INV-004/JKD/XI/2026', draft: deka() })
    })
    renderApp('/invoice/new?order=5')
    expect(await screen.findByText('Gagal memuat rekening')).toBeInTheDocument()
    expect(screen.getByLabelText('Nomor invoice')).toBeInTheDocument()
  })

  it('shows an error when the saved invoice has no id', async () => {
    mockFetch({
      ...me,
      ...banks,
      'GET /api/orders/5/invoice-draft': () => json(200, { number: 'INV-004/JKD/XI/2026', draft: deka() }),
      'POST /api/invoices': () => json(201, {})
    })
    renderApp('/invoice/new?order=5')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText(/ID tidak diterima/)).toBeInTheDocument()
  })

  it('adds and removes items', async () => {
    mockFetch({
      ...me,
      ...banks,
      'GET /api/orders/5/invoice-draft': () => json(200, { number: 'N', draft: deka() })
    })
    renderApp('/invoice/new?order=5')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Tambah item' }))
    expect(screen.getAllByLabelText(/^Nama item/)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Hapus item 2' }))
    expect(screen.getAllByLabelText(/^Nama item/)).toHaveLength(1)
  })
})

describe('InvoicesPage', () => {
  it('lists invoices and opens one on row click', async () => {
    mockFetch({
      ...me,
      'GET /api/invoices': () =>
        json(200, { rows: [{ id: 9, number: 'INV-004/JKD/XI/2026', orderId: 5, client: 'Deka Restu', total: 350000, date: '2026-11-16', createdAt: 'x' }], total: 1 }),
      'GET /api/invoices/9': () => json(200, { id: 9, number: 'INV-004/JKD/XI/2026', orderId: 5, data: deka() })
    })
    renderApp('/invoice')
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Nomor', 'Klien', 'Tanggal', 'Total', 'Aksi'])
    expect(within(table).getByText('Rp350.000')).toBeInTheDocument()
    await userEvent.setup().click(within(table).getByRole('link', { name: 'Lihat invoice INV-004/JKD/XI/2026' }))
    expect(await screen.findByRole('button', { name: /Download PDF/ })).toBeInTheDocument()
  })
})

describe('InvoiceView', () => {
  it('prints with the PDF title and edits with PUT', async () => {
    let put
    mockFetch({
      ...me,
      ...banks,
      'GET /api/invoices/9': () => json(200, { id: 9, number: 'INV-004/JKD/XI/2026', orderId: 5, data: deka() }),
      'PUT /api/invoices/9': (o) => {
        put = JSON.parse(o.body)
        return json(200, { id: 9, ...put, orderId: 5 })
      }
    })
    let titleAtPrint
    const print = vi.fn(() => {
      titleAtPrint = document.title
    })
    window.print = print
    renderApp('/invoice/9')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalled()
    expect(titleAtPrint).toBe('Invoice - Deka Restu - November 2026')
    await user.click(screen.getByRole('link', { name: /Edit/ }))
    const client = await screen.findByLabelText('Klien')
    await user.clear(client)
    await user.type(client, 'Deka R')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(put).toBeDefined())
    expect(put.number).toBe('INV-004/JKD/XI/2026')
    expect(put.data.client).toBe('Deka R')
  })
})
