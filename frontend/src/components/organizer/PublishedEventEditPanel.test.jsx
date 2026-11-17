import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PublishedEventEditPanel from './PublishedEventEditPanel'

const success = vi.fn()
const error = vi.fn()
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success, error }) }))

const scheduledPolicy = {
  status: 'scheduled',
  reasonRequired: true,
  liveEditableFields: ['title', 'description', 'banner', 'startDate', 'endDate'],
  endDateExtendOnly: false,
  canPauseRevise: false,
  hasActivity: false,
  isTerminal: false,
}
const activePolicy = {
  ...scheduledPolicy,
  status: 'active',
  liveEditableFields: ['title', 'description', 'banner', 'endDate'],
  endDateExtendOnly: true,
  canPauseRevise: true,
}

const baseEvent = {
  title: 'Student Council',
  description: 'Vote',
  startDate: '2030-01-01T08:00:00.000Z',
  endDate: '2030-01-05T08:00:00.000Z',
}

let service
const renderPanel = (event, policy, extra = {}) => {
  service = {
    getEditPolicy: vi.fn().mockResolvedValue({ data: { policy } }),
    updateEvent: vi.fn().mockResolvedValue({ data: { success: true } }),
    unpublishEvent: vi.fn().mockResolvedValue({ data: { success: true } }),
  }
  const onChanged = vi.fn()
  render(
    <PublishedEventEditPanel
      eventId="e1"
      event={event}
      service={service}
      noun="election"
      onChanged={onChanged}
      {...extra}
    />,
  )
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PublishedEventEditPanel', () => {
  it('renders nothing for a draft event and never asks for the policy', () => {
    renderPanel({ ...baseEvent, status: 'draft' }, scheduledPolicy)
    expect(screen.queryByTestId('published-edit-panel')).not.toBeInTheDocument()
    expect(service.getEditPolicy).not.toHaveBeenCalled()
  })

  it('renders nothing for a closed event', async () => {
    renderPanel({ ...baseEvent, status: 'completed' }, { ...scheduledPolicy, isTerminal: true })
    expect(screen.queryByTestId('published-edit-panel')).not.toBeInTheDocument()
  })

  it('sends only the changed fields together with the reason', async () => {
    const { onChanged } = renderPanel({ ...baseEvent, status: 'scheduled' }, scheduledPolicy)
    fireEvent.click(await screen.findByRole('button', { name: /Edit published details/i }))

    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Student Council 2030' } })
    expect(save).toBeDisabled() // still needs a reason

    fireEvent.change(screen.getByLabelText(/Reason for the change/i), {
      target: { value: 'Fixed a typo in the title' },
    })
    expect(save).toBeEnabled()

    fireEvent.click(save)
    await waitFor(() =>
      expect(service.updateEvent).toHaveBeenCalledWith('e1', {
        title: 'Student Council 2030',
        changeReason: 'Fixed a typo in the title',
      }),
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('flags a blank title and a too-short reason while editing, and explains the disabled button', async () => {
    renderPanel({ ...baseEvent, status: 'scheduled' }, scheduledPolicy)
    fireEvent.click(await screen.findByRole('button', { name: /Edit published details/i }))
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(screen.getByRole('status')).toHaveTextContent('Change at least one detail to save.')

    const title = screen.getByLabelText(/^Title/)
    fireEvent.change(title, { target: { value: '   ' } })
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument() // not before leaving the field
    fireEvent.blur(title)
    expect(await screen.findByText('Title is required')).toBeInTheDocument()

    const reason = screen.getByLabelText(/Reason for the change/i)
    fireEvent.change(reason, { target: { value: 'abc' } })
    fireEvent.blur(reason)
    expect(await screen.findByText('Explain the change in at least 5 characters.')).toBeInTheDocument()
    expect(save).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Fix the highlighted fields to continue.')

    fireEvent.change(title, { target: { value: 'Fixed title' } })
    fireEvent.change(reason, { target: { value: 'Typo fix' } })
    await waitFor(() => expect(save).toBeEnabled())
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument()
  })

  it('rejects shortening the end date of a live event as soon as it is entered', async () => {
    renderPanel({ ...baseEvent, status: 'active' }, activePolicy)
    fireEvent.click(await screen.findByRole('button', { name: /Edit published details/i }))
    const end = screen.getByLabelText(/End \(extend only\)/i)

    fireEvent.change(end, { target: { value: '2030-01-02T08:00' } })
    fireEvent.blur(end)
    expect(await screen.findByRole('alert')).toHaveTextContent(/can only be extended, not shortened/i)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    fireEvent.change(end, { target: { value: '2030-01-09T08:00' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('hides the start date and labels the end date as extend-only while live', async () => {
    renderPanel({ ...baseEvent, status: 'active' }, activePolicy)
    fireEvent.click(await screen.findByRole('button', { name: /Edit published details/i }))
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/End \(extend only\)/i)).toBeInTheDocument()
  })

  it('offers pause and revise with a required reason when nobody has taken part', async () => {
    const { onChanged } = renderPanel({ ...baseEvent, status: 'active' }, activePolicy)
    fireEvent.click(await screen.findByRole('button', { name: /Pause & revise/i }))

    const confirm = screen.getByRole('button', { name: 'Pause and move to draft' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Reason for pausing/i), {
      target: { value: 'Wrong candidate listed' },
    })
    fireEvent.click(confirm)

    await waitFor(() => expect(service.unpublishEvent).toHaveBeenCalledWith('e1', 'Wrong candidate listed'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('explains why the structure is locked once participation has started', async () => {
    renderPanel(
      { ...baseEvent, status: 'active' },
      { ...activePolicy, canPauseRevise: false, hasActivity: true },
    )
    await screen.findByText(/Participation has already started/i)
    expect(screen.queryByRole('button', { name: /Pause & revise/i })).not.toBeInTheDocument()
  })

  it('shows the server message when saving fails', async () => {
    renderPanel({ ...baseEvent, status: 'scheduled' }, scheduledPolicy)
    service.updateEvent.mockRejectedValue({ response: { data: { message: 'Start in the past' } } })
    fireEvent.click(await screen.findByRole('button', { name: /Edit published details/i }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Another title' } })
    fireEvent.change(screen.getByLabelText(/Reason for the change/i), { target: { value: 'Some good reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('Start in the past'))
  })
})
