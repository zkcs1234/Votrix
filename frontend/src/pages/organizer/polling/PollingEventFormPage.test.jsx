import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PollingEventFormPage from './PollingEventFormPage'
import { chooseDateTime, daysFromToday } from '@/test/pickDateTime'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateEvent: vi.fn(),
  publishDraft: vi.fn(),
  saveDraft: vi.fn(),
  saveDraftAsync: vi.fn(),
  deleteDraft: vi.fn(),
  markComplete: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('@/services/polling.service', () => ({ pollingService: {
  getSettings: mocks.getSettings,
  updateEvent: mocks.updateEvent,
} }))
vi.mock('@/services/draft.service', () => ({ draftService: {
  publishDraft: mocks.publishDraft,
} }))
vi.mock('@/hooks/useDraft', () => ({ default: () => ({
  saveDraft: mocks.saveDraft,
  saveDraftAsync: mocks.saveDraftAsync,
  deleteDraft: mocks.deleteDraft,
  draft: null,
  saveStatus: 'idle',
  lastSavedAt: null,
}) }))
vi.mock('@/hooks/useFormSession', () => ({ default: () => ({
  sessionKey: 'new-poll',
  confirmLeave: null,
}) }))
vi.mock('@/hooks/useEventProgress', () => ({ default: () => ({
  markComplete: mocks.markComplete,
  reset: mocks.reset,
}) }))
vi.mock('@/hooks/useSilentDraftAutosave', () => ({ default: vi.fn() }))
vi.mock('@/components/upload/ImageUploadField', () => ({ default: () => <div>Poll banner upload</div> }))

function renderForm() {
  render(<MemoryRouter initialEntries={['/organizer/polling/events/new']}><Routes>
    <Route path="/organizer/polling/events/new" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/details" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/settings" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/builder" element={<div>Builder</div>} />
  </Routes></MemoryRouter>)
}

// Dates are relative to today because the picker does not accept past dates.
const start = daysFromToday(2)
const end = daysFromToday(4)

async function fillSchedule() {
  fireEvent.change(screen.getByLabelText(/^Poll title/), { target: { value: 'Campus poll' } })
  chooseDateTime('Start Date and Time', start, 9, 0, 'AM')
  chooseDateTime('End Date and Time', end, 5, 0, 'PM')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))
  await screen.findByText('Poll banner upload')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Settings' }))
  await screen.findByLabelText(/^Anonymous responses/)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.saveDraft.mockResolvedValue(null)
  mocks.publishDraft.mockResolvedValue({ data: { event: { id: 'created-poll' } } })
  mocks.updateEvent.mockResolvedValue({ data: { event: { id: 'poll-id' } } })
})

it('shows the shared numbered setup progress on polling details', () => {
  renderForm()
  const progress = screen.getByRole('navigation', { name: 'Event setup progress' })
  expect(within(progress).getByText('Details')).toBeInTheDocument()
  expect(within(progress).getByText('Branding')).toBeInTheDocument()
  expect(within(progress).getByText('Settings')).toBeInTheDocument()
  expect(within(progress).queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next: Branding' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Your setup journey' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Draft protection' })).not.toBeInTheDocument()
})

it('uses the event end date as the poll expiration', async () => {
  renderForm()
  await fillSchedule()
  expect(screen.queryByLabelText(/^Poll expiration date and time/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create & continue' }))

  await waitFor(() => expect(mocks.publishDraft).toHaveBeenCalledTimes(1))
  const [, payload] = mocks.publishDraft.mock.calls[0]
  expect(payload).toMatchObject({
    title: 'Campus poll',
    startDate: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9).toISOString(),
    endDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 17).toISOString(),
    pollExpiresAt: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 17).toISOString(),
  })
})

it('does not let the end be set before the start before creating the event', async () => {
  renderForm()
  fireEvent.change(screen.getByLabelText(/^Poll title/), { target: { value: 'Campus poll' } })
  chooseDateTime('Start Date and Time', start, 9, 0, 'AM')

  // The picker itself refuses a day earlier than the start, so an invalid range
  // cannot be entered (the schema still rejects one that arrives another way).
  fireEvent.click(screen.getByLabelText(/^End Date and Time/))
  expect(screen.getByRole('button', { name: daysFromToday(1).toDateString() })).toBeDisabled()
  expect(mocks.publishDraft).not.toHaveBeenCalled()
})

it('uses the event end date when updating polling settings', async () => {
  mocks.getSettings.mockResolvedValue({ data: { settings: {
    id: 'poll-id',
    title: 'Saved poll',
    description: '',
    startDate: '2026-10-20T09:00:00.000Z',
    endDate: '2026-10-22T17:00:00.000Z',
    pollExpiresAt: '2026-10-21T12:00:00.000Z',
    status: 'draft',
    pollAnonymous: false,
    pollAllowMultipleSubmissions: false,
  } } })
  render(<MemoryRouter initialEntries={['/organizer/polling/events/poll-id/settings']}><Routes>
    <Route path="/organizer/polling/events/:eventId/settings" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/builder" element={<div>Builder</div>} />
  </Routes></MemoryRouter>)

  await screen.findByLabelText(/^Anonymous responses/)
  expect(screen.queryByLabelText(/^Poll expiration date and time/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next: Builder' }))
  await waitFor(() => expect(mocks.updateEvent).toHaveBeenCalledWith('poll-id', expect.objectContaining({
    pollExpiresAt: new Date('2026-10-22T17:00:00.000Z').toISOString(),
  })))
})

it('replaces a legacy saved expiration with the updated event end date', async () => {
  const savedEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 17)
  mocks.getSettings.mockResolvedValue({ data: { settings: {
    id: 'poll-id',
    title: 'Saved poll',
    description: '',
    startDate: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9).toISOString(),
    endDate: savedEnd.toISOString(),
    pollExpiresAt: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1, 12).toISOString(),
    status: 'draft',
    pollAnonymous: false,
    pollAllowMultipleSubmissions: false,
  } } })
  render(<MemoryRouter initialEntries={['/organizer/polling/events/poll-id/details']}><Routes>
    <Route path="/organizer/polling/events/:eventId/details" element={<PollingEventFormPage />} />
  </Routes></MemoryRouter>)

  await screen.findByLabelText(/^Start Date and Time/)
  chooseDateTime('Start Date and Time', end, 4, 0, 'PM')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))

  await waitFor(() => expect(mocks.updateEvent).toHaveBeenCalledWith('poll-id', expect.objectContaining({
    startDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 16).toISOString(),
    endDate: savedEnd.toISOString(),
    pollExpiresAt: savedEnd.toISOString(),
  })))
})
