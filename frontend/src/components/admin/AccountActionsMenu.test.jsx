import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccountActionsMenu from './AccountActionsMenu'

const base = { status: 'active', onEdit: vi.fn(), onView: vi.fn(), onStatusChange: vi.fn() }

describe('AccountActionsMenu resend', () => {
  it('shows no Resend button unless a handler is given', () => {
    render(<AccountActionsMenu {...base} />)
    expect(screen.queryByRole('button', { name: /resend/i })).toBeNull()
  })

  it('calls onResend when Resend is clicked', () => {
    const onResend = vi.fn()
    render(<AccountActionsMenu {...base} onResend={onResend} />)
    fireEvent.click(screen.getByRole('button', { name: /resend/i }))
    expect(onResend).toHaveBeenCalledTimes(1)
  })
})
