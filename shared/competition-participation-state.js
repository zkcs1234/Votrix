import {scopeAllows} from './competition-calculation.js'
import {orderedRounds,progressionSources,resolveRoundEntryIds,advancementLabel} from './competition-participation.js'
import {progressionIssues} from './competition-progression-validation.js'
const gateAllows=(gate,id)=>!gate || gate.mode==='all' || gate.mode==='selected'&&gate.ids?.includes(id)
const sourceKey=rows=>JSON.stringify(rows.map(s=>({id:s.id,version:s.version})).sort((a,b)=>String(a.id).localeCompare(String(b.id))))

// Read-only presentation of saved sources; this does not calculate scores.
export function buildParticipationState(foundation,context={known:true}) {
  const version=foundation.event?.official_rules_id
  const model=context.rules ? {...context.rules.snapshot,id:context.rules.id} : foundation
  const field={...model,advancementDecisions:foundation.advancementDecisions ?? [],eligibilityDecisions:foundation.eligibilityDecisions ?? []}
  const summaries={}
  for(const round of orderedRounds(field.rounds)){
    const sources=progressionSources(field.rounds,round.id),source=sources[0],protectedRound=sources.some(s=>(s.advancementType ?? 'none')!=='none')
    const mode=sources.length?(protectedRound?'qualification':'all_continue'):'ordinary'
    const eligibleIds=resolveRoundEntryIds(field,round.id),sourceIds=source?resolveRoundEntryIds(field,source.id):[]
    const decision=(field.advancementDecisions ?? []).find(d=>d.rules_version===version&&d.next_round_id===round.id&&sources.some(s=>s.id===d.round_id))
    const session=context.session,calculations=(context.calculations ?? []).filter(c=>c.rules_version===version&&c.round_id===source?.id)
    const calculation=calculations.sort((a,b)=>String(b.created_at??'').localeCompare(String(a.created_at??'')))[0]
    let phase=mode==='all_continue'?'all_continue':mode==='qualification'?'awaiting_results':'assigned'
    if(!foundation.contestants?.length)phase='no_entries'
    else if(sources.length>1)phase='invalid_progression'
    else if(mode==='qualification'&&decision)phase=decision.qualifiers?.length?(eligibleIds.length?'qualification_confirmed':'no_eligible_entries'):'no_qualifying_entries'
    else if(mode!=='ordinary'&&!sourceIds.length)phase=progressionSources(field.rounds,source.id).some(s=>(s.advancementType ?? 'none')!=='none')?'awaiting_source_progression':'no_source_entries'
    else if(mode==='all_continue'&&!eligibleIds.length)phase='no_eligible_entries'
    else if(mode==='qualification'&&version){
      if(!context.known)phase='unavailable'
      else {
        const required=(field.judges ?? []).filter(j=>['judge','head_judge'].includes(j.role)&&field.contestants.some(entry=>sourceIds.includes(entry.id)&&scopeAllows(j,entry,source,foundation.event.id)))
        const submissions=(context.submissions ?? []).filter(s=>s.status==='submitted'&&s.rules_version===version&&s.session_id===session?.id)
        const complete=field.scoringConfig?.calculationMethod==='manual' || required.length>0&&required.every(j=>submissions.some(s=>s.judge_id===j.judgeId&&s.round_id===source.id)&&foundation.judges?.some(live=>live.judgeId===j.judgeId&&live.isActive!==false&&(!live.accountStatus||live.accountStatus==='active')))
        const current=calculation&&sourceKey(calculation.source_versions ?? [])===sourceKey(submissions)&&calculation.session_id===session?.id
        phase=!complete?'awaiting_results':!current||!['ready_for_verification','under_verification','finalized','published'].includes(calculation.status)?'awaiting_tabulation'
          :calculation.verified_at&&['under_verification','finalized','published'].includes(calculation.status)?'awaiting_approval':'awaiting_verification'
      }
    }
    if(source&&!decision&&progressionIssues(source,field.rounds,field.scoringConfig?.calculationMethod).length)phase='invalid_progression'
    let scoringStatus=version&&!context.known?'unavailable':'not_open'
    if(session&&session.rules_version===version&&session.current_round_id===round.id){
      if(session.status==='paused')scoringStatus='paused'
      else if(session.status==='completed')scoringStatus='closed'
      else if(session.status==='active'){
        const criteria=(field.criteria ?? []).filter(c=>c.isActive!==false&&round.criteriaIds?.includes(c.id)&&gateAllows(session.access_config?.criteria,c.id))
        const open=eligibleIds.filter(id=>gateAllows(session.access_config?.entries,id)&&criteria.some(c=>session.access_config?.intersections?.[`${id}:${c.id}`]!=='deny'))
        scoringStatus=open.length?(open.length===eligibleIds.length?'open':'partly_open'):'closed'
      }
    }
    summaries[round.id]={roundId:round.id,mode,phase,sourceRoundId:source?.id ?? null,sourceRoundName:source?.name ?? null,ruleLabel:advancementLabel(source),
      plannedEntryIds:mode==='qualification'?sourceIds:eligibleIds,eligibleEntryIds:eligibleIds,storedEntryIds:foundation.rounds?.find(r=>r.id===round.id)?.contestantIds ?? [],
      confirmedQualifierIds:protectedRound?decision?.qualifiers ?? null:null,decisionId:protectedRound?decision?.id ?? null:null,scoringStatus,calculationId:calculation?.id ?? null}
  }
  return {known:context.known!==false,rulesVersion:version ?? null,rounds:summaries}
}
