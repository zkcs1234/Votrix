import {beforeEach,afterEach,test,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),emit:vi.fn(),csv:vi.fn(),rows:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc})}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToUser:f.emit}))
vi.mock('../../src/modules/competition-native-exports.js',()=>({nativeExportCsv:f.csv,nativeExportRows:f.rows}))
import {ownedResults,publicResults,publishResults,exportResults} from '../../src/services/competition-native-results.service.js'
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`,e=id(1),c=id(2),actor=id(3),calc=id(4),digest='a'.repeat(64)
beforeEach(()=>{vi.clearAllMocks();for(const flag of ['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED','COMPETITION_NATIVE_TABULATION_ENABLED','COMPETITION_NATIVE_RESULTS_ENABLED'])vi.stubEnv(flag,'true');f.csv.mockReturnValue('safe csv');f.rows.mockReturnValue([]);f.rpc.mockResolvedValue({data:null})})
afterEach(()=>vi.unstubAllEnvs())
test('results are separately gated before new schema or public lookup',async()=>{vi.stubEnv('COMPETITION_NATIVE_RESULTS_ENABLED','false');await expect(publicResults(e,c)).rejects.toMatchObject({statusCode:503});expect(f.rpc).not.toHaveBeenCalled()})
test('unpublished/withdrawn public reads deny without returning private data',async()=>{await expect(publicResults(e,c)).rejects.toMatchObject({statusCode:404})})
test('public responses whitelist snapshot fields and never disclose injected private traces/reviewer data',async()=>{
 f.rpc.mockResolvedValue({data:{publicationVersion:1,reviewer:'secret',results:{eventId:e,competitionId:c,roundId:null,worksheets:['secret'],input_snapshot:'secret',standings:[{participationId:id(5),rank:1,score:80,privateScore:99,trace:'secret'}]}}})
 const data=await publicResults(e,c);expect(JSON.stringify(data)).not.toContain('secret');expect(JSON.stringify(data)).not.toContain('privateScore');expect(data.results.standings[0].score).toBe(80)
})
test('public manual rows cannot fabricate numeric scores even if DB response contains one',async()=>{f.rpc.mockResolvedValue({data:{results:{eventId:e,competitionId:c,roundId:null,standings:[{manual:true,score:100,rank:1}]}}});expect((await publicResults(e,c)).results.standings[0].score).toBe(null)})

test('public deduction settings expose responsibility flags without judge reasons or private rule metadata',async()=>{
 f.rpc.mockResolvedValue({data:{results:{eventId:e,competitionId:c,roundId:null,deductionSettings:{organizer:false,judge:true,reason:'secret'},judgeDeductions:[{reason:'secret'}],standings:[]}}})
 const data=await publicResults(e,c)
 expect(data.results.deductionSettings).toEqual({organizer:false,judge:true})
 expect(JSON.stringify(data)).not.toContain('secret')
 expect(data.results).not.toHaveProperty('judgeDeductions')
})
test('incomplete current results mask both current and historical finalized score payloads',async()=>{f.rpc.mockResolvedValue({data:{eventId:e,competitionId:c,roundId:null,viewerId:actor,complete:false,official:{secret:80},calculation:{secret:99},history:[{version:1,results:{secret:80}}]}});const data=await ownedResults(e,c,actor);expect(data.official).toBe(null);expect(data.calculation).toBe(null);expect(data.history[0].results).toBe(null)})
test('publication binds server actor, explicit selected calculation, request ID and CAS; emits only after commit',async()=>{
 const body={action:'publish',roundId:null,requestId:id(6),calculationId:calc,sourceDigest:digest,expectedPublicationVersion:0,reason:'Explicit reviewed version',acknowledged:true}
 f.rpc.mockImplementation(async name=>({data:name==='competition_child_official_notice'?{userIds:[actor],roundIds:[null]}:{publicationId:id(7),publicationVersion:1}}))
 await publishResults(e,c,actor,body);expect(f.rpc).toHaveBeenCalledWith('competition_child_publication_action',{p_event:e,p_competition:c,p_actor:actor,p_round:null,p_action:'publish',p_body:body});expect(f.emit).toHaveBeenCalledWith(actor,'competition:native-invalidated',{eventId:e,competitionId:c,roundId:null,affectedRoundIds:[null]});expect(JSON.stringify(f.emit.mock.calls)).not.toContain(digest)
})
test('stale publication rejection never emits or selects a legacy fallback',async()=>{f.rpc.mockResolvedValue({error:{code:'P0001',message:'PUBLICATION_VERSION_CONFLICT'}});await expect(publishResults(e,c,actor,{action:'withdraw',requestId:id(6),expectedPublicationVersion:1,reason:'Explicit withdrawal',acknowledged:true})).rejects.toMatchObject({statusCode:409});expect(f.emit).not.toHaveBeenCalled()})
test('exports require fresh source digest and authoritative scope before serialization',async()=>{
 f.rpc.mockResolvedValue({data:{eventId:e,competitionId:c,roundId:null,kind:'final',source:{complete:false,sourceDigest:digest}}});await expect(exportResults(e,c,actor,{kind:'final',sourceDigest:digest,calculationId:calc})).rejects.toMatchObject({statusCode:409});expect(f.csv).not.toHaveBeenCalled()
 const dataset={eventId:e,competitionId:c,roundId:null,kind:'final',source:{complete:true,sourceDigest:digest,calculation:{id:calc}},publication:{action:'publish',calculationId:calc}}
 f.rpc.mockResolvedValue({data:{...dataset,publication:null}});await expect(exportResults(e,c,actor,{kind:'final',sourceDigest:digest,calculationId:calc})).rejects.toMatchObject({statusCode:403});expect(f.csv).not.toHaveBeenCalled()
 f.rpc.mockResolvedValue({data:dataset});expect((await exportResults(e,c,actor,{kind:'final',sourceDigest:digest,calculationId:calc})).csv).toBe('safe csv')
})
test('individual judge downloads bind the authorized event, category, round, judge and immutable submission',async()=>{
 const judge=id(8),submission=id(9),round=id(10)
 const dataset={eventId:e,competitionId:c,roundId:round,kind:'judge',source:{complete:true,sourceDigest:digest,submissions:[{id:submission,judge_id:judge}]},rawRows:[{judgeId:judge,submissionId:submission}]}
 f.rpc.mockResolvedValue({data:dataset})
 await expect(exportResults(e,c,actor,{kind:'judge',roundId:round,sourceDigest:digest,judgeId:judge,submissionId:submission})).resolves.toMatchObject({csv:'safe csv'})
 expect(f.rpc).toHaveBeenCalledWith('competition_child_export_sources',expect.objectContaining({p_event:e,p_competition:c,p_actor:actor,p_round:round,p_judge:judge,p_kind:'judge',p_digest:digest}))
})
test('judge downloads reject missing judges, superseded submission IDs and mixed judge rows before serialization',async()=>{
 const judge=id(8),submission=id(9)
 await expect(exportResults(e,c,actor,{kind:'judge',sourceDigest:digest})).rejects.toMatchObject({statusCode:400})
 expect(f.rpc).not.toHaveBeenCalled()
 const dataset={eventId:e,competitionId:c,roundId:null,kind:'judge',source:{complete:true,sourceDigest:digest,submissions:[{id:submission,judge_id:judge}]},rawRows:[{judgeId:judge,submissionId:submission}]}
 f.rpc.mockResolvedValue({data:dataset})
 await expect(exportResults(e,c,actor,{kind:'judge',sourceDigest:digest,judgeId:judge,submissionId:id(10)})).rejects.toMatchObject({statusCode:409})
 dataset.rawRows.push({judgeId:id(11),submissionId:id(12)})
 await expect(exportResults(e,c,actor,{kind:'judge',sourceDigest:digest,judgeId:judge,submissionId:submission})).rejects.toMatchObject({statusCode:409})
 expect(f.csv).not.toHaveBeenCalled()
})
test('official result exports reject withdrawn and superseded publication snapshots',async()=>{
 const dataset={eventId:e,competitionId:c,roundId:null,kind:'final',source:{complete:true,sourceDigest:digest,calculation:{id:calc}},publication:{action:'withdraw',calculationId:calc}}
 f.rpc.mockResolvedValue({data:dataset});await expect(exportResults(e,c,actor,{kind:'final',sourceDigest:digest,calculationId:calc})).rejects.toMatchObject({statusCode:403})
 dataset.publication={action:'replace',calculationId:id(8)}
 await expect(exportResults(e,c,actor,{kind:'final',sourceDigest:digest,calculationId:calc})).rejects.toMatchObject({statusCode:403})
 dataset.kind='tabulation';dataset.publication={action:'withdraw',calculationId:calc}
 await expect(exportResults(e,c,actor,{kind:'tabulation',sourceDigest:digest,calculationId:calc})).rejects.toMatchObject({statusCode:403})
 expect(f.csv).not.toHaveBeenCalled()
})
test('large target sets and repeated long labels fail before CSV allocation without truncating sources',async()=>{const dataset={eventId:e,competitionId:c,roundId:null,kind:'worksheets',source:{complete:true,sourceDigest:digest},rawRows:Array(12001).fill({})};f.rpc.mockResolvedValue({data:dataset});await expect(exportResults(e,c,actor,{kind:'worksheets',sourceDigest:digest})).rejects.toMatchObject({statusCode:413});expect(f.csv).not.toHaveBeenCalled();dataset.rawRows=[];f.rows.mockReturnValue([{event_name:'x'.repeat(6*1024*1024)}]);await expect(exportResults(e,c,actor,{kind:'worksheets',sourceDigest:digest})).rejects.toMatchObject({statusCode:413});expect(f.csv).not.toHaveBeenCalled()})
