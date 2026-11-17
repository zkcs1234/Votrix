import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CompetitionRoundSettings from './CompetitionRoundSettings'

const rounds = [
  { id: 'r1', name: 'Prelim', purpose: 'qualification', progression: 'weighted', weight: 60, displayOrder: 0, categoryId: null, advancementType: 'top_n', advancementValue: 5 },
  { id: 'r2', name: 'Final', purpose: 'final', progression: 'weighted', weight: 30, displayOrder: 1, categoryId: null },
]
const foundation = { categories: [], divisions: [], criteria: [], event: {}, scoringConfig: {} }

function setup(section, round = rounds[0]) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <CompetitionRoundSettings
        eventId="e" round={round} rounds={rounds} foundation={foundation} section={section}
        onSectionChange={vi.fn()} onConfigureCriteria={vi.fn()} onConfigureDeductions={vi.fn()}
        onSave={onSave} onMove={vi.fn()} readOnly={false} busy={false}
      />
    </MemoryRouter>,
  )
  return { onSave }
}

describe('Advancement settings live validation', () => {
  it('flags a bad number of advancing entries as it is typed and clears it when fixed', async () => {
    const { onSave } = setup('advancement')
    const amount = screen.getByLabelText('Number of entries advancing')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(amount, { target: { value: '0' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a whole number of entries greater than 0.')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save advancement' }))
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(amount, { target: { value: '3' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Save advancement' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ advancementType: 'top_n', advancementValue: 3 })))
  })

  it('checks a percentage against 100', async () => {
    setup('advancement', { ...rounds[0], advancementType: 'top_percent', advancementValue: 50 })
    const amount = screen.getByLabelText('Percentage of entries advancing')
    fireEvent.change(amount, { target: { value: '150' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('no more than 100')
  })
})

describe('Next round / score settings live validation', () => {
  it('flags a contribution above the available budget while typing', async () => {
    setup('progression', { ...rounds[1], progression: 'weighted', weight: 30 })
    const contribution = screen.getByLabelText('Contribution to combined result (%)')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(contribution, { target: { value: '60' } }) // Prelim holds 60%, so 40% is available
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 40.00% is available')
    expect(contribution).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(contribution, { target: { value: '35' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
