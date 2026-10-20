import {beforeEach,afterEach,expect,test,vi} from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),emit:vi.fn(),calculate:vi.fn(),qualify:vi.fn(),deductionsEnabled:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc,from:f.from})}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToUser:f.emit}))
vi.mock('../../src/modules/competition-native-tabulation.js',()=>({calculateNativeSnapshot:f.calculate,nativeDeductionsEnabled:f.deductionsEnabled,nativeQualifierProposal:f.qualify}))
import {tabulationSnapshot,tabulationWorkspaceSnapshot,calculateNative,automaticallyCalculateNative,transitionNative,appointReviewer,deductionNative,qualificationNative} from '../../src/services/competition-native-tabulation.service.js'
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`,event=id(1),child=id(2),owner=id(3),round=null,calc=id(4)
let state
beforeEach(()=>{
 vi.clearAllMocks();for(const flag of ['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED','COMPETITION_NATIVE_TABULATION_ENABLED'])vi.stubEnv(flag,'true')
 state={eventId:event,competitionId:child,roundId:round,viewerId:owner,complete:true,session:{status:'closed'},sourceDigest:'digest',deductionsResolved:true,submissions:[{id:id(5)}],rules:{id:id(6)},evidence:{},calculation:{id:calc,finalized:true}}
 f.from.mockImplementation(table=>({select:()=>table==='events'?{eq:()=>({maybeSingle:async()=>({data:{organizations:{organizer_id:owner}},error:null})})}:{in:async()=>({data:[],error:null})}}))
 f.rpc.mockImplementation(async name=>({data:name==='competition_child_tabulation_snapshot'?state:name==='competition_child_official_notice'?{userIds:[owner],roundIds:[null]}:{calculationId:calc},error:null}))
 f.calculate.mockReturnValue({input:{rules:{id:id(6)}},output:{ready:true,results:[]}});f.qualify.mockReturnValue({automatic:[id(7)]});f.deductionsEnabled.mockImplementation(snapshot=>(snapshot.rules?.configuration_snapshot?.scoringConfig?.deductionRules??[]).length>0)
})
afterEach(()=>vi.unstubAllEnvs())
test('all deployment gates must be enabled before querying any native official sources',async()=>{vi.stubEnv('COMPETITION_NATIVE_TABULATION_ENABLED','false');await expect(tabulationSnapshot(event,child,owner)).rejects.toMatchObject({statusCode:503});expect(f.rpc).not.toHaveBeenCalled()})
test('incomplete current snapshot masks all old worksheet/calculation evidence despite historical payloads',async()=>{
 state.complete=false;state.scopes=[{submissions:[{scores:'secret'}]}];state.allDeductions=[{amount:10}];state.deductions=[{amount:10}]
 const data=await tabulationSnapshot(event,child,owner);expect(data).toMatchObject({complete:false,submissions:[],rules:null,evidence:null,calculation:null,scopes:[],allDeductions:[],deductions:[]});expect(JSON.stringify(data)).not.toContain('secret')
})
test('snapshot resolves judge and assigned reviewer names without exposing UUID fallbacks',async()=>{
 state.progress=[{judgeId:id(8),submitted:true}];state.reviewPolicy={reviewer_id:id(9),active:true}
 f.from.mockImplementation(()=>({select:()=>({in:async()=>({data:[{id:id(8),first_name:'Ana',last_name:'Cruz'},{id:id(9),first_name:'John',last_name:'Reyes'}],error:null})})}))
 const data=await tabulationSnapshot(event,child,owner)
 expect(data.progress[0]).toMatchObject({judgeId:id(8),judgeName:'Ana Cruz'})
 expect(data.reviewPolicy.reviewerName).toBe('John Reyes')
})

test('contributing-round judge records retain names and immutable source identity',async()=>{
 const pre=id(10),entry=id(7),judge=id(8),submission=id(5)
 state.rules={id:id(6),configuration_snapshot:{structure:'multiple',rounds:[{id:pre,displayOrder:0},{id:id(11),displayOrder:1,progression:'carry_forward',deductionMode:'none'}],criteria:[{id:'technique',roundId:pre}],scoringConfig:{deductionMode:'judge',deductionRules:[{id:'time',description:'Time limit',appliedBy:'judge',roundId:pre,amount:2,units:'points'}]}}}
 state.scopes=[{session:{round_id:pre,entry_ids:[entry]},submissions:[{id:submission,judge_id:judge,sources:[{entry_id:entry,criterion_id:'technique',deductions:[{id:'record',ruleId:'time',offenseKey:'time-1',reason:'Time limit exceeded'}]}]}]}]
 const original=JSON.stringify(state.scopes)
 f.from.mockImplementation(()=>({select:()=>({in:async()=>({data:[{id:judge,first_name:'Earlier',last_name:'Judge'}],error:null})})}))
 const data=await tabulationSnapshot(event,child,owner)
 expect(data.judgeDeductions[0]).toMatchObject({judgeName:'Earlier Judge',submission_id:submission,round_id:pre,amount:2})
 expect(data.scopes[0].submissions[0].judgeName).toBe('Earlier Judge')
 expect(JSON.stringify(state.scopes)).toBe(original)
 expect(data.sourceDigest).toBe('digest')
})
test('calculation never invokes the engine for incomplete, reopened, unresolved or stale sources',async()=>{
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'manual',deductionRules:[{id:'configured-rule'}]}}}
 for(const change of [{complete:false},{session:{status:'paused'}},{deductionsResolved:false},{sourceDigest:'newdigest'}]){const previous={...state};Object.assign(state,change);await expect(calculateNative(event,child,owner,{sourceDigest:'digest'})).rejects.toMatchObject({statusCode:409});state=previous}
 expect(f.calculate).not.toHaveBeenCalled();expect(f.rpc.mock.calls.every(([name])=>name==='competition_child_tabulation_snapshot')).toBe(true)
})
test('automatic calculation uses the organizer as its audited actor and skips unchanged sources',async()=>{
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'weighted_average'}}}
 state.calculation=null
 f.calculate.mockReturnValue({input:{rules:{id:id(6)}},output:{ready:true,results:[{contestantId:id(7)}]}})
 await expect(automaticallyCalculateNative(event,child)).resolves.toMatchObject({status:'up_to_date',calculationId:calc})
 expect(f.calculate).toHaveBeenCalledWith(expect.objectContaining(state))
 expect(f.rpc).toHaveBeenCalledWith('competition_child_official_calculate',expect.objectContaining({p_event:event,p_competition:child,p_actor:owner,p_round:null,p_digest:'digest'}))
 expect(f.emit).toHaveBeenCalledWith(owner,'competition:native-invalidated',expect.anything())
 f.rpc.mockClear();f.calculate.mockClear();state.calculation={id:calc,source_digest:'digest'}
 await expect(automaticallyCalculateNative(event,child)).resolves.toMatchObject({status:'up_to_date',calculationId:calc})
 expect(f.calculate).not.toHaveBeenCalled()
 expect(f.rpc).toHaveBeenCalledTimes(1)
})
test('Pageant stale combined calculations reconcile through the audited automatic path before showing tabulation',async()=>{
 state.calculation=null;state.calculationStale=true;state.divisionRanking={mode:'division'}
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'rank_based'}}}
 f.calculate.mockReturnValue({input:{rules:{id:id(6)}},output:{ready:true,results:[]}})
 f.rpc.mockImplementation(async name=>{
  if(name==='competition_child_tabulation_snapshot')return {data:state}
  if(name==='competition_child_official_calculate'){state={...state,calculation:{id:calc,source_digest:'digest'},calculationStale:false};return {data:{calculationId:calc}}}
  return {data:{userIds:[],roundIds:[]}}
 })
 const result=await tabulationWorkspaceSnapshot(event,child,owner)
 expect(f.calculate).toHaveBeenCalledTimes(1)
 expect(result.calculation.id).toBe(calc)
 expect(f.rpc).toHaveBeenCalledWith('competition_child_official_calculate',expect.objectContaining({p_actor:owner,p_digest:'digest'}))
})
test('complete submitted sources calculate automatically before the scoring session is closed',async()=>{
 state.session={status:'active'}
 state.calculation=null
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'weighted_average'}}}
 await expect(automaticallyCalculateNative(event,child)).resolves.toMatchObject({status:'up_to_date',calculationId:calc})
 expect(f.rpc).toHaveBeenCalledWith('competition_child_official_calculate',expect.objectContaining({p_actor:owner,p_digest:'digest'}))
})
test('automatic calculation reports incomplete and manual-score sources without ranking them',async()=>{
 state.complete=false
 await expect(automaticallyCalculateNative(event,child)).resolves.toEqual({status:'incomplete'})
 expect(f.calculate).not.toHaveBeenCalled()
 state.complete=true;state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'manual'}}}
 await expect(automaticallyCalculateNative(event,child)).resolves.toEqual({status:'needs_review',message:'Manual placements require an authorized recorded decision.'})
 expect(f.calculate).not.toHaveBeenCalled()
})
test('disabled deductions are not a calculation prerequisite',async()=>{
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'manual',deductionRules:[]}}}
 state.deductionsResolved=false
 await calculateNative(event,child,owner,{sourceDigest:'digest'})
 expect(f.calculate).toHaveBeenCalled()
})
test('disabled organizer deductions are rejected before the deduction RPC',async()=>{
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{deductionRules:[]}}}
 await expect(deductionNative(event,child,owner,{action:'propose',entryId:id(7),ruleKey:'rule',offenseKey:'offense',reason:'Valid reason'})).rejects.toMatchObject({statusCode:409})
 expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['competition_child_tabulation_snapshot'])
})
test('enabled organizer deductions require configured rule, eligible entry and explicit reason',async()=>{
 const entry=id(7)
 state.session={status:'closed',entry_ids:[entry]}
 state.rules={id:id(6),configuration_snapshot:{structure:'single',criteria:[],scoringConfig:{deductionRules:[{id:'rule',description:'Late entry',amount:2,units:'points'}]}}}
 await expect(deductionNative(event,child,owner,{action:'propose',entryId:entry,ruleKey:'unknown',offenseKey:'offense',reason:'Valid reason'})).rejects.toMatchObject({statusCode:400})
 await expect(deductionNative(event,child,owner,{action:'propose',entryId:id(8),ruleKey:'rule',offenseKey:'offense',reason:'Valid reason'})).rejects.toMatchObject({statusCode:400})
 await expect(deductionNative(event,child,owner,{action:'propose',entryId:entry,ruleKey:'rule',offenseKey:'offense',reason:'bad'})).rejects.toMatchObject({statusCode:400})
 await deductionNative(event,child,owner,{action:'propose',entryId:entry,ruleKey:'rule',offenseKey:'offense',reason:'Valid reason'})
 expect(f.rpc).toHaveBeenCalledWith('competition_child_deduction_action',expect.objectContaining({p_event:event,p_competition:child,p_actor:owner,p_action:'propose'}))
})
test('official engine inputs are server-derived; client output fields cannot replace them',async()=>{
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'manual'}}}
 await calculateNative(event,child,owner,{sourceDigest:'digest',input:{malicious:true},output:{results:['fabricated']}})
 expect(f.rpc).toHaveBeenCalledWith('competition_child_official_calculate',expect.objectContaining({p_event:event,p_competition:child,p_actor:owner,p_round:null,p_digest:'digest',p_input:f.calculate.mock.results[0].value.input,p_output:f.calculate.mock.results[0].value.output}))
 expect(f.emit).toHaveBeenCalledWith(owner,'competition:native-invalidated',{eventId:event,competitionId:child,roundId:null,affectedRoundIds:[null]})
})
test('SQL transaction rejecting a reopened source emits no notification',async()=>{
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'manual'}}}
 f.rpc.mockImplementation(async name=>name==='competition_child_official_calculate'?{error:{code:'P0001',message:'STALE_OR_INCOMPLETE_CALCULATION'}}:{data:state})
 await expect(calculateNative(event,child,owner,{sourceDigest:'digest'})).rejects.toMatchObject({statusCode:409});expect(f.emit).not.toHaveBeenCalled()
})
test('independent verification, finalization and deduction review bind the authenticated role',async()=>{
 await expect(transitionNative(event,child,owner,{calculationId:calc,action:'verify'})).rejects.toMatchObject({statusCode:403})
 await transitionNative(event,child,owner,{calculationId:calc,action:'finalize',reason:'Explicit organizer finalization'})
 expect(f.rpc).toHaveBeenCalledWith('competition_child_official_transition',expect.objectContaining({p_actor:owner,p_action:'finalize',p_calculation:calc}))
 await expect(deductionNative(event,child,owner,{action:'approve'})).rejects.toMatchObject({statusCode:403})
})
test('reviewer appointment and confirmation pass explicit competition and frozen-source provenance',async()=>{
 await appointReviewer(event,child,owner,id(9));expect(f.rpc).toHaveBeenCalledWith('competition_child_appoint_reviewer',{p_event:event,p_competition:child,p_actor:owner,p_participant:id(9)})
 await expect(qualificationNative(event,child,owner,{roundId:id(8),calculationId:calc,sourceDigest:'digest',qualifierIds:[id(7)],reason:'Explicit roster review',acknowledged:true},true)).rejects.toMatchObject({statusCode:503})
 // The snapshot identity must match the selected round before confirmation.
 expect(f.rpc.mock.calls.some(([name])=>name==='competition_child_confirm_qualification')).toBe(false)
 state.roundId=id(8)
 await qualificationNative(event,child,owner,{roundId:id(8),calculationId:calc,sourceDigest:'digest',qualifierIds:[id(7)],reason:'Explicit roster review',acknowledged:true},true)
 expect(f.rpc).toHaveBeenCalledWith('competition_child_confirm_qualification',expect.objectContaining({p_event:event,p_competition:child,p_actor:owner,p_round:id(8),p_calculation:calc,p_digest:'digest',p_qualifiers:[id(7)],p_acknowledged:true}))
})
test('wrong competition or round snapshot fails closed without a legacy calculation fallback',async()=>{state.competitionId=id(11);await expect(tabulationSnapshot(event,child,owner)).rejects.toMatchObject({statusCode:503})})


test('calculation accepts complete closed sources before an independent reviewer is appointed',async()=>{
 state.reviewPolicy=null;state.calculation=null
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'manual'}}}
 await calculateNative(event,child,owner,{sourceDigest:'digest'})
 expect(f.calculate).toHaveBeenCalled()
 expect(f.rpc).toHaveBeenCalledWith('competition_child_official_calculate',expect.objectContaining({p_actor:owner,p_digest:'digest'}))
})


test('opening tabulation recovers a missing numeric calculation for any competition',async()=>{
 state.calculation=null;state.deductionsResolved=false
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'weighted_average',deductionRules:[]}}}
 f.rpc.mockImplementation(async name=>{
  if(name==='competition_child_tabulation_snapshot')return {data:state}
  if(name==='competition_child_official_calculate'){state={...state,calculation:{id:calc,source_digest:'digest'}};return {data:{calculationId:calc}}}
  return {data:{userIds:[],roundIds:[]}}
 })
 const recovered=await tabulationWorkspaceSnapshot(event,child,owner)
 expect(recovered.calculation.id).toBe(calc)
 expect(f.calculate).toHaveBeenCalledTimes(1)
 await tabulationWorkspaceSnapshot(event,child,owner)
 expect(f.calculate).toHaveBeenCalledTimes(1)
})

test.each(['manual','incomplete','open_deductions'])('workspace recovery preserves the %s calculation gate',async(gate)=>{
 state.calculation=null
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:gate==='manual'?'manual':'sum',deductionRules:gate==='open_deductions'?[{id:'rule'}]:[]}}}
 if(gate==='incomplete')state.complete=false
 if(gate==='open_deductions')state.deductionsResolved=false
 await tabulationWorkspaceSnapshot(event,child,owner)
 expect(f.calculate).not.toHaveBeenCalled()
 expect(f.rpc.mock.calls.map(([name])=>name)).not.toContain('competition_child_official_calculate')
})

test('disabled organizer deductions do not block automatic numeric calculation',async()=>{
 state.calculation=null;state.deductionsResolved=false
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'sum',deductionRules:[]}}}
 await expect(automaticallyCalculateNative(event,child)).resolves.toMatchObject({status:'up_to_date'})
 expect(f.calculate).toHaveBeenCalledTimes(1)
})


test('a failed automatic calculation can recover on the next workspace check',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  state.calculation=null
  state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'sum'}}}
  f.calculate.mockImplementationOnce(()=>{throw new Error('Temporary calculation failure')})
  f.rpc.mockImplementation(async name=>{
   if(name==='competition_child_tabulation_snapshot')return {data:state}
   if(name==='competition_child_official_calculate'){state={...state,calculation:{id:calc,source_digest:'digest'}};return {data:{calculationId:calc}}}
   return {data:{userIds:[],roundIds:[]}}
  })
  expect((await tabulationWorkspaceSnapshot(event,child,owner)).calculation).toBeNull()
  expect((await tabulationWorkspaceSnapshot(event,child,owner)).calculation.id).toBe(calc)
  expect(f.calculate).toHaveBeenCalledTimes(2)
 }finally{log.mockRestore()}
})

test('automatic recovery cannot run for a mismatched authorized snapshot',async()=>{
 state.viewerId=id(99);state.calculation=null
 state.rules={id:id(6),configuration_snapshot:{scoringConfig:{calculationMethod:'sum'}}}
 await expect(tabulationWorkspaceSnapshot(event,child,owner)).rejects.toMatchObject({statusCode:503})
 expect(f.calculate).not.toHaveBeenCalled()
})


test('a manual round override stays explicit even when the competition default is numeric',async()=>{
 state.roundId=id(8);state.calculation=null
 state.rules={id:id(6),configuration_snapshot:{rounds:[{id:id(8),calculationMethod:'manual'}],scoringConfig:{calculationMethod:'sum'}}}
 await expect(automaticallyCalculateNative(event,child,id(8))).resolves.toMatchObject({status:'needs_review'})
 expect(f.calculate).not.toHaveBeenCalled()
 await calculateNative(event,child,owner,{roundId:id(8),sourceDigest:'digest',reason:'Manual round decision',manualResults:[]})
 expect(f.calculate).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({reason:'Manual round decision'}))
})

test('a numeric round override calculates automatically even under a manual competition default',async()=>{
 state.roundId=id(8);state.calculation=null
 state.rules={id:id(6),configuration_snapshot:{rounds:[{id:id(8),calculationMethod:'sum'}],scoringConfig:{calculationMethod:'manual'}}}
 await expect(automaticallyCalculateNative(event,child,id(8))).resolves.toMatchObject({status:'up_to_date'})
 expect(f.calculate).toHaveBeenCalledTimes(1)
})
