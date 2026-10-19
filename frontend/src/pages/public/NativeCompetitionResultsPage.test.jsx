import {act,render,screen} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {beforeEach,afterEach,test,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({public:vi.fn()}))
vi.mock('@/services/competition-native-results.service',()=>({nativeResultsService:{public:f.public}}))
import Page from './NativeCompetitionResultsPage'
const snapshot=version=>({publicationVersion:version,publishedAt:'2026-10-13',results:{eventId:'event',competitionId:'child',roundId:null,eventName:'Dance event',competitionName:'Hip-Hop',roundName:'Single phase',method:'weighted_average',tiePolicy:'shared',standings:[{participationId:'entry',name:'Published dancer',entryNumber:1,rank:1,score:80}]}})
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();f.public.mockResolvedValue({data:snapshot(1)})})
afterEach(()=>vi.useRealTimers())
const ready=async()=>{await act(async()=>render(<MemoryRouter initialEntries={['/competition/events/event/competitions/child/results']}><Routes><Route path="/competition/events/:eventId/competitions/:competitionId/results" element={<Page/>}/></Routes></MemoryRouter>))}
test('anonymous public view shows approved snapshot only with no worksheets or reviewer controls',async()=>{await ready();expect(screen.getByText(/Published dancer/)).toBeInTheDocument();expect(screen.queryByText(/worksheet/i)).not.toBeInTheDocument();expect(screen.queryByRole('button')).not.toBeInTheDocument()})

test.each([{organizer:false,judge:false},{organizer:false,judge:true},{organizer:true,judge:false}])('published deductions follow the frozen responsibility flags: %j',async flags=>{
 const data=snapshot(1);data.results.deductionSettings=flags;f.public.mockResolvedValue({data});await ready()
 expect(!!screen.queryByRole('columnheader',{name:'Organizer aggregate deductions'})).toBe(flags.organizer)
 expect(!!screen.queryByText('Official scores include submitted judge deductions.')).toBe(flags.judge)
})
test('polling reconciles withdrawal and a lower delayed publication cannot resurrect withdrawn scores',async()=>{await ready();f.public.mockResolvedValueOnce({data:{publicationVersion:2,withdrawn:true,results:null}});await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(screen.queryByText(/Published dancer/)).not.toBeInTheDocument();f.public.mockResolvedValueOnce({data:snapshot(1)});await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(screen.queryByText(/Published dancer/)).not.toBeInTheDocument();f.public.mockResolvedValueOnce({data:snapshot(3)});await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(screen.getByText(/Published dancer/)).toBeInTheDocument()})
test('unpublished denial/failure clears public score state; focus refetches without manual refresh',async()=>{await ready();f.public.mockRejectedValueOnce(new Error('unpublished'));await act(async()=>window.dispatchEvent(new Event('focus')));expect(screen.queryByText(/Published dancer/)).not.toBeInTheDocument();expect(screen.getByText('Published results are unavailable.')).toBeInTheDocument()})
test('a malformed higher version from another child cannot prevent recovery of a valid selected publication',async()=>{await ready();const wrong=snapshot(100);wrong.results.competitionId='sibling';f.public.mockResolvedValueOnce({data:wrong});await act(async()=>window.dispatchEvent(new Event('focus')));expect(screen.queryByText(/Published dancer/)).not.toBeInTheDocument();f.public.mockResolvedValueOnce({data:snapshot(2)});await act(async()=>window.dispatchEvent(new Event('online')));expect(screen.getByText(/Published dancer/)).toBeInTheDocument()})
