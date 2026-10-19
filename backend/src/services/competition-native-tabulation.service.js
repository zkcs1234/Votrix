import {db} from '../foundation/db.js'
import {ApiError} from '../utils/ApiError.js'
import {validateUUID} from '../utils/sanitize.js'
import {nativeScoringEnabled} from './competition-native-scoring.service.js'
import {calculateNativeSnapshot,nativeDeductionsEnabled,nativeQualifierProposal} from '../modules/competition-native-tabulation.js'
import {rulesForDeductionRound, submittedJudgeDeductions} from '../../../shared/competition-deductions.js'
import {emitToUser} from '../websocket/ws-emitter.js'

export function nativeTabulationEnabled(){return nativeScoringEnabled()&&process.env.COMPETITION_NATIVE_TABULATION_ENABLED==='true'}
function boundary(eventId,competitionId,actor,roundId){
 if(!nativeTabulationEnabled())throw new ApiError(503,'Native tabulation is disabled pending deployment review')
 for(const value of [eventId,competitionId,actor])validateUUID(value)
 if(roundId!=null)validateUUID(roundId)
}
export function tabulationError(error){
 if(!error)return
 if(['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code))throw new ApiError(503,'Reviewed migrations 106 and 123 are required for native official tabulation')
 const message=error.message??''
 if(/FORBIDDEN/.test(message))throw new ApiError(403,'This official competition context is not authorized')
 if(error.code==='23505'||/STALE|INCOMPLETE|COMPLETE|FINALIZED|VERIFICATION|FROZEN|IMMUTABLE|IN_USE|CONFLICT|CLOSED|CONFIRMED/.test(message))throw new ApiError(409,message.replaceAll('_',' '))
 if(['23503','23514','22P02','22003','P0001'].includes(error.code))throw new ApiError(400,/^[A-Z0-9_]+$/.test(message)?message.replaceAll('_',' '):'Invalid official competition operation')
 throw new ApiError(503,'Official tabulation is unavailable; no legacy fallback was selected')
}
async function rpc(name,args){const {data,error}=await db().rpc(name,args);tabulationError(error);return data}
export async function tabulationSnapshot(eventId,competitionId,actor,roundId=null,reviewer=false){
 boundary(eventId,competitionId,actor,roundId)
 const data=await rpc('competition_child_tabulation_snapshot',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_reviewer:reviewer})
 if(data?.eventId!==eventId||data.competitionId!==competitionId||data.roundId!==roundId||data.viewerId!==actor)throw new ApiError(503,'Official source snapshot identity mismatch')
 const decisions=data.allDeductions??data.deductions??[]
 const judgeIds=[...new Set([...(data.progress??[]).map(j=>j.judgeId),...(data.scopes??[]).flatMap(scope=>(scope.submissions??[]).map(submission=>submission.judge_id)),data.reviewPolicy?.reviewer_id,...decisions.flatMap(d=>[d.proposed_by,d.review?.actor_id])].filter(Boolean))]
 let profiles=[]
 if(judgeIds.length){
  const {data:rows,error}=await db().from('users').select('id,first_name,last_name,email').in('id',judgeIds)
  tabulationError(error)
  profiles=rows??[]
 }
 const names=new Map(profiles.map(user=>[user.id,[user.first_name,user.last_name].filter(Boolean).join(' ').trim()||user.email]))
 const progress=(data.progress??[]).map((judge,index)=>({...judge,judgeName:names.get(judge.judgeId)||`Judge ${index+1}`}))
 const reviewPolicy=data.reviewPolicy?{...data.reviewPolicy,reviewerName:names.get(data.reviewPolicy.reviewer_id)||'Assigned reviewer'}:data.reviewPolicy
 if(data.complete!==true)return {...data,progress,reviewPolicy,submissions:[],rules:null,evidence:null,entries:[],scopes:[],allDeductions:[],deductions:[],judgeDeductions:[],calculation:null}
 let judgeDeductions=[]
 try{judgeDeductions=submittedJudgeDeductions(data.rules?.configuration_snapshot??{},data.scopes??[{session:data.session,submissions:data.submissions}]).map(record=>({...record,judgeName:names.get(record.judge_id)||'Assigned judge'}))}catch{throw new ApiError(503,'Current judge deduction records do not match their frozen scoring scope')}
 const withActorNames=items=>(items??[]).map(item=>({...item,proposedByName:names.get(item.proposed_by)||'Organizer',review:item.review?{...item.review,actorName:names.get(item.review.actor_id)||'Reviewer'}:item.review}))
 const scopes=data.scopes?.map(scope=>({...scope,submissions:scope.submissions?.map(submission=>({...submission,judgeName:names.get(submission.judge_id)||'Assigned judge'}))}))
 return {...data,...(scopes?{scopes}:{}),progress,reviewPolicy,judgeDeductions,deductions:withActorNames(data.deductions),allDeductions:withActorNames(data.allDeductions)}
}
export async function automaticallyCalculateNative(eventId,competitionId,roundId=null){
 try{
  if(!nativeTabulationEnabled())return {status:'disabled'}
  const {data:event,error}=await db().from('events').select('organizations!inner(organizer_id)').eq('id',eventId).maybeSingle()
  tabulationError(error)
  const actor=event?.organizations?.organizer_id
  if(!actor)throw new ApiError(503,'Competition organizer identity is unavailable for automatic calculation')
  const snapshot=await tabulationSnapshot(eventId,competitionId,actor,roundId)
  if(!snapshot.complete||!['active','closed'].includes(snapshot.session?.status)||!snapshot.deductionsResolved)return {status:'incomplete'}
  const method=snapshot.rules?.configuration_snapshot?.scoringConfig?.calculationMethod
  if(method==='manual')return {status:'needs_review',message:'Manual placements require an authorized recorded decision.'}
  if(snapshot.calculation?.source_digest===snapshot.sourceDigest)return {status:'up_to_date',calculationId:snapshot.calculation.id}
  const calculated=calculateNativeSnapshot(snapshot)
  const result=await rpc('competition_child_official_calculate',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_digest:snapshot.sourceDigest,p_input:calculated.input,p_output:calculated.output})
  await notify(eventId,competitionId,actor,roundId)
  return {status:'up_to_date',calculationId:result.calculationId}
 }catch(error){
  console.error('[native-tabulation] Automatic calculation failed', {
   eventId,competitionId,roundId,code:error.code??'unknown',message:error.message,
  })
  return {status:'needs_review',message:'Automatic calculation needs administrator review. The saved source data is unchanged.'}
 }
}
async function notify(eventId,competitionId,actor,roundId){
 try{const data=await rpc('competition_child_official_notice',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId});for(const user of data.userIds??[])emitToUser(user,'competition:native-invalidated',{eventId,competitionId,roundId,affectedRoundIds:data.roundIds})}catch{/* Authoritative reconciliation covers a missed notification after commit. */}
}
export async function appointReviewer(eventId,competitionId,actor,participantId){
 boundary(eventId,competitionId,actor,null);validateUUID(participantId)
 const result=await rpc('competition_child_appoint_reviewer',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_participant:participantId});await notify(eventId,competitionId,actor,null);return result
}
export async function calculateNative(eventId,competitionId,actor,body={}){
 const roundId=body?.roundId??null,snapshot=await tabulationSnapshot(eventId,competitionId,actor,roundId)
 const deductionsEnabled=nativeDeductionsEnabled(snapshot)
 if(!snapshot.complete||snapshot.session?.status!=='closed'||deductionsEnabled&&!snapshot.deductionsResolved)throw new ApiError(409,'Close scoring and resolve all current submissions and configured deductions before calculating')
 if(snapshot.rules?.configuration_snapshot?.scoringConfig?.calculationMethod!=='manual')throw new ApiError(403,'Numeric score calculations run automatically when current sources are ready')
 if(body.sourceDigest!==snapshot.sourceDigest)throw new ApiError(409,'Scoring sources changed during review')
 let calculated
 try{calculated=calculateNativeSnapshot(snapshot,{manualResults:body.manualResults,reason:body.reason})}catch(e){throw new ApiError(400,e.message)}
 const result=await rpc('competition_child_official_calculate',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_digest:snapshot.sourceDigest,p_input:calculated.input,p_output:calculated.output})
 await notify(eventId,competitionId,actor,roundId);return result
}
export async function transitionNative(eventId,competitionId,actor,body={},reviewer=false){
 boundary(eventId,competitionId,actor,body?.roundId??null);validateUUID(body?.calculationId)
 if(body.action!==(reviewer?'verify':'finalize'))throw new ApiError(403,'The authenticated review role does not authorize this action')
 const result=await rpc('competition_child_official_transition',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_calculation:body.calculationId,p_action:body.action,p_reason:body.reason??''});await notify(eventId,competitionId,actor,body.roundId??null);return result
}
export async function deductionNative(eventId,competitionId,actor,body={},reviewer=false){
 boundary(eventId,competitionId,actor,body?.roundId??null)
 if(!reviewer&&!['propose','revoke'].includes(body.action)||reviewer&&!['approve','reject','revoke'].includes(body.action))throw new ApiError(403,'This deduction action is not authorized for the authenticated role')
 const snapshot=await tabulationSnapshot(eventId,competitionId,actor,body?.roundId??null,reviewer)
 const configuration=snapshot.rules?.configuration_snapshot
 const rules=configuration?.scoringConfig?.deductionRules??[]
 if(!rules.length||!nativeDeductionsEnabled(snapshot))throw new ApiError(409,'Organizer-managed deductions are disabled for this competition and round')
 if(body.action==='propose'){
  const rule=rulesForDeductionRound(configuration,body.roundId??null,'organizer').find(item=>item.id===body.ruleKey)
  if(!rule)throw new ApiError(400,'Choose a configured deduction rule')
  if(!snapshot.session?.entry_ids?.includes(body.entryId))throw new ApiError(400,'Choose an eligible entry in this competition and round')
  if(rule.roundId&&rule.roundId!==(body.roundId??null))throw new ApiError(400,'This deduction rule does not apply to the selected round')
  if(rule.criteriaId&&!configuration.criteria.some(item=>item.id===rule.criteriaId&&(item.roundId??null)===(rule.roundId??body.roundId??null)))throw new ApiError(400,'This deduction rule does not apply to the selected criterion')
  if(typeof body.offenseKey!=='string'||!body.offenseKey.trim()||typeof body.reason!=='string'||body.reason.trim().length<5)throw new ApiError(400,'Provide an offense reference and a reason of at least five characters')
  if(rule.appliedBy&&(body.offenseKey.length>200||body.reason.length>2000))throw new ApiError(400,'Use a violation reference of at most 200 characters and a reason of at most 2,000 characters')
 }
 const result=await rpc('competition_child_deduction_action',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:body.roundId??null,p_action:body.action,p_body:body})
 await notify(eventId,competitionId,actor,body.roundId??null)
 return {...result,calculation:await automaticallyCalculateNative(eventId,competitionId,body.roundId??null)}
}
export async function qualificationNative(eventId,competitionId,actor,body={},confirm=false){
 const snapshot=await tabulationSnapshot(eventId,competitionId,actor,body?.roundId??null)
 let proposal;try{proposal=nativeQualifierProposal(snapshot,snapshot.calculation)}catch(e){throw new ApiError(409,e.message)}
 if(!confirm)return proposal
 validateUUID(body.calculationId)
 const result=await rpc('competition_child_confirm_qualification',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:body.roundId,p_calculation:body.calculationId,p_digest:body.sourceDigest,p_qualifiers:body.qualifierIds,p_reason:body.reason??'',p_acknowledged:body.acknowledged===true});await notify(eventId,competitionId,actor,body.roundId);return result
}
export async function reviewerChoices(eventId,actor){
 boundary(eventId,eventId,actor,null)
 return rpc('competition_child_reviewer_choices',{p_event:eventId,p_actor:actor})
}
