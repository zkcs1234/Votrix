import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { validateUUID } from '../utils/sanitize.js'
import { nativeSetupEnabled } from '../modules/competition-native-configuration.js'
import { emitToUser } from '../websocket/ws-emitter.js'

export function nativeScoringEnabled() { return nativeSetupEnabled() && process.env.COMPETITION_NATIVE_SCORING_ENABLED === 'true' }
export function scoringError(error, rpcName = 'unknown') {
  if (!error) return
  const message = error.message ?? ''
  if (['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code)) throw new ApiError(503,'Reviewed migration 105 is required for native scoring')
  if (/FORBIDDEN/.test(message)) throw new ApiError(403,'This scoring context or access is not authorized')
  if (/CONFLICT|CLOSED|LOCKED|SUBMITTED|FROZEN|QUALIFICATION|TRANSITION/.test(message)) throw new ApiError(409,message.replaceAll('_',' '))
  if (['23503','23514','22P02','22003'].includes(error.code)||error.code==='P0001') throw new ApiError(400,/^[A-Z0-9_]+$/.test(message)?message.replaceAll('_',' '):'Invalid native scoring request')
  console.error('[native-scoring] Unexpected database RPC error', {
    rpc: rpcName,
    code: error.code ?? 'unknown',
    message: message.slice(0, 500),
  })
  throw new ApiError(503,'Competition scoring is unavailable; refresh this context before retrying')
}
function boundary(eventId, competitionId, actor, roundId) {
  if (!nativeScoringEnabled()) throw new ApiError(503,'Native scoring is disabled pending deployment review')
  validateUUID(eventId);validateUUID(actor)
  if (competitionId) validateUUID(competitionId)
  if (roundId != null) validateUUID(roundId)
}
async function rpc(name, params) { const {data,error}=await db().rpc(name,params);scoringError(error,name);return data }
export async function scoringChoices(eventId,actor,owner=false) {
  boundary(eventId,null,actor,null)
  return rpc('competition_child_scoring_choices',{p_event:eventId,p_actor:actor,p_owner:owner})
}
export async function activeSessionsForOrganizer(actor) {
  const {data,error}=await db().rpc('competition_child_active_sessions_for_organizer',{p_actor:actor})
  if(['PGRST202','42P01','42703'].includes(error?.code))throw new ApiError(503,'Reviewed migration 122 is required for native organizer dashboard sessions')
  scoringError(error,'competition_child_active_sessions_for_organizer')
  if(!Array.isArray(data))throw new ApiError(503,'Native organizer session metadata is unavailable')
  return data.map(record=>({
    eventId:record.eventId,
    eventTitle:record.eventTitle,
    competitionName:record.competitionName,
    roundName:record.roundName,
    session:{id:record.sessionId,status:record.status,startedAt:record.startedAt},
  }))
}
export async function liveActivity(eventId,actor) {
  const contexts=await scoringChoices(eventId,actor,true)
  if(!Array.isArray(contexts))throw new ApiError(503,'Competition context discovery is unavailable')
  const {data:records,error}=await db().rpc('competition_child_live_activity',{p_event:eventId,p_actor:actor})
  if(['PGRST202','42P01','42703'].includes(error?.code))throw new ApiError(503,'Reviewed migration 120 is required for native live activity')
  scoringError(error,'competition_child_live_activity')
  if(!Array.isArray(records))throw new ApiError(503,'Competition activity is unavailable')
  return records.map(record=>{
    const context=contexts.find(item=>item.competitionId===record.competitionId&&(item.roundId??null)===(record.roundId??null))
    return {action:record.action,actorId:record.actorId,createdAt:record.createdAt,competitionName:context?.competitionName??'Competition',roundName:context?.roundName??'Round'}
  })
}
export async function scoringChoicesResponse(eventId,actor,owner=false) {
  const contexts=owner?await scoringChoices(eventId,actor,true):await nativeJudgeNavigation(eventId,actor)
  if(!Array.isArray(contexts))throw new ApiError(503,'Competition context discovery is unavailable')
  // Only parent-event participants/owners may reach this route. Return presence,
  // not unassigned competition names, so empty native contexts cannot select legacy.
  const [{data:competitions,error:competitionError},{data:event,error:eventError}]=await Promise.all([
    db().from('competitions').select('id').eq('event_id',eventId).eq('origin','native').limit(1),
    db().from('events').select('id,title,start_date,end_date,status,banner').eq('id',eventId).maybeSingle(),
  ])
  scoringError(competitionError);scoringError(eventError)
  if(!Array.isArray(competitions)||!event)throw new ApiError(503,'Competition identity discovery is unavailable')
  return {contexts,nativeEvent:competitions.length>0,eventName:event.title,event}
}
export async function nativeJudgeNavigation(eventId,actor){
 boundary(eventId,null,actor,null)
 const {data,error}=await db().rpc('competition_child_judge_navigation',{p_event:eventId,p_actor:actor,p_reviewers:process.env.COMPETITION_NATIVE_TABULATION_ENABLED==='true'})
 if(['PGRST202','42P01','42703'].includes(error?.code))throw new ApiError(503,'Reviewed migration 108 is required for native dashboard navigation')
 scoringError(error)
 if(!Array.isArray(data)||data.some(c=>c.eventId!==eventId||!['waiting','open','paused','submitted','closed','review'].includes(c.state)))throw new ApiError(503,'Native dashboard metadata is unavailable')
 return data
}
export async function liveView(eventId,competitionId,actor,roundId=null,owner=false) {
  boundary(eventId,competitionId,actor,roundId)
  const data=await rpc('competition_child_live_view',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_owner:owner})
  if (data?.context?.eventId!==eventId||data.context.competitionId!==competitionId||data.context.roundId!==roundId||(!owner&&data.viewerJudgeId!==actor)) throw new ApiError(503,'Scoring snapshot identity mismatch')
  // Enrich only the already-authorized roster. Native entry numbers identify
  // participation rows; the registration number is scoped to its division.
  const masterIds=[...new Set((data.contestants??[]).map(e=>e.masterId).filter(Boolean))]
  let registrations=[],divisions=[]
  if(masterIds.length){
    const {data:rows,error}=await db().from('competition_contestants').select('id,contestant_number,division_id').eq('event_id',eventId).in('id',masterIds)
    scoringError(error,'live_registration_metadata');registrations=rows??[]
    const divisionIds=[...new Set(registrations.map(row=>row.division_id).filter(Boolean))]
    if(divisionIds.length){
      const {data:rows,error}=await db().from('competition_divisions').select('id,name,row_color').eq('event_id',eventId).in('id',divisionIds)
      scoringError(error,'live_division_metadata');divisions=rows??[]
    }
  }
  const registrationById=new Map(registrations.map(row=>[row.id,row])),divisionById=new Map(divisions.map(row=>[row.id,row]))
  return {...data,allowedDivisions:divisions.map(row=>({id:row.id,name:row.name,rowColor:row.row_color})),criteria:(data.criteria??[]).map(k=>({...k,open:k.open===true})),contestants:(data.contestants??[]).map(e=>{
    const registration=registrationById.get(e.masterId),division=divisionById.get(registration?.division_id)
    return {...e,open:e.open===true,...(registration?{registrationNumber:registration.contestant_number,divisionId:registration.division_id,divisionName:division?.name??'',rowColor:division?.row_color??null}:{})}
  })}
}
function bodyContext(body) {
  validateUUID(body?.requestId,'requestId');validateUUID(body?.rulesVersion,'rulesVersion')
  for (const key of ['setupRevision','inputRevision']) if (!Number.isSafeInteger(body[key])||body[key]<1) throw new ApiError(400,`Current ${key} is required`)
}
// Notifications contain only identities/revisions. The view RPC filters scores.
// Routing reads are after commit; failed delivery is covered by reconciliation.
async function invalidate(eventId,competitionId,roundId,actor,result,excludeActor=false,accessChange=null) {
  const accessHint=accessChange?{
    access:accessChange,
    sessionRevision:result.sessionRevision,
  }:{}
  try {
    if(process.env.COMPETITION_NATIVE_TABULATION_ENABLED==='true'){
      const {data,error}=await db().rpc('competition_child_official_notice',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId})
      if(!error&&data?.userIds){for(const user of data.userIds)if(!excludeActor||user!==actor)emitToUser(user,'competition:native-invalidated',{eventId,competitionId,roundId,sessionId:result.sessionId??null,affectedRoundIds:data.roundIds,...accessHint});return}
    }
    const hint={eventId,competitionId,roundId,sessionId:result.sessionId??null,...accessHint}
    for(const user of new Set(result.notificationUserIds??[]))if(!excludeActor||user!==actor)emitToUser(user,'competition:native-invalidated',hint)
  } catch { /* Committed writes remain successful even if notification routing fails. */ }
}
export async function liveControl(eventId,competitionId,actor,roundId,action,body) {
  boundary(eventId,competitionId,actor,roundId);bodyContext(body)
  if(!['start','pause','resume','close','access','reopen'].includes(action))throw new ApiError(400,'Invalid live action')
  const result=await rpc('competition_child_live_control',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_action:action,p_body:body})
  const accessChange=action==='access'?{kind:body.kind,targetId:body.targetId,open:body.open}:null
  await invalidate(eventId,competitionId,roundId,actor,result,action==='access',accessChange)
  const {notificationUserIds,...publicResult}=result
  if(action==='close'){
    const {automaticallyCalculateNative}=await import('./competition-native-tabulation.service.js')
    publicResult.calculation=await automaticallyCalculateNative(eventId,competitionId,roundId)
  }
  return publicResult
}
export async function scoreWrite(eventId,competitionId,actor,roundId,action,body) {
  boundary(eventId,competitionId,actor,roundId);bodyContext(body);validateUUID(body.sessionId)
  if(!['draft','lock','submit'].includes(action))throw new ApiError(400,'Invalid score action')
  if(action!=='submit') {validateUUID(body.entryId);validateUUID(body.criterionId);if(!Number.isSafeInteger(body.rowRevision)||body.rowRevision<0)throw new ApiError(400,'Current rowRevision is required')}
  const result=await rpc('competition_child_score_write',{p_event:eventId,p_competition:competitionId,p_judge:actor,p_round:roundId,p_action:action,p_body:body})
  await invalidate(eventId,competitionId,roundId,actor,result,true)
  const {notificationUserIds,...publicResult}=result
  if(action==='submit'){
    const {automaticallyCalculateNative}=await import('./competition-native-tabulation.service.js')
    publicResult.calculation=await automaticallyCalculateNative(eventId,competitionId,roundId)
  }
  return publicResult
}
