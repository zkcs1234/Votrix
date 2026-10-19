import {serializeCsv} from '../../../shared/csv-export.js'
import {applicableDeductionRules, hasDeductionModes, submittedJudgeDeductions} from '../../../shared/competition-deductions.js'

// Raw decimals are SQL text, kept separate from the engine's rounded trace.
// Shared CSV serialization protects all user-controlled spreadsheet cells.
export function nativeExportRows(dataset){
 const state=dataset.source,calc=state.calculation,cfg=state.rules.configuration_snapshot
 const method=(cfg.rounds??[]).find(r=>r.id===dataset.roundId)?.calculationMethod??cfg.scoringConfig.calculationMethod
 if(!state.complete)throw new Error('Complete current judge sources are required')
 const meta={event_id:dataset.eventId,event_name:dataset.eventName,competition_id:dataset.competitionId,competition_name:dataset.competitionName,round_id:dataset.roundId,round_name:dataset.roundName,frozen_rule_version:state.rules.id,scoring_method:method,numeric_carry_basis:cfg.scoringConfig.numericCarryBasis??'',effective_precision:cfg.scoringConfig.decimalPlaces??2,source_digest:state.sourceDigest,source_revision:state.session.source_revision,source_current:true,calculation_id:calc?.id??'',calculation_version:calc?.version??'',calculated_at:calc?.created_at??'',calculation_current:!!calc,verified:calc?.verified??false,finalized:calc?.finalized??false,publication_version:dataset.publication?.version??'',publication_action:dataset.publication?.action??''}
 const entry=id=>state.entries.find(e=>e.id===id)
 const trace=(judge,id,criterion,target)=>calc?.output_snapshot.worksheets?.find(w=>w.judgeId===judge&&w.entryId===id&&w.roundId===dataset.roundId)?.criteria.find(c=>c.criteriaId===criterion)?.minors?.find(m=>m.id===target)
 if(['judge','worksheets'].includes(dataset.kind)){
 const raw=dataset.rawRows.map(row=>{
  const major=cfg.criteria.find(c=>c.id===row.criterionId),target=major.minorCriteria?.find(m=>m.id===row.targetId)??major,e=entry(row.participationId),sheet=calc?.output_snapshot.worksheets?.find(w=>w.judgeId===row.judgeId&&w.entryId===row.participationId&&w.roundId===dataset.roundId)
  return {...meta,record_type:'submitted_raw_target',judge_id:row.judgeId,judge_name:row.judgeName,submission_id:row.submissionId,submitted_at:row.submittedAt,participation_id:row.participationId,entry_number:e?.contestantNumber,entry_name:e?.name,criterion_id:major.id,criterion_name:major.name,major_weight_decimal_text:row.majorWeightText??String(major.percentage),minor_id:row.targetId,minor_name:target.name,minor_weight_decimal_text:target.percentage!==undefined&&target!==major?String(target.percentage):'',raw_score_decimal_text:row.rawText,minimum_decimal_text:row.minimumText??String(target.minScore),maximum_decimal_text:row.maximumText??String(target.maxScore),normalization_formula:cfg.scoringConfig.criterionBasis==='points'?'raw major points; no normalization':major.minorCriteria?.length?major.minorCriteria.some(m=>m.percentage!==undefined)?'raw / maximum * 100; sum(normalized minor * minor percentage / 100)':'raw / maximum * 100; equal mean of normalized minors':'raw / maximum * 100; direct major scoring',calculated_normalized:trace(row.judgeId,row.participationId,major.id,row.targetId)?.normalized??'',calculated_judge_total:sheet?.total??'',numeric_judge_carry_total:sheet?.carryNumericTotal??'',source_row_revision:row.rowRevision,...(applicableDeductionRules(cfg,dataset.roundId,'judge').length?{original_judge_total:sheet?.originalTotal??'',judge_point_deduction_total:sheet?.judgeDeductionTotal??'',judge_placement_penalty:sheet?.judgePlacementPenalty??''}:{})}
 })
 const judgeIds=new Set(dataset.rawRows.map(row=>row.judgeId))
 const judgeRecords=submittedJudgeDeductions(cfg,state.scopes??[{session:state.session,submissions:state.submissions??[]}]).filter(record=>record.round_id===dataset.roundId&&judgeIds.has(record.judge_id))
 const names=new Map(dataset.rawRows.map(row=>[row.judgeId,row.judgeName]))
 const records=[...raw,...judgeRecords.map(record=>({...meta,record_type:'submitted_judge_deduction',judge_id:record.judge_id,judge_name:names.get(record.judge_id),submission_id:record.submission_id,participation_id:record.contestant_id,entry_number:entry(record.contestant_id)?.contestantNumber,entry_name:entry(record.contestant_id)?.name,deduction_owner:'judge',rule_id:record.rule_id,criterion_id:record.criteria_id??'',offense_id:record.offense_key,amount:record.amount,units:record.units,deduction_reason:record.reason}))]
 return hasDeductionModes(cfg)?state.entries.flatMap(e=>records.filter(row=>row.participation_id===e.id)):records
 }
 if(!calc?.finalized)throw new Error('Current finalized calculation is required')
 const rows=calc.output_snapshot.results.map(r=>({...meta,record_type:dataset.kind==='final'?'finalized_official_result':'official_tabulation',participation_id:r.contestantId,entry_number:entry(r.contestantId)?.contestantNumber,entry_name:entry(r.contestantId)?.name,rank:r.rank,manual_placement:r.manual===true,base_score:r.baseScore??'',approved_deduction_total:r.deductionTotal??'',deduction_units:method==='rank_based'?'placements':'points',numeric_adjusted_score:r.numericCarryScore??r.numericScore??'',numeric_point_deduction_total:r.pointDeductionTotal??'',final_score:r.finalScore??'',manual_basis:r.manual?cfg.scoringConfig.manualBasis:'',finalized_at:dataset.finalizedAt??''}))
 if(dataset.kind==='tabulation'){
  const configuredRuleIds=new Set(applicableDeductionRules(cfg,dataset.roundId,'organizer').map(rule=>rule.id))
  rows.push(...nativeExportRows({...dataset,kind:'worksheets'}))
  rows.push(...(cfg.scoringConfig.deductionRules?.length?state.allDeductions.filter(d=>configuredRuleIds.has(d.rule_key)):[]).map(d=>({...meta,record_type:'deduction_decision',participation_id:d.entry_id,decision_id:d.id,rule_id:d.rule_key,offense_id:d.offense_key,decision_status:d.status,amount:d.rule_snapshot.amount,units:d.rule_snapshot.units,decision_reason:d.reason,review_actor:d.review?.actor_id??'',review_version:d.review?.version??'',reviewed_at:d.review?.created_at??''})))
  rows.push({...meta,record_type:'calculation_trace',trace_json:JSON.stringify(calc.output_snapshot),inputs_json:JSON.stringify(calc.input_snapshot)})
  if(hasDeductionModes(cfg)){
   const names=new Map(dataset.rawRows.map(row=>[row.judgeId,row.judgeName]))
   const allJudgeRecords=submittedJudgeDeductions(cfg,state.scopes??[{session:state.session,submissions:state.submissions??[]}])
   const grouped=state.entries.flatMap(e=>{
    const sources=rows.filter(row=>row.participation_id===e.id&&!['official_tabulation','deduction_decision'].includes(row.record_type))
    const sheets=(calc.output_snapshot.worksheets??[]).filter(sheet=>sheet.entryId===e.id)
    const traces=sheets.flatMap(sheet=>(sheet.criteria??[]).map(criterion=>({...meta,record_type:'criterion_calculation',participation_id:e.id,entry_number:e.contestantNumber,entry_name:e.name,scope_round_id:sheet.roundId,judge_id:sheet.judgeId,judge_name:names.get(sheet.judgeId)??'',criterion_id:criterion.criteriaId,criterion_name:criterion.name,original_contribution:criterion.originalContribution??criterion.contribution,adjusted_contribution:criterion.contribution,original_judge_total:sheet.originalTotal??sheet.total,adjusted_judge_total:sheet.total})))
    const contributing=allJudgeRecords.filter(record=>record.contestant_id===e.id&&record.round_id!==dataset.roundId).map(record=>({...meta,record_type:'submitted_judge_deduction',participation_id:e.id,entry_number:e.contestantNumber,entry_name:e.name,scope_round_id:record.round_id,judge_id:record.judge_id,judge_name:names.get(record.judge_id)??'',submission_id:record.submission_id,deduction_owner:'judge',rule_id:record.rule_id,criterion_id:record.criteria_id??'',offense_id:record.offense_key,amount:record.amount,units:record.units,deduction_reason:record.reason}))
    return [...sources,...traces,...contributing,...rows.filter(row=>row.participation_id===e.id&&row.record_type==='deduction_decision'),...rows.filter(row=>row.participation_id===e.id&&row.record_type==='official_tabulation')]
   })
   rows.splice(0,rows.length,...grouped,...rows.filter(row=>row.record_type==='calculation_trace'))
  }
 }
 if(hasDeductionModes(cfg)&&!applicableDeductionRules(cfg,dataset.roundId).length)return rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!/deduct|penalt/i.test(key))))
 return rows
}
export function nativeExportCsv(dataset){return serializeCsv(nativeExportRows(dataset))}
