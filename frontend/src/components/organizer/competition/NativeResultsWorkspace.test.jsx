import {MemoryRouter} from 'react-router-dom'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,test,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({choices:vi.fn(),owned:vi.fn(),publish:vi.fn(),export:vi.fn(),listeners:new Map()}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'owner'}})}))
vi.mock('@/services/competition-native.service',()=>({nativeCompetitionService:{choices:f.choices}}))
vi.mock('@/services/competition-native-results.service',()=>({nativeResultsService:{owned:f.owned,publish:f.publish,export:f.export}}))
vi.mock('@/services/socket.service',()=>({isConnected:()=>true,subscribe:(type,cb)=>{const group=f.listeners.get(type)??new Set();group.add(cb);f.listeners.set(type,group);return()=>group.delete(cb)}}))
import Workspace, {NativeResultsBoundary} from './NativeResultsWorkspace'
const choices=[{competitionId:'a',competitionName:'Hip-Hop',roundId:null,roundName:'Single phase'},{competitionId:'b',competitionName:'Contemporary',roundId:null,roundName:'Single phase'}]
const snapshot=c=>({eventId:'event',competitionId:c,roundId:null,viewerId:'owner',complete:true,sourceDigest:'digest',calculation:{id:`calc-${c}`,version:1},progress:[{judgeId:'judge',submitted:true}],statistics:{participants:2,eligibleParticipants:2,requiredJudges:1,submittedJudges:1},official:{method:'weighted_average',tiePolicy:'shared',precision:2,standings:[{participationId:`entry-${c}`,entryNumber:1,name:`Dancer ${c}`,rank:1,score:80,deductionTotal:0,deductionUnits:'points'}]},history:[],publication:null})
let states
beforeEach(()=>{vi.clearAllMocks();f.listeners.clear();states={a:snapshot('a'),b:snapshot('b')};f.owned.mockImplementation(async(e,c)=>({data:structuredClone(states[c])}));f.publish.mockResolvedValue({data:{}})})
const ready=async(analytics=false)=>{render(<Workspace eventId="event" choices={choices} analytics={analytics}/>);await screen.findByText(/Current judge completion/)}
test('official Pageant results show one standings table per division',async()=>{
 states.a.official.divisionRanking={mode:'division',divisions:[{id:'men',name:'MEN'},{id:'women',name:'WOMEN'}]}
 states.a.official.standings[0].divisionId='men'
 states.a.official.standings.push({participationId:'woman',divisionId:'women',entryNumber:1,name:'Woman winner',rank:1,score:3})
 await ready()
 expect(screen.getAllByRole('table')).toHaveLength(2)
 expect(screen.getByRole('heading',{name:'MEN'})).toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'WOMEN'})).toBeInTheDocument()
})
const emit=payload=>{for(const cb of f.listeners.get('competition:native-invalidated')??[])cb(payload)}
test('explicit No Deductions removes deduction columns from current official results',async()=>{
 states.a.official.deductionSettings={organizer:false,judge:false}
 await ready()
 expect(screen.queryByRole('columnheader',{name:/deductions/i})).not.toBeInTheDocument()
})
test('judge-only official results identify submitted deductions without inventing an organizer penalty column',async()=>{
 states.a.official.deductionSettings={organizer:false,judge:true}
 await ready()
 expect(screen.getByText(/Calculated scores include submitted judge deductions/)).toBeInTheDocument()
 expect(screen.queryByRole('columnheader',{name:'Organizer deductions'})).not.toBeInTheDocument()
})
test('private finalized standings are separate from publication and analytics remain child-specific',async()=>{await ready(true);expect(screen.getByText('Current official standings')).toBeInTheDocument();expect(screen.getByLabelText('Official score summary')).toHaveTextContent('Dancer a');expect(screen.getByText(/Not published/)).toBeInTheDocument();expect(screen.queryByText(/overall winner/i)).not.toBeInTheDocument()})
test('incomplete sources hide current/historical score payloads and all CSV controls',async()=>{states.a.complete=false;await ready();expect(screen.queryByText('Current official standings')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'All worksheets CSV'})).not.toBeInTheDocument();expect(screen.getByText(/historical submissions do not complete/)).toBeInTheDocument()})
test('publication requires an explicit reason and selected current version; retry preserves exact body',async()=>{
 await ready();expect(screen.getByRole('button',{name:'Publish selected finalized version'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Publication reason'),{target:{value:'Reviewed approved public edition'}});f.publish.mockRejectedValueOnce(new Error('response lost'));fireEvent.click(screen.getByRole('button',{name:'Publish selected finalized version'}));await screen.findByRole('button',{name:'Retry original publication action'});await waitFor(()=>expect(f.publish).toHaveBeenCalledTimes(1));const body=f.publish.mock.calls[0][2];expect(body).toMatchObject({calculationId:'calc-a',expectedPublicationVersion:0,acknowledged:true,action:'publish'});fireEvent.click(screen.getByRole('button',{name:'Retry original publication action'}));await waitFor(()=>expect(f.publish).toHaveBeenCalledTimes(2));expect(f.publish.mock.calls[1][2]).toEqual(body)
})
test('published stale snapshots can be explicitly withdrawn even while current sources are incomplete',async()=>{states.a.complete=false;states.a.calculation=null;states.a.publication={version:2,action:'publish',current:false};await ready();fireEvent.change(screen.getByLabelText('Publication reason'),{target:{value:'Withdraw pending source review'}});fireEvent.click(screen.getByRole('button',{name:'Withdraw publication'}));await waitFor(()=>expect(f.publish).toHaveBeenCalledWith('event','a',expect.objectContaining({action:'withdraw',expectedPublicationVersion:2,calculationId:null})))})
test('matching invalidation clears score-bearing results immediately and ignores sibling hints',async()=>{await ready();const initial=f.owned.mock.calls.length;await act(async()=>emit({eventId:'event',competitionId:'b',roundId:null}));expect(f.owned).toHaveBeenCalledTimes(initial);let release;f.owned.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(screen.queryByText('Current official standings')).not.toBeInTheDocument();states.a.complete=false;await act(async()=>release({data:states.a}));expect(screen.queryByRole('button',{name:'Published final results CSV'})).not.toBeInTheDocument()})
test('tabulation and official result exports require the current finalized version to be published',async()=>{
 await ready();expect(screen.getByRole('button',{name:'Published tabulation CSV'})).toBeDisabled();expect(screen.getByRole('button',{name:'Published final results CSV'})).toBeDisabled()
 states.a.publication={version:1,action:'publish',current:true,calculationId:'calc-a'}
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Published tabulation CSV'})).toBeEnabled())
 expect(screen.getByRole('button',{name:'Published final results CSV'})).toBeEnabled()
})
test('historical selection cannot publish/export as current; switching clears selected version',async()=>{states.a.history=[{calculationId:'old',version:1,current:false,results:{...states.a.official,standings:[{participationId:'old-entry',rank:1,name:'Old snapshot',score:70}]}}];await ready();fireEvent.change(screen.getByLabelText('Results version'),{target:{value:'old'}});expect(screen.getByText('Historical finalized standings')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Publish selected finalized version'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Competition'),{target:{value:'b'}});await screen.findByText(/Dancer b/);expect(screen.queryByText('Old snapshot')).not.toBeInTheDocument()})
test('manual official placements have no fabricated numeric summary meters',async()=>{states.a.official.method='manual';states.a.official.standings[0]={participationId:'manual',entryNumber:1,name:'Manual entry',rank:1,manual:true,score:null};await ready(true);expect(screen.getByText('Manual placement 1')).toBeInTheDocument();expect(document.querySelector('meter')).toBeNull()})


test('the final-results handoff opens the requested authorized competition',async()=>{
 vi.stubEnv('VITE_COMPETITION_NATIVE_RESULTS_ENABLED','true')
 f.choices.mockResolvedValue({data:{contexts:choices,nativeEvent:true}})
 render(<MemoryRouter initialEntries={['/report?competitionId=b']}><NativeResultsBoundary eventId="event" Legacy={()=><p>Legacy</p>}/></MemoryRouter>)
 expect(await screen.findByRole('combobox',{name:'Competition'})).toHaveValue('b')
 await waitFor(()=>expect(f.owned).toHaveBeenCalledWith('event','b',null))
 expect(f.owned).not.toHaveBeenCalledWith('event','a',null)
})

test('final-results handoffs reject an unavailable competition',async()=>{
 vi.stubEnv('VITE_COMPETITION_NATIVE_RESULTS_ENABLED','true')
 f.choices.mockResolvedValue({data:{contexts:choices,nativeEvent:true}})
 render(<MemoryRouter initialEntries={['/report?competitionId=foreign']}><NativeResultsBoundary eventId="event" Legacy={()=><p>Legacy</p>}/></MemoryRouter>)
 expect(await screen.findByRole('alert')).toHaveTextContent('not available in the current results context')
 expect(f.owned).not.toHaveBeenCalled()
})
