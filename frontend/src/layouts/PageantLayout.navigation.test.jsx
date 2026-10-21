import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import PageantLayout from './PageantLayout'
import ElectionLayout from './ElectionLayout'
import PollingLayout from './PollingLayout'
import TabulationWorkspaceNavigation from '@/components/organizer/competition/TabulationWorkspaceNavigation'

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
  const page = location.pathname.split('/').pop()
  const section = location.hash.replace('#tabulation-', '') || (page === 'results' ? 'validation' : page === 'scoring' ? 'submissions' : page)
  return <><TabulationWorkspaceNavigation eventId="event" section={section} workspace={page === 'scoring' || page === 'results' ? page : null} /><output aria-label="Current page">{location.pathname}{location.search}{location.hash}</output></>
}
function mount(path) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/organizer/competition/events/:eventId" element={<PageantLayout />}>
      <Route path="*" element={<Page />} />
    </Route>
  </Routes></MemoryRouter>)
}
function mountSetupLayout(Layout, base, path) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path={`${base}/:eventId`} element={<Layout />}>
      <Route path="*" element={<p>Setup form</p>} />
    </Route>
  </Routes></MemoryRouter>)
}
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})


test('Scoring, Results, advancement and audit are sibling destinations outside Tabulation', async()=>{
 await act(async()=>mount(`${base}/tabulation/overview${context}`))
 const tabulation=within(screen.getByRole('group',{name:'Tabulation navigation'}))
 expect(tabulation.getAllByRole('link').map(n=>n.textContent)).toEqual(['Overview'])
 for(const [label,page] of Object.entries({Scoring:'scoring',Results:'results','Round Advancement':'advancement','Audit Trail':'audit'})){
  expect(tabulation.queryByRole('link',{name:label})).not.toBeInTheDocument()
  expect(screen.getByRole('link',{name:label})).toHaveAttribute('href',`${base}/${page}${context}`)
 }
 expect(screen.queryByRole('link',{name:'Judge Submissions'})).not.toBeInTheDocument()
 expect(screen.queryByRole('link',{name:'Finalization'})).not.toBeInTheDocument()
 await act(async()=>fireEvent.click(screen.getByRole('link',{name:'Scoring'})))
 expect(screen.getByRole('link',{name:'Scoring'})).toHaveAttribute('aria-current','page')
 expect(screen.getByRole('link',{name:'Live Control'})).toHaveAttribute('href',`${base}/live${context}`)
})

test.each([
 ['Scoring','scoring',['Judge Submissions','Tabulation Matrix','Deductions & Adjustments'],['submissions','matrix','deductions']],
 ['Results','results',['Validation','Results & Rankings','Finalization'],['validation','results','finalization']],
])('%s section shortcuts keep the same page and preserve context',async(label,page,labels,sections)=>{
 await act(async()=>mount(`${base}/${page}${context}`))
 for(let index=0;index<sections.length;index++){
  const navigation=within(screen.getByRole('navigation',{name:`${label} page sections`}))
  expect(navigation.getAllByRole('link')).toHaveLength(3)
  await act(async()=>fireEvent.click(navigation.getByRole('link',{name:labels[index]})))
  expect(screen.getByRole('status',{name:'Current page'})).toHaveTextContent(`${base}/${page}${context}#tabulation-${sections[index]}`)
  expect(screen.getByRole('link',{name:label})).toHaveAttribute('aria-current','page')
 }
})

test('Round Advancement and Audit Trail remain separate pages',async()=>{
 await act(async()=>mount(`${base}/results${context}`))
 await act(async()=>fireEvent.click(screen.getByRole('link',{name:'Round Advancement'})))
 expect(screen.queryByRole('navigation',{name:'Results page sections'})).not.toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Review Finalization'})).toHaveAttribute('href',`${base}/results${context}#tabulation-finalization`)
 await act(async()=>fireEvent.click(screen.getByRole('link',{name:'Audit Trail'})))
 expect(screen.getByRole('status',{name:'Current page'})).toHaveTextContent(`${base}/audit${context}`)
 expect(screen.getByRole('link',{name:'Audit Trail'})).toHaveAttribute('aria-current','page')
 expect(screen.queryByRole('navigation',{name:/page sections/})).not.toBeInTheDocument()
})

test('the bare Tabulation URL still selects Overview',async()=>{
 await act(async()=>mount(`${base}/tabulation${context}`))
 expect(screen.getByRole('button',{name:'Tabulation'})).toHaveAttribute('aria-expanded','true')
 expect(screen.getByRole('link',{name:'Overview'})).toHaveAttribute('aria-current','page')
})

test.each([
  [PageantLayout, '/organizer/competition/events'],
  [ElectionLayout, '/organizer/election/events'],
  [PollingLayout, '/organizer/polling/events'],
])('exposes valid Event Details and Branding routes for a new event', async (Layout, base) => {
  await act(async () => mountSetupLayout(Layout, base, `${base}/new`))
  expect(screen.getByRole('link', { name: 'Event Details' })).toHaveAttribute('href', `${base}/new`)
  expect(screen.getByRole('link', { name: 'Branding' })).toHaveAttribute('href', `${base}/new/branding`)
  expect(screen.getByRole('link', { name: 'Event Details' })).toHaveAttribute('aria-current', 'page')
})
