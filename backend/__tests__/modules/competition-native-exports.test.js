import {expect,test} from 'vitest'
import {nativeExportRows,nativeExportCsv} from '../../src/modules/competition-native-exports.js'
const dataset=()=>({eventId:'event',eventName:'=HYPERLINK("bad")',competitionId:'child',competitionName:'Dance',roundId:null,roundName:'Single phase',kind:'worksheets',finalizedAt:'2026-10-13',source:{complete:true,sourceDigest:'sha',session:{source_revision:2},rules:{id:'rule',configuration_snapshot:{criteria:[{id:'major',name:'Technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[{id:'minor',name:'Skill',minScore:0,maxScore:10}]}],scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2}}},entries:[{id:'entry',contestantNumber:1,name:'@malicious'}],calculation:{id:'calc',version:1,verified:true,finalized:true,created_at:'2026-10-13',input_snapshot:{},output_snapshot:{results:[{contestantId:'entry',rank:1,baseScore:80,finalScore:80,deductionTotal:0}],worksheets:[{judgeId:'judge',entryId:'entry',roundId:null,total:80,criteria:[{criteriaId:'major',minors:[{id:'minor',normalized:80}]}]}]}},allDeductions:[]},rawRows:[{judgeId:'judge',judgeName:' -formula',submissionId:'submission',submittedAt:'2026-10-13',participationId:'entry',criterionId:'major',targetId:'minor',rawText:'8.123456789012345678901',majorWeightText:'100.000',minimumText:'0.000',maximumText:'10.000',rowRevision:1}]})
test('raw decimals, bounds and weights remain exact SQL text separate from computed values',()=>{const d=dataset(),row=nativeExportRows(d)[0];expect(row.raw_score_decimal_text).toBe('8.123456789012345678901');expect(row.maximum_decimal_text).toBe('10.000');expect(row.major_weight_decimal_text).toBe('100.000');expect(row.calculated_normalized).toBe(80);expect(nativeExportCsv(d)).toContain('8.123456789012345678901')})
test('existing safe CSV helper protects names, leading whitespace, quotes and multiline cells',()=>{const d=dataset();d.competitionName='Dance, "Final"\nrow';const csv=nativeExportCsv(d);expect(csv).toContain("'=HYPERLINK");expect(csv).toContain("'@malicious");expect(csv).toContain("' -formula");expect(csv).toContain('Dance, ""Final""\nrow')})
test('incomplete sources cannot create any score-bearing export',()=>{const d=dataset();d.source.complete=false;expect(()=>nativeExportCsv(d)).toThrow('Complete current')})
test('tabulation exports include submitted raw rows, exact calculation IDs and trace records',()=>{const d=dataset();d.kind='tabulation';expect(nativeExportRows(d).map(r=>r.record_type)).toEqual(['official_tabulation','submitted_raw_target','calculation_trace']);expect(nativeExportRows(d).every(r=>r.calculation_id==='calc'&&r.competition_id==='child')).toBe(true)})
test('tabulation exports omit deductions when disabled and exclude decisions outside frozen configured rules',()=>{
 const d=dataset();d.kind='tabulation';d.source.allDeductions=[{id:'stale',entry_id:'entry',rule_key:'removed-rule',rule_snapshot:{amount:99,units:'points'}}]
 expect(nativeExportRows(d).some(row=>row.record_type==='deduction_decision')).toBe(false)
 d.source.rules.configuration_snapshot.scoringConfig.deductionRules=[{id:'active-rule'}]
 d.source.allDeductions.push({id:'active',entry_id:'entry',rule_key:'active-rule',status:'approve',rule_snapshot:{amount:2,units:'points'}})
 expect(nativeExportRows(d).filter(row=>row.record_type==='deduction_decision').map(row=>row.decision_id)).toEqual(['active'])
})
test('final result exports require finalized current calculation and keep manual numeric totals blank',()=>{const d=dataset();d.kind='final';d.source.calculation.finalized=false;expect(()=>nativeExportRows(d)).toThrow('finalized');d.source.calculation.finalized=true;d.source.rules.configuration_snapshot.scoringConfig.calculationMethod='manual';d.source.calculation.output_snapshot.results[0]={contestantId:'entry',rank:1,manual:true,baseScore:null,finalScore:null,deductionTotal:null};expect(nativeExportRows(d)[0]).toMatchObject({rank:1,manual_placement:true,base_score:'',final_score:''})})

test('exports describe legacy weighted minors and the selected round method',()=>{const d=dataset();d.roundId='pre';d.source.rules.configuration_snapshot.rounds=[{id:'pre',calculationMethod:'sum'}];d.source.rules.configuration_snapshot.criteria[0].minorCriteria[0].percentage=100;const row=nativeExportRows(d)[0];expect(row.scoring_method).toBe('sum');expect(row.minor_weight_decimal_text).toBe('100');expect(row.normalization_formula).toContain('weighted mean');expect(row.normalization_formula).toContain('major percentage')})
test('exports identify new minor weights as direct shares of the round total',()=>{const d=dataset();const cfg=d.source.rules.configuration_snapshot;cfg.scoringConfig.minorWeightBasis='overall';cfg.criteria[0].percentage=30;cfg.criteria[0].minorCriteria[0].percentage=30;const row=nativeExportRows(d)[0];expect(row.normalization_formula).toContain('direct shares of the round total');expect(row.normalization_formula).not.toContain('then multiply by the major percentage')})

test('rank carry exports keep numeric point deductions separate from ordinal penalties',()=>{const d=dataset();d.kind='final';d.source.rules.configuration_snapshot.scoringConfig.calculationMethod='rank_based';d.source.calculation.output_snapshot.results[0]={contestantId:'entry',rank:1,baseScore:3,finalScore:5,deductionTotal:2,numericCarryScore:83.9,pointDeductionTotal:7};expect(nativeExportRows(d)[0]).toMatchObject({deduction_units:'placements',approved_deduction_total:2,numeric_adjusted_score:83.9,numeric_point_deduction_total:7})})

test('judge CSV preserves original raw decimals and includes submitted deduction audit records separately',()=>{
 const d=dataset(),cfg=d.source.rules.configuration_snapshot
 cfg.structure='single';cfg.rounds=[];cfg.criteria[0].roundId=null
 cfg.scoringConfig.deductionMode='judge';cfg.scoringConfig.deductionRules=[{id:'late',description:'Late start',appliedBy:'judge',amount:2,units:'points'}]
 d.source.session.entry_ids=['entry']
 d.source.submissions=[{id:'submission',judge_id:'judge',sources:[{entry_id:'entry',criterion_id:'major',scores:{minor:8},deductions:[{id:'record',ruleId:'late',offenseKey:'late-1',reason:'Exceeded permitted time'}]}]}]
 Object.assign(d.source.calculation.output_snapshot.worksheets[0],{originalTotal:80,total:78,judgeDeductionTotal:2})
 const rows=nativeExportRows(d)
 expect(rows[0]).toMatchObject({record_type:'submitted_raw_target',raw_score_decimal_text:'8.123456789012345678901',original_judge_total:80,calculated_judge_total:78})
 expect(rows[1]).toMatchObject({record_type:'submitted_judge_deduction',judge_id:'judge',submission_id:'submission',amount:2,units:'points',deduction_owner:'judge',offense_id:'late-1'})
})
test('explicit No Deductions omits deduction fields from finalized reports',()=>{
 const d=dataset();d.kind='final';d.source.rules.configuration_snapshot.scoringConfig.deductionMode='none';d.source.rules.configuration_snapshot.scoringConfig.deductionRules=[]
 expect(Object.keys(nativeExportRows(d)[0]).some(key=>/deduct|penalt/.test(key))).toBe(false)
})

test('modern combined exports group originals, criterion traces and results vertically by entry',()=>{
 const d=dataset();d.kind='tabulation';d.source.rules.configuration_snapshot.scoringConfig.deductionMode='none'
 d.source.entries.push({id:'second',contestantNumber:2,name:'Second performer'})
 d.rawRows.push({...d.rawRows[0],participationId:'second',rawText:'7.000'})
 d.source.calculation.output_snapshot.results.push({contestantId:'second',rank:2,baseScore:70,finalScore:70})
 const rows=nativeExportRows(d)
 expect(rows.filter(row=>row.participation_id).map(row=>[row.participation_id,row.record_type])).toEqual([
  ['entry','submitted_raw_target'],['entry','criterion_calculation'],['entry','official_tabulation'],
  ['second','submitted_raw_target'],['second','official_tabulation'],
 ])
 expect(rows.at(-1).record_type).toBe('calculation_trace')
 expect(rows.some(row=>Object.keys(row).some(key=>/deduct|penalt/i.test(key)))).toBe(false)
})
