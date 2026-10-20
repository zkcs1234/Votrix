import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PollingEventFormPage from './PollingEventFormPage'

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

function chooseDateTime(fieldName, date, hour) {
  fireEvent.click(screen.getByLabelText(new RegExp(`^${fieldName}`)))
  const now = new Date()
  const monthDelta = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth()
  for (let index = 0; index < Math.abs(monthDelta); index += 1) {
    fireEvent.click(screen.getByRole('button', { name: monthDelta > 0 ? 'Next month' : 'Previous month' }))
  }
  fireEvent.click(screen.getByRole('button', { name: date.toDateString() }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: `Hour ${hour % 12 || 12}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Minute 0' }))
  fireEvent.click(screen.getByRole('button', { name: hour >= 12 ? 'PM' : 'AM' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
}

function renderForm() {
  render(<MemoryRouter initialEntries={['/organizer/polling/events/new']}><Routes>
    <Route path="/organizer/polling/events/new" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/details" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/settings" element={<PollingEventFormPage />} />
    <Route path="/organizer/polling/events/:eventId/builder" element={<div>Builder</div>} />
  </Routes></MemoryRouter>)
}

async function fillSchedule() {
  fireEvent.change(screen.getByLabelText(/^Poll title/), { target: { value: 'Campus poll' } })
  const start = new Date(2026, 9, 20)
  const end = new Date(2026, 9, 22)
  chooseDateTime('Start Date and Time', start, 9)
  chooseDateTime('End Date and Time', end, 17)
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

it('uses the event end date as the poll expiration', async () => {
  renderForm()
  await fillSchedule()
  expect(screen.queryByLabelText(/^Poll expiration date and time/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create & continue' }))

  await waitFor(() => expect(mocks.publishDraft).toHaveBeenCalledTimes(1))
  const [, payload] = mocks.publishDraft.mock.calls[0]
  expect(payload).toMatchObject({
    title: 'Campus poll',
    startDate: new Date(2026, 9, 20, 9).toISOString(),
    endDate: new Date(2026, 9, 22, 17).toISOString(),
    pollExpiresAt: new Date(2026, 9, 22, 17).toISOString(),
  })
})

it('rejects an event end before its start before creating the event', async () => {
  renderForm()
  fireEvent.change(screen.getByLabelText(/^Poll title/), { target: { value: 'Campus poll' } })
  chooseDateTime('Start Date and Time', new Date(2026, 9, 20), 9)
  chooseDateTime('End Date and Time', new Date(2026, 9, 22), 17)
  fireEvent.change(screen.getByLabelText(/^End Date and Time/), {
    target: { value: '2026-10-19T17:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))

  expect(await screen.findByText('End date must be on or after start date')).toBeInTheDocument()
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
  render(<MemoryRouter initialEntries={['/organizer/polling/events/poll-id/details']}><Routes>
    <Route path="/organizer/polling/events/:eventId/details" element={<PollingEventFormPage />} />
  </Routes></MemoryRouter>)

  await screen.findByLabelText(/^Start Date and Time/)
  chooseDateTime('Start Date and Time', new Date(2026, 9, 22), 16)
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))

  await waitFor(() => expect(mocks.updateEvent).toHaveBeenCalledWith('poll-id', expect.objectContaining({
    startDate: new Date(2026, 9, 22, 16).toISOString(),
    endDate: '2026-10-22T17:00:00.000Z',
    pollExpiresAt: '2026-10-22T17:00:00.000Z',
  })))
})
