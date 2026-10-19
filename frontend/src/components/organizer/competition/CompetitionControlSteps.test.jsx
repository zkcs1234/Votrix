import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import CompetitionControlSteps from './CompetitionControlSteps'

const mocks=vi.hoisted(()=>({action:vi.fn(),start:vi.fn(),pause:vi.fn(),resume:vi.fn(),round:vi.fn(),complete:vi.fn(),reload:vi.fn()}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'owner'}})}))
vi.mock('@/hooks/useCompetitionSync',()=>({default:()=>({connected:true})}))
vi.mock('./CompetitionLiveWorkflowPanel',()=>({ExistingLiveWorkflowTools:()=>null}))
vi.mock('@/services/competition-workflow.service',()=>({workflowService:{action:mocks.action}}))
vi.mock('@/services/competition-session.service',()=>({competitionSessionService:{startSession:mocks.start,pauseSession:mocks.pause,resumeSession:mocks.resume,setActiveRound:mocks.round,completeSession:mocks.complete}}))
const contestants=[{id:'a',name:'Alice',contestantNumber:1,divisionId:'women'},{id:'b',name:'Bob',contestantNumber:1,divisionId:'men'}]
const criteria=[{id:'beauty',name:'Beauty',percentage:40},{id:'stage',name:'Stage',percentage:60}]
const foundation={event:{official_rules_id:'rules'},rounds:[{id:'pre',name:'Preliminary',contestantIds:['a','b'],criteriaIds:['beauty','stage']}],contestants,criteria,divisions:[{id:'women',name:'Women'},{id:'men',name:'Men'}]}
const session={id:'session',rulesVersion:'rules',status:'active',currentRoundId:'pre',roundContestants:contestants,contestantOrder:['a','b'],criteriaControl:criteria,accessConfig:{entries:{mode:'all'},criteria:{mode:'all'}}}
const mount=(props={})=>render(<MemoryRouter><CompetitionControlSteps eventId="event" foundation={foundation} reload={mocks.reload} {...props}/></MemoryRouter>)
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear()
 mocks.action.mockImplementation(async(_event,type,payload)=>({data:{result:type==='lineups'?[]:type==='lineup-save'?{id:'lineup',round_id:payload.roundId,rules_version:'rules',...payload}: {}}}))
 for(const fn of [mocks.start,mocks.pause,mocks.resume,mocks.round,mocks.complete,mocks.reload])fn.mockResolvedValue({data:{}})
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
const save=async()=>{fireEvent.click(screen.getByRole('button',{name:'Save Stage Lineup & Continue to Live Session'}));await screen.findByRole('button',{name:'Start Live Session'})}
test('planned access does not mutate live gates; confirmed save alone enables startup',async()=>{
 mount();expect(screen.getByRole('button',{name:/2Live Session/})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Close planned criterion Beauty'}))
 expect(mocks.action.mock.calls.some(call=>call[1]==='access')).toBe(false)
 await save();expect(mocks.start).not.toHaveBeenCalled()
 expect(mocks.action).toHaveBeenCalledWith('event','lineup-save',expect.objectContaining({roundId:'pre',slots:[['a'],['b']]}))
 expect(screen.getByText(/Planned permissions are not already live/)).toBeInTheDocument()
})
test('startup pauses, applies saved lineup and planned gates, then resumes; no empty-selected gate',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Close planned criterion Beauty'}));fireEvent.click(screen.getByRole('button',{name:'Close planned criterion Stage'}))
 await save();fireEvent.click(screen.getByRole('button',{name:'Start Live Session'}))
 await waitFor(()=>expect(mocks.resume).toHaveBeenCalledOnce())
 expect(mocks.action).toHaveBeenCalledWith('event','access',{kind:'criteria',gate:{mode:'none',ids:[]}})
 const activate=mocks.action.mock.calls.findIndex(call=>call[1]==='lineup-activate')
 expect(mocks.start.mock.invocationCallOrder[0]).toBeLessThan(mocks.pause.mock.invocationCallOrder[0])
 expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.action.mock.invocationCallOrder[activate])
 expect(mocks.action.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.resume.mock.invocationCallOrder[0])
})
test('failed save preserves preparation and does not permit startup',async()=>{
 mocks.action.mockImplementation(async(_event,type)=>{if(type==='lineup-save')throw new Error('Save unavailable');return {data:{result:[]}}})
 mount();fireEvent.click(screen.getByRole('button',{name:'Move slot 1 down'}));fireEvent.click(screen.getByRole('button',{name:'Save Stage Lineup & Continue to Live Session'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable')
 expect(screen.queryByRole('button',{name:'Start Live Session'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:/2Live Session/})).toBeDisabled()
})
test('partial startup failure is reported, reconciled and never resumes automatically',async()=>{
 mount();await save();mocks.action.mockImplementation(async(_event,type)=>{if(type==='access')throw new Error('Gate rejected');return {data:{result:[]}}})
 fireEvent.click(screen.getByRole('button',{name:'Start Live Session'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('The session started, but preparation did not finish')
 expect(mocks.resume).not.toHaveBeenCalled();expect(mocks.pause).toHaveBeenCalledTimes(2)
})
test('division filtering never changes membership and a toggle retains hidden contestants',async()=>{
 mount({session});fireEvent.click(screen.getByRole('button',{name:'Women'}))
 expect(screen.queryByRole('button',{name:'Close scoring for Bob'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Close scoring for Alice'}))
 await waitFor(()=>expect(mocks.action).toHaveBeenCalledWith('event','access',{kind:'entries',gate:{mode:'selected',ids:['b']}}))
 expect(screen.getByText('40%')).toBeInTheDocument();expect(screen.getByText('60%')).toBeInTheDocument()
})
test('removing a draft slot requires replacement before saving and never removes participation',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Remove slot 1 from draft lineup'}))
 expect(screen.getByRole('button',{name:'Save Stage Lineup & Continue to Live Session'})).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox',{name:'Alice'}));fireEvent.click(screen.getByRole('button',{name:'Add individual slots'}))
 await save();expect(mocks.action).toHaveBeenCalledWith('event','lineup-save',expect.objectContaining({slots:[['b'],['a']]}))
})
test('published controls are closed without fetching or mutating live configuration',()=>{
 mount({session,readOnly:true});expect(screen.getByText('Performance controls closed')).toBeInTheDocument();expect(mocks.action).not.toHaveBeenCalled()
})
test('saved preparation recovers only for the current owner, event and published rules',async()=>{
 localStorage.setItem('votrix.stage-preparation.owner.event.rules',JSON.stringify({lineupId:'lineup',plannedEntries:['b'],plannedCriteria:['stage']}))
 mocks.action.mockResolvedValue({data:{result:[{id:'lineup',round_id:'pre',rules_version:'rules',slots:[['b'],['a']],name:'Saved performance',mode:'manual'}]}})
 mount();await screen.findByRole('button',{name:'Start Live Session'})
 expect(mocks.start).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Edit stage preparation'}))
 expect(screen.getByLabelText('Stage name')).toHaveValue('Saved performance')
 expect(screen.getByRole('button',{name:'Open planned criterion Beauty'})).toBeInTheDocument()
})
test('a local plan without a matching authoritative lineup cannot enable startup',async()=>{
 localStorage.setItem('votrix.stage-preparation.owner.event.rules',JSON.stringify({lineupId:'deleted-lineup',plannedEntries:['b'],plannedCriteria:['stage']}))
 mount();await waitFor(()=>expect(mocks.action).toHaveBeenCalledWith('event','lineups'))
 expect(screen.getByRole('button',{name:/2Live Session/})).toBeDisabled()
 expect(screen.queryByRole('button',{name:'Start Live Session'})).not.toBeInTheDocument()
})
test('live presentation uses the saved slot order and existing slot endpoint',async()=>{
 mocks.action.mockResolvedValue({data:{result:[{id:'lineup',round_id:'pre',slots:[['a'],['b']],name:'Saved performance'}]}})
 mount({session:{...session,lineupId:'lineup',activeSlot:0}})
 expect(await screen.findByText('Presenting slot 1 of 2: Alice')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Previous contestant / slot'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Next contestant / slot'}))
 await waitFor(()=>expect(mocks.action).toHaveBeenCalledWith('event','slot',{index:1}))
})
