import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VoterPollPage from './VoterPollPage'

const mocks = vi.hoisted(() => ({ getPoll: vi.fn(), submitPoll: vi.fn() }))

vi.mock('@/services/polling.service', () => ({
  pollingService: { getPoll: mocks.getPoll, submitPoll: mocks.submitPoll },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { firstName: 'Test', lastName: 'Voter' } }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('shows poll load errors and recovers when retry succeeds', async () => {
  mocks.getPoll
    .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Poll service unavailable' } } })
    .mockResolvedValueOnce({ data: { pollOpen: false, questions: [], event: { title: 'Survey' } } })

  render(
    <MemoryRouter initialEntries={['/participant/polling/events/poll-1']}>
      <Routes>
        <Route path="/participant/polling/events/:eventId" element={<VoterPollPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Poll service unavailable')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading poll' }))
  expect(await screen.findByText('This poll is closed or has expired.')).toBeInTheDocument()
  expect(mocks.getPoll).toHaveBeenCalledTimes(2)
})

test('shows the poll title and styled back-to-dashboard link', async () => {
  mocks.getPoll.mockResolvedValue({
    data: {
      pollOpen: true,
      canSubmit: true,
      questions: [],
      event: { title: 'Campus Survey', pollAnonymous: true },
    },
  })

  render(
    <MemoryRouter initialEntries={['/participant/polling/events/poll-1']}>
      <Routes>
        <Route path="/participant/polling/events/:eventId" element={<VoterPollPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Campus Survey' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/participant')
  expect(screen.getByText('Your responses are anonymous.')).toBeInTheDocument()
})

test('flags an unanswered required question where it is, on submit, and clears it as it is answered', async () => {
  mocks.getPoll.mockResolvedValue({
    data: {
      pollOpen: true,
      canSubmit: true,
      questions: [
        { id: 'q1', question: 'Comments', required: true, type: 'text', typeDef: { label: 'Text', ui: { input: 'textarea' }, answerFormat: { kind: 'text' } } },
        { id: 'q2', question: 'Anything else', required: false, type: 'text', typeDef: { label: 'Text', ui: { input: 'textarea' }, answerFormat: { kind: 'text' } } },
      ],
      event: { title: 'Campus Survey' },
    },
  })

  render(
    <MemoryRouter initialEntries={['/participant/polling/events/poll-1']}>
      <Routes>
        <Route path="/participant/polling/events/:eventId" element={<VoterPollPage />} />
      </Routes>
    </MemoryRouter>,
  )

  const comments = await screen.findByLabelText('Comments')
  expect(screen.queryByText('This question is required.')).not.toBeInTheDocument() // nothing nags before any attempt

  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
  expect(await screen.findByText('This question is required.')).toBeInTheDocument()
  expect(screen.getByText('Answer the highlighted question to submit.')).toBeInTheDocument()
  expect(screen.getAllByText('This question is required.')).toHaveLength(1) // the optional question is not flagged

  fireEvent.change(comments, { target: { value: 'Great' } })
  expect(screen.queryByText('This question is required.')).not.toBeInTheDocument()
  expect(screen.queryByText('Answer the highlighted question to submit.')).not.toBeInTheDocument()
})


test('stays inside the participant layout: Submit lives in the layout footer slot and still submits the form', async () => {
  // The layout provides this slot (AppShell). The page must use it instead of a
  // full-screen layer that would cover the header and sidebar.
  const slot = document.createElement('div')
  slot.id = 'stage-footer-portal'
  document.body.appendChild(slot)
  try {
    mocks.submitPoll.mockResolvedValue({ data: { success: true } })
    mocks.getPoll.mockResolvedValue({
      data: {
        pollOpen: true,
        canSubmit: true,
        questions: [
          { id: 'q1', question: 'Comments', required: true, type: 'text', typeDef: { label: 'Text', ui: { input: 'textarea' }, answerFormat: { kind: 'text' } } },
        ],
        event: { title: 'Campus Survey' },
      },
    })
    const { container } = render(
      <MemoryRouter initialEntries={['/participant/polling/events/poll-1']}>
        <Routes>
          <Route path="/participant/polling/events/:eventId" element={<VoterPollPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(await screen.findByLabelText('Comments'), { target: { value: 'Great' } })
    const submit = screen.getByRole('button', { name: 'Submit response' })
    expect(slot).toContainElement(submit)
    expect(container.querySelector('form')).not.toContainElement(submit)
    // Nothing is pinned to the viewport on top of the layout.
    expect(document.querySelector('.fixed.inset-0')).toBeNull()

    fireEvent.click(submit)
    await vi.waitFor(() => expect(mocks.submitPoll).toHaveBeenCalledTimes(1))
    expect(mocks.submitPoll.mock.calls[0][1]).toEqual({ q1: 'Great' })
  } finally {
    slot.remove()
  }
})
