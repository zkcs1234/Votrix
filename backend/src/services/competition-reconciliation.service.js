import { db } from '../foundation/db.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { ApiError } from '../utils/ApiError.js'

export async function reconciliationPreview(eventId, actor, sessionId) {
  await assertOrganizerOwnsEvent(eventId,actor)
  if (!sessionId) throw new ApiError(400,'Choose an explicit historical session to inspect')
  const [{data:sources,error},{data:entries,error:entryError}] = await Promise.all([
    db().from('competition_session_judge_scores').select('*').eq('event_id',eventId).eq('session_id',sessionId),
    db().from('competition_contestants').select('id').eq('event_id',eventId),
  ])
  if(error||entryError)throw new ApiError(503,'Historical source records are unavailable')
  const ids=entries.map(e=>e.id)
  const [{data:projection,error:projectionError},{data:minors,error:minorError}]=await Promise.all([
    ids.length?db().from('competition_scores').select('*').in('contestant_id',ids):{data:[],error:null},
    db().from('competition_minor_criteria').select('id,criteria_id').eq('event_id',eventId),
  ])
  if(projectionError||minorError)throw new ApiError(503,'Historical projection is unavailable')
  const changes=[],ambiguous=[]
  for(const source of sources){
    if(!source.locked_criteria?.length){ambiguous.push({sourceId:source.id,reason:'No explicit parent locks; completion will not be inferred'});continue}
    for(const parent of source.locked_criteria){
      const cells=Object.entries(source.scores??{}).filter(([id])=>id===parent||minors.some(m=>m.id===id&&m.criteria_id===parent))
      for(const [target,value]of cells){
        const saved=projection.filter(p=>p.judge_id===source.judge_id&&p.contestant_id===source.contestant_id&&p.round_id===source.round_id&&p.criteria_id===parent&&(p.minor_criteria_id??parent)===target)
        if(saved.length!==1||Number(saved[0].score)!==Number(value))changes.push({sourceId:source.id,entryId:source.contestant_id,judgeId:source.judge_id,roundId:source.round_id,criteriaId:parent,targetId:target,sourceValue:value,projectionValues:saved.map(p=>p.score)})
      }
      const expected=new Set(cells.map(([id])=>id))
      for(const row of projection.filter(p=>p.judge_id===source.judge_id&&p.contestant_id===source.contestant_id&&p.round_id===source.round_id&&p.criteria_id===parent&&!expected.has(p.minor_criteria_id??parent)))changes.push({sourceId:source.id,projectionId:row.id,reason:'Extra projected cell under an explicitly locked parent'})
    }
  }
  return {sessionId,changes,ambiguous,submissionsCreated:0,snapshotsChanged:0}
}
