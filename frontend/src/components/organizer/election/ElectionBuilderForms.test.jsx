import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PositionForm from './PositionForm'
import GroupNameForm from './GroupNameForm'
import CandidateForm from './CandidateForm'

vi.mock('@/components/upload/ImageUploadField', () => ({ default: () => null }))

describe('PositionForm', () => {
  const setup = (props = {}) => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(
      <PositionForm
        sectionId="g1"
        saving={false}
        canManageEligibility
        programs={['BSIT', 'BSCS']}
        onCreate={onCreate}
        {...props}
      />,
    )
    return { onCreate }
  }

  it('flags a blank name and bad numbers while typing, and explains the disabled button', async () => {
    setup()
    const add = screen.getByRole('button', { name: 'Add position' })
    expect(add).toBeDisabled()
    expect(screen.getByText('Fill in the required fields to continue.')).toBeInTheDocument()

    const name = screen.getByPlaceholderText('e.g. President')
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.blur(name)
    expect(await screen.findByText('Position name is required')).toBeInTheDocument()

    const winners = screen.getByLabelText(/^Number of winners/)
    fireEvent.change(winners, { target: { value: '0' } })
    fireEvent.blur(winners)
    expect(await screen.findByText('Number of winners must be at least 1')).toBeInTheDocument()
    expect(add).toBeDisabled()
  })

  it('requires a program when "Only selected programs" is chosen, instead of a toast after submit', async () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('e.g. President'), { target: { value: 'President' } })
    const add = screen.getByRole('button', { name: 'Add position' })
    await waitFor(() => expect(add).toBeEnabled())

    fireEvent.click(screen.getByLabelText('Only selected programs'))
    expect(await screen.findByText('Select at least one program, or allow all voters in the group')).toBeInTheDocument()
    expect(add).toBeDisabled()

    fireEvent.click(screen.getByLabelText('BSIT'))
    await waitFor(() => expect(add).toBeEnabled())
  })

  it('sends numbers and the chosen programs, then clears the form', async () => {
    const { onCreate } = setup()
    const name = screen.getByPlaceholderText('e.g. President')
    fireEvent.change(name, { target: { value: ' Treasurer ' } })
    fireEvent.change(screen.getByLabelText(/^Display order/), { target: { value: '3' } })
    fireEvent.click(screen.getByLabelText('Only selected programs'))
    fireEvent.click(screen.getByLabelText('BSCS'))
    const add = screen.getByRole('button', { name: 'Add position' })
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      name: 'Treasurer', description: null, numberOfWinners: 1, maxVote: 1, displayOrder: 3,
      allowSkip: false, eligiblePrograms: ['BSCS'],
    }))
    await waitFor(() => expect(name).toHaveValue(''))
  })
})

describe('GroupNameForm', () => {
  it('flags a duplicate name (case-insensitively) as it is typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<GroupNameForm otherNames={['SSG']} submitLabel="Add" savingLabel="Adding" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Election group name')
    fireEvent.change(input, { target: { value: 'ssg' } })
    fireEvent.blur(input)
    expect(await screen.findByText('An election group with this name already exists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

    fireEvent.change(input, { target: { value: 'FSTLP' } })
    const add = screen.getByRole('button', { name: 'Add' })
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('FSTLP'))
  })

  it('rename keeps Save disabled until the name actually changes', async () => {
    render(
      <GroupNameForm
        initialName="SSG"
        otherNames={['FSTLP']}
        ariaLabel="Rename SSG"
        submitLabel="Save name"
        savingLabel="Saving"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const save = screen.getByRole('button', { name: 'Save name' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Rename SSG'), { target: { value: 'SSG Council' } })
    await waitFor(() => expect(save).toBeEnabled())
  })
})

describe('CandidateForm', () => {
  const positions = [{ id: 'p1', name: 'President' }]

  it('shows what is missing instead of silently doing nothing', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<CandidateForm positions={positions} sectionId="g1" saving={false} onCreate={onCreate} />)
    const add = screen.getByRole('button', { name: 'Add candidate' })
    expect(add).toBeDisabled()

    const position = screen.getByLabelText(/^Position/)
    fireEvent.focus(position)
    fireEvent.blur(position)
    expect(await screen.findByText('Select a position')).toBeInTheDocument()

    fireEvent.change(position, { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ada Lovelace' } })
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      { positionId: 'p1', name: 'Ada Lovelace', party: '', biography: '', platform: '' },
      null,
    ))
  })
})
