import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ResetPasswordPage from './ResetPasswordPage'
import LoginPage from './LoginPage'
import ForgotPasswordPage from './ForgotPasswordPage'
import { authService } from '@/services/auth.service'

vi.mock('@/services/auth.service', () => ({
  authService: { resetPassword: vi.fn(), login: vi.fn(), forgotPassword: vi.fn() },
}))
vi.mock('@/hooks/useLogin', () => ({ useLogin: () => ({ handleSubmit: vi.fn(), error: null, loading: false }) }))

const renderAt = (ui, url = '/') => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Login', () => {
  it('flags a malformed email when the field is left, and clears it once fixed', async () => {
    renderAt(<LoginPage />)
    const email = screen.getByLabelText(/^Email/)
    fireEvent.change(email, { target: { value: 'ada@' } })
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument() // not while still typing the first time
    fireEvent.blur(email)
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()

    fireEvent.change(email, { target: { value: 'ada@example.com' } })
    await waitFor(() => expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument())
  })

  it('asks for the password after leaving it empty', async () => {
    renderAt(<LoginPage />)
    const password = screen.getByLabelText(/^Password/)
    fireEvent.focus(password)
    fireEvent.blur(password)
    expect(await screen.findByText('Password is required')).toBeInTheDocument()
  })
})

describe('Forgot password', () => {
  it('validates the email while typing', async () => {
    renderAt(<ForgotPasswordPage />)
    const email = screen.getByLabelText(/^Email/)
    fireEvent.change(email, { target: { value: 'nope' } })
    fireEvent.blur(email)
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
  })
})

describe('Reset password', () => {
  it('shows the length rule, then re-checks the match when the new password changes', async () => {
    renderAt(<ResetPasswordPage />, '/reset-password?token=abc')
    const next = screen.getByLabelText(/^New password/)
    const confirm = screen.getByLabelText(/^Confirm new password/)

    fireEvent.change(next, { target: { value: 'short' } })
    fireEvent.blur(next)
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()

    fireEvent.change(next, { target: { value: 'longenough1' } })
    fireEvent.change(confirm, { target: { value: 'different1' } })
    fireEvent.blur(confirm)
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()

    // Changing the NEW password so they agree clears the confirm box's message.
    fireEvent.change(next, { target: { value: 'different1' } })
    await waitFor(() => expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument())
  })

  it('does not nag about the empty confirm box while the new password is still being typed', async () => {
    renderAt(<ResetPasswordPage />, '/reset-password?token=abc')
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'longenough1' } })
    expect(screen.queryByText('Confirm your password')).not.toBeInTheDocument()
    expect(authService.resetPassword).not.toHaveBeenCalled()
  })
})
