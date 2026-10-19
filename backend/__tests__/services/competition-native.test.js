import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),own:vi.fn(),sync:vi.fn(),activity:vi.fn(),notify:vi.fn(),child:null,rows:null,publishRow:null,updateCount:0}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:f.own}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc,from:()=>{f.from();let updating=false;const q={select:()=>q,eq:()=>q,update:()=>{updating=true;f.updateCount++;return q},maybeSingle:async()=>({data:updating?f.publishRow:f.rows?.length?f.rows.shift():f.child,error:null}),then:resolve=>resolve({data:[],error:null})};return q}})}))
vi.mock('../../src/foundation/activity.js',()=>({recordEventActivity:f.activity}))
vi.mock('../../src/services/event-schedule-sync.service.js',()=>({syncEventSchedules:f.sync}))
vi.mock('../../src/services/notification.service.js',()=>({notifyAdminsEventPublished:f.notify}))
import {nativeFoundation,saveNativeConfiguration,assignNativeJudge,freezeNativeRules,nativeJudgeContext,nativeDatabaseError,completeNativeCreation} from '../../src/services/competition-native.service.js'
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`,e=id(1),c=id(2),actor=id(3),ep=id(4)
const config={structure:'single',rounds:[],criteria:[{id:id(5),name:'Quality',roundId:null,percentage:100,minScore:0,maxScore:100}],scoringConfig:{calculationMethod:'sum',tiePolicy:'shared'}}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED','true');vi.stubEnv('COMPETITION_NATIVE_SETUP_ENABLED','true');f.rows=null;f.publishRow={id:e};f.updateCount=0;f.child={id:c,event_id:e,origin:'native',setup_revision:3,input_revision:4};f.own.mockResolvedValue({id:e,status:'draft',title:'Campus arts',event_type:'competition_scoring'});f.rpc.mockResolvedValue({data:{setupRevision:4,inputRevision:5},error:null});f.sync.mockResolvedValue();f.activity.mockResolvedValue();f.notify.mockResolvedValue()})
afterEach(()=>vi.unstubAllEnvs())
test('native setup is disabled independently of Phase 2 identity endpoints',async()=>{
 vi.stubEnv('COMPETITION_NATIVE_SETUP_ENABLED','false');await expect(nativeFoundation(e,c,actor)).rejects.toMatchObject({statusCode:503});expect(f.from).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()
})
test('configuration uses explicit child identity and its expected revision, never parent configuration',async()=>{
 await saveNativeConfiguration(e,c,actor,{expectedSetupRevision:3,configuration:config})
 expect(f.rpc).toHaveBeenCalledWith('competition_save_native_configuration',{p_event:e,p_competition:c,p_actor:actor,p_revision:3,p_config:config})
})
test('ownership and legacy identity cannot fall through into native configuration writes',async()=>{
 f.child.origin='legacy';await expect(saveNativeConfiguration(e,c,actor,{expectedSetupRevision:3,configuration:config})).rejects.toMatchObject({statusCode:403});expect(f.rpc).not.toHaveBeenCalled()
 f.own.mockRejectedValue({statusCode:403});await expect(nativeFoundation(e,c,actor)).rejects.toMatchObject({statusCode:403})
})
test('assignment records exact competition, enrolled participant and NULL single phase',async()=>{
 f.rows=[f.child,{id:ep,event_id:e,is_active:true,participant_type:'COMPETITION_JUDGE',judge_role:'judge'},{configuration:config}]
 await assignNativeJudge(e,c,actor,{participantId:ep})
 expect(f.rpc).toHaveBeenCalledWith('competition_assign_native_judge',{p_event:e,p_competition:c,p_actor:actor,p_participant:ep,p_round:null,p_remove:false})
})
test('freeze requires acknowledgment and both current child revisions',async()=>{
 await expect(freezeNativeRules(e,c,actor,{expectedSetupRevision:3,expectedInputRevision:4})).rejects.toMatchObject({statusCode:400})
 f.rpc.mockResolvedValueOnce({data:{competition:f.child,configuration:config,assignments:[],rules:null,rulesCurrent:false},error:null})
 await freezeNativeRules(e,c,actor,{acknowledged:true,expectedSetupRevision:3,expectedInputRevision:4})
 expect(f.rpc).toHaveBeenCalledWith('competition_freeze_native_rules',{p_event:e,p_competition:c,p_actor:actor,p_setup:3,p_input:4})
})
test('foundation derives readiness from one authoritative SQL snapshot and hides irrelevant controls',async()=>{
 f.rpc.mockResolvedValue({data:{competition:f.child,configuration:config,assignments:[],rules:null,rulesCurrent:false,scoringAvailable:false},error:null})
 const value=await nativeFoundation(e,c,actor)
 expect(value.criteriaReadiness.allReady).toBe(true);expect(value.roundControls).toEqual([]);expect(value.scoringAvailable).toBe(false)
 expect(f.rpc).toHaveBeenCalledWith('competition_native_foundation',{p_event:e,p_competition:c,p_actor:actor})
})
test('review and create freezes the native setup and publishes the event to its schedule',async()=>{
 f.own.mockResolvedValue({id:e,status:'draft',title:'Campus arts',event_type:'competition_scoring'})
 const result=await completeNativeCreation(e,actor,{acknowledged:true,parentReviewToken:'a'.repeat(32),competitions:[{id:c,setupRevision:3,inputRevision:4}]})
 expect(f.rpc).toHaveBeenCalledWith('competition_complete_creation',{p_event:e,p_actor:actor,p_children:[{id:c,setupRevision:3,inputRevision:4}],p_parent_review_token:'a'.repeat(32)})
 expect(f.updateCount).toBe(1);expect(result.published).toBe(true)
 expect(f.sync).toHaveBeenCalledOnce();expect(f.activity).toHaveBeenCalledWith(expect.objectContaining({eventId:e,action:'competition.event.publish'}));expect(f.notify).toHaveBeenCalledWith({eventId:e,title:'Campus arts',eventType:'competition_scoring'})
})
test('retrying review after successful publish does not move an already published event',async()=>{
 f.own.mockResolvedValue({id:e,status:'scheduled',competition_created_at:'2026-10-17T00:00:00Z'})
 const result=await completeNativeCreation(e,actor,{acknowledged:true,parentReviewToken:'a'.repeat(32),competitions:[{id:c,setupRevision:3,inputRevision:4}]})
 expect(result.published).toBe(true);expect(f.updateCount).toBe(0);expect(f.sync).not.toHaveBeenCalled()
})
test('judge context binds authenticated judge rather than owner or client-selected identity',async()=>{
 await nativeJudgeContext(e,c,actor,null)
 expect(f.rpc).toHaveBeenCalledWith('competition_native_judge_context',{p_event:e,p_competition:c,p_judge:actor,p_round:null})
})
test('SQL permission/revision failures stay failures without event-level fallback',async()=>{
 f.rpc.mockResolvedValue({error:{message:'JUDGE_CONTEXT_FORBIDDEN'}});await expect(nativeJudgeContext(e,c,actor)).rejects.toMatchObject({statusCode:403})
 f.rpc.mockResolvedValue({error:{message:'CHILD_SETUP_REVISION_CONFLICT'}});await expect(saveNativeConfiguration(e,c,actor,{expectedSetupRevision:3,configuration:config})).rejects.toMatchObject({statusCode:409})
})
test('freeze validation is actionable and missing 104 fails closed rather than naming migration 103',()=>{
 expect(()=>nativeDatabaseError({code:'P0001',message:'REMOVAL_EXHAUSTS_CHILD_PANEL'})).toThrow('REMOVAL EXHAUSTS CHILD PANEL')
 expect(()=>nativeDatabaseError({code:'PGRST202'})).toThrow('migration 104')
})
test('snapshot with wrong context IDs cannot be returned as an authorized foundation',async()=>{
 f.rpc.mockResolvedValue({data:{competition:{...f.child,id:id(99)},configuration:config},error:null})
 await expect(nativeFoundation(e,c,actor)).rejects.toMatchObject({statusCode:503})
})
