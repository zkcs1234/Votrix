import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,afterEach,expect,test,vi} from 'vitest'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
const f=vi.hoisted(()=>({view:vi.fn(),score:vi.fn(),control:vi.fn(),activity:vi.fn(),tabulation:vi.fn(),choices:vi.fn(),activate:vi.fn(),listeners:new Map()}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'judge-a'}})}))
vi.mock('@/services/competition-native.service',()=>({nativeCompetitionService:{view:f.view,score:f.score,control:f.control,activity:f.activity,choices:f.choices,activateLiveControl:f.activate}}))
vi.mock('@/services/competition-native-tabulation.service',()=>({nativeTabulationService:{snapshot:f.tabulation,reviewerChoices:vi.fn()}}))
vi.mock('@/services/socket.service',()=>({isConnected:()=>true,subscribe:(type,callback)=>{const group=f.listeners.get(type)??new Set();group.add(callback);f.listeners.set(type,group);return()=>group.delete(callback)}}))
import Workspace,{CompetitionWorkspaceBoundary,nativeContextKey} from './NativeCompetitionWorkspace'
const choices=[{competitionId:'a',competitionName:'Hip-Hop',roundId:null,roundName:'Single phase',state:'open'},{competitionId:'b',competitionName:'Contemporary',roundId:null,roundName:'Single phase',state:'waiting'}]
const emit=payload=>{for(const cb of f.listeners.get('competition:native-invalidated')??[])cb(payload)}
let views
const snapshot=c=>({context:{eventId:'event',competitionId:c,competitionName:c==='a'?'Hip-Hop':'Contemporary',roundId:null,sessionId:`s-${c}`,sessionRevision:1,rulesVersion:`rules-${c}`,setupRevision:2,inputRevision:3},viewerJudgeId:'judge-a',session:{id:`s-${c}`,status:'active',revision:1,source_revision:1,entry_ids:[`entry-${c}`],entry_access:{[`entry-${c}`]:true},criterion_access:{[`criterion-${c}`]:true}},criteria:[{id:`criterion-${c}`,name:'Technique',percentage:100,open:true,lockedCount:0,requiredCount:1,lockedJudgeCount:0,judgeCount:1,participantCount:1,minors:[{id:`minor-${c}`,name:'Execution',minScore:0,maxScore:10}]}],contestants:[{id:`entry-${c}`,name:`Dancer ${c}`,contestantNumber:1,photo:'/photo.jpg',open:true,lockedCriteria:[]}],drafts:[],submission:null,progress:[{judgeId:'judge-a',lockedCount:0,requiredCount:1,submitted:false}]})
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();f.listeners.clear();views={a:snapshot('a'),b:snapshot('b')}
 f.view.mockImplementation(async(e,c)=>({data:structuredClone(views[c])}))
 f.activity.mockResolvedValue({data:{activity:[]}})
 f.tabulation.mockResolvedValue({data:null})
 f.score.mockImplementation(async(e,c,action,body)=>{
  const v=views[c];v.session.source_revision++
  if(action==='submit'){v.submission={id:'submitted'};v.progress[0].submitted=true;return{data:{submissionId:'submitted'}}}
  const row={entry_id:body.entryId,criterion_id:body.criterionId,scores:body.scores,deductions:body.deductions??[],revision:body.rowRevision+1,locked:action==='lock'};v.drafts=[row]
  if(row.locked){v.contestants[0].lockedCriteria=[body.criterionId];v.progress[0].lockedCount=1}
  return{data:{rowRevision:row.revision,locked:row.locked}}
 })
 f.control.mockResolvedValue({data:{}})
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
const ready=async(owner=false)=>{if(owner)views.b.session=null;const r=render(<MemoryRouter><Workspace eventId="event" eventName="Campus arts showcase" choices={choices} owner={owner}/></MemoryRouter>);if(owner){await screen.findByRole('heading',{name:'Live Control Panel'});await screen.findByText('Dancer a')}else await screen.findByText('Dancer a');return r}

test.each(['access','pause','correction','row correction'])('a delayed draft response preserves newer %s state',async(change)=>{
 await ready()
 let release
 f.score.mockImplementationOnce(async(_event,_child,_action,body)=>{
  views.a.drafts=[{entry_id:body.entryId,criterion_id:body.criterionId,scores:body.scores,revision:1,locked:false}]
  views.a.session.source_revision=2
  return new Promise(resolve=>{release=resolve})
 })
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'8'}})
 fireEvent.click(screen.getByRole('button',{name:'Retry saves'}))
 await waitFor(()=>expect(f.score).toHaveBeenCalledTimes(1))
 if(change!=='row correction'){views.a.session.revision=2;views.a.context.sessionRevision=2}
 if(change==='access'){
  views.a.contestants[0].open=false;views.a.session.entry_access['entry-a']=false
 }else if(change==='pause'){
  views.a.session.status='paused'
  views.a.criteria[0].open=false;views.a.contestants[0].open=false
 }
 else{
  views.a.drafts[0]={...views.a.drafts[0],scores:{'minor-a':9},revision:2}
  views.a.session.source_revision=3
 }
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 if(!change.includes('correction'))expect(screen.getByRole('spinbutton')).toBeDisabled()
 await act(async()=>release({data:{rowRevision:1,locked:false}}))
 if(!change.includes('correction'))expect(screen.getByRole('spinbutton')).toBeDisabled()
 else await waitFor(()=>expect(screen.getByRole('spinbutton')).toHaveValue(9))
 expect(screen.queryByRole('button',{name:'Retry saves'})).not.toBeInTheDocument()
})
test('opening published Live Control marks the event active without starting scoring',async()=>{
 vi.stubEnv('VITE_COMPETITION_NATIVE_SCORING_ENABLED','true')
 f.choices.mockResolvedValue({data:{contexts:choices,nativeEvent:true,eventName:'Campus arts showcase',event:{id:'event',status:'scheduled'}}})
 f.activate.mockResolvedValue({data:{status:'active',changed:true}})
 render(<MemoryRouter initialEntries={['/organizer/competition/events/event/live']}><Routes><Route path="/organizer/competition/events/:eventId/live" element={<CompetitionWorkspaceBoundary owner/>}/></Routes></MemoryRouter>)
 expect(await screen.findByText('Event ongoing')).toBeInTheDocument()
 expect(f.activate).toHaveBeenCalledWith('event')
 expect(f.control).not.toHaveBeenCalled()
})
test('judge division bar filters the same scoring table and hidden contestants remain required for submission',async()=>{
 Object.assign(views.a.contestants[0],{registrationNumber:1,divisionId:'men',divisionName:'MEN',lockedCriteria:['criterion-a']})
 views.a.contestants.push({id:'woman-a',name:'Woman a',contestantNumber:2,registrationNumber:1,divisionId:'women',divisionName:'WOMEN',open:true,lockedCriteria:[]})
 views.a.session.entry_ids.push('woman-a')
 await ready()
 const bar=screen.getByRole('navigation',{name:'Contestant division filter'}),table=screen.getByRole('table')
 expect(within(bar).getByRole('button',{name:'Event Wide'})).toHaveAttribute('aria-pressed','true')
 expect(bar.nextElementSibling).toHaveTextContent('Connected')
 expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
 const headers=table.querySelector('thead').innerHTML
 fireEvent.click(within(bar).getByRole('button',{name:'Men'}))
 expect(table.querySelectorAll('tbody tr')).toHaveLength(1)
 expect(screen.queryByRole('spinbutton',{name:'Woman a: Technique, Execution score'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Submit Scores'})).toBeDisabled()
 fireEvent.click(within(bar).getByRole('button',{name:'Women'}))
 expect(table.querySelector('tbody tr')).toHaveAttribute('data-contestant-id','woman-a')
 expect(table.querySelector('thead').innerHTML).toBe(headers)
 fireEvent.click(within(bar).getByRole('button',{name:'Event Wide'}))
 expect([...table.querySelectorAll('.v-judge-number > span')].map(node=>node.textContent)).toEqual(['#1','#1'])
 expect(f.score).not.toHaveBeenCalled()
})
test('native context keys isolate judge/event/competition/round/session/rules/revisions',()=>{
 const key=nativeContextKey('event','judge-a',views.a.context)
 for(const field of ['competitionId','roundId','sessionId','rulesVersion','setupRevision','inputRevision'])expect(nativeContextKey('event','judge-a',{...views.a.context,[field]:'changed'})).not.toBe(key)
 expect(nativeContextKey('event','judge-b',views.a.context)).not.toBe(key)
})
test('existing table retains identity, photos, minor bounds, major percentages and criterion locking/score submission',async()=>{
 await ready();expect(screen.getByRole('heading',{name:'Campus arts showcase'})).toBeInTheDocument();const dashboardLink=screen.getByRole('link',{name:'Back to dashboard'});expect(dashboardLink).toHaveAttribute('href','/participant');expect(dashboardLink.compareDocumentPosition(screen.getByRole('heading',{name:'Campus arts showcase'}))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(screen.getByRole('navigation',{name:'Competition categories'})).toBeInTheDocument();expect(screen.getByRole('button',{name:/Contemporary:/})).toBeInTheDocument();const table=screen.getByRole('table');expect(within(table).getByText('100%')).toBeInTheDocument();expect(within(table).getByText('0–10')).toBeInTheDocument();expect(table.querySelector('img').src).toContain('/photo.jpg');expect(within(table).queryByText('Waiting')).not.toBeInTheDocument();expect(within(table).queryByText('Not open yet')).not.toBeInTheDocument();expect(within(table).getByText('Technique')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'})).toBeDisabled();expect(screen.getByRole('button',{name:'Submit Scores'})).toBeDisabled()
})
test('locked category navigation selects its context but prevents scoring until organizer opens it',async()=>{
 views.b.scoringAvailable=false;views.b.criteria[0].open=false;views.b.contestants[0].open=false
 await ready();fireEvent.click(screen.getByRole('button',{name:/Contemporary:/}));await screen.findByText('Dancer b')
 expect(screen.getByRole('spinbutton')).toBeDisabled();expect(screen.getAllByText('This category is locked until the organizer opens scoring.').length).toBeGreaterThan(0);expect(screen.getByRole('button',{name:'Submit Scores'})).toBeDisabled()
})
test('locking and submission send participation identity, raw score and child/session revisions, then reconcile automatically',async()=>{
 await ready();fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'7.5'}});fireEvent.click(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Submit Scores'})).toBeEnabled())
 const lockedButton=screen.getByRole('button',{name:'Dancer a: Technique, Execution locked'})
 expect(lockedButton).toBeDisabled();expect(lockedButton).toHaveClass('is-locked');expect(lockedButton).toHaveTextContent('Locked')
 expect(f.view).toHaveBeenCalledTimes(1)
 expect(f.score.mock.calls[0]).toMatchObject(['event','a','lock',{entryId:'entry-a',criterionId:'criterion-a',scores:{'minor-a':7.5},competitionId:'a',roundId:null,sessionId:'s-a',rulesVersion:'rules-a',setupRevision:2,inputRevision:3,rowRevision:0}])
 fireEvent.click(screen.getByRole('button',{name:'Submit Scores'}))
 const confirmation=await screen.findByRole('dialog',{name:'Submit scores for this round?'})
 expect(confirmation).toHaveTextContent('you won’t be able to edit these scores unless the organizer reopens the round')
 expect(f.score.mock.calls.some(call=>call[2]==='submit')).toBe(false)
 fireEvent.click(within(confirmation).getByRole('button',{name:'Cancel'}))
 expect(screen.queryByRole('dialog',{name:'Submit scores for this round?'})).not.toBeInTheDocument()
 expect(f.score.mock.calls.some(call=>call[2]==='submit')).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Submit Scores'}))
 fireEvent.click(await screen.findByRole('button',{name:'Yes, Submit Scores'}))
 await screen.findByText('Dancer b')
 expect(f.score.mock.calls.at(-1)[2]).toBe('submit')
 expect(screen.queryByRole('dialog',{name:'Submit scores for this round?'})).not.toBeInTheDocument()
 expect(screen.getByRole('spinbutton')).toBeEnabled()
 expect(screen.getByRole('button',{name:/Contemporary:/})).toHaveAttribute('aria-current','page')
})

test.each([0,1,2])('judge input enforces %i saved decimal places before sending the accepted score',async precision=>{
 views.a.criteria[0].minors[0].decimalPlaces=precision
 await ready()
 const input=screen.getByRole('spinbutton'),lock=()=>screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'})
 expect(input).toHaveAttribute('step',String(10**-precision))
 fireEvent.change(input,{target:{value:'8.55'}})
 expect(lock().disabled).toBe(precision!==2)
 fireEvent.change(input,{target:{value:'8.5'}})
 expect(lock().disabled).toBe(precision===0)
 const accepted=precision===2?8.55:precision===1?8.5:8
 fireEvent.change(input,{target:{value:String(accepted)}})
 expect(lock()).toBeEnabled()
 expect(f.score).not.toHaveBeenCalled()
 fireEvent.click(lock())
 await waitFor(()=>expect(f.score).toHaveBeenCalledWith('event','a','lock',expect.objectContaining({scores:{'minor-a':accepted}})))
})
test('Lock shows progress only on its button and locks score inputs after success',async()=>{
 let finishLock
 await ready()
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'8'}})
 f.score.mockImplementationOnce(()=>new Promise(resolve=>{finishLock=resolve}))
 fireEvent.click(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'}))
 const loadingButton=await screen.findByRole('button',{name:'Dancer a: Technique, Execution Locking'})
 expect(loadingButton).toBeDisabled()
 expect(loadingButton.querySelector('.animate-spin')).toBeInTheDocument()
 expect(screen.getByRole('spinbutton')).toBeDisabled()
 expect(screen.getByRole('button',{name:'Submit Scores'})).toBeDisabled()
 await act(async()=>finishLock({data:{rowRevision:1,locked:true}}))
 const lockedButton=await screen.findByRole('button',{name:'Dancer a: Technique, Execution locked'})
 expect(lockedButton).toBeDisabled()
 expect(lockedButton).toHaveClass('is-locked')
 expect(lockedButton).toHaveTextContent('Locked')
 expect(screen.getByRole('spinbutton')).toBeDisabled()
 expect(f.view).toHaveBeenCalledTimes(1)
})
test('automatic draft save needs no manual refresh and never sends the sibling identity',async()=>{
 await ready();fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'6'}})
 await waitFor(()=>expect(f.score).toHaveBeenCalled(),{timeout:3000})
 expect(f.score.mock.calls[0][2]).toBe('draft');expect(f.score.mock.calls[0][1]).toBe('a');await waitFor(()=>expect(screen.getByText('Drafts saved')).toBeInTheDocument())
})
test('switching clears displayed scores and pending state; a late old-competition view cannot overwrite the selection',async()=>{
 await ready();fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'8'}})
 let release;f.view.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 fireEvent.click(screen.getByRole('button',{name:/Contemporary:/}));await screen.findByText('Dancer b');expect(screen.getByRole('spinbutton').value).toBe('')
 await act(async()=>release({data:views.a}));expect(screen.queryByText('Dancer a')).not.toBeInTheDocument();expect(screen.getByText('Dancer b')).toBeInTheDocument();expect(f.score).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Hip-Hop: OPEN FOR SCORING'}));await screen.findByText('Dancer a');expect(screen.getByRole('spinbutton').value).toBe('8')
})
test('scoped notifications refresh only selected child and apply pause/access gates without manual refresh',async()=>{
 await ready();const initial=f.view.mock.calls.length
 await act(async()=>emit({eventId:'event',competitionId:'b',roundId:null}));expect(f.view).toHaveBeenCalledTimes(initial)
 views.a.session.status='paused';views.a.session.revision=2;views.a.context.sessionRevision=2;views.a.criteria[0].open=false;views.a.contestants[0].open=false
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(screen.getByRole('spinbutton')).toBeDisabled();expect(screen.getAllByText(/paused/).length).toBeGreaterThan(0)
})
test('opening a participant enables only that judge row immediately without replacing the scoresheet',async()=>{
 views.a.contestants[0].open=false
 views.a.session.entry_access['entry-a']=false
 const {rerender}=await ready()
 const table=screen.getByRole('table')
 expect(screen.getByRole('spinbutton')).toBeDisabled()
 let finishRefresh
 f.view.mockImplementationOnce(()=>new Promise(resolve=>{finishRefresh=resolve}))
 views.a.contestants[0].open=true
 views.a.session.entry_access['entry-a']=true
 views.a.session.revision=2
 views.a.context.sessionRevision=2
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null,sessionId:'s-a',sessionRevision:2,access:{kind:'entry',targetId:'entry-a',open:true}}))
 rerender(<MemoryRouter><Workspace eventId="event" eventName="Campus arts showcase" choices={choices.map(context=>({...context}))} owner={false}/></MemoryRouter>)
 expect(screen.getByRole('table')).toBe(table)
 expect(screen.getByRole('spinbutton')).toBeEnabled()
 expect(screen.queryByText('Loading authorized scoring context…')).not.toBeInTheDocument()
 await act(async()=>finishRefresh({data:structuredClone(views.a)}))
 expect(screen.getByRole('spinbutton')).toBeEnabled()
})
test('failed authoritative permission refresh disables scoring while retaining local drafts',async()=>{
 await ready();fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'9'}});f.view.mockRejectedValueOnce({response:{data:{message:'Judge assignment revoked'}}})
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(screen.getByRole('alert')).toHaveTextContent('revoked');expect(screen.getByRole('spinbutton')).toBeDisabled();expect(screen.getByRole('spinbutton').value).toBe('9');expect(localStorage.getItem(nativeContextKey('event','judge-a',views.a.context))).toContain('9')
})
test('network retry persists exact request ID/body and cannot mix pending locks into a different competition',async()=>{
 await ready();f.score.mockRejectedValueOnce(new Error('offline'));fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'7'}});fireEvent.click(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'}));await waitFor(()=>expect(screen.getAllByText('offline').length).toBeGreaterThan(0))
 const first=f.score.mock.calls[0][3];fireEvent.click(screen.getByRole('button',{name:'Retry saves'}));await waitFor(()=>expect(f.score).toHaveBeenCalledTimes(2));expect(f.score.mock.calls[1][3]).toEqual(first);expect(f.score.mock.calls[1][1]).toBe('a')
})
test('organizer displays completion without score values and access control stays bound to selected child',async()=>{
 await ready(true);expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();expect(within(screen.getByText('Judge submissions').parentElement).getByText('0/2')).toBeInTheDocument()
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
 fireEvent.click(within(screen.getByRole('row',{name:/Dancer a/})).getByRole('button',{name:'Close scoring for Dancer a'}));await waitFor(()=>expect(f.control).toHaveBeenCalled());expect(f.control.mock.calls[0]).toMatchObject(['event','a','access',{competitionId:'a',roundId:null,kind:'entry',targetId:'entry-a',open:false}]);expect(JSON.stringify(f.control.mock.calls)).not.toContain('scores')
 confirm.mockRestore()
})
test('category cannot close before every assigned judge submits',async()=>{
 await ready(true)
 const close=screen.getByRole('button',{name:'Close Hip-Hop'})
 expect(close).toBeDisabled()
 expect(screen.getByText('Waiting for 1 judge to submit.')).toBeInTheDocument()
})
test('all judge submissions enable closing and proceeding opens the next category without tabulation',async()=>{
 views.a.progress[0].submitted=true
 views.a.session.status='closed'
 views.b.session=null
 views.b.progress[0].submitted=false
 await ready(true)
 expect(screen.getAllByText('Ready to tabulate').length).toBeGreaterThan(0)
 const proceed=screen.getByRole('button',{name:'Proceed to Contemporary →'})
 expect(proceed).toBeEnabled()
 f.control.mockImplementationOnce(async(_eventId,competitionId,action)=>{
  expect([competitionId,action]).toEqual(['b','start'])
  views.b.session={id:'s-b',status:'active',revision:1,source_revision:1,entry_ids:['entry-b'],entry_access:{'entry-b':true},criterion_access:{'criterion-b':true}}
  return{data:{sessionId:'s-b',status:'active'}}
 })
 fireEvent.click(proceed)
 await waitFor(()=>expect(f.control).toHaveBeenCalledWith('event','b','start',expect.objectContaining({rulesVersion:'rules-b',setupRevision:2,inputRevision:3})))
 expect(await screen.findByText('Contemporary is now open for live scoring.')).toBeInTheDocument()
 expect(screen.getByLabelText('Selected category and round')).toHaveValue('b:single')
 expect(f.tabulation).toHaveBeenCalled()
})
test.each([
 {competitionType:'pageant',blocked:true,disabled:true},
 {competitionType:'pageant',blocked:false,disabled:false},
 {competitionType:'dance',blocked:true,disabled:false},
])('Live Control round selector preserves $competitionType behavior (blocked: $blocked)',async({competitionType,blocked,disabled})=>{
 const rounds=[
  {competitionId:'pageant',competitionName:'Pageant',roundId:'preliminary',roundName:'Preliminary'},
  {competitionId:'pageant',competitionName:'Pageant',roundId:'final',roundName:'Final'},
 ]
 const roundViews=Object.fromEntries(rounds.map((context,index)=>{
  const base=structuredClone(views.a)
  base.context={...base.context,...context,eventId:'event',sessionId:`session-${context.roundId}`}
  base.session=null
  base.progress=[]
  base.laterRoundBlocked=index>0&&blocked
  return [`${context.competitionId}:${context.roundId}`,base]
 }))
 f.view.mockImplementation(async(_eventId,competitionId,roundId)=>({data:structuredClone(roundViews[`${competitionId}:${roundId}`])}))
 render(<MemoryRouter><Workspace eventId="event" eventName="Campus arts showcase" event={{competitionType}} choices={rounds} owner/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Live Control Panel'})
 const finalRound=await screen.findByRole('button',{name:/Round 2: CLOSED — Final/})
 if(disabled)expect(finalRound).toBeDisabled()
 else expect(finalRound).toBeEnabled()
})
test.each(['pageant','competition'])('closed %s rounds hand off to tabulation before the next round starts',async(competitionType)=>{
 const rounds=[
  {competitionId:'pageant',competitionName:'Pageant',roundId:'preliminary',roundName:'Preliminary'},
  {competitionId:'pageant',competitionName:'Pageant',roundId:'final',roundName:'Final'},
 ]
 const roundViews=Object.fromEntries(rounds.map((context,index)=>{
  const base=structuredClone(views.a)
  base.context={...base.context,...context,eventId:'event',sessionId:`session-${context.roundId}`}
  base.session=index===0?{...base.session,status:'closed'}:null
  base.progress=index===0?[{judgeId:'judge-a',submitted:true}]:[]
  base.laterRoundBlocked=index>0
  return [`${context.competitionId}:${context.roundId}`,base]
 }))
 f.view.mockImplementation(async(_eventId,competitionId,roundId)=>({data:structuredClone(roundViews[`${competitionId}:${roundId}`])}))
 render(<MemoryRouter><Workspace eventId="event" eventName="Pageant" event={{competitionType}} choices={rounds} owner/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Live Control Panel'})
 const link=await screen.findByRole('link',{name:'Go to Preliminary Tabulation →'})
 expect(link).toHaveAttribute('href','/organizer/competition/events/event/tabulation/overview?competitionId=pageant&roundId=preliminary')
 expect(screen.getByText(/Scores calculate automatically/)).toBeInTheDocument()
})
test('final closed category shows completion and Tabulation action instead of a next-category action',async()=>{
 views.a.progress[0].submitted=true
 views.a.session.status='closed'
 views.b.progress[0].submitted=true
 views.b.session.status='closed'
 render(<MemoryRouter><Workspace eventId="event" eventName="Campus arts showcase" choices={choices} owner/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Live Control Panel'})
 await screen.findByText('Dancer a')
 expect(screen.getByText('All Competition Categories Completed')).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Go to Tabulation →'})).toHaveAttribute('href','/organizer/competition/events/event/tabulation/overview?competitionId=a')
 expect(screen.queryByRole('button',{name:/Proceed to/})).not.toBeInTheDocument()
})
test('organizer can open judge scoring for an individual major criterion',async()=>{
 views.a.session.criterion_access['criterion-a']=false
 await ready(true)
 const openButton=screen.getByRole('button',{name:'Open scoring for Technique'})
 expect(openButton).toBeEnabled()
 const criteriaTable=screen.getByRole('table',{name:/Major criterion scoring access and judge lock progress/})
 expect(within(criteriaTable).getByRole('columnheader',{name:'Participant locks'})).toBeInTheDocument()
 expect(within(criteriaTable).getByRole('columnheader',{name:'Judges complete'})).toBeInTheDocument()
 const criterionRow=within(criteriaTable).getByRole('row',{name:/Technique/})
 expect(within(criterionRow).getByText('0/1 locked')).toBeInTheDocument()
 expect(within(criterionRow).getByText('0/1 complete')).toBeInTheDocument()
 fireEvent.click(openButton)
 await waitFor(()=>expect(f.control).toHaveBeenCalledWith('event','a','access',expect.objectContaining({competitionId:'a',roundId:null,kind:'criterion',targetId:'criterion-a',open:true})))
})
test('opening or closing access loads only its own Live Control button',async()=>{
 views.a.criteria.push({...views.a.criteria[0],id:'criterion-b',name:'Floorwork',open:false})
 views.a.criteria[0].open=false
 views.a.session.criterion_access['criterion-a']=false
 views.a.session.criterion_access['criterion-b']=false
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
 let finishControl
 f.control.mockImplementationOnce(()=>new Promise(resolve=>{finishControl=resolve}))
 await ready(true)
 const initialViewCalls=f.view.mock.calls.length
 fireEvent.click(screen.getByRole('button',{name:'Open scoring for Technique'}))
 const pendingButton=await screen.findByRole('button',{name:'Updating scoring access for Technique'})
 expect(pendingButton).toBeDisabled()
 expect(screen.getByRole('button',{name:'Open scoring for Floorwork'})).toBeEnabled()
 expect(screen.getByRole('button',{name:'Close scoring for Dancer a'})).toBeEnabled()
 expect(screen.getByRole('button',{name:'Pause scoring'})).toBeEnabled()
 expect(f.view).toHaveBeenCalledTimes(initialViewCalls)
 await act(async()=>finishControl({data:{sessionRevision:2,status:'active'}}))
 expect(await screen.findByRole('button',{name:'Close scoring for Technique'})).toBeEnabled()
 expect(f.view).toHaveBeenCalledTimes(initialViewCalls)
 confirm.mockRestore()
})
test('organizer sees per-criterion lock completion without seeing judge scores',async()=>{
 views.a.criteria[0]={...views.a.criteria[0],lockedCount:1,requiredCount:2,lockedJudgeCount:1,judgeCount:2,participantCount:1}
 await ready(true)
 const criterionRow=within(screen.getByRole('table',{name:/Major criterion scoring access and judge lock progress/})).getByRole('row',{name:/Technique/})
 expect(within(criterionRow).getByText('1/2 locked')).toBeInTheDocument()
 expect(within(criterionRow).getByText('1/2 complete')).toBeInTheDocument()
 expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
 expect(screen.queryByText(/Execution/)).not.toBeInTheDocument()
})
test('closing a major criterion asks for confirmation and preserves the scoped access action',async()=>{
 await ready(true)
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'Close scoring for Technique'}))
 await waitFor(()=>expect(f.control).toHaveBeenCalledWith('event','a','access',expect.objectContaining({competitionId:'a',roundId:null,kind:'criterion',targetId:'criterion-a',open:false})))
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Existing scores will be kept'))
 confirm.mockRestore()
})
test('organizer dashboard separates scoring access and allows next category after live completion without finalization',async()=>{
 views.a.session.status='closed'
 views.a.progress[0].submitted=true
 await ready(true)
 expect(screen.getByRole('heading',{name:'Campus arts showcase'})).toBeInTheDocument()
 expect(screen.getByText('Performer access')).toBeInTheDocument()
 expect(screen.getByText(/no separate performer access control/i)).toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'Major criteria'}).compareDocumentPosition(screen.getByText('Performer access'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Selected category and round'),{target:{value:'b:single'}})
 await screen.findByText('Dancer b')
 expect(screen.getByRole('button',{name:'Open Category'})).toBeEnabled()
 expect(screen.queryByText(/previous category must be finalized/i)).not.toBeInTheDocument()
})
test('opening the next category does not require finalized prior results',async()=>{
 views.a.session.status='closed'
 views.a.progress[0].submitted=true
 await ready(true)
 fireEvent.change(screen.getByLabelText('Selected category and round'),{target:{value:'b:single'}})
 await screen.findByText('Dancer b')
 const openButton=screen.getByRole('button',{name:'Open Category'})
 expect(openButton).toBeEnabled()
 fireEvent.click(openButton)
 await waitFor(()=>expect(f.control).toHaveBeenCalledWith('event','b','start',expect.objectContaining({competitionId:'b',roundId:null,requestId:expect.any(String)})))
})

test('explicit round selection isolates pending drafts and blocks Final until confirmed qualification',async()=>{
 const rounds=[{...choices[0],roundId:'preliminary',roundName:'Preliminary',state:'open'},{...choices[0],roundId:'final',roundName:'Final',state:'waiting'}]
 views.a.context.roundId='preliminary';views.a.context.sessionId='s-preliminary'
 const final={...snapshot('b'),context:{...snapshot('b').context,competitionId:'a',roundId:'final',sessionId:null},session:null,laterRoundBlocked:true,criteria:snapshot('b').criteria.map(k=>({...k,open:false})),contestants:snapshot('b').contestants.map(e=>({...e,open:false}))}
 f.view.mockImplementation(async(e,c,r)=>({data:structuredClone(r==='preliminary'?views.a:final)}))
 render(<MemoryRouter><Workspace eventId="event" choices={rounds}/></MemoryRouter>);await screen.findByText('Dancer a');fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'8'}})
 fireEvent.click(screen.getByRole('button',{name:/Round 2: CLOSED — Final/}));await screen.findByText('Dancer b');expect(screen.getByRole('spinbutton')).toBeDisabled();expect(screen.getByRole('spinbutton').value).toBe('');expect(screen.getByText(/confirmed qualification/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:/Round 1: OPEN — Preliminary/}));await screen.findByText('Dancer a');expect(screen.getByRole('spinbutton').value).toBe('8');expect(f.score).not.toHaveBeenCalled()
})
test('successful round submission automatically selects the next round without bypassing qualification',async()=>{
 const rounds=[{...choices[0],roundId:'preliminary',roundName:'Preliminary',state:'open'},{...choices[0],roundId:'final',roundName:'Final',state:'waiting'}]
 views.a.context.roundId='preliminary'
 views.a.contestants[0].lockedCriteria=['criterion-a']
 views.b.scoringAvailable=false
 const final={...snapshot('b'),context:{...snapshot('b').context,competitionId:'a',roundId:'final',sessionId:null},session:null,laterRoundBlocked:true,criteria:snapshot('b').criteria.map(k=>({...k,open:false})),contestants:snapshot('b').contestants.map(e=>({...e,open:false}))}
 f.view.mockImplementation(async(_e,_c,roundId)=>({data:structuredClone(roundId==='final'?final:views.a)}))
 render(<MemoryRouter><Workspace eventId="event" choices={rounds}/></MemoryRouter>)
 await screen.findByText('Dancer a')
 fireEvent.click(screen.getByRole('button',{name:'Submit Scores'}))
 fireEvent.click(await screen.findByRole('button',{name:'Yes, Submit Scores'}))
 expect(await screen.findByText(/confirmed qualification/)).toBeInTheDocument()
 expect(screen.getByRole('button',{name:/Round 2: CLOSED — Final/})).toHaveAttribute('aria-pressed','true')
 expect(screen.getByRole('spinbutton')).toBeDisabled()
 expect(f.score.mock.calls.at(-1)[2]).toBe('submit')
})
test('reconnect refetches authoritative access; older session/source snapshots cannot reopen scoring',async()=>{
 await ready();views.a.session.revision=5;views.a.session.source_revision=5;views.a.context.sessionRevision=5;views.a.session.status='paused';views.a.criteria[0].open=false;views.a.contestants[0].open=false
 await act(async()=>{for(const cb of f.listeners.get('ws:connected')??[])cb({})});expect(screen.getByRole('spinbutton')).toBeDisabled()
 f.view.mockResolvedValueOnce({data:snapshot('a')});await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(screen.getByRole('spinbutton')).toBeDisabled();expect(screen.getAllByText(/paused/).length).toBeGreaterThan(0)
})
test('organizer sees lock and submission progress from invalidations without confidential score values',async()=>{
 await ready(true);views.a.progress[0]={judgeId:'judge-a',lockedCount:1,requiredCount:1,submitted:true};views.a.session.source_revision=2
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(within(screen.getByText('Judge submissions').parentElement).getByText('1/2')).toBeInTheDocument();expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
})
test('terminal event state disables round submission even when every source is locked',async()=>{
 views.a.eventStatus='completed';views.a.scoringAvailable=false;views.a.criteria[0].open=false;views.a.contestants[0].open=false;views.a.contestants[0].lockedCriteria=['criterion-a']
 await ready();expect(screen.getByRole('spinbutton')).toBeDisabled();expect(screen.getByRole('button',{name:'Submit Scores'})).toBeDisabled();expect(screen.getByText(/Scoring is read only/)).toBeInTheDocument()
})
test('a Lock click during an in-flight draft is queued and committed instead of silently ignored',async()=>{
 let release,firstBody
 f.score.mockImplementationOnce((_e,_c,_action,body)=>{firstBody=body;return new Promise(resolve=>{release=resolve})})
 await ready();fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'8'}})
 await waitFor(()=>expect(release).toBeTypeOf('function'),{timeout:4000});fireEvent.click(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'}))
 views.a.drafts=[{entry_id:'entry-a',criterion_id:'criterion-a',scores:firstBody.scores,revision:1,locked:false}];views.a.session.source_revision++
 await act(async()=>release({data:{rowRevision:1,locked:false}}))
 await waitFor(()=>expect(f.score.mock.calls.some(call=>call[2]==='lock')).toBe(true),{timeout:5000})
 await waitFor(()=>expect(within(screen.getByRole('row',{name:/Dancer a/})).getByRole('button',{name:'Dancer a: Technique, Execution locked'})).toHaveClass('is-locked'))
})


const enableJudgeDeductions=()=>{
 const rule={id:'late',description:'Late start',amount:2,units:'points',appliedBy:'judge',roundId:null,criteriaId:null,perViolation:false,maxOccurrences:1,anchorCriterionId:'criterion-a'}
 views.a.deductionSettings={mode:'judge',rules:[rule],configuration:{structure:'single',rounds:[],criteria:[{id:'criterion-a',name:'Technique',roundId:null,percentage:100,minorCriteria:[{id:'minor-a',name:'Execution',minScore:0,maxScore:10}]}],scoringConfig:{calculationMethod:'weighted_average',deductionMode:'judge',deductionRules:[{...rule,anchorCriterionId:undefined}]}}}
}
test('judge deductions stay locked until an audited correction is reopened and scoring resumes',async()=>{
 enableJudgeDeductions()
 views.a.contestants[0].lockedCriteria=['criterion-a']
 views.a.progress[0].lockedCount=1
 views.a.drafts=[{entry_id:'entry-a',criterion_id:'criterion-a',scores:{'minor-a':8},deductions:[],revision:1,locked:true}]
 await ready()
 expect(screen.getByRole('button',{name:'Deduct'})).toBeDisabled()
 expect(screen.getByText(/Deductions are locked with this criterion/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Deduct'}))
 expect(f.score).not.toHaveBeenCalled()
 views.a.contestants[0].lockedCriteria=[];views.a.progress[0].lockedCount=0
 views.a.drafts[0].locked=false;views.a.drafts[0].revision=2
 views.a.session.status='paused';views.a.session.revision=2;views.a.session.source_revision=2;views.a.context.sessionRevision=2
 views.a.criteria[0].open=false;views.a.contestants[0].open=false
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 expect(screen.getByRole('button',{name:'Deduct'})).toBeDisabled()
 expect(screen.getByText('Scoring is paused. Wait for the organizer to resume it.')).toBeInTheDocument()
 views.a.session.status='active';views.a.session.revision=3;views.a.session.source_revision=3;views.a.context.sessionRevision=3
 views.a.criteria[0].open=true;views.a.contestants[0].open=true
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 expect(screen.getByRole('button',{name:'Deduct'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'Deduct'}))
 await waitFor(()=>expect(f.score).toHaveBeenCalledWith('event','a','draft',expect.objectContaining({sessionRevision:3,rowRevision:2,scores:{'minor-a':8},deductions:[expect.objectContaining({ruleId:'late'})]})))
 expect(screen.getByRole('spinbutton')).toHaveValue(8)
 expect(screen.getByText('Applied 1 of 1. Configured deduction limit reached.')).toBeInTheDocument()
})
test('judge deductions lock and submit with the original criterion score and cannot be changed afterwards',async()=>{
 enableJudgeDeductions();await ready()
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'8'}})
 fireEvent.click(screen.getByRole('button',{name:'Deduct'}))
 await waitFor(()=>expect(f.score).toHaveBeenCalledWith('event','a','draft',expect.objectContaining({entryId:'entry-a',criterionId:'criterion-a',deductions:[expect.objectContaining({ruleId:'late'})]})))
 expect(screen.queryByLabelText(/violation reference|deduction reason/i)).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Deduct'})).toBeDisabled()
 expect(screen.getByText('Applied 1 of 1. Configured deduction limit reached.')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'})).toBeEnabled()
 expect(screen.queryByText(/Judge total preview/)).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Dancer a: Technique, Execution Lock'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Submit Scores'})).toBeEnabled())
 expect(screen.getByText(/Applied 1 of 1\. Deductions are locked with this criterion/)).toBeInTheDocument()
 const payload=f.score.mock.calls.find(call=>call[2]==='lock')[3]
 expect(payload.scores).toEqual({'minor-a':8})
 expect(payload.deductions).toEqual([expect.objectContaining({id:expect.any(String),ruleId:'late'})])
 expect(payload.deductions[0]).not.toHaveProperty('offenseKey')
 expect(payload.deductions[0]).not.toHaveProperty('reason')
 expect(payload.deductions[0]).not.toHaveProperty('amount')
 fireEvent.click(screen.getByRole('button',{name:'Submit Scores'}))
 fireEvent.click(await screen.findByRole('button',{name:'Yes, Submit Scores'}))
 await screen.findByText('Dancer b')
 expect(f.score.mock.calls.at(-1)[2]).toBe('submit')
})
test('competition switching isolates incomplete local judge deductions without posting them to a sibling',async()=>{
 enableJudgeDeductions();await ready()
 fireEvent.click(screen.getByRole('button',{name:'Deduct'}))
 await waitFor(()=>expect(f.score).toHaveBeenCalledWith('event','a','draft',expect.objectContaining({entryId:'entry-a',criterionId:'criterion-a',deductions:[expect.objectContaining({ruleId:'late'})]})))
 fireEvent.click(screen.getByRole('button',{name:/Contemporary:/}))
 await screen.findByText('Dancer b')
 expect(screen.queryByLabelText(/violation reference|deduction reason/i)).not.toBeInTheDocument()
 expect(f.score.mock.calls.filter(call=>call[1]==='b')).toHaveLength(0)
})


test('a qualified Round 2 handoff opens its own Live Control session explicitly',async()=>{
 const rounds=[{competitionId:'pageant',competitionName:'Pageant',roundId:'preliminary',roundName:'Preliminary'},{competitionId:'pageant',competitionName:'Pageant',roundId:'final',roundName:'Final'}]
 f.view.mockImplementation(async(_e,c,r)=>{const base=structuredClone(views.a);return {data:{...base,context:{...base.context,eventId:'event',competitionId:c,roundId:r},session:r==='preliminary'?{...base.session,status:'closed'}:null,progress:[{judgeId:'judge-a',submitted:r==='preliminary'}],laterRoundBlocked:false}}})
 render(<MemoryRouter initialEntries={['/organizer/competition/events/event/live?competitionId=pageant&roundId=final']}><Workspace eventId="event" eventName="Pageant" event={{competitionType:'pageant'}} choices={rounds} owner/></MemoryRouter>)
 const open=await screen.findByRole('button',{name:'Open Final scoring'})
 await waitFor(()=>expect(open).toBeEnabled())
 expect(screen.getByRole('button',{name:/Round 2: CLOSED — Final/})).toHaveAttribute('aria-pressed','true')
 fireEvent.click(open)
 await waitFor(()=>expect(f.control).toHaveBeenCalledWith('event','pageant','start',expect.objectContaining({roundId:'final'})))
})


test('a next-round Open action remains disabled until its authorized live context loads',async()=>{
 let release
 f.view.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 render(<MemoryRouter><Workspace eventId="event" choices={[choices[0]]} owner/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Live Control Panel'})
 expect(screen.getByRole('button',{name:'Open Category'})).toBeDisabled()
 expect(f.control).not.toHaveBeenCalled()
 await act(async()=>release({data:{...views.a,session:null}}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Open Category'})).toBeEnabled())
})
