import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import ElectionEventFormPage from './ElectionEventFormPage'

const mocks = vi.hoisted(() => ({
  saveDraft: vi.fn(), saveDraftAsync: vi.fn(), deleteDraft: vi.fn(),
  publishDraft: vi.fn(), uploadBanner: vi.fn(),
  getEvent: vi.fn(), updateEvent: vi.fn(),
  progress: { completedKeys: [], markComplete: vi.fn(), reset: vi.fn() },
}))
vi.mock('@/hooks/useDraft', () => ({ default: () => ({
  saveDraft: mocks.saveDraft, saveDraftAsync: mocks.saveDraftAsync,
  deleteDraft: mocks.deleteDraft, draft: null, saveStatus: 'idle', lastSavedAt: null,
}) }))
vi.mock('@/hooks/useFormSession', () => ({ default: () => ({ sessionKey: 'new-election', confirmLeave: null }) }))
vi.mock('@/hooks/useEventProgress', () => ({ default: () => mocks.progress }))
vi.mock('@/hooks/useSilentDraftAutosave', () => ({ default: vi.fn() }))
vi.mock('@/services/draft.service', () => ({ draftService: {
  publishDraft: mocks.publishDraft, uploadBanner: mocks.uploadBanner,
} }))
vi.mock('@/services/election.service', () => ({ electionService: {
  getEvent: mocks.getEvent, updateEvent: mocks.updateEvent, uploadBanner: mocks.uploadBanner,
} }))

function Location() { return <p data-testid="location">{useLocation().pathname}</p> }
function renderForm() {
  render(<MemoryRouter initialEntries={['/organizer/election/events/new']}>
    <ElectionEventFormPage /><Location />
  </MemoryRouter>)
}
function chooseDateTime(fieldName, day, hour, minute, period) {
  const input = screen.getByLabelText(new RegExp(`^${fieldName}`))
  fireEvent.click(input)
  fireEvent.click(screen.getByRole('button', { name: day.toDateString() }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  fireEvent.click(screen.getByRole('button', { name: `Hour ${hour}` }))
  fireEvent.click(screen.getByRole('button', { name: `Minute ${minute}` }))
  fireEvent.click(screen.getByRole('button', { name: period }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.saveDraft.mockResolvedValue(null)
  mocks.publishDraft.mockResolvedValue({ data: { event: { id: 'created-election' } } })
})

it('accepts native date inputs and submits the ISO payload only on Create & continue', async () => {
  renderForm()
  const now = new Date()
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  fireEvent.change(screen.getByRole('textbox', { name: /^Title/ }), { target: { value: 'Picker acceptance election' } })
  chooseDateTime('Start Date and Time', day, 12, 0, 'AM')
  chooseDateTime('End Date and Time', day, 12, 0, 'PM')
  expect(mocks.publishDraft).not.toHaveBeenCalled()
  expect(mocks.saveDraftAsync).not.toHaveBeenCalled()
  expect(screen.getByTestId('location')).toHaveTextContent('/organizer/election/events/new')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Create & continue' }))
  await screen.findByText('/organizer/election/events/created-election/positions')
  const end = new Date(day)
  end.setHours(12, 0, 0, 0)
  expect(mocks.publishDraft).toHaveBeenCalledExactlyOnceWith('election', {
    title: 'Picker acceptance election', description: '',
    startDate: day.toISOString(), endDate: end.toISOString(), resultsVisibility: 'public',
  })
})

it('shows the shared numbered setup progress on election details', () => {
  renderForm()
  const progress = screen.getByRole('navigation', { name: 'Event setup progress' })
  expect(within(progress).getByText('Details')).toBeInTheDocument()
  expect(within(progress).getByText('Branding')).toBeInTheDocument()
  expect(within(progress).queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next: Branding' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Your setup journey' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Draft protection' })).not.toBeInTheDocument()
})

it('retains the existing same-day end-before-start validation', async () => {
  renderForm()
  const now = new Date()
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  fireEvent.change(screen.getByRole('textbox', { name: /^Title/ }), { target: { value: 'Validation election' } })
  chooseDateTime('Start Date and Time', day, 3, 20, 'PM')
  chooseDateTime('End Date and Time', day, 12, 0, 'AM')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))
  expect(await screen.findByText('End date must be on or after start date')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create & continue' })).not.toBeInTheDocument()
  expect(mocks.publishDraft).not.toHaveBeenCalled()
  expect(mocks.saveDraftAsync).not.toHaveBeenCalled()
})
