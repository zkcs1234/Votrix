import {afterEach,expect,test,vi} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import CompetitionDashboardPage from './CompetitionDashboardPage'

// Pure UI target: NONE. No SDK/backend/database/network is initialized.
const f=vi.hoisted(()=>({listeners:new Map(),invalidate:vi.fn()}))
vi.mock('@/services/pageant.service',()=>({pageantService:{getDashboard:vi.fn()}}))
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:{stats:{},eventBreakdown:[{id:'event-one',title:'Campus event',status:'draft',registered:2,participated:0,rate:0}]},isLoading:false}),useQueryClient:()=>({invalidateQueries:f.invalidate})}))
vi.mock('@/hooks/useSocketEvent',()=>({useSocketEvent:(type,callback)=>f.listeners.set(type,callback)}))
vi.mock('@/hooks/useDelayedLoading',()=>({useDelayedLoading:()=>false}))
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.clearAllMocks();f.listeners.clear()})
test('disabled native setup preserves the legacy dashboard entry path',()=>{
 vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','false')
 render(<MemoryRouter><CompetitionDashboardPage/></MemoryRouter>)
 expect(screen.queryByRole('button',{name:'Manage competitions'})).not.toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Campus event'})).toHaveAttribute('href','/organizer/competition/events/event-one/contestants')
})
test('enabled dashboard opens existing event-scoped setup instead of a parallel workflow',()=>{
 vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','true')
 render(<MemoryRouter><CompetitionDashboardPage/></MemoryRouter>)
 expect(screen.getByRole('link',{name:'Manage competitions'})).toHaveAttribute('href','/organizer/competition/events')
 expect(screen.getByRole('link',{name:'Campus event'})).toHaveAttribute('href','/organizer/competition/events/event-one/workspace')
 expect(screen.getByRole('link',{name:'Create Event'})).toHaveAttribute('href','/organizer/competition/events/new')
})
test('native Live Control updates refresh the competition dashboard cache',()=>{
 vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','true')
 render(<MemoryRouter><CompetitionDashboardPage/></MemoryRouter>)
 f.listeners.get('competition:native-invalidated')({eventId:'event-one'})
 expect(f.invalidate).toHaveBeenCalledWith({queryKey:['competition','dashboard']})
})
