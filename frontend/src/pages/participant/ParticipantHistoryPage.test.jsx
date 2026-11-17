import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ParticipantHistoryPage from './ParticipantHistoryPage'

const mocks = vi.hoisted(() => ({ getHistory: vi.fn(), downloadCsv: vi.fn(), user: null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/utils/csvDownload', () => ({ downloadCsv: mocks.downloadCsv }))
vi.mock('@/services/voter.service', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, voterService: { ...actual.voterService, getHistory: mocks.getHistory } }
})

const partial = {
  id: 'election:partial', eventId: 'partial', eventType: 'election', title: 'Department senate election',
  organizationName: 'CCS Council', role: 'Student', outcome: 'Partial', summary: '2 of 3 sections submitted',
  completedAt: '2026-03-12T08:31:00.000Z', sortDate: '2026-03-12T08:31:00.000Z',
  window: { start: '2026-03-10T00:00:00Z', end: '2026-03-12T00:00:00Z' }, eventStatus: 'completed',
  results: { state: 'available' }, scoresheetPath: null,
  receipt: {
    kind: 'sections',
    rows: [
      { name: 'President and VP', submittedAt: '2026-03-12T08:29:00Z', status: 'Submitted' },
      { name: 'Senators', submittedAt: '2026-03-12T08:31:00Z', status: 'Submitted' },
      { name: 'Year representatives', submittedAt: null, status: 'Not submitted' },
    ],
  },
}
const missed = {
  id: 'election:missed', eventId: 'missed', eventType: 'election', title: 'Org fair officers',
  organizationName: 'Org Fair Committee', role: 'Student', outcome: 'Missed', summary: 'No ballot submitted',
  completedAt: null, sortDate: '2026-01-20T00:00:00Z', window: { start: '2026-01-18T00:00:00Z', end: '2026-01-20T00:00:00Z' },
  results: { state: 'pending', availableAfter: '2026-02-01T00:00:00Z' }, scoresheetPath: null, receipt: { kind: 'sections', rows: [] },
}
const anonymousPoll = {
  id: 'polling:poll', eventId: 'poll', eventType: 'polling', title: 'Library hours survey',
  organizationName: 'Library', role: 'Student', outcome: 'Submitted', summary: 'Response recorded',
  completedAt: null, sortDate: '2026-02-07T00:00:00Z', window: { start: null, end: '2026-02-07T00:00:00Z' },
  results: { state: 'none' }, scoresheetPath: null, receipt: { kind: 'poll', responses: 1, anonymous: true },
}
const judgeRow = {
  id: 'competition:comp', eventId: 'comp', eventType: 'competition_scoring', title: 'Intramurals opening pageant',
  organizationName: 'Sports Office', role: 'Head judge', outcome: 'Submitted', summary: '2 rounds submitted',
  completedAt: '2026-10-09T12:52:00.000Z', sortDate: '2026-10-09T12:52:00.000Z', window: { start: '2026-10-08T00:00:00Z', end: '2026-10-09T23:00:00Z' },
  results: { state: 'available', publishedAt: '2026-10-10T00:00:00Z' }, scoresheetPath: '/participant/competition/events/comp/score',
  receipt: { kind: 'rounds', rows: [
    { name: 'Preliminary', submittedAt: '2026-10-08T12:40:00Z', status: 'Submitted' },
    { name: 'Final', submittedAt: '2026-10-09T12:52:00Z', status: 'Submitted' },
  ] },
}

const studentSummary = { total: 3, tookPart: 2, missed: 1, participationRate: 67, ballots: 1, partial: 1, polls: 1, eventsJudged: 0, roundsSubmitted: 0, lastCompletedAt: '2026-03-12T08:31:00Z' }
const judgeSummary = { total: 2, tookPart: 1, missed: 1, participationRate: 50, ballots: 0, partial: 0, polls: 0, eventsJudged: 1, roundsSubmitted: 2, lastCompletedAt: '2026-10-09T12:52:00Z' }
const response = (items, summary = studentSummary, extra = {}) => ({ data: { items, total: items.length, page: 1, limit: 20, summary, ...extra } })

function Where() {
  const { search } = useLocation()
  return <output data-testid="search">{search}</output>
}
const renderPage = (url = '/participant/history') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/participant/history" element={<><ParticipantHistoryPage /><Where /></>} />
        <Route path="*" element={<p>Elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = { id: 's1', role: 'participant', participantTypes: ['STUDENT'] }
  mocks.getHistory.mockResolvedValue(response([partial, missed, anonymousPoll]))
})
afterEach(cleanup)

describe('History summary', () => {
  it('shows a student their participation numbers', async () => {
    renderPage()
    expect(await screen.findByText('2 of 3')).toBeInTheDocument()
    expect(screen.getByText('67% of closed events')).toBeInTheDocument()
    expect(screen.getByText('1 partial')).toBeInTheDocument()
    expect(screen.getByText('Ballots')).toBeInTheDocument()
    expect(screen.getByText('Polls', { selector: 'p' })).toBeInTheDocument()
  })

  it('shows a judge rounds and events judged instead, with no type filter', async () => {
    mocks.user = { id: 'j1', role: 'participant', participantTypes: ['JUDGE'] }
    mocks.getHistory.mockResolvedValue(response([judgeRow], judgeSummary))
    renderPage()
    expect(await screen.findByText('Events judged')).toBeInTheDocument()
    expect(screen.getByText('Rounds submitted')).toBeInTheDocument()
    expect(screen.queryByText('Ballots')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Elections' })).not.toBeInTheDocument()
  })
})

describe('History list', () => {
  it('groups by month, newest first, with an outcome badge and a plain "when"', async () => {
    renderPage()
    await screen.findByText('Department senate election')
    expect(screen.getByRole('region', { name: /March 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /January 2026/ })).toBeInTheDocument()
    const senate = screen.getByText('Department senate election').closest('button')
    expect(within(senate).getByText('Partial')).toBeInTheDocument()
    const orgFair = screen.getByText('Org fair officers').closest('button')
    expect(within(orgFair).getByText('Missed')).toBeInTheDocument()
    expect(within(orgFair).getByText(/^Closed /)).toBeInTheDocument()
  })

  it('opens a receipt with each ballot section and why it was only partial, and never any selections', async () => {
    renderPage()
    fireEvent.click((await screen.findByText('Department senate election')).closest('button'))
    const receipt = await screen.findByLabelText('Participation receipt for Department senate election')
    expect(within(receipt).getByText('Year representatives')).toBeInTheDocument()
    expect(within(receipt).getByText('Not submitted')).toBeInTheDocument()
    expect(within(receipt).getAllByText('Submitted', { selector: 'span' })).toHaveLength(2)
    expect(within(receipt).getByText(/Voting closed before every section was submitted/)).toBeInTheDocument()
    expect(within(receipt).getByText(/selections and answers are never shown/i)).toBeInTheDocument()
    expect(within(receipt).getByRole('link', { name: /View results/ })).toHaveAttribute('href', '/participant/results')
    fireEvent.click(screen.getAllByText('Department senate election')[0].closest('button'))
    expect(screen.queryByLabelText('Participation receipt for Department senate election')).not.toBeInTheDocument()
  })

  it('explains a missed event and what happens with results that are not out yet', async () => {
    renderPage()
    fireEvent.click((await screen.findByText('Org fair officers')).closest('button'))
    const receipt = await screen.findByLabelText('Participation receipt for Org fair officers')
    expect(within(receipt).getByText(/voting closed before you submitted a ballot/)).toBeInTheDocument()
    expect(within(receipt).getByText(/Results appear after voting closes/)).toBeInTheDocument()
  })

  it('tells an anonymous poll respondent their answers are not linked to them', async () => {
    renderPage()
    fireEvent.click((await screen.findByText('Library hours survey')).closest('button'))
    const receipt = await screen.findByLabelText('Participation receipt for Library hours survey')
    expect(within(receipt).getByText('1 response')).toBeInTheDocument()
    expect(within(receipt).getByText(/not linked to you/)).toBeInTheDocument()
  })

  it('gives a judge their rounds and a read-only scoresheet link', async () => {
    mocks.user = { id: 'j1', role: 'participant', participantTypes: ['JUDGE'] }
    mocks.getHistory.mockResolvedValue(response([judgeRow], judgeSummary))
    renderPage()
    fireEvent.click((await screen.findByText('Intramurals opening pageant')).closest('button'))
    const receipt = await screen.findByLabelText('Participation receipt for Intramurals opening pageant')
    expect(within(receipt).getByText('Head judge')).toBeInTheDocument()
    expect(within(receipt).getByText('Preliminary')).toBeInTheDocument()
    expect(within(receipt).getByText('Final')).toBeInTheDocument()
    expect(within(receipt).getByRole('link', { name: 'Open scoresheet' })).toHaveAttribute('href', judgeRow.scoresheetPath)
    expect(within(receipt).getByText(/Other judges.+scores are never shown/)).toBeInTheDocument()
  })

  it('prints the receipt through the browser', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    fireEvent.click((await screen.findByText('Org fair officers')).closest('button'))
    fireEvent.click(await screen.findByRole('button', { name: 'Print receipt' }))
    expect(print).toHaveBeenCalled()
  })

  it('switches to a table and opens the receipt under the row', async () => {
    renderPage()
    await screen.findByText('Department senate election')
    fireEvent.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getByTestId('search')).toHaveTextContent('view=table')
    expect(screen.getByRole('columnheader', { name: 'Outcome' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Library hours survey'))
    expect(await screen.findByLabelText('Participation receipt for Library hours survey')).toBeInTheDocument()
  })
})

describe('History filters', () => {
  it('sends the filters to the server and keeps them in the URL so a view can be shared', async () => {
    renderPage()
    await screen.findByText('Department senate election')

    fireEvent.click(screen.getByRole('tab', { name: 'Missed' }))
    await waitFor(() => expect(mocks.getHistory).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'missed', range: 'last12', page: 1 })))
    expect(screen.getByTestId('search')).toHaveTextContent('outcome=missed')

    fireEvent.click(screen.getByRole('tab', { name: 'Polls' }))
    await waitFor(() => expect(mocks.getHistory).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'poll', outcome: 'missed' })))

    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'all' } })
    await waitFor(() => expect(mocks.getHistory).toHaveBeenLastCalledWith(expect.objectContaining({ range: 'all' })))
    expect(screen.getByTestId('search').textContent).toContain('range=all')
  })

  it('opens from a shared link with its filters applied', async () => {
    renderPage('/participant/history?outcome=done&range=year&view=table&q=library')
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'done', range: 'year', search: 'library' })))
    expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ignores unknown filter values in the URL instead of sending them to the server', async () => {
    renderPage('/participant/history?outcome=<script>&range=forever&type=banana')
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalled())
    expect(mocks.getHistory).toHaveBeenLastCalledWith(expect.objectContaining({ range: 'last12', outcome: undefined, type: undefined }))
  })

  it('searches after a short pause', async () => {
    renderPage()
    await screen.findByText('Department senate election')
    fireEvent.change(screen.getByPlaceholderText(/Search event/), { target: { value: 'library' } })
    await waitFor(() => expect(mocks.getHistory).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'library' })))
    expect(screen.getByTestId('search').textContent).toContain('q=library')
  })
})

describe('History states', () => {
  it('invites a new account to take part', async () => {
    mocks.getHistory.mockResolvedValue(response([], { ...studentSummary, total: 0, tookPart: 0, missed: 0, participationRate: null }))
    renderPage()
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeDisabled()
  })

  it('explains an empty filtered result', async () => {
    mocks.getHistory.mockResolvedValue(response([]))
    renderPage('/participant/history?outcome=missed')
    expect(await screen.findByText('No matching history')).toBeInTheDocument()
  })

  it('shows an error with a working retry', async () => {
    mocks.getHistory.mockRejectedValueOnce({ response: { data: { message: 'History is unavailable' } } })
    renderPage()
    expect(await screen.findByText('History is unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Department senate election')).toBeInTheDocument()
  })

  it('loads more rows and appends them', async () => {
    mocks.getHistory.mockResolvedValueOnce(response([partial], studentSummary, { total: 2 }))
    renderPage()
    await screen.findByText('Department senate election')
    mocks.getHistory.mockResolvedValueOnce(response([missed], studentSummary, { total: 2, page: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Org fair officers')).toBeInTheDocument()
    expect(screen.getByText('Department senate election')).toBeInTheDocument()
    expect(mocks.getHistory).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('exports the loaded rows as CSV without any choices or answers', async () => {
    renderPage()
    await screen.findByText('Department senate election')
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(mocks.downloadCsv).toHaveBeenCalledTimes(1)
    const [filename, headers, rows] = mocks.downloadCsv.mock.calls[0]
    expect(filename).toBe('participation-history.csv')
    expect(headers).toEqual(['Event', 'Type', 'Organization', 'Role', 'Outcome', 'Summary', 'When'])
    expect(rows).toHaveLength(3)
    expect(rows[0].slice(0, 6)).toEqual(['Department senate election', 'Election', 'CCS Council', 'Student', 'Partial', '2 of 3 sections submitted'])
    expect(JSON.stringify(rows)).not.toMatch(/Senators|President and VP/)
  })
})
