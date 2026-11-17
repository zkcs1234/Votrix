import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CompetitionRoundForm from './CompetitionRoundForm'

const rounds = [{ id: 'r1', name: 'Prelim', progression: 'weighted', weight: 60, purpose: 'regular', categoryId: null }]
const setup = (props = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<CompetitionRoundForm rounds={rounds} onSave={onSave} {...props} />)
  return { onSave }
}

describe('CompetitionRoundForm live validation', () => {
  it('flags a blank name once it has been left, and clears it as soon as one is typed', async () => {
    setup()
    const name = screen.getByLabelText('Round name')
    expect(screen.queryByText('Enter a name for this round.')).not.toBeInTheDocument() // nothing nags on first load

    fireEvent.change(name, { target: { value: '   ' } })
    expect(await screen.findByText('Enter a name for this round.')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(name, { target: { value: 'Final' } })
    await waitFor(() => expect(screen.queryByText('Enter a name for this round.')).not.toBeInTheDocument())
  })

  it('flags a contribution that does not fit the combined budget as it is typed', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('How are scores used?'), { target: { value: 'weighted' } })
    const weight = screen.getByLabelText('Contribution to combined result (%)')
    expect(screen.queryByText(/Only .* is available/)).not.toBeInTheDocument()

    fireEvent.change(weight, { target: { value: '70' } }) // 60% is already assigned, so 40% is available
    expect(await screen.findByText('Only 40.00% is available in this combined result. Enter a smaller contribution.')).toBeInTheDocument()
    expect(weight).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(weight, { target: { value: '40' } })
    await waitFor(() => expect(screen.queryByText(/Only .* is available/)).not.toBeInTheDocument())
  })

  it('still blocks Save while invalid and saves once it is valid', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }))
    expect(await screen.findByText('Enter a name for this round.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Final' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Final' })))
  })
})
