import {afterEach,beforeEach,expect,test,vi} from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),emit:vi.fn(),autoCalculate:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc})}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToUser:f.emit}))
vi.mock('../../src/services/competition-native-tabulation.service.js',()=>({automaticallyCalculateNative:f.autoCalculate}))
import {scoringChoices,activeSessionsForOrganizer,liveView,liveControl,scoreWrite,scoringError} from '../../src/services/competition-native-scoring.service.js'
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`,event=id(1),child=id(2),judge=id(3),owner=id(4),session=id(5)
const body={requestId:id(6),rulesVersion:id(7),setupRevision:2,inputRevision:3,sessionId:session,sessionRevision:1,entryId:id(8),criterionId:id(9),rowRevision:0,scores:{[id(10)]:7}}
beforeEach(()=>{vi.clearAllMocks();for(const flag of ['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED','COMPETITION_NATIVE_TABULATION_ENABLED'])vi.stubEnv(flag,'true');f.rpc.mockResolvedValue({data:{sessionId:session,sessionRevision:2,notificationUserIds:[judge,owner],rowRevision:1,locked:true},error:null});f.autoCalculate.mockResolvedValue({status:'up_to_date'})})
afterEach(()=>vi.unstubAllEnvs())
test('scoring requires all three deployment gates and never calls RPC when disabled',async()=>{
 for(const flag of ['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED']){vi.stubEnv(flag,'false');await expect(scoringChoices(event,judge)).rejects.toMatchObject({statusCode:503});vi.stubEnv(flag,'true')}
 expect(f.rpc).not.toHaveBeenCalled()
})
test('choices bind authenticated actor and owner mode',async()=>{await scoringChoices(event,judge);expect(f.rpc).toHaveBeenCalledWith('competition_child_scoring_choices',{p_event:event,p_actor:judge,p_owner:false})})
test('organizer dashboard loads owner-authorized active native sessions without score data',async()=>{
 f.rpc.mockResolvedValue({data:[{eventId:event,eventTitle:'Show',competitionName:'Dance',roundName:'Finals',sessionId:session,status:'active',startedAt:'2026-10-18T00:00:00Z'}],error:null})
 await expect(activeSessionsForOrganizer(owner)).resolves.toEqual([{eventId:event,eventTitle:'Show',competitionName:'Dance',roundName:'Finals',session:{id:session,status:'active',startedAt:'2026-10-18T00:00:00Z'}}])
 expect(f.rpc).toHaveBeenCalledWith('competition_child_active_sessions_for_organizer',{p_actor:owner})
})
test('native organizer dashboard reports when its reviewed migration is missing',async()=>{
 f.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'function is missing'}})
 await expect(activeSessionsForOrganizer(owner)).rejects.toMatchObject({statusCode:503,message:'Reviewed migration 122 is required for native organizer dashboard sessions'})
})
test('view requires exact judge, competition and NULL round and coerces closed access safely',async()=>{
 f.rpc.mockResolvedValue({data:{context:{eventId:event,competitionId:child,roundId:null},viewerJudgeId:judge,criteria:[{open:null}],contestants:[{open:null}]}})
 expect((await liveView(event,child,judge)).criteria[0].open).toBe(false)
 f.rpc.mockResolvedValue({data:{context:{eventId:event,competitionId:child,roundId:id(12)},viewerJudgeId:judge}})
 await expect(liveView(event,child,judge)).rejects.toMatchObject({statusCode:503})
})
test('score writes bind server actor, pass expected child/session/row revisions and notify only after commit',async()=>{
 const result=await scoreWrite(event,child,judge,null,'lock',body)
 expect(f.rpc).toHaveBeenCalledWith('competition_child_score_write',{p_event:event,p_competition:child,p_judge:judge,p_round:null,p_action:'lock',p_body:body})
 expect(result.notificationUserIds).toBeUndefined(); expect(f.emit).toHaveBeenCalledTimes(1)
 expect(f.emit).toHaveBeenCalledWith(owner,'competition:native-invalidated',{eventId:event,competitionId:child,roundId:null,sessionId:session})
 expect(f.emit).not.toHaveBeenCalledWith(judge,'competition:native-invalidated',expect.anything())
 const serialized=JSON.stringify(f.emit.mock.calls);expect(serialized).not.toContain('scores');expect(serialized).not.toContain('rowRevision')
})
test('rejected transaction emits nothing and fails closed without legacy fallback',async()=>{
 f.rpc.mockResolvedValue({error:{code:'P0001',message:'SESSION_CLOSED_OR_REVISION_CONFLICT'}})
 await expect(scoreWrite(event,child,judge,null,'draft',body)).rejects.toMatchObject({statusCode:409});expect(f.emit).not.toHaveBeenCalled();expect(f.rpc).toHaveBeenCalledTimes(1)
})
test('control uses authenticated owner and explicit child/round identity',async()=>{await liveControl(event,child,owner,null,'pause',body);expect(f.rpc.mock.calls[0][1]).toMatchObject({p_actor:owner,p_competition:child,p_round:null,p_action:'pause'})})
test('submissions and scoring close automatically request current calculation',async()=>{
 const submitted=await scoreWrite(event,child,judge,null,'submit',body)
 expect(f.autoCalculate).toHaveBeenCalledWith(event,child,null)
 expect(submitted.calculation).toEqual({status:'up_to_date'})
 f.autoCalculate.mockClear()
 const closed=await liveControl(event,child,owner,null,'close',body)
 expect(f.autoCalculate).toHaveBeenCalledWith(event,child,null)
 expect(closed.calculation).toEqual({status:'up_to_date'})
})
test('access-control changes notify other authorized viewers without forcing the organizer to refetch',async()=>{
 await liveControl(event,child,owner,null,'access',{...body,kind:'criterion',targetId:id(13),open:false})
 expect(f.emit).toHaveBeenCalledTimes(1)
 expect(f.emit).toHaveBeenCalledWith(judge,'competition:native-invalidated',{eventId:event,competitionId:child,roundId:null,sessionId:session,access:{kind:'criterion',targetId:id(13),open:false},sessionRevision:2})
 expect(f.emit).not.toHaveBeenCalledWith(owner,'competition:native-invalidated',expect.anything())
})
test('unknown actions and missing request/revision identities fail before database access',async()=>{
 await expect(scoreWrite(event,child,judge,null,'calculate',body)).rejects.toMatchObject({statusCode:400})
 await expect(scoreWrite(event,child,judge,null,'draft',{...body,rowRevision:-1})).rejects.toMatchObject({statusCode:400})
 await expect(liveControl(event,child,owner,null,'start',{...body,inputRevision:null})).rejects.toMatchObject({statusCode:400})
 expect(f.rpc).not.toHaveBeenCalled()
})
test('schema, permissions, validation and qualification errors retain actionable HTTP boundaries',()=>{
 expect(()=>scoringError({code:'PGRST202'})).toThrow('migration 105')
 for(const [message,statusCode] of [['SCOPED_ACCESS_FORBIDDEN',403],['FINALIZED_QUALIFICATION_REQUIRED',409],['SCORE_OUT_OF_BOUNDS',400]]){try{scoringError({code:'P0001',message})}catch(e){expect(e.statusCode).toBe(statusCode)}}
})
test('unexpected database errors log RPC diagnostics without request payloads',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 f.rpc.mockResolvedValue({error:{code:'XX000',message:'unexpected database failure'}})
 await expect(scoreWrite(event,child,judge,null,'draft',body)).rejects.toMatchObject({statusCode:503,message:'Competition scoring is unavailable; refresh this context before retrying'})
 expect(log).toHaveBeenCalledWith('[native-scoring] Unexpected database RPC error',{rpc:'competition_child_score_write',code:'XX000',message:'unexpected database failure'})
 expect(JSON.stringify(log.mock.calls)).not.toContain(JSON.stringify(body.scores))
 log.mockRestore()
})
test('notification transport failure cannot turn a committed write into a failed score response',async()=>{f.emit.mockImplementation(()=>{throw new Error('disconnected')});await expect(scoreWrite(event,child,judge,null,'lock',body)).resolves.toMatchObject({locked:true})})
