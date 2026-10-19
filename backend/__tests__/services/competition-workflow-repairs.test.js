import {beforeEach,expect,test,vi} from 'vitest'
const f=vi.hoisted(()=>({tables:{},revision:1,inserts:[],rpc:vi.fn(),access:vi.fn(),eventEmit:vi.fn(),organizerEmit:vi.fn(),userEmit:vi.fn()}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:async()=>({id:'event',status:'active',competition_input_revision:f.revision,organizations:{organizer_id:'owner'}}),getEventById:async()=>({id:'event',official_rules_id:'rules',organizations:{organizer_id:'owner'}})}))
vi.mock('../../src/services/competition-access.service.js',()=>({judgeAccess:f.access,allowsScoring:vi.fn()}))
vi.mock('../../src/foundation/audit.js',()=>({recordAudit:vi.fn()}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToEvent:f.eventEmit,emitToEventOrganizer:f.organizerEmit,emitToUser:f.userEmit}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc,from(table){
 const filters=[];let insert
 const result=()=>({error:null,data:insert??(f.tables[table]??[]).filter(row=>filters.every(([key,value])=>row[key]===value)),count:(f.tables[table]??[]).length})
 const q={select:()=>q,order:()=>q,limit:()=>q,range:()=>q,in:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},is:(key,value)=>{filters.push([key,value]);return q},
 insert:row=>{insert={...row,id:'calculation'};f.inserts.push(insert);return q},single:async()=>{const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]:r.data}},maybeSingle:async()=>{const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data}},then:resolve=>resolve(result())}
 return q
}})}))
import {calculate,tabulationData,transitionCalculation,reviewerVerify,judgePublishedResults,scoringWrite} from '../../src/services/competition-workflow.service.js'
beforeEach(()=>{
 vi.clearAllMocks();f.revision=1;f.inserts=[]
 f.rpc.mockResolvedValue({data:{status:'under_verification'},error:null});f.access.mockResolvedValue({participant:{id:'judge'}})
 const rules={event:{id:'event'},rounds:[{id:'pre',purpose:'qualification',displayOrder:0,advancementType:'top_n',advancementValue:1,criteriaIds:[],contestantIds:['a','b']},{id:'final',purpose:'final',displayOrder:1,progression:'weighted',criteriaIds:[],contestantIds:[]}],contestants:[{id:'a',name:'A'},{id:'b',name:'B'}],criteria:[],categories:[],divisions:[],judges:[{judgeId:'reviewer',role:'score_reviewer'}],scoringConfig:{calculationMethod:'manual',confirmed:true,verifierId:'reviewer',independentApproval:true}}
 f.tables={competition_rule_versions:[{id:'rules',event_id:'event',version:1,snapshot:rules}],competition_advancement_decisions:[{event_id:'event',rules_version:'rules',round_id:'pre',next_round_id:'final',qualifiers:['a']}],competition_eligibility_decisions:[],competition_round_submissions:[],competition_deductions:[],competition_sessions:[{id:'session',event_id:'event',rules_version:'rules',current_round_id:'final'}],competition_session_judge_scores:[],users:[{id:'reviewer',account_status:'active'}],event_participants:[{event_id:'event',user_id:'reviewer',participant_type:'COMPETITION_JUDGE',is_active:true,judge_role:'score_reviewer',users:{account_status:'active'}}]}
})
test('unknown and foreign round contexts reject before any calculation INSERT',async()=>{
 await expect(calculate('event','owner',{roundId:'foreign',results:[{contestantId:'a',rank:1}],reason:'Placement decision'})).rejects.toMatchObject({statusCode:400})
 expect(f.inserts).toEqual([])
})
test('manual overall uses approved finalist field, saves revision and notifies only privileged rooms',async()=>{
 const state=await tabulationData('event','owner')
 expect(state.eligibleEntries.map(e=>e.id)).toEqual(['a'])
 const result=await calculate('event','owner',{results:[{contestantId:'a',rank:1}],reason:'Verified performance decision'})
 expect(result.status).toBe('ready_for_verification')
 expect(f.inserts[0]).toMatchObject({source_input_revision:1,result_snapshot:[{contestantId:'a',rank:1,manual:true}]})
 expect(f.organizerEmit).toHaveBeenCalledWith('event','competition:workflow-updated',expect.objectContaining({eventId:'event',action:'calculated'}))
 expect(f.userEmit).toHaveBeenCalledWith('reviewer','competition:workflow-updated',expect.objectContaining({calculationId:'calculation'}))
 expect(f.eventEmit).not.toHaveBeenCalled()
})
test('manual calculation rejects eliminated IDs and missing/duplicate positive placements',async()=>{
 for(const results of [[{contestantId:'b',rank:1}],[{contestantId:'a',rank:0}],[{contestantId:'a',rank:1},{contestantId:'a',rank:1}]])
   await expect(calculate('event','owner',{results,reason:'Decision'})).rejects.toMatchObject({statusCode:400})
 expect(f.inserts).toEqual([])
})
test('missing transactional revision fails closed before inserting a new snapshot',async()=>{
 f.revision=undefined
 await expect(calculate('event','owner',{results:[{contestantId:'a',rank:1}],reason:'Decision'})).rejects.toMatchObject({statusCode:503})
 expect(f.inserts).toEqual([])
})
test('stale finalized calculation cannot be published even with an unchanged source digest',async()=>{
 const state=await tabulationData('event','owner')
 f.tables.competition_result_calculations=[{id:'calc',event_id:'event',rules_version:'rules',round_id:null,source_digest:state.sourceDigest,source_input_revision:0,status:'finalized',created_by:'owner'}]
 await expect(transitionCalculation('event','owner','calc','publish')).rejects.toMatchObject({statusCode:409})
 expect(f.rpc).not.toHaveBeenCalled();expect(f.eventEmit).not.toHaveBeenCalled()
})
test('reviewer verification hands current status to organizer and appointed reviewer after commit',async()=>{
 const state=await tabulationData('event','owner')
 f.tables.competition_result_calculations=[{id:'calc',event_id:'event',rules_version:'rules',round_id:null,source_digest:state.sourceDigest,source_input_revision:1,status:'ready_for_verification',created_by:'owner'}]
 await reviewerVerify('event','reviewer','calc',{reason:'Checked submitted version'})
 expect(f.rpc).toHaveBeenCalledWith('competition_result_transition',expect.objectContaining({p_action:'verify',p_actor:'reviewer'}))
 expect(f.organizerEmit).toHaveBeenCalledWith('event','competition:workflow-updated',expect.objectContaining({action:'verified'}))
 expect(f.userEmit).toHaveBeenCalledWith('reviewer','competition:workflow-updated',expect.objectContaining({action:'verified'}))
})
test('failed scoring RPC does not announce a submission and successful Submit sends scoped hints only',async()=>{
 const context={judgeId:'judge',sessionId:'session',roundId:'final',rulesVersion:'rules'}
 f.rpc.mockResolvedValueOnce({error:{message:'SCORING_CLOSED'}})
 await expect(scoringWrite('event','judge','submit',{context})).rejects.toMatchObject({statusCode:409})
 expect(f.organizerEmit).not.toHaveBeenCalled()
 await scoringWrite('event','judge','submit',{context})
 expect(f.organizerEmit).toHaveBeenCalledWith('event','session:judge-score-submitted',expect.objectContaining({eventId:'event',action:'submit'}))
 expect(f.eventEmit).not.toHaveBeenCalled()
})
test('ordinary judge results read returns only published overall allowlisted fields',async()=>{
 f.tables.competition_result_calculations=[{event_id:'event',status:'provisional',round_id:null,result_snapshot:[{contestantId:'private',finalScore:99}]},{event_id:'event',status:'published',round_id:'pre',result_snapshot:[{contestantId:'round',finalScore:99}]},{event_id:'event',status:'published',round_id:null,published_at:'2026-10-12T12:00:00Z',rules_version:'rules',configuration_snapshot:{method:'manual',worksheets:[{secret:1}]},result_snapshot:[{contestantId:'a',contestantName:'A',rank:1,manual:true,finalScore:null,judgeTotals:[90],perCriterion:{raw:99}}]}]
 const result=await judgePublishedResults('event','judge')
 expect(result.results).toEqual([{contestantId:'a',contestantName:'A',contestantNumber:undefined,divisionId:null,rank:1,finalScore:null,manual:true}])
 expect(JSON.stringify(result)).not.toMatch(/worksheets|judgeTotals|perCriterion|private/)
 f.access.mockRejectedValueOnce(Object.assign(new Error('Unenrolled'),{statusCode:403}))
 await expect(judgePublishedResults('event','unenrolled')).rejects.toMatchObject({statusCode:403})
})
test('a superseded rules publication is not substituted for current unpublished final results',async()=>{
 f.tables.competition_result_calculations=[{event_id:'event',status:'published',round_id:null,rules_version:'previous-rules',published_at:'2026-10-12T12:00:00Z',result_snapshot:[{contestantId:'a',rank:1,finalScore:90}]}]
 const result=await judgePublishedResults('event','judge')
 expect(result.results).toEqual([]);expect(result.publishedAt).toBeNull()
})
