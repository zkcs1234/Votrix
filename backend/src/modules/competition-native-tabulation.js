import {applicableDeductionRules, submittedJudgeDeductions} from '../../../shared/competition-deductions.js'
import {calculateOfficial,combineOfficialContributions,officialDeductionTotal,officialMean} from '../../../shared/competition-calculation.js'
import {nextRound as getNextRound} from '../../../shared/competition-participation.js'
import {selectQualifiers} from './advancement.js'

export function nativeDeductionsEnabled(snapshot) {
 return applicableDeductionRules(snapshot.rules?.configuration_snapshot,snapshot.roundId,'organizer').length>0
}

// Pure shape adapter. Arithmetic, rounding, ranks and deductions remain in the
// existing official engine. Only CURRENT authorized submissions enter it.
export function nativeCalculationInputs(snapshot) {
 if(snapshot.complete!==true||!snapshot.rules||!snapshot.submissions?.length)throw new Error('All current judge sheets must be complete')
 const frozen=snapshot.rules,cfg=frozen.configuration_snapshot
 const scopes=snapshot.scopes??[{session:snapshot.session,submissions:snapshot.submissions}]
 const rounds=cfg.rounds.map((r,i)=>({...r,purpose:i===cfg.rounds.length-1?'final':'preliminary',contestantIds:scopes.find(s=>s.session?.round_id===r.id)?.session.entry_ids??[],criteriaIds:cfg.criteria.filter(k=>k.roundId===r.id).map(k=>k.id),progression:r.progression??'back_to_zero'}))
 const contestants=frozen.participation_snapshot.map(e=>({id:e.id,masterId:e.contestant_id,name:snapshot.entries?.find(x=>x.id===e.id)?.name??e.id,contestantNumber:e.entry_number}))
 const judges=[...new Set(frozen.assignment_snapshot.map(a=>a.judgeId))].map(judgeId=>({judgeId,isActive:true,role:frozen.assignment_snapshot.find(a=>a.judgeId===judgeId).judgeRole,assignments:frozen.assignment_snapshot.filter(a=>a.judgeId===judgeId).map(a=>a.round_id==null?{scope:'event',scopeId:snapshot.eventId}:{scope:'round',scopeId:a.round_id})}))
 if(judges.some(j=>!j.assignments.length))throw new Error('Explicit frozen judge assignments are required')
 const submissions=scopes.flatMap(scope=>scope.submissions.map(s=>({...s,status:'submitted',round_id:scope.session.round_id,sources:scope.session.entry_ids.map(entryId=>({contestantId:entryId,scores:Object.assign({},...s.sources.filter(row=>row.entry_id===entryId).map(row=>row.scores))}))})))
 const configuredRules=cfg.scoringConfig.deductionRules??[]
 const seenDeductions=new Set()
 for(const record of snapshot.allDeductions??snapshot.deductions??[]){if(seenDeductions.has(record.id))throw new Error('Duplicate organizer deduction');seenDeductions.add(record.id)}
 const configuredRuleIds=new Set(configuredRules.map(rule=>rule.id))
 const deductions=configuredRules.length
  ? (snapshot.allDeductions??snapshot.deductions??[]).filter(d=>d.status==='approve'&&configuredRuleIds.has(d.rule_key)&&applicableDeductionRules(cfg,snapshot.roundId,'organizer').some(rule=>rule.id===d.rule_key)).map(d=>({id:d.id,contestant_id:d.entry_id,round_id:d.rule_snapshot.roundId??cfg.criteria.find(k=>k.id===d.rule_snapshot.criteriaId)?.roundId??null,criteria_id:d.rule_snapshot.criteriaId??null,decision_status:'approved',rule_id:d.rule_key,description:d.rule_snapshot.description,reason:d.reason,amount:d.rule_snapshot.amount,units:d.rule_snapshot.units,...(d.rule_snapshot.appliedBy?{appliedBy:d.rule_snapshot.appliedBy}:{})}))
  : []
 const rules={id:frozen.id,event:{id:snapshot.eventId},contestants,judges,rounds,criteria:cfg.criteria.map(k=>({...k,isActive:true,minorCriteria:k.minorCriteria??[]})),categories:[],scoringConfig:{...cfg.scoringConfig,calculationMethod:cfg.rounds.find(r=>r.id===snapshot.roundId)?.calculationMethod??cfg.scoringConfig.calculationMethod,decimalPlaces:cfg.scoringConfig.decimalPlaces??2,finalRoundId:rounds.at(-1)?.id??null}}
 return {rules,submissions,deductions,judgeDeductions:submittedJudgeDeductions(cfg,scopes),roundId:rounds.at(-1)?.id===snapshot.roundId?null:snapshot.roundId}
}
export function calculateNativeSnapshot(snapshot,{manualResults,reason}={}) {
 const input=nativeCalculationInputs(snapshot)
 if(input.rules.scoringConfig.calculationMethod==='manual') {
  const entries=snapshot.session.entry_ids
  if(typeof reason!=='string'||reason.trim().length<5||!Array.isArray(manualResults)||manualResults.length!==entries.length||new Set(manualResults.map(r=>r.contestantId)).size!==entries.length||manualResults.some(r=>!entries.includes(r.contestantId)||!Number.isSafeInteger(r.rank)||r.rank<1))throw new Error('Explicit complete manual placements and a reason are required')
  const results=manualResults.map(r=>({...input.rules.contestants.find(e=>e.id===r.contestantId),contestantId:r.contestantId,rank:r.rank,manual:true,baseScore:null,deductionTotal:null,finalScore:null,judgeTotals:[]})).sort((a,b)=>a.rank-b.rank)
  return {input,output:{results,worksheets:[],roundResults:[],missing:[],ready:true,manualBasis:input.rules.scoringConfig.manualBasis,reason}}
 }
 const cfg=input.rules.scoringConfig, final=input.rules.rounds.at(-1)
 let output
 if(cfg.calculationMethod==='rank_based'&&cfg.numericCarryBasis==='weighted_judge_average'&&snapshot.roundId===final?.id&&final.progression==='weighted') {
  if(input.deductions.some(d=>d.units==='placements'&&d.round_id!=null&&d.round_id!==final.id))throw new Error('Earlier round placements cannot be carried as numeric deductions')
  const numericRules=structuredClone(input.rules)
  numericRules.scoringConfig.calculationMethod='weighted_average'
  numericRules.rounds.forEach(r=>{r.calculationMethod='weighted_average'})
  const numeric=calculateOfficial(numericRules,input.submissions,{roundId:null,deductions:input.deductions.filter(d=>d.units==='points'),judgeDeductions:input.judgeDeductions.filter(d=>d.units==='points'&&!d.competition_scope)})
  if(!numeric.ready)throw new Error('Every contributing round needs complete current numeric sources')
  const finalSheets=numeric.worksheets.filter(w=>w.roundId===final.id)
  const dp=cfg.decimalPlaces??2
  const subtractPoints=(score,points)=>combineOfficialContributions([{score,weight:100},{score:-points,weight:100}],dp)
  const combined=finalSheets.map(w=>({...w,finalJudgePointDeductionTotal:combineOfficialContributions(input.judgeDeductions.filter(d=>d.judge_id===w.judgeId&&d.contestant_id===w.entryId&&d.units==='points'&&d.competition_scope).map(d=>({score:d.amount,weight:100})),dp),judgePlacementPenalty:combineOfficialContributions(input.judgeDeductions.filter(d=>d.judge_id===w.judgeId&&d.contestant_id===w.entryId&&d.round_id===final.id&&d.units==='placements').map(d=>({score:d.amount,weight:100})),dp),deductions:[...(w.deductions??[]),...input.judgeDeductions.filter(d=>d.judge_id===w.judgeId&&d.contestant_id===w.entryId&&d.round_id===final.id&&(d.units==='placements'||d.competition_scope))],carryNumericTotal:subtractPoints(combineOfficialContributions(input.rules.rounds.map(r=>({weight:r.weight,score:r.id===final.id?subtractPoints(w.total,officialDeductionTotal(input.deductions,w.entryId,final.id,'points',dp)):numeric.roundResults.find(row=>row.roundId===r.id&&row.contestantId===w.entryId)?.finalScore})),dp),officialDeductionTotal(input.deductions,w.entryId,null,'points',dp))}))
  for(const worksheet of combined)worksheet.carryNumericTotal=subtractPoints(worksheet.carryNumericTotal,worksheet.finalJudgePointDeductionTotal)
  const results=numeric.results.map(row=>{
   const own=combined.filter(w=>w.entryId===row.contestantId)
   const rawJudgeRanks=Object.fromEntries(own.map(w=>[w.judgeId,1+combined.filter(peer=>peer.judgeId===w.judgeId&&peer.carryNumericTotal>w.carryNumericTotal).length]))
   const judgeRanks=Object.fromEntries(own.map(w=>[w.judgeId,combineOfficialContributions([{score:rawJudgeRanks[w.judgeId],weight:100},...input.judgeDeductions.filter(d=>d.judge_id===w.judgeId&&d.contestant_id===row.contestantId&&d.round_id===final.id&&d.units==='placements').map(d=>({score:d.amount,weight:100}))],dp)]))
   const placements=combineOfficialContributions(Object.values(judgeRanks).map(score=>({score,weight:100})),dp)
   const placementPenalty=officialDeductionTotal(input.deductions,row.contestantId,final.id,'placements',dp)+officialDeductionTotal(input.deductions,row.contestantId,null,'placements',dp)
   const adjustedPlacements=combineOfficialContributions([{score:placements,weight:100},{score:placementPenalty,weight:100}],dp)
   return {...row,rawJudgeRanks,judgeRanks,numericCarryScore:own.some(w=>w.finalJudgePointDeductionTotal)?officialMean(own.map(w=>w.carryNumericTotal),dp):row.finalScore,pointDeductionTotal:row.deductionTotal,baseScore:placements,finalScore:adjustedPlacements,rankingScore:adjustedPlacements,weightedScore:row.finalScore,deductionTotal:placementPenalty,judgeTotals:own.map(w=>w.carryNumericTotal)}
  }).sort((a,b)=>a.finalScore-b.finalScore)
  results.forEach((row,i)=>{row.rank=i&&row.finalScore===results[i-1].finalScore?results[i-1].rank:i+1})
  output={...numeric,results,worksheets:numeric.worksheets.map(w=>combined.find(c=>c.entryId===w.entryId&&c.judgeId===w.judgeId&&c.roundId===w.roundId)??w),numericCarryBasis:cfg.numericCarryBasis}
 } else output=calculateOfficial(input.rules,input.submissions,{roundId:input.roundId,deductions:input.deductions,judgeDeductions:input.judgeDeductions})
 if(!output.ready||output.missing.length)throw new Error('The authoritative engine found incomplete current sources')
 const dp=cfg.decimalPlaces??2
 output.entryCriteriaAverages=output.worksheets.reduce((entries,worksheet)=>{
  for(const criterion of worksheet.criteria??[]){
   const key=`${worksheet.roundId??'single'}:${worksheet.entryId}`
   const entry=entries[key]??={roundId:worksheet.roundId,entryId:worksheet.entryId,criteria:{}}
   const values=entry.criteria[criterion.criteriaId]??=[]
   values.push(criterion.average)
   entry.criteria[criterion.criteriaId]=values
  }
  return entries
 },{})
 for(const entry of Object.values(output.entryCriteriaAverages)){
  for(const [criterionId,values] of Object.entries(entry.criteria)){
   entry.criteria[criterionId]=combineOfficialContributions(values.map(score=>({score,weight:100/values.length})),dp)
  }
 }
 return {input,output}
}
export function nativeQualifierProposal(snapshot,calculation) {
 if(!calculation?.finalized)throw new Error('Finalized current calculation is required')
 const cfg=snapshot.rules.configuration_snapshot,round=cfg.rounds.find(r=>r.id===snapshot.roundId)
 const next=round?getNextRound(cfg.rounds,round):null
 if(!next)throw new Error('This phase has no outgoing qualification')
 const output=calculation.output_snapshot
 const standings=output.results.map(r=>({contestantId:r.contestantId,rank:r.rank,score:r.finalScore,roundScore:output.roundResults?.find(s=>s.roundId===round.id&&s.contestantId===r.contestantId)?.finalScore??r.finalScore})).sort((a,b)=>a.rank-b.rank)
 return {fromRound:round.id,toRound:next.id,policy:round.advancementType??'none',automatic:[...selectQualifiers(standings,round.advancementType,round.advancementValue)],standings}
}
