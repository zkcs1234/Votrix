import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import ElectionEventFormPage from './ElectionEventFormPage'
import { chooseDateTime } from '@/test/pickDateTime'

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

it('does not let the end be set before the start on the same day', async () => {
  renderForm()
  const now = new Date()
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  fireEvent.change(screen.getByRole('textbox', { name: /^Title/ }), { target: { value: 'Validation election' } })
  chooseDateTime('Start Date and Time', day, 3, 20, 'PM')

  // The picker enforces the order itself: an earlier time that day is disabled,
  // so an invalid range cannot be entered (the schema still rejects one that
  // arrives some other way; see event.schemas.test.js).
  fireEvent.click(screen.getByLabelText(/^End Date and Time/))
  fireEvent.click(screen.getByRole('button', { name: day.toDateString() }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  fireEvent.click(screen.getByRole('button', { name: 'AM' }))
  expect(screen.getByRole('button', { name: 'Hour 12' })).toBeDisabled()
  expect(mocks.publishDraft).not.toHaveBeenCalled()
  expect(mocks.saveDraftAsync).not.toHaveBeenCalled()
})
