import { expect,test } from 'vitest'
import XLSX from 'xlsx'
import {buildWorkbook,writeStyledWorkbook,compareWorkbook} from '../../src/services/competition-workbook.service.js'
const state={rules:{id:'rules',version:1,event:{id:'event',title:'Competition'},scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2},rounds:[],criteria:[],divisions:[{id:'female',name:'Female',rowColor:'#F7DCEC'}]},session:{id:'session'},sourceVersions:[],sourceDigest:'hash',ready:true,deductions:[],worksheets:[{roundId:null,entryId:'a',judgeId:'j',submissionId:'submission',complete:true,total:85,criteria:[{criteriaId:'c',name:'Quality',percentage:100,average:85,contribution:85,minors:[{id:'m',raw:8.5,minScore:0,maxScore:10,normalized:85}]}]}],results:[{contestantId:'a',contestantName:'A',divisionId:'female',baseScore:85,deductionTotal:0,finalScore:85,rank:1,status:'Submitted',judgeTotals:[85]}]}
test('real XLSX roundtrip preserves source identity, values, formulas and division colors',()=>{
 const expected=buildWorkbook(state),buffer=writeStyledWorkbook(expected),received=XLSX.read(buffer,{type:'buffer',cellFormula:true,cellStyles:true})
 expect(buffer.subarray(0,2).toString()).toBe('PK');expect(compareWorkbook(expected,received).verified).toBe(true)
 expect(received.Sheets['Score Matrix'].A2.s.fgColor.rgb).toBe('F7DCEC')
 expect(received.Sheets['Judge Worksheets'].F2.f).toContain('ROUND(SUM(')
 expect(received.Sheets['Judge Sheet 1'].A4.s.fgColor.rgb).toBe('F7DCEC')
 expect(received.Sheets['Judge Sheet 1'].D4.f).toBe("'Judge Worksheets'!F2")
})
test('changed input, forged formula, duplicate identity and stale version are detected',()=>{
 const expected=buildWorkbook(state),received=XLSX.read(writeStyledWorkbook(expected),{type:'buffer',cellFormula:true})
 received.Sheets['Raw Scores'].H2.v=12;received.Sheets['Raw Scores'].K2.f='HYPERLINK("https://example.invalid")';received.Sheets['Competition Info'].B4.v='stale'
 const result=compareWorkbook(expected,received);expect(result.verified).toBe(false);expect(result.invalid.length).toBeGreaterThan(0);expect(result.versionConflicts.length).toBe(1)
})
test('workbook contribution formulas use direct round weights and preserve legacy weighting',()=>{
 const direct=structuredClone(state)
 direct.rules.criteria=[{id:'major',percentage:30,minorCriteria:[{id:'m1',percentage:10},{id:'m2',percentage:10},{id:'m3',percentage:10}]}]
 direct.rules.scoringConfig.minorWeightBasis='overall'
 direct.worksheets[0].criteria=[{criteriaId:'major',percentage:30,minors:[
  {id:'m1',raw:8,minScore:0,maxScore:10,normalized:80,percentage:10},
  {id:'m2',raw:6,minScore:0,maxScore:10,normalized:60,percentage:10},
  {id:'m3',raw:10,minScore:0,maxScore:10,normalized:100,percentage:10},
 ]}]
 const directSheet=buildWorkbook(direct).Sheets['Raw Scores']
 expect(directSheet.N2.f).toBe('K2*M2/100')
 expect(directSheet.N3.f).toBe('K3*M3/100')
 expect(directSheet.M2.v).toBe(10)
 expect(directSheet.N2.f).not.toContain('*L2')

 const legacy=structuredClone(direct)
 delete legacy.rules.scoringConfig.minorWeightBasis
 legacy.worksheets[0].criteria[0].minors[0].percentage=40
 legacy.worksheets[0].criteria[0].minors[1].percentage=60
 legacy.worksheets[0].criteria[0].minors=legacy.worksheets[0].criteria[0].minors.slice(0,2)
 expect(buildWorkbook(legacy).Sheets['Raw Scores'].N2.f).toBe('K2*L2*M2/10000')

 const equal=structuredClone(state)
 equal.worksheets[0].criteria[0].minors=[...state.worksheets[0].criteria[0].minors,{id:'m2',raw:7,minScore:0,maxScore:10,normalized:70}]
 expect(buildWorkbook(equal).Sheets['Raw Scores'].N2.f).toBe('K2*L2/100/2')
})
