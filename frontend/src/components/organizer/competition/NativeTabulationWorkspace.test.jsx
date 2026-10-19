import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,expect,test,vi} from 'vitest'
import {MemoryRouter, Routes, Route, useParams} from 'react-router-dom'
const f=vi.hoisted(()=>({snapshot:vi.fn(),calculate:vi.fn(),transition:vi.fn(),appoint:vi.fn(),qualification:vi.fn(),deduction:vi.fn(),export:vi.fn(),owned:vi.fn(),downloadCsv:vi.fn(),downloadExcel:vi.fn(),downloadPdf:vi.fn(),downloadBlob:vi.fn(),listeners:new Map()}))
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'owner'}})}))
vi.mock('@/services/competition-native-tabulation.service',()=>({nativeTabulationService:{snapshot:f.snapshot,calculate:f.calculate,transition:f.transition,appoint:f.appoint,qualification:f.qualification,deduction:f.deduction}}))
vi.mock('@/services/competition-native-results.service',()=>({nativeResultsService:{export:f.export,owned:f.owned}}))
vi.mock('@/utils/exportReport',()=>({downloadCsv:f.downloadCsv,downloadExcel:f.downloadExcel,downloadPdf:f.downloadPdf}))
vi.mock('@/utils/csvDownload',()=>({downloadBlob:f.downloadBlob}))
vi.mock('@/services/socket.service',()=>({isConnected:()=>true,subscribe:(type,cb)=>{const group=f.listeners.get(type)??new Set();group.add(cb);f.listeners.set(type,group);return()=>group.delete(cb)}}))
import Workspace from './NativeTabulationWorkspace'
const choices=[{competitionId:'a',competitionName:'Hip-Hop',roundId:null,roundName:'Single phase'},{competitionId:'b',competitionName:'Contemporary',roundId:null,roundName:'Single phase'}]
let states
const snapshot=c=>({eventId:'event',competitionId:c,roundId:null,viewerId:'owner',complete:true,progress:[{judgeId:'judge1',judgeName:'Maria Santos',submitted:true,submissionId:`submission-${c}`,submittedAt:'2026-10-13T00:00:00Z'}],session:{id:`session-${c}`,status:'closed',entry_ids:[`entry-${c}`]},reviewPolicy:{active:true,reviewer_id:'reviewer',reviewerName:'John Reyes'},sourceDigest:'digest',deductionsResolved:true,deductions:[],entries:[{id:`entry-${c}`,name:`Dancer ${c}`,contestantNumber:1}],rules:{id:`rules-${c}`,configuration_snapshot:{structure:'single',rounds:[],criteria:[{id:`criterion-${c}`,name:'Technique',percentage:100,roundId:null,minorCriteria:[{id:`minor-${c}`,name:'Skill',minScore:0,maxScore:10}]}],scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2,deductionRules:[]}}},submissions:[{id:`submission-${c}`,judge_id:'judge1',session_id:`session-${c}`,rules_version:`rules-${c}`,round_id:null,submitted_at:'2026-10-13T00:00:00Z',sources:[{session_id:`session-${c}`,judge_id:'judge1',locked:true,entry_id:`entry-${c}`,criterion_id:`criterion-${c}`,scores:{[`minor-${c}`]:8}}]}],calculation:{id:`calc-${c}`,version:1,source_digest:'digest',verified:false,finalized:false,input_snapshot:{},output_snapshot:{results:[{contestantId:`entry-${c}`,rank:1,baseScore:80,deductionTotal:0,finalScore:80}],worksheets:[{entryId:`entry-${c}`,judgeId:'judge1',roundId:null,total:80,complete:true,criteria:[{criteriaId:`criterion-${c}`,name:'Technique',percentage:100,average:80,contribution:80,minors:[{id:`minor-${c}`,name:'Skill',raw:8,normalized:80}]}]}],entryCriteriaAverages:{[`single:entry-${c}`]:{roundId:null,entryId:`entry-${c}`,criteria:{[`criterion-${c}`]:80}}}}}})
beforeEach(()=>{vi.clearAllMocks();f.listeners.clear();states={a:snapshot('a'),b:snapshot('b')};f.snapshot.mockImplementation(async(e,c,r)=>({data:{...structuredClone(states[c]),roundId:r??null}}));f.export.mockResolvedValue({data:new Blob(['csv'])});f.owned.mockResolvedValue({data:{complete:true,calculation:{id:'calc-a'},publication:{current:true,action:'publish',calculationId:'calc-a'}}});for(const method of [f.calculate,f.transition,f.appoint,f.deduction])method.mockResolvedValue({data:{}})})
const emit=payload=>{for(const cb of f.listeners.get('competition:native-invalidated')??[])cb(payload)}
const renderReady=async(reviewer=false)=>{render(<MemoryRouter><Workspace eventId="event" choices={choices} reviewer={reviewer}/></MemoryRouter>);await screen.findByRole('heading',{name:'Category overview'})}
const openStage=name=>{
 if(name==='Ranking & Tie Rules'){fireEvent.click(screen.getByRole('tab',{name:/^Finalization:/}));fireEvent.click(screen.getByRole('button',{name:'Results & Rankings'}));return}
 fireEvent.click(screen.getByRole('tab',{name:new RegExp(`^${name==='Calculation'?'Validation':name}:`)}))
}
const matrixAction=action=>{fireEvent.click(screen.getByRole('button',{name:'Actions for Dancer a'}));fireEvent.click(screen.getByRole('button',{name:action}))}
const exportEntry=name=>{fireEvent.click(screen.getByRole('button',{name:`Actions for ${name}`}));fireEvent.click(screen.getByRole('button',{name:'Export this entry'}))}

test('subsection navigation preserves the selected original sheet without reloading the scoring context',async()=>{
 function Routed(){const {section='overview'}=useParams();return <Workspace eventId="event" choices={choices} initialSection={section}/>}
 render(<MemoryRouter initialEntries={['/organizer/competition/events/event/tabulation/overview']}><Routes><Route path="/organizer/competition/events/:eventId/tabulation/:section" element={<Routed/>}/></Routes></MemoryRouter>)
 await screen.findByRole('table',{name:'Contestant tabulation matrix'})
 matrixAction('View original sheets')
 expect(await screen.findByRole('table',{name:'Original submitted scores for Maria Santos'})).toBeInTheDocument()
 expect(screen.queryByRole('table',{name:'Contestant tabulation matrix'})).not.toBeInTheDocument()
 expect(f.snapshot).toHaveBeenCalledTimes(1)
})

test('each View Sheet action opens the clicked judge original record, not the combined results',async()=>{
 states.a.progress.push({judgeId:'judge2',judgeName:'Jen Smith',submitted:true,submissionId:'submission-jen',submittedAt:'2026-10-19T02:00:00Z'})
 states.a.submissions.push({...structuredClone(states.a.submissions[0]),id:'submission-jen',judge_id:'judge2',submitted_at:'2026-10-19T02:00:00Z',sources:[{...states.a.submissions[0].sources[0],judge_id:'judge2',scores:{'minor-a':9.125}}]})
 await renderReady();openStage('Judge Submissions')
 const row=screen.getByRole('rowheader',{name:'Jen Smith'}).closest('tr')
 fireEvent.click(within(row).getByRole('button',{name:'View Sheet'}))
 const dialog=screen.getByRole('dialog',{name:'Judge Score Sheet'})
 expect(dialog).toHaveTextContent('Judge: Jen Smith')
 expect(dialog).toHaveTextContent('Current submission · submission-jen')
 expect(within(dialog).getByRole('table')).toHaveTextContent('9.125')
 expect(within(dialog).queryByText('80')).not.toBeInTheDocument()
 expect(within(dialog).queryByText('8')).not.toBeInTheDocument()
 fireEvent.click(within(dialog).getByRole('button',{name:'Close Sheet'}))
 fireEvent.click(within(screen.getByRole('rowheader',{name:'Maria Santos'}).closest('tr')).getByRole('button',{name:'View Sheet'}))
 expect(screen.getByRole('dialog')).toHaveTextContent('Judge: Maria Santos')
 expect(screen.getByRole('dialog')).not.toHaveTextContent('9.125')
})

test('View Sheet shows unavailable submission status without leaking historical scores',async()=>{
 states.a.complete=false;states.a.progress[0].submitted=false;states.a.progress[0].submissionState='missing'
 await renderReady();openStage('Judge Submissions')
 fireEvent.click(screen.getByRole('button',{name:'View Sheet'}))
 const dialog=screen.getByRole('dialog')
 expect(dialog).toHaveTextContent('Missing submission')
 expect(within(dialog).queryByRole('table')).not.toBeInTheDocument()
 expect(within(dialog).getByRole('button',{name:'Download CSV'})).toBeDisabled()
})

test('source correction closes the open original sheet before an authoritative reload',async()=>{
 await renderReady();openStage('Judge Submissions');fireEvent.click(screen.getByRole('button',{name:'View Sheet'}))
 expect(screen.getByRole('dialog')).toBeInTheDocument()
 let release;f.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 states.a.complete=false
 await act(async()=>release({data:states.a}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('tabulation honors the Pageant round selected by the Live Control handoff',async()=>{
 const rounds=[
  {competitionId:'pageant',competitionName:'Pageant',roundId:'preliminary',roundName:'Preliminary'},
  {competitionId:'pageant',competitionName:'Pageant',roundId:'final',roundName:'Final'},
 ]
 states.pageant=snapshot('pageant')
 render(<MemoryRouter><Workspace eventId="event" choices={rounds} initialChoice={rounds[0]}/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Category overview'})
 expect(screen.getByRole('combobox',{name:'Round'})).toHaveValue('pageant:preliminary')
 expect(f.snapshot).toHaveBeenCalledWith('event','pageant','preliminary',false)
})
test('incomplete current sources hide historical worksheet values, aggregates, results and controls',async()=>{
 states.a.complete=false;states.a.progress[0].submitted=false;states.a.progress[0].issues=[{message:'A required criterion score is missing.',entryId:'entry-a',criterionId:'criterion-a'}]
 await renderReady();openStage('Judge Submissions');expect(screen.getByText('Missing submission')).toBeInTheDocument();expect(screen.queryByText(/Round overview/)).not.toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Score and workflow issues'})).not.toBeInTheDocument();expect(screen.queryByText('80')).not.toBeInTheDocument();expect(screen.getByRole('tab',{name:'Validation: blocked'})).toBeDisabled()
})
test('overview displays one compact contestant matrix and opens sources and calculation on demand',async()=>{
 await renderReady()
 const matrix=screen.getByRole('table',{name:'Contestant tabulation matrix'})
 expect(within(matrix).getByRole('rowheader',{name:'Dancer a'})).toBeInTheDocument()
 expect(within(matrix).getByRole('columnheader',{name:'Judge 1: Maria Santos'})).toBeInTheDocument()
 expect(screen.queryByRole('rowheader',{name:/Scoring summary/})).not.toBeInTheDocument()
 expect(screen.queryByRole('heading',{name:'Entry Summary ? Dancer a'})).not.toBeInTheDocument()
 expect(screen.queryByText('How the total is calculated')).not.toBeInTheDocument()
 for(const title of ['Judge submissions','Score comparison','Calculation breakdown','Validation & review','Audit trail','Automatic score calculation','Independent review','Final results']) expect(screen.queryByRole('heading',{name:title,hidden:true})).not.toBeInTheDocument()
 expect(screen.getAllByRole('table')).toHaveLength(1)
 matrixAction('View calculation')
 expect(screen.getByText('How the total is calculated')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Close Breakdown'}))
 matrixAction('View original sheets')
 expect(screen.getByRole('tab',{name:/^Judge Submissions:/})).toHaveAttribute('aria-selected','true')
 expect(screen.getByRole('table',{name:'Original submitted scores for Maria Santos'})).toBeInTheDocument()
 for(const title of ['Category overview','Contestant scores','Automatic score calculation','Independent review','Final results','Audit trail']) expect(screen.queryByRole('heading',{name:title,hidden:true})).not.toBeInTheDocument()
 expect(screen.getByText(/Current submission.*submission-a/)).toHaveTextContent('2026')
 expect(screen.getByText(/Frozen rule revision rules-a/)).toBeInTheDocument()
})
test('matrix has one row per contestant and offers exports without repeating per-entry tables',async()=>{
 states.a.session.entry_ids.push('entry-extra')
 states.a.entries.push({id:'entry-extra',name:'Dancer extra',contestantNumber:2})
 await renderReady()
 const matrix=screen.getByRole('table',{name:'Contestant tabulation matrix'})
 expect(within(matrix).getAllByRole('rowheader')).toHaveLength(2)
 expect(screen.queryByRole('table',{name:/original judge scores by configured criterion/})).not.toBeInTheDocument()
 exportEntry('Dancer a')
 expect(f.downloadCsv).toHaveBeenCalledWith('competition-entry-1.csv',expect.arrayContaining([expect.objectContaining({'Record type':'Original scores','Technique (100%) \u00b7 Skill [0\u201310]':'8','Calculated judge total':80})]))
})

test('deduction controls and calculation prerequisites are absent when no selected-round rule is configured',async()=>{
 states.a.deductionsResolved=false;states.a.calculation=null
 await renderReady()
 expect(screen.queryByText('Deduction decisions')).not.toBeInTheDocument()
 expect(screen.queryByText('Pending reviews')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Propose Deduction'})).not.toBeInTheDocument()
 openStage('Calculation')
 expect(screen.queryByRole('button',{name:'Calculate official results'})).not.toBeInTheDocument()
 expect(screen.getAllByText('Needs Review').length).toBeGreaterThan(0)
 fireEvent.click(screen.getByText('Export',{selector:'summary'}))
 expect(screen.queryByRole('button',{name:/Deduction Report/})).not.toBeInTheDocument()
})
test('configured organizer deductions expose the deduction workspace and proposal control',async()=>{
 states.a.rules.configuration_snapshot.scoringConfig.deductionRules=[{id:'rule-a',description:'Late entry',amount:2,units:'points'}]
 await renderReady()
 openStage('Deductions')
 expect(screen.getByRole('heading',{name:'Deduction decisions'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Propose Deduction'})).toBeInTheDocument()
})
test('correction invalidation clears worksheets immediately before the incomplete authoritative response',async()=>{
 await renderReady();let release;f.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));states.a.complete=false;states.a.progress[0].submitted=false
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(screen.queryByText('Skill: 8')).not.toBeInTheDocument()
 await act(async()=>release({data:states.a}));openStage('Judge Submissions');expect(screen.getByText('Missing submission')).toBeInTheDocument();expect(screen.queryByText('80')).not.toBeInTheDocument()
})
test('late score-bearing response cannot restore visibility after a newer invalidation',async()=>{
 await renderReady();let release;f.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));states.a.complete=false;states.a.progress[0].submitted=false
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));await act(async()=>release({data:snapshot('a')}));openStage('Judge Submissions');await screen.findByText('Missing submission');expect(screen.queryByText('Skill: 8')).not.toBeInTheDocument()
})
test('competition switching ignores late sibling responses and clears prior qualification/placement context',async()=>{
 await renderReady();let release;f.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));fireEvent.change(screen.getByLabelText('Competition'),{target:{value:'b'}});await screen.findAllByText('Dancer b');await act(async()=>release({data:states.a}));expect(screen.queryByText('Dancer a')).not.toBeInTheDocument();expect(screen.getAllByText('Dancer b').length).toBeGreaterThan(0)
})
test('reviewer verification and organizer finalization require explicit review and current calculation identity',async()=>{
 await renderReady(true);openStage('Finalization');expect(screen.queryByRole('button',{name:'Calculate official results'})).not.toBeInTheDocument();fireEvent.change(screen.getByLabelText('Review reason'),{target:{value:'Independent source review'}});fireEvent.click(screen.getByRole('button',{name:'Verify calculation'}));await waitFor(()=>expect(f.transition).toHaveBeenCalledWith('event','a',expect.objectContaining({calculationId:'calc-a',sourceDigest:'digest',action:'verify',reason:'Independent source review'}),true))
})
test('numeric results have no routine manual calculation action',async()=>{
 states.a.calculation=null;await renderReady();openStage('Calculation')
 expect(screen.queryByRole('button',{name:/Calculate official results|Recalculate results/})).not.toBeInTheDocument()
 expect(screen.getAllByText('Needs Review').length).toBeGreaterThan(0)
 expect(f.calculate).not.toHaveBeenCalled()
})
test('single phase renders no round selector or qualification controls',async()=>{states.a.calculation.finalized=true;await renderReady();expect(screen.queryByLabelText('Round')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Review qualification'})).not.toBeInTheDocument()})
test('failed authoritative refresh removes worksheets and results instead of retaining a stale official view',async()=>{await renderReady();f.snapshot.mockRejectedValueOnce({response:{data:{message:'Current source permission revoked'}}});await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}));expect(screen.getByRole('alert')).toHaveTextContent('revoked');expect(screen.queryByText('Skill: 8')).not.toBeInTheDocument()})
test('organizer finalization is explicit after independent verification',async()=>{
 states.a.calculation.verified=true;await renderReady();openStage('Finalization');expect(screen.getByRole('button',{name:'Finalize official calculation'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Review reason'),{target:{value:'Explicit reviewed finalization'}});fireEvent.click(screen.getByRole('button',{name:'Finalize official calculation'}));await waitFor(()=>expect(f.transition).toHaveBeenCalledWith('event','a',expect.objectContaining({calculationId:'calc-a',action:'finalize',reason:'Explicit reviewed finalization'})))
})
test('individual judge CSV download uses the selected competition, round and original submission',async()=>{
 await renderReady();matrixAction('View original sheets');fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Download CSV'}))
 await waitFor(()=>expect(f.export).toHaveBeenCalledWith('event','a',expect.objectContaining({kind:'judge',sourceDigest:'digest',judgeId:'judge1',submissionId:'submission-a'})))
 expect(f.downloadBlob).toHaveBeenCalled()
})
test('export dialog supports all judge sheets as a CSV download',async()=>{
 await renderReady();fireEvent.click(screen.getByText('Export',{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:/Judge Score Sheets/}))
 await screen.findByRole('dialog');await waitFor(()=>expect(f.snapshot).toHaveBeenCalledTimes(2));fireEvent.click(screen.getByRole('button',{name:'Export CSV'}))
 await waitFor(()=>expect(f.export).toHaveBeenCalledWith('event','a',expect.objectContaining({kind:'worksheets',sourceDigest:'digest'})))
})
test('combined score export is entry-by-entry and includes only backend calculation results',async()=>{
 await renderReady();fireEvent.click(screen.getByText('Export',{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:/Combined Scores/}))
 await screen.findByRole('dialog');await waitFor(()=>expect(f.snapshot).toHaveBeenCalledTimes(2));fireEvent.click(screen.getByRole('button',{name:'Export CSV'}))
 await waitFor(()=>expect(f.downloadCsv).toHaveBeenCalled())
 const [,records]=f.downloadCsv.mock.calls[0]
 expect(Object.keys(records[0])).toEqual(expect.arrayContaining(['Record type','Entry number','Entry','Judge','Submission ID','Submitted at','Technique (100%) \u00b7 Skill [0\u201310]','Calculated aggregate','Calculated score','Place','Frozen rules version','Source digest']))
 expect(records).toEqual(expect.arrayContaining([
   expect.objectContaining({'Record type':'Original scores',Entry:'Dancer a','Submission ID':'submission-a','Technique (100%) \u00b7 Skill [0\u201310]':'8'}),
   expect.objectContaining({'Record type':'Calculated result',Entry:'Dancer a','Calculated score':80}),
 ]))
 expect(f.export).not.toHaveBeenCalled()
})
test('ranking comparison withholds estimated scores until backend calculation exists',async()=>{
 states.a.calculation=null
 await renderReady()
 expect(screen.getByRole('tab',{name:'Finalization: blocked'})).toBeDisabled()
 expect(screen.queryByRole('heading',{name:'Overall ranking and tie rules'})).not.toBeInTheDocument()
 expect(screen.queryByText('80')).not.toBeInTheDocument()
})
test('stale calculations do not display prior standings or enable calculation details',async()=>{
 states.a.calculation=null;states.a.calculationStale=true
 await renderReady()
 expect(screen.queryByRole('button',{name:'View calculation'})).not.toBeInTheDocument()
 expect(screen.getByRole('tab',{name:'Finalization: blocked'})).toBeDisabled()
 expect(screen.queryByText('80')).not.toBeInTheDocument()
})
test('rank-based comparison displays backend judge ranks and the configured placement total',async()=>{
 states.a.rules.configuration_snapshot.scoringConfig.calculationMethod='rank_based'
 states.a.calculation.output_snapshot.results[0]={...states.a.calculation.output_snapshot.results[0],baseScore:2,finalScore:2,rank:1,judgeRanks:{judge1:2}}
 await renderReady()
 openStage('Ranking & Tie Rules')
 expect(screen.getByRole('columnheader',{name:'Judge rank · Maria Santos'})).toBeInTheDocument()
 expect(screen.getAllByRole('columnheader',{name:'Placement total'}).length).toBeGreaterThan(0)
 expect(screen.getAllByText('2',{selector:'td'}).length).toBeGreaterThan(0)
})
test('shared ties are explained from frozen tie rules instead of presented as a pending resolution',async()=>{
 states.a.rules.configuration_snapshot.scoringConfig.tiePolicy='shared'
 states.a.calculation.output_snapshot.results.push({contestantId:'entry-b',rank:1,baseScore:80,finalScore:80})
 states.a.entries.push({id:'entry-b',name:'Dancer b',contestantNumber:2})
 await renderReady()
 openStage('Ranking & Tie Rules')
 expect(screen.getByRole('heading',{name:'Overall ranking and tie rules'})).toBeInTheDocument()
 expect(screen.getByText(/frozen rules assign equal results the same placement/)).toBeInTheDocument()
 expect(screen.getByText('Place 1: Dancer a, Dancer b')).toBeInTheDocument()
 expect(screen.queryByText(/Tie Resolution: Pending/)).not.toBeInTheDocument()
})
test('highest-criterion ties are shown as already processed by the official calculation',async()=>{
 states.a.rules.configuration_snapshot.scoringConfig.tiePolicy='highest_criterion'
 states.a.calculation.output_snapshot.results.push({contestantId:'entry-b',rank:1,baseScore:80,finalScore:80})
 states.a.entries.push({id:'entry-b',name:'Dancer b',contestantNumber:2})
 await renderReady()
 openStage('Ranking & Tie Rules')
 expect(screen.getByText(/highest-criterion rule has already been applied by the official calculation/)).toBeInTheDocument()
})
test('official result export remains unavailable until current results are published',async()=>{
 f.owned.mockResolvedValue({data:{complete:true,calculation:null,publication:null}})
 await renderReady();fireEvent.click(screen.getByText('Export',{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:/Official Results/}))
 await screen.findByRole('dialog');expect(await screen.findByText(/Only the current, finalized and published results/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Export CSV'})).toBeDisabled()
})
test('qualification review preserves automatic cutoff selection and confirmation does not start scoring',async()=>{
 const rounds=[{...choices[0],roundId:'pre',roundName:'Preliminary'},{...choices[0],roundId:'final',roundName:'Final'}]
 states.a.roundId='pre';states.a.calculation.finalized=true;states.a.rules.configuration_snapshot.rounds=[{id:'pre',displayOrder:0,advancementType:'top_n',advancementValue:1},{id:'special',displayOrder:1,purpose:'special'},{id:'final',displayOrder:2}]
 f.qualification.mockResolvedValue({data:{automatic:['entry-a','entry-b'],policy:'top_n',fromRound:'pre',toRound:'final',standings:[{contestantId:'entry-a',rank:1},{contestantId:'entry-b',rank:1}]}})
 states.a.calculation.output_snapshot.results.push({contestantId:'entry-b',rank:1,baseScore:80,finalScore:80})
 states.a.entries.push({id:'entry-b',name:'Dancer b',contestantNumber:2})
 render(<MemoryRouter><Workspace eventId="event" choices={rounds}/></MemoryRouter>);await screen.findByRole('tab',{name:'Next Round: available'});openStage('Next Round');fireEvent.click(screen.getByRole('button',{name:'Review Advancement'}));await screen.findByRole('button',{name:'Confirm reviewed qualifiers'});expect(screen.getAllByRole('checkbox')).toHaveLength(2);expect(screen.getAllByRole('checkbox').every((checkbox)=>checkbox.checked&&checkbox.disabled)).toBe(true);fireEvent.change(screen.getByLabelText('Review reason'),{target:{value:'Explicit tied cutoff roster review'}});fireEvent.click(screen.getByRole('button',{name:'Confirm reviewed qualifiers'}));await waitFor(()=>expect(f.qualification).toHaveBeenCalledWith('event','a',expect.objectContaining({roundId:'pre',sourceDigest:'digest',calculationId:'calc-a',qualifierIds:['entry-a','entry-b'],acknowledged:true}),true));expect(f.calculate).not.toHaveBeenCalled()
})
test('manual advancement uses the existing reasoned qualifier decision for tied standings',async()=>{
 const rounds=[{...choices[0],roundId:'pre',roundName:'Preliminary'},{...choices[0],roundId:'final',roundName:'Final'}]
 states.a.roundId='pre';states.a.calculation.finalized=true;states.a.rules.configuration_snapshot.rounds=[{id:'pre',displayOrder:0,advancementType:'manual'},{id:'final',displayOrder:1}]
 states.a.calculation.output_snapshot.results.push({contestantId:'entry-b',rank:1,baseScore:80,finalScore:80})
 states.a.entries.push({id:'entry-b',name:'Dancer b',contestantNumber:2})
 f.qualification.mockResolvedValue({data:{automatic:[],policy:'manual',fromRound:'pre',toRound:'final',standings:[{contestantId:'entry-a',rank:1},{contestantId:'entry-b',rank:1}]}})
 render(<MemoryRouter><Workspace eventId="event" choices={rounds}/></MemoryRouter>);await screen.findByRole('tab',{name:'Next Round: available'});openStage('Next Round');expect(screen.getByText(/Manual advancement is configured/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Review Advancement'}));await screen.findByRole('button',{name:'Confirm reviewed qualifiers'});expect(screen.getAllByRole('checkbox').every((checkbox)=>!checkbox.disabled)).toBe(true)
})
test('a published single-round category can proceed to the next category still needing tabulation',async()=>{
 states.a.calculation.finalized=true
 f.owned.mockImplementation(async(eventId,competitionId,roundId)=>({data:{
  eventId,competitionId,roundId:roundId??null,viewerId:'owner',complete:true,
  calculation:{id:`calc-${competitionId}`,finalized:true},
  publication:competitionId==='a'?{action:'publish',current:true,calculationId:`calc-${competitionId}`}:null,
 }}))
 await renderReady()
 fireEvent.click(screen.getByRole('tab',{name:/^Category Wrap-up:/}))
 const proceed=await screen.findByRole('button',{name:'Proceed to Contemporary'})
 fireEvent.click(proceed)
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'Competition'})).toHaveValue('b'))
 expect(f.snapshot).toHaveBeenCalledWith('event','b',null,false)
})
test('a category handoff waits for terminal publication',async()=>{
 states.a.calculation.finalized=true
 f.owned.mockImplementation(async(eventId,competitionId,roundId)=>({data:{
  eventId,competitionId,roundId:roundId??null,viewerId:'owner',complete:true,
  calculation:{id:`calc-${competitionId}`,finalized:true},publication:null,
 }}))
 await renderReady()
 fireEvent.click(screen.getByRole('tab',{name:/^Category Wrap-up:/}))
 expect(await screen.findByText(/publish the terminal round’s results before proceeding/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/^Proceed to Contemporary/})).not.toBeInTheDocument()
})
test('a published single-category single-round competition has no category handoff',async()=>{
 states.a.calculation.finalized=true
 f.owned.mockImplementation(async(eventId,competitionId,roundId)=>({data:{
  eventId,competitionId,roundId:roundId??null,viewerId:'owner',complete:true,
  calculation:{id:`calc-${competitionId}`,finalized:true},
  publication:{action:'publish',current:true,calculationId:`calc-${competitionId}`},
 }}))
 render(<MemoryRouter><Workspace eventId="event" choices={[choices[0]]}/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Category overview'})
 fireEvent.click(screen.getByRole('tab',{name:/^Category Wrap-up:/}))
 expect(await screen.findByText(/Every configured category has completed its rounds/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/^Proceed to/})).not.toBeInTheDocument()
})
test('multiple-round categories hand off to the earliest unfinished round in the next category',async()=>{
 const contexts=[
  {competitionId:'a',competitionName:'Hip-Hop',roundId:'a-pre',roundName:'Preliminary'},
  {competitionId:'a',competitionName:'Hip-Hop',roundId:'a-final',roundName:'Final'},
  {competitionId:'b',competitionName:'Contemporary',roundId:'b-pre',roundName:'Preliminary'},
  {competitionId:'b',competitionName:'Contemporary',roundId:'b-final',roundName:'Final'},
 ]
 const roundsFor=id=>[
  {id:`${id}-pre`,name:'Preliminary',displayOrder:0,advancementType:'top_n',advancementValue:1},
  {id:`${id}-final`,name:'Final',displayOrder:1},
 ]
 states.a.roundId='a-final'
 states.a.calculation.finalized=true
 states.a.rules.configuration_snapshot.structure='multiple'
 states.a.rules.configuration_snapshot.rounds=roundsFor('a')
 states.b.roundId='b-pre'
 states.b.rules.configuration_snapshot.structure='multiple'
 states.b.rules.configuration_snapshot.rounds=roundsFor('b')
 f.snapshot.mockImplementation(async(eventId,competitionId,roundId)=>({data:{
  ...structuredClone(states[competitionId]),roundId:roundId??null,
 }}))
 f.owned.mockImplementation(async(eventId,competitionId,roundId)=>({data:{
  eventId,competitionId,roundId,viewerId:'owner',
  complete:competitionId==='a'||roundId==='b-pre',
  calculation:competitionId==='a'||roundId==='b-final'?{id:`calc-${competitionId}-${roundId}`,finalized:true}:null,
  publication:competitionId==='a'&&roundId==='a-final'
   ?{action:'publish',current:true,calculationId:`calc-${competitionId}-${roundId}`}
   :null,
 }}))
 render(<MemoryRouter><Workspace eventId="event" choices={contexts} initialChoice={contexts[1]}/></MemoryRouter>)
 await screen.findByRole('heading',{name:'Category overview'})
 fireEvent.click(screen.getByRole('tab',{name:/^Category Wrap-up:/}))
 fireEvent.click(await screen.findByRole('button',{name:'Proceed to Contemporary'}))
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'Round'})).toHaveValue('b:b-pre'))
 expect(f.owned).toHaveBeenCalledWith('event','a','a-pre')
 expect(f.owned).toHaveBeenCalledWith('event','a','a-final')
})

test.each([['Excel','xls','downloadExcel'],['PDF','pdf','downloadPdf']])('combined %s export uses current rows and explicitly labels unfinalized results',async(label,format,helper)=>{
 await renderReady();fireEvent.click(screen.getByText('Export',{selector:'summary'}));fireEvent.click(screen.getByRole('button',{name:`Export All Entries (${label})`}))
 const dialog=await screen.findByRole('dialog');await waitFor(()=>expect(f.snapshot).toHaveBeenCalledTimes(2))
 expect(within(dialog).getByRole('combobox',{name:'Export format'})).toHaveValue(format)
 fireEvent.click(within(dialog).getByRole('button',{name:`Export ${label}`}))
 await waitFor(()=>expect(f[helper]).toHaveBeenCalled())
 const [filename,payload]=f[helper].mock.calls[0]
 expect(filename).toMatch(new RegExp(`\\.${format}$`))
 const records=format==='xls'?payload[0].rows:payload.sections[0].rows
 expect(records).toEqual(expect.arrayContaining([expect.objectContaining({'Record type':'Calculated result','Calculated score':80,'Official final score':''})]))
 expect(JSON.stringify(payload)).not.toContain('Dancer b')
})

test('a live score correction closes an open breakdown before refreshed sources arrive',async()=>{
 await renderReady();matrixAction('View calculation');expect(screen.getByRole('dialog')).toBeInTheDocument()
 let release;f.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 await act(async()=>release({data:{...states.a,complete:false,calculation:null}}))
 expect(screen.queryByRole('button',{name:'View calculation'})).not.toBeInTheDocument()
})

test('configured unresolved deductions block continuation and official calculation',async()=>{
 states.a.rules.configuration_snapshot.scoringConfig.deductionRules=[{id:'rule-a',description:'Late entry',amount:2,units:'points'}]
 states.a.deductionsResolved=false;states.a.calculation=null
 await renderReady();openStage('Deductions')
 expect(screen.getByRole('button',{name:'Next: Validation →'})).toBeDisabled()
 openStage('Calculation');expect(screen.queryByRole('button',{name:'Calculate official results'})).not.toBeInTheDocument()
 expect(screen.getAllByText('Incomplete').length).toBeGreaterThan(0)
 expect(f.calculate).not.toHaveBeenCalled()
})

test('manual results retain explicit placement entry and do not offer a numeric calculation breakdown',async()=>{
 states.a.rules.configuration_snapshot.scoringConfig.calculationMethod='manual';states.a.calculation=null
 await renderReady();expect(screen.queryByRole('button',{name:'View calculation'})).not.toBeInTheDocument()
 openStage('Calculation');expect(screen.getByRole('heading',{name:'Manual Official Results'})).toBeInTheDocument()
 expect(screen.getByRole('spinbutton',{name:'Dancer a placement'})).toBeInTheDocument()
})


test('automatic results remain available before reviewer assignment and appointment is available at finalization',async()=>{
 states.a.reviewPolicy=null
 states.a.reviewerOptions=[{participantId:'reviewer-enrollment',name:'John Reyes'}]
 f.calculate.mockImplementation(async()=>{states.a.calculation=snapshot('a').calculation;return {data:{}}})
 f.appoint.mockImplementation(async()=>{states.a.reviewPolicy={active:true,reviewer_id:'reviewer',reviewerName:'John Reyes'};return {data:{}}})
 await renderReady();openStage('Calculation')
 expect(screen.queryByRole('heading',{name:'Independent review'})).not.toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'Automatic score calculation'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Calculate official results'})).not.toBeInTheDocument()
 expect(screen.getByRole('list',{name:'Configured criterion weights'})).toHaveTextContent('Technique')
 expect(screen.getAllByText('Up to Date').length).toBeGreaterThan(0)
 openStage('Finalization')
 expect(screen.getByRole('heading',{name:'Independent review'})).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Independent reviewer'),{target:{value:'reviewer-enrollment'}})
 fireEvent.click(screen.getByRole('button',{name:'Assign Reviewer'}))
 await waitFor(()=>expect(f.appoint).toHaveBeenCalledWith('event','a','reviewer-enrollment'))
 await screen.findByText('John Reyes')
 expect(screen.getByRole('heading',{name:'Final results'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Finalize official calculation'})).not.toBeInTheDocument()
 expect(f.calculate).not.toHaveBeenCalled()
})

test('validation keeps checks separate from the contestant matrix and does not repeat totals',async()=>{
 await renderReady();openStage('Calculation')
 expect(screen.queryByRole('table',{name:'Contestant tabulation matrix'})).not.toBeInTheDocument()
 expect(screen.queryByRole('table',{name:'Current calculation totals by entry'})).not.toBeInTheDocument()
 expect(screen.getByRole('list',{name:'Configured criterion weights'})).toHaveTextContent('Technique \u00b7 100%')
 expect(screen.getByRole('heading',{name:'Automatic score calculation'})).toBeInTheDocument()
})

test('manual placements require their own decision reason before saving',async()=>{
 states.a.reviewPolicy=null;states.a.calculation=null
 states.a.rules.configuration_snapshot.scoringConfig.calculationMethod='manual'
 await renderReady();openStage('Calculation')
 fireEvent.change(screen.getByLabelText('Dancer a placement'),{target:{value:'1'}})
 expect(screen.getByRole('button',{name:'Save manual placements'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Manual placement reason'),{target:{value:'Reviewed manual placement decision'}})
 fireEvent.click(screen.getByRole('button',{name:'Save manual placements'}))
 await waitFor(()=>expect(f.calculate).toHaveBeenCalledWith('event','a',expect.objectContaining({reason:'Reviewed manual placement decision',manualResults:[{contestantId:'entry-a',rank:1}]})))
})


test('calculation remains selected across a delayed authoritative refresh',async()=>{
 await renderReady();openStage('Calculation')
 let release;f.snapshot.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 await act(async()=>emit({eventId:'event',competitionId:'a',roundId:null}))
 expect(screen.queryByRole('heading',{name:'Calculation summary'})).not.toBeInTheDocument()
 await act(async()=>release({data:states.a}))
 expect(screen.getByRole('tab',{name:'Validation: complete'})).toHaveAttribute('aria-selected','true')
 expect(screen.getByRole('heading',{name:'Automatic score calculation'})).toBeInTheDocument()
})


test('judge mode exposes submitted deductions read-only and exports them with the original entry',async()=>{
 const cfg=states.a.rules.configuration_snapshot
 cfg.structure='single';cfg.scoringConfig.deductionMode='judge';cfg.scoringConfig.deductionRules=[{id:'late',description:'Late start',amount:2,units:'points',appliedBy:'judge'}]
 states.a.judgeDeductions=[{id:'record',contestant_id:'entry-a',judge_id:'judge1',judgeName:'Maria Santos',round_id:null,description:'Late start',amount:2,units:'points',offense_key:'late-1',reason:'Exceeded permitted time',submission_id:'submission-a'}]
 Object.assign(states.a.calculation.output_snapshot.worksheets[0],{originalTotal:80,total:78,judgeDeductionTotal:2})
 await renderReady()
 expect(screen.queryByRole('tab',{name:/^Organizer Deductions:/})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Apply Deduction'})).not.toBeInTheDocument()
 openStage('Judge Deductions')
 expect(screen.getByRole('heading',{name:'Submitted judge deductions'})).toBeInTheDocument()
 expect(screen.getByText('Exceeded permitted time')).toBeInTheDocument()
 openStage('Tabulation Matrix')
 exportEntry('Dancer a')
 expect(f.downloadCsv).toHaveBeenCalledWith('competition-entry-1.csv',expect.arrayContaining([expect.objectContaining({'Record type':'Judge deduction','Deduction owner':'Judge','Deduction amount':2,'Violation reference':'late-1'})]))
})
test('new organizer mode applies configured deductions without displaying legacy review prerequisites',async()=>{
 const cfg=states.a.rules.configuration_snapshot
 cfg.structure='single';cfg.scoringConfig.deductionMode='organizer';cfg.scoringConfig.deductionRules=[{id:'late',description:'Late start',amount:2,units:'points',appliedBy:'organizer'}]
 states.a.reviewPolicy=null;states.a.calculation=null
 await renderReady();openStage('Organizer Deductions')
 expect(screen.queryByRole('heading',{name:'Independent review'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Deduction contestant'),{target:{value:'entry-a'}})
 fireEvent.change(screen.getByLabelText('Deduction rule'),{target:{value:'late'}})
 fireEvent.change(screen.getByLabelText('Offense identity'),{target:{value:'late-1'}})
 fireEvent.change(screen.getByLabelText('Deduction reason'),{target:{value:'Organizer recorded late entry'}})
 fireEvent.click(screen.getByRole('button',{name:'Apply Deduction'}))
 await waitFor(()=>expect(f.deduction).toHaveBeenCalledWith('event','a',expect.objectContaining({action:'propose',entryId:'entry-a',ruleKey:'late',reason:'Organizer recorded late entry'})))
 expect(f.appoint).not.toHaveBeenCalled()
})
