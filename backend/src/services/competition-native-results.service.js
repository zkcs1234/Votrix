import {db} from '../foundation/db.js'
import {ApiError} from '../utils/ApiError.js'
import {validateUUID} from '../utils/sanitize.js'
import {nativeTabulationEnabled,tabulationError} from './competition-native-tabulation.service.js'
import {nativeExportCsv,nativeExportRows} from '../modules/competition-native-exports.js'
import {emitToUser} from '../websocket/ws-emitter.js'
import {COMPETITION_CAPACITY} from '../modules/competition-capacity.js'

export function nativeResultsEnabled(){return nativeTabulationEnabled()&&process.env.COMPETITION_NATIVE_RESULTS_ENABLED==='true'}
function context(eventId,competitionId,roundId,actor){if(!nativeResultsEnabled())throw new ApiError(503,'Native results are disabled pending deployment requirements');validateUUID(eventId);validateUUID(competitionId);if(roundId!=null)validateUUID(roundId);if(actor!=null)validateUUID(actor)}
async function rpc(name,args){const {data,error}=await db().rpc(name,args);if(error&&['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code))throw new ApiError(503,'Reviewed migration 107 is required for native results');tabulationError(error);return data}
export async function ownedResults(eventId,competitionId,actor,roundId=null){
 context(eventId,competitionId,roundId,actor)
 const data=await rpc('competition_child_owned_results',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId})
 if(data?.eventId!==eventId||data.competitionId!==competitionId||data.roundId!==roundId||data.viewerId!==actor)throw new ApiError(503,'Results context mismatch')
 if(data.complete!==true)return {...data,official:null,calculation:null,history:(data.history??[]).map(h=>({...h,results:null}))}
 return data
}
export async function publishResults(eventId,competitionId,actor,body={}){
 const roundId=body.roundId??null;context(eventId,competitionId,roundId,actor);validateUUID(body.requestId)
 if(!['publish','replace','withdraw'].includes(body.action)||body.acknowledged!==true||!Number.isSafeInteger(body.expectedPublicationVersion)||body.expectedPublicationVersion<0||typeof body.reason!=='string'||body.reason.trim().length<5)throw new ApiError(400,'Explicit publication action, reason, acknowledgment and current publication version are required')
 if(body.action!=='withdraw')validateUUID(body.calculationId)
 const result=await rpc('competition_child_publication_action',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_action:body.action,p_body:body})
 try{const notice=await rpc('competition_child_official_notice',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId});for(const user of notice.userIds??[])emitToUser(user,'competition:native-invalidated',{eventId,competitionId,roundId,affectedRoundIds:notice.roundIds})}catch{/* Committed publication remains successful; authoritative reconciliation covers delivery loss. */}
 return result
}
export async function publicResults(eventId,competitionId,roundId=null){
 context(eventId,competitionId,roundId)
 const data=await rpc('competition_child_public_results',{p_event:eventId,p_competition:competitionId,p_round:roundId})
 if(!data)throw new ApiError(404,'Published results are unavailable')
 if(data.withdrawn===true)return {publicationVersion:data.publicationVersion,withdrawn:true,results:null}
 if(data.results?.eventId!==eventId||data.results.competitionId!==competitionId||data.results.roundId!==roundId)throw new ApiError(503,'Published result identity mismatch')
 // Explicit projection remains a defense even if a DB response changes shape.
 const r=data.results
 const divisionRanking=r.divisionRanking?.mode==='division'?{mode:'division',divisions:(r.divisionRanking.divisions??[]).map(d=>({id:d.id,name:d.name}))}:null
 return {publicationId:data.publicationId,publicationVersion:data.publicationVersion,publishedAt:data.publishedAt,results:{eventId:r.eventId,eventName:r.eventName,competitionId:r.competitionId,competitionName:r.competitionName,roundId:r.roundId,roundName:r.roundName,calculationVersion:r.calculationVersion,method:r.method,tiePolicy:r.tiePolicy,precision:r.precision,finalizedAt:r.finalizedAt,...(r.deductionSettings?{deductionSettings:{organizer:r.deductionSettings.organizer===true,judge:r.deductionSettings.judge===true}}:{}),...(divisionRanking?{divisionRanking}:{}),standings:(r.standings??[]).map(s=>({participationId:s.participationId,...(divisionRanking?{divisionId:s.divisionId,divisionName:s.divisionName}:{}),entryNumber:s.entryNumber,name:s.name,rank:s.rank,score:s.manual?null:s.score,manual:s.manual===true,numericCarryScore:s.numericCarryScore??null,numericScore:s.numericScore??null,pointDeductionTotal:s.pointDeductionTotal??null,deductionTotal:s.deductionTotal,deductionUnits:s.deductionUnits,tied:s.tied===true}))}}
}
export async function exportResults(eventId,competitionId,actor,query={}){
 const roundId=query.roundId??null;context(eventId,competitionId,roundId,actor)
 if(!['judge','worksheets','tabulation','final'].includes(query.kind)||typeof query.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(query.sourceDigest))throw new ApiError(400,'Export kind and current source digest are required')
 if(query.calculationId!=null)validateUUID(query.calculationId);if(query.judgeId!=null)validateUUID(query.judgeId)
 if(query.submissionId!=null)validateUUID(query.submissionId)
 if(query.kind==='judge'&&!query.judgeId)throw new ApiError(400,'A judge is required for an individual score sheet')
 const dataset=await rpc('competition_child_export_sources',{p_event:eventId,p_competition:competitionId,p_actor:actor,p_round:roundId,p_kind:query.kind,p_digest:query.sourceDigest,p_calculation:query.calculationId??null,p_judge:query.judgeId??null})
 if(dataset?.eventId!==eventId||dataset.competitionId!==competitionId||dataset.roundId!==roundId||dataset.kind!==query.kind||dataset.source?.complete!==true||dataset.source?.sourceDigest!==query.sourceDigest)throw new ApiError(409,'Export identity or current source evidence changed')
 if(query.kind==='judge'){
  const submissions=dataset.source.submissions?.filter(s=>s.judge_id===query.judgeId)??[]
  const submission=submissions.length===1?submissions[0]:null
  if(!submission||query.submissionId!=null&&submission.id!==query.submissionId||dataset.rawRows?.some(row=>row.judgeId!==query.judgeId||row.submissionId!==submission.id))throw new ApiError(409,'The selected judge submission changed or is unavailable')
 }
 if(['tabulation','final'].includes(query.kind)&&(!['publish','replace'].includes(dataset.publication?.action)||dataset.publication.calculationId!==dataset.source?.calculation?.id))throw new ApiError(403,'Official results must be published for the current calculation before export')
 if(dataset.rawRows?.length>COMPETITION_CAPACITY.rawTargetsPerRound)throw new ApiError(413,'Export exceeds the reviewed scoring-target limit')
 const lengths=new Map();let estimated=0
 for(const row of nativeExportRows(dataset)){
  for(const value of Object.values(row)){const text=String(value??'');if(!lengths.has(text))lengths.set(text,Buffer.byteLength(text,'utf8'));estimated+=lengths.get(text)*2+4}
  if(estimated>COMPETITION_CAPACITY.exportBytes)throw new ApiError(413,'Export exceeds the conservative 10 MiB serialization budget')
 }
 const csv=nativeExportCsv(dataset)
 if(Buffer.byteLength(csv,'utf8')>COMPETITION_CAPACITY.exportBytes)throw new ApiError(413,'Export exceeds the reviewed 10 MiB response limit')
 return {csv,filename:`competition-${competitionId}-${roundId??'single'}-${query.kind}.csv`}
}
