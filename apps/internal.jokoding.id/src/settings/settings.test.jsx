import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'

function json(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

function mockFetch(handlers) {
  const fn = vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`
    const h = handlers[key]
    if (!h) return json(404, { error: 'Tidak ditemukan' })
    return h(opts)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const me = (role) => ({ 'GET /api/auth/me': () => json(200, { id: 1, name: 'Budi', username: 'budi', role }) })

const settingsData = {
  'GET /api/banks': () =>
    json(200, [{ slot: 1, bankName: 'BCA', accountNumber: '111', accountHolder: 'Joko', isDefault: true }]),
  'GET /api/users': () =>
    json(200, [
      { id: 1, username: 'budi', name: 'Budi', role: 'admin', active: true },
      { id: 2, username: 'andi', name: 'Andi', role: 'member', active: true }
    ])
}

const renderApp = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )

const bodyOf = (fetchFn, key) => {
  const call = fetchFn.mock.calls.find(
    ([url, o = {}]) => `${o.method || 'GET'} ${new URL(url, 'http://localhost').pathname}` === key
  )
  return call && JSON.parse(call[1].body)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Pengaturan', () => {
  it('member does not see the nav item and is redirected away', async () => {
    mockFetch({ ...me('member'), 'GET /api/orders': () => json(200, []) })
    renderApp('/pengaturan')
    expect(await screen.findByRole('link', { name: 'Beranda' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pengaturan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pengaturan' })).not.toBeInTheDocument()
  })

  it('admin sees banks and members; saves bank and makes slot 2 default', async () => {
    const f = mockFetch({
      ...me('admin'),
      ...settingsData,
      'PUT /api/banks/1': (o) => json(200, JSON.parse(o.body)),
      'PUT /api/banks/2': (o) => json(200, JSON.parse(o.body))
    })
    renderApp('/pengaturan')
    expect(await screen.findByRole('link', { name: 'Pengaturan' })).toBeInTheDocument()
    const card1 = await screen.findByRole('form', { name: 'Rekening 1' })
    expect(within(card1).getByLabelText('Nomor rekening')).toHaveValue('111')
    expect(within(card1).getByText('Default')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.clear(within(card1).getByLabelText('Nomor rekening'))
    await user.type(within(card1).getByLabelText('Nomor rekening'), '999')
    await user.click(within(card1).getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(bodyOf(f, 'PUT /api/banks/1')).toEqual({
        bankName: 'BCA', accountNumber: '999', accountHolder: 'Joko', isDefault: false
      })
    )
    const card2 = screen.getByRole('form', { name: 'Rekening 2' })
    await user.type(within(card2).getByLabelText('Nama bank'), 'BNI')
    await user.type(within(card2).getByLabelText('Nomor rekening'), '222')
    await user.type(within(card2).getByLabelText('Atas nama'), 'Joko')
    await user.click(within(card2).getByRole('button', { name: 'Jadikan default' }))
    await waitFor(() =>
      expect(bodyOf(f, 'PUT /api/banks/2')).toEqual({
        bankName: 'BNI', accountNumber: '222', accountHolder: 'Joko', isDefault: true
      })
    )
  })

  it('admin adds a member, deactivates one, and resets a password', async () => {
    const f = mockFetch({
      ...me('admin'),
      ...settingsData,
      'POST /api/users': () => json(201, { id: 3, username: 'cici', name: 'Cici', role: 'member', active: true }),
      'PATCH /api/users/2': () => json(200, { id: 2, username: 'andi', name: 'Andi', role: 'member', active: false })
    })
    renderApp('/pengaturan')
    const row = (await screen.findByRole('cell', { name: 'andi' })).closest('tr')
    const selfRow = screen.getByRole('cell', { name: 'budi' }).closest('tr')
    expect(within(selfRow).queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(row).getByRole('button', { name: 'Nonaktifkan' }))
    await waitFor(() => expect(bodyOf(f, 'PATCH /api/users/2')).toEqual({ active: false }))

    const form = screen.getByRole('form', { name: 'Tambah anggota' })
    await user.type(within(form).getByLabelText('Nama'), 'Cici')
    await user.type(within(form).getByLabelText('Username'), 'cici')
    await user.type(within(form).getByLabelText('Password'), 'password1')
    await user.click(within(form).getByRole('button', { name: 'Tambah' }))
    await waitFor(() =>
      expect(bodyOf(f, 'POST /api/users')).toEqual({ username: 'cici', name: 'Cici', password: 'password1' })
    )

    f.mockClear()
    const row2 = screen.getByRole('cell', { name: 'andi' }).closest('tr')
    await user.click(within(row2).getByRole('button', { name: 'Reset password' }))
    await user.type(screen.getByLabelText('Password baru'), 'newpassword')
    await user.click(screen.getByRole('button', { name: 'Simpan password' }))
    await waitFor(() => expect(bodyOf(f, 'PATCH /api/users/2')).toEqual({ password: 'newpassword' }))
    expect(await screen.findByText('Password andi diganti')).toBeInTheDocument()
  })
})
