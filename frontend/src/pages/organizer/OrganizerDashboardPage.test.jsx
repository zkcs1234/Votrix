import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const f=vi.hoisted(()=>({dashboard:vi.fn(),analytics:vi.fn(),listeners:new Map()}))
vi.mock('@/services/organizer.service',()=>({organizerService:{getDashboard:f.dashboard,getAnalytics:f.analytics}}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{email:'organizer@example.com'}})}))
vi.mock('@/hooks/useDelayedLoading',()=>({useDelayedLoading:()=>false}))
vi.mock('@/hooks/useSocketEvent',()=>({useSocketEvent:(event,handler)=>f.listeners.set(event,handler)}))
vi.mock('@/components/ui/StatCard',()=>({default:()=>null}))
vi.mock('@/components/ui/Card',()=>({default:({children})=>children}))
vi.mock('@/components/ui/Skeleton',()=>({SkeletonStatCard:()=>null,SkeletonModuleLink:()=>null,SkeletonList:()=>null,SkeletonChart:()=>null}))
vi.mock('@/components/charts',()=>({AreaChartView:()=>null,PieChartView:()=>null}))
vi.mock('@/components/upload/OrganizationLogoUpload',()=>({default:()=>null}))
vi.mock('@/components/organizer/OrganizerOverviewEvents',()=>({default:()=>null}))
import OrganizerDashboardPage from './OrganizerDashboardPage'

const nativeSession=(eventTitle='New showcase')=>({
 eventId:'event-1',eventTitle,session:{id:'native-session-1',status:'active',startedAt:'2026-10-18T00:00:00Z',competitionName:'Dance',roundName:'Finals'},
})
const dashboard=activeSessions=>({data:{activeSessions,stats:{},organization:null,recentActivity:[]}})

beforeEach(()=>{
 vi.clearAllMocks()
 f.listeners.clear()
 f.dashboard.mockResolvedValue(dashboard([nativeSession()]))
 f.analytics.mockResolvedValue({data:{charts:{monthlyEvents:[],eventParticipation:[]}}})
})

it('shows active native sessions and refreshes after Live Control invalidates the event',async()=>{
 render(<MemoryRouter><OrganizerDashboardPage/></MemoryRouter>)
 expect(await screen.findByText('New showcase')).toBeInTheDocument()
 expect(screen.getByText('Dance · Finals')).toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'Live scoring session ongoing'})).toBeInTheDocument()
 expect(screen.getByRole('link',{name:/Open Live Control/})).toHaveAttribute('href','/organizer/competition/events/event-1/live')

 f.dashboard.mockResolvedValue(dashboard([nativeSession('Updated showcase')]))
 f.listeners.get('competition:native-invalidated')({eventId:'event-1'})
 await waitFor(()=>expect(screen.getByText('Updated showcase')).toBeInTheDocument())
 expect(f.dashboard).toHaveBeenCalledTimes(2)
})
