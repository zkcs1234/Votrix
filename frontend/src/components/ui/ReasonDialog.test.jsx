import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import ReasonDialog, { useReasonDialog } from './ReasonDialog'

describe('ReasonDialog', () => {
  it('keeps Confirm disabled until a reason is typed, then submits it trimmed', async () => {
    const onSubmit = vi.fn()
    render(<ReasonDialog title="Reopen" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Enter a reason to continue.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: '  Wrong entry  ' } })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    expect(onSubmit).toHaveBeenCalledWith('Wrong entry')
  })

  it('shows the minimum length as it is typed', async () => {
    render(<ReasonDialog title="Reopen" minLength={5} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    const field = screen.getByLabelText(/^Reason/)
    fireEvent.change(field, { target: { value: 'abc' } })
    expect(await screen.findByText('Reason must be at least 5 characters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('flags a reason over the maximum and shows a counter', async () => {
    render(<ReasonDialog title="Reopen" maxLength={20} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'x'.repeat(25) } })
    expect(await screen.findByText('Reason must be 20 characters or fewer.')).toBeInTheDocument()
    expect(screen.getByText('25/20')).toBeInTheDocument()
  })
})

describe('useReasonDialog', () => {
  function Harness({ onResult }) {
    const { ask, dialog } = useReasonDialog()
    const [, force] = useState(0)
    return (
      <div>
        <button onClick={async () => { onResult(await ask({ title: 'Why?' })); force(1) }}>open</button>
        {dialog}
      </div>
    )
  }

  it('resolves to the typed reason, and to null when cancelled', async () => {
    const onResult = vi.fn()
    render(<Harness onResult={onResult} />)

    fireEvent.click(screen.getByText('open'))
    fireEvent.change(await screen.findByLabelText(/^Reason/), { target: { value: 'Because' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith('Because'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('open'))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(null))
  })
})
