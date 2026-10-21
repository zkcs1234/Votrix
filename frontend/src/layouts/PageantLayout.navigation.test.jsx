import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import PageantLayout from './PageantLayout'

const user = { id: 'owner', role: 'organizer', username: 'Organizer' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ useSocketEvent: vi.fn() }))
vi.mock('@/services/notifications.service', () => ({ notificationsService: { getUnreadCount: async () => ({ data: { unreadCount: 0 } }) } }))
vi.mock('@/components/ui/ModuleStageLayout', () => ({ default: ({ children }) => children }))
vi.mock('@/components/ui/GlobalSearch', () => ({ default: () => null }))
vi.mock('@/components/brand/VotrixLogo', () => ({ default: () => <span>Votrix</span> }))
vi.mock('@/components/ui/NotificationsModal', () => ({ default: () => null }))
vi.mock('@/components/organizer/ProfileCard', () => ({ default: () => null }))

const base = '/organizer/competition/events/event'
const context = '?competitionId=pageant&roundId=preliminary'
function Page() {
  const location = useLocation()
  return <output aria-label="Current page">{location.pathname}{location.search}{location.hash}</output>
}
function mount(path) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/organizer/competition/events/:eventId" element={<PageantLayout />}>
      <Route path="*" element={<Page />} />
    </Route>
  </Routes></MemoryRouter>)
}
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})

test('Results & Reporting exposes only Tabulation, Results, and Adjustments', async () => {
  await act(async () => mount(`${base}/tabulation${context}`))
  const sidebar = screen.getAllByRole('navigation').find(nav =>
    within(nav).queryByRole('link', { name: 'TABULATION' }),
  )
  expect(sidebar).toBeTruthy()
  const reportingLinks = within(sidebar).getAllByRole('link').filter(link =>
    [ 'TABULATION', 'RESULTS', 'ADJUSTMENTS' ].includes(link.textContent.trim()),
  )
  expect(reportingLinks.map(link => link.textContent.trim())).toEqual([ 'TABULATION', 'RESULTS', 'ADJUSTMENTS' ])
  expect(within(sidebar).queryByRole('link', { name: 'Scoring' })).not.toBeInTheDocument()
  expect(within(sidebar).queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
  expect(within(sidebar).queryByRole('link', { name: 'Judge Submissions' })).not.toBeInTheDocument()
  expect(within(sidebar).queryByRole('link', { name: 'Round Advancement' })).not.toBeInTheDocument()

  await act(async () => fireEvent.click(within(sidebar).getByRole('link', { name: 'ADJUSTMENTS' })))
  expect(screen.getByRole('status', { name: 'Current page' })).toHaveTextContent(`${base}/adjustments${context}`)
  expect(within(sidebar).getByRole('link', { name: 'ADJUSTMENTS' })).toHaveAttribute('aria-current', 'page')

  await act(async () => fireEvent.click(within(sidebar).getByRole('link', { name: 'RESULTS' })))
  expect(screen.getByRole('status', { name: 'Current page' })).toHaveTextContent(`${base}/results${context}`)
  expect(within(sidebar).getByRole('link', { name: 'RESULTS' })).toHaveAttribute('aria-current', 'page')
})

test('Tabulation is a single direct destination, without an Overview child', async () => {
  await act(async () => mount(`${base}/results${context}`))
  const sidebar = screen.getAllByRole('navigation').find(nav =>
    within(nav).queryByRole('link', { name: 'TABULATION' }),
  )
  await act(async () => fireEvent.click(within(sidebar).getByRole('link', { name: 'TABULATION' })))
  expect(screen.getByRole('status', { name: 'Current page' })).toHaveTextContent(`${base}/tabulation${context}`)
  expect(within(sidebar).queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
  expect(within(sidebar).getByRole('link', { name: 'TABULATION' })).toHaveAttribute('aria-current', 'page')
})
