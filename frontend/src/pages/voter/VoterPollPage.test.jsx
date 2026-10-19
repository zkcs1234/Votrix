import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VoterPollPage from './VoterPollPage'

const mocks = vi.hoisted(() => ({ getPoll: vi.fn() }))

vi.mock('@/services/polling.service', () => ({
  pollingService: { getPoll: mocks.getPoll },
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
