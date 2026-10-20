import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionEventFormPage from './CompetitionEventFormPage'
import { pageantService } from '@/services/pageant.service'
import { draftService } from '@/services/draft.service'

const drafts = vi.hoisted(() => ({ saveDraft: vi.fn(), saveDraftAsync: vi.fn(), deleteDraft: vi.fn(), draft: null }))
const progress = vi.hoisted(() => ({ completedKeys: [], markComplete: vi.fn(), reset: vi.fn() }))
vi.mock('@/services/pageant.service', () => ({ pageantService: { getTemplates: vi.fn(), getEvent: vi.fn(), updateEvent: vi.fn(), uploadBanner: vi.fn() } }))
vi.mock('@/services/draft.service', () => ({ draftService: { publishDraft: vi.fn(), uploadBanner: vi.fn() } }))
vi.mock('@/hooks/useDraft', () => ({ default: () => ({ ...drafts, saveStatus: 'idle', lastSavedAt: null }) }))
vi.mock('@/hooks/useFormSession', () => ({ default: ({ eventId }) => ({ sessionKey: eventId ? `edit:${eventId}` : 'create', confirmLeave: null }) }))
vi.mock('@/hooks/useEventProgress', () => ({ default: () => progress }))
vi.mock('@/hooks/useSilentDraftAutosave', () => ({ default: () => {} }))
vi.mock('@/components/upload/ImageUploadField', () => ({ default: ({ onFileSelect, disabled }) => <input type="file" aria-label="Event banner" disabled={disabled} onChange={event => onFileSelect(event.target.files[0])} /> }))

beforeEach(() => {
  vi.resetAllMocks(); drafts.draft = null
  pageantService.getTemplates.mockResolvedValue({ data: { templates: [] } })
  drafts.saveDraft.mockResolvedValue({ id: 'draft' }); drafts.deleteDraft.mockResolvedValue()
  draftService.uploadBanner.mockResolvedValue({ data: { url: '/banner.png' } })
  draftService.publishDraft.mockResolvedValue({ data: { event: { id: 'created' } } })
})
function open(path = '/organizer/competition/events/new') {
  render(<MemoryRouter initialEntries={[path]}><nav><Link to="/organizer/competition/events/existing/edit">Open existing event</Link><Link to="/organizer/competition/events/new">Start another create</Link></nav><Routes>
    <Route path="/organizer/competition/events/new" element={<CompetitionEventFormPage />} />
    <Route path="/organizer/competition/events/:eventId/branding" element={<CompetitionEventFormPage />} />
    <Route path="/organizer/competition/events/:eventId/edit" element={<CompetitionEventFormPage />} />
    <Route path="/organizer/competition/events/:eventId/categories" element={<p>Created categories</p>} />
  </Routes></MemoryRouter>)
}
<<<<<<< HEAD
function chooseDateTime(label, date, hour, minute, period) {
  fireEvent.click(screen.getByLabelText(new RegExp(`^${label}`)))
  const now = new Date()
  const monthOffset = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth()
  for (let i = 0; i < Math.abs(monthOffset); i += 1) {
    fireEvent.click(screen.getByRole('button', { name: monthOffset < 0 ? 'Previous month' : 'Next month' }))
  }
  fireEvent.click(screen.getByRole('button', { name: date.toDateString() }))
  fireEvent.click(screen.getByRole('button', { name: 'Time' }))
  fireEvent.click(screen.getByRole('button', { name: `Hour ${hour}` }))
  fireEvent.click(screen.getByRole('button', { name: `Minute ${minute}` }))
  fireEvent.click(screen.getByRole('button', { name: period }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
}
function fillDetails() {
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Campus Finals' } })
  const date = new Date()
  date.setDate(date.getDate() + 2)
  chooseDateTime('Start Date', date, 9, 0, 'AM')
  chooseDateTime('End Date', date, 5, 0, 'PM')
=======
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
async function fillDetails() {
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Campus Finals' } })
  const date = new Date(2026, 9, 20)
  chooseDateTime('Start Date and Time', date, 9)
  chooseDateTime('End Date and Time', date, 17)
>>>>>>> main
}
async function branding() {
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))
  await screen.findByRole('button', { name: 'Next: Competition Type' })
}
async function competitionType() {
  await branding()
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competition Type' }))
  await screen.findByLabelText(/Competition type/)
  fireEvent.change(screen.getByLabelText(/Competition type/), {target:{value:'dance'}})
}
it('competition type is a separate required third step and validates a custom type before parent creation', async () => {
  open(); await fillDetails(); await branding()
  expect(screen.queryByLabelText(/Competition type/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', {name:'Next: Competition Type'}))
  await screen.findByLabelText(/Competition type/)
  fireEvent.change(screen.getByLabelText(/Competition type/), { target: { value: '__other__' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competitions / Categories' }))
  await screen.findByText('Enter a competition type.')
  expect(draftService.publishDraft).not.toHaveBeenCalled()
})
it('failed draft save retains Details and typed values for retry', async () => {
  drafts.saveDraft.mockRejectedValueOnce({ response: { data: { message: 'Draft service unavailable' } } })
  open(); await fillDetails(); fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))
  await screen.findByText('Draft service unavailable')
  expect(screen.getByLabelText(/^Title/)).toHaveValue('Campus Finals')
  expect(screen.queryByRole('button', { name: 'Next: Competitions / Categories' })).not.toBeInTheDocument()
})
it('Branding Back returns to populated Details without losing a selected banner', async () => {
  open(); await fillDetails(); await branding()
  const file = new File(['banner'], 'banner.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Event banner'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Back: Event Details' }))
  expect(screen.getByLabelText(/^Title/)).toHaveValue('Campus Finals')
<<<<<<< HEAD
  expect(screen.getByLabelText(/^Start Date/).value).toMatch(/9:00 AM/)
=======
  expect(screen.getByLabelText(/^Start Date/).value).toContain('Oct 20, 2026')
>>>>>>> main
  await competitionType()
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competitions / Categories' }))
  await screen.findByText('Created categories')
  expect(draftService.uploadBanner).toHaveBeenCalledExactlyOnceWith('competition', file)
})
it('duplicate clicks and a lost creation response preserve one creation key across retries', async () => {
  let reject
  draftService.publishDraft.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure }))
  open(); await fillDetails(); await competitionType()
  const create = screen.getByRole('button', { name: 'Next: Competitions / Categories' })
  fireEvent.click(create); fireEvent.click(create)
  await waitFor(() => expect(draftService.publishDraft).toHaveBeenCalledTimes(1))
  const firstPayload = draftService.publishDraft.mock.calls[0][1]
  expect(firstPayload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  reject({ response: { data: { message: 'Response interrupted' } } })
  await screen.findByText('Response interrupted')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competitions / Categories' }))
  await screen.findByText('Created categories')
  expect(draftService.publishDraft.mock.calls[1][1]).toEqual(firstPayload)
  expect(drafts.deleteDraft).toHaveBeenCalledTimes(1)
})
it('direct new Branding route cannot create an event with missing Details', async () => {
  open('/organizer/competition/events/new/branding')
  fireEvent.click(screen.getByRole('button', { name: 'Next: Competition Type' }))
  await screen.findByText('Check the event details before creating this competition.')
  expect(draftService.publishDraft).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/^Title/)).toBeInTheDocument()
})
it('failed existing-event fetch shows retry instead of an editable empty event', async () => {
  pageantService.getEvent.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Event access denied' } } })
  pageantService.getEvent.mockResolvedValueOnce({ data: { event: { id: 'e', status: 'draft', title: 'Saved title', startDate: '2026-10-20T09:00:00Z', endDate: '2026-10-20T17:00:00Z' } } })
  open('/organizer/competition/events/e/edit')
  await screen.findByText('Event access denied')
  expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading event' }))
  await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Saved title'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('rejects whitespace-only title through the footer before creating a draft', async () => {
  open(); await fillDetails()
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: Branding' }))
  await screen.findByText('Title is required')
  expect(drafts.saveDraft).not.toHaveBeenCalled()
})
it('a different form session rotates create identity while retries within a session keep it',async()=>{
 draftService.publishDraft.mockRejectedValueOnce({response:{data:{message:'Interrupted response'}}})
 pageantService.getEvent.mockResolvedValue({data:{event:{id:'existing',status:'draft',title:'Existing competition',startDate:'2026-10-20T09:00:00Z',endDate:'2026-10-20T17:00:00Z'}}})
 open();await fillDetails();await competitionType();fireEvent.click(screen.getByRole('button',{name:'Next: Competitions / Categories'}))
 await screen.findByText('Interrupted response')
 const previousKey=draftService.publishDraft.mock.calls[0][1].idempotencyKey
 fireEvent.click(screen.getByRole('link',{name:'Open existing event'}))
 await waitFor(()=>expect(screen.getByLabelText(/^Title/)).toHaveValue('Existing competition'))
 fireEvent.click(screen.getByRole('link',{name:'Start another create'}))
 await waitFor(()=>expect(screen.getByLabelText(/^Title/)).toHaveValue(''))
 await fillDetails();await competitionType();fireEvent.click(screen.getByRole('button',{name:'Next: Competitions / Categories'}))
 await screen.findByText('Created categories')
 expect(draftService.publishDraft.mock.calls[1][1].idempotencyKey).not.toBe(previousKey)
})
