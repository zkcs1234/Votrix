import {render,screen,cleanup,act} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {beforeEach,afterEach,test,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({choices:vi.fn(),reviewerChoices:vi.fn(),legacy:vi.fn(),view:vi.fn()}))
vi.mock('@/services/competition-native.service',()=>({nativeCompetitionService:{choices:f.choices,view:f.view}}))
vi.mock('@/services/competition-native-tabulation.service',()=>({nativeTabulationService:{reviewerChoices:f.reviewerChoices}}))
import {CompetitionWorkspaceBoundary} from '@/components/voter/competition/NativeCompetitionWorkspace'
import {NativeTabulationBoundary} from './NativeTabulationWorkspace'
import {NativeResultsBoundary} from './NativeResultsWorkspace'
import Report from '@/pages/organizer/reports/CompetitionReportPage'
const Legacy=()=>{f.legacy();return <p>Legacy page</p>}
const mount=element=>render(<MemoryRouter initialEntries={['/events/event']}><Routes><Route path="/events/:eventId" element={element}/></Routes></MemoryRouter>)
beforeEach(()=>{vi.clearAllMocks();for(const k of ['VITE_COMPETITION_NATIVE_SCORING_ENABLED','VITE_COMPETITION_NATIVE_TABULATION_ENABLED','VITE_COMPETITION_NATIVE_RESULTS_ENABLED'])vi.stubEnv(k,'true');f.choices.mockResolvedValue({data:{contexts:[],nativeEvent:true}});f.reviewerChoices.mockResolvedValue({data:{contexts:[]}})})
afterEach(()=>{cleanup();vi.unstubAllEnvs()})
test('an unassigned native judge gets an explicit empty state, never a legacy scoring page',async()=>{mount(<CompetitionWorkspaceBoundary Legacy={Legacy}/>);expect(await screen.findByText(/No competition or round is currently assigned/)).toBeInTheDocument();expect(f.legacy).not.toHaveBeenCalled()})
test('context recovery discovers a new reviewer appointment without manual refresh',async()=>{
 mount(<CompetitionWorkspaceBoundary Legacy={Legacy}/>);await screen.findByText(/No competition or round is currently assigned/)
 f.reviewerChoices.mockResolvedValue({data:{contexts:[{competitionId:'new-child',roundId:null,competitionName:'New review appointment'}]}})
 await act(async()=>{window.dispatchEvent(new Event('focus'))})
 expect(await screen.findByRole('option',{name:'New review appointment'})).toBeInTheDocument()
 expect(f.legacy).not.toHaveBeenCalled()
})

test('review contexts returned by navigation open independent tabulation without requesting a judge score sheet',async()=>{
 f.choices.mockResolvedValue({data:{contexts:[{competitionId:'review-child',roundId:null,competitionName:'Assigned review',reviewer:true,state:'review'}],nativeEvent:true}})
 mount(<CompetitionWorkspaceBoundary Legacy={Legacy}/>)
 expect(await screen.findByRole('option',{name:'Assigned review'})).toBeInTheDocument()
 expect(f.view).not.toHaveBeenCalled()
 expect(f.reviewerChoices).not.toHaveBeenCalled()
 expect(f.legacy).not.toHaveBeenCalled()
})
test('native owner Live Control points to setup rather than an event-only fallback',async()=>{mount(<CompetitionWorkspaceBoundary owner Legacy={Legacy}/>);expect(await screen.findByRole('link',{name:'Open competition setup'})).toHaveAttribute('href','/organizer/competition/events/event/workspace');expect(f.legacy).not.toHaveBeenCalled()})
test('empty native tabulation and results both provide setup navigation',async()=>{mount(<NativeTabulationBoundary eventId="event" Legacy={Legacy}/>);expect(await screen.findByRole('link',{name:'Open competition setup'})).toBeInTheDocument();cleanup();mount(<NativeResultsBoundary eventId="event" Legacy={Legacy}/>);expect(await screen.findByRole('link',{name:'Open competition setup'})).toBeInTheDocument();expect(f.legacy).not.toHaveBeenCalled()})

test('tabulation subsection links keep an authorized competition/round and reject foreign query contexts',async()=>{
 f.choices.mockResolvedValue({data:{contexts:[{competitionId:'a',roundId:null,competitionName:'Hip-Hop'},{competitionId:'b',roundId:'final',roundName:'Final',competitionName:'Contemporary'}],nativeEvent:true}})
 render(<MemoryRouter initialEntries={['/events/event?competitionId=b&roundId=final']}><NativeTabulationBoundary eventId="event" Legacy={Legacy}/></MemoryRouter>)
 expect(await screen.findByRole('combobox',{name:'Competition'})).toHaveValue('b')
 expect(screen.getByRole('combobox',{name:'Round'})).toHaveValue('b:final')
 cleanup()
 render(<MemoryRouter initialEntries={['/events/event?competitionId=foreign']}><NativeTabulationBoundary eventId="event" Legacy={Legacy}/></MemoryRouter>)
 expect(await screen.findByRole('alert')).toHaveTextContent('not available in the current tabulation context')
 expect(f.legacy).not.toHaveBeenCalled()
})
test('missing identity metadata fails closed while an explicitly legacy event retains its page',async()=>{f.choices.mockResolvedValueOnce({data:{contexts:[]}});mount(<NativeResultsBoundary eventId="event" Legacy={Legacy}/>);expect(await screen.findByRole('alert')).toHaveTextContent('Competition identity is unavailable');expect(f.legacy).not.toHaveBeenCalled();cleanup();f.choices.mockResolvedValueOnce({data:{contexts:[],nativeEvent:false}});mount(<NativeResultsBoundary eventId="event" Legacy={Legacy}/>);expect(await screen.findByText('Legacy page')).toBeInTheDocument()})
test('the Report route enters the native results/export boundary',async()=>{mount(<Report/>);expect(await screen.findByRole('link',{name:'Open competition setup'})).toBeInTheDocument();expect(f.choices).toHaveBeenCalledWith('event',true)})
test('dashboard deep links bind an authorized child/round and reject unassigned query identities',async()=>{f.choices.mockResolvedValue({data:{contexts:[{competitionId:'a',roundId:null,competitionName:'Hip-Hop'},{competitionId:'b',roundId:'final',competitionName:'Contemporary'}],nativeEvent:true}});f.view.mockRejectedValue(new Error('Unavailable fixture view'));render(<MemoryRouter initialEntries={['/events/event?competitionId=b&roundId=final']}><Routes><Route path="/events/:eventId" element={<CompetitionWorkspaceBoundary Legacy={Legacy}/>}/></Routes></MemoryRouter>);await screen.findByText('Unavailable fixture view');expect(f.view).toHaveBeenCalledWith('event','b','final',false);cleanup();render(<MemoryRouter initialEntries={['/events/event?competitionId=foreign']}><Routes><Route path="/events/:eventId" element={<CompetitionWorkspaceBoundary Legacy={Legacy}/>}/></Routes></MemoryRouter>);expect(await screen.findByRole('alert')).toHaveTextContent('not currently assigned');expect(f.legacy).not.toHaveBeenCalled()})
