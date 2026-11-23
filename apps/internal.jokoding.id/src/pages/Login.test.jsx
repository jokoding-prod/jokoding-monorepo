import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: null, login: vi.fn() }) }))

import Login from './Login.jsx'

describe('Login', () => {
  it('eye button toggles password visibility', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Tampilkan password' }))
    expect(input).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Sembunyikan password' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
