import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
 buildJudgeScoreSheetData,
 downloadCsv,
 downloadExcel,
 downloadJudgeScoreSheetsExcel,
} from './exportReport'

beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.runOnlyPendingTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})

test('browser CSV download uses literal-safe text and retains numeric totals',()=>{
 let payload
 vi.stubGlobal('Blob',class {constructor(parts,options){payload={text:parts.join(''),type:options.type}}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 downloadCsv('competition.csv',[{contestant:'=1+1',score:89.33},{contestant:'Pending',score:null}])
 expect(payload).toEqual({text:'"contestant","score"\n"\'=1+1","89.33"\n"Pending",""',type:'text/csv;charset=utf-8'})
 expect(click).toHaveBeenCalledTimes(1)
})

test('SpreadsheetML download keeps formula-looking names explicitly typed as text',()=>{
 let text
 vi.stubGlobal('Blob',class {constructor(parts){text=parts.join('')}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 downloadExcel('competition',[{name:'Results',rows:[{contestant:'=1+1',score:89.33}]}])
 expect(text).toContain('<Data ss:Type="String">=1+1</Data>')
 expect(text).toContain('<Data ss:Type="Number">89.33</Data>')
 expect(text).not.toContain('ss:Formula')
})

test('judge score sheet builder creates one raw-score matrix per submitted judge',()=>{
 const sources={
  complete:true,
  session:{id:'session',entry_ids:['entry-1']},
  entries:[{id:'entry-1',name:'=Formula Contestant'}],
  rules:{id:'rules',configuration_snapshot:{
   structure:'single',
   rounds:[],
   criteria:[
    {id:'technique',name:'Technique',percentage:60,roundId:null},
    {id:'stage',name:'Stage Presence',percentage:40,roundId:null},
   ],
   scoringConfig:{criterionBasis:'percentage',calculationMethod:'weighted_average'},
  }},
  progress:[
   {judgeId:'judge-1',judgeName:'Judge One',submitted:true,submissionId:'submission-1'},
   {judgeId:'judge-2',judgeName:'Judge Two',submitted:true,submissionId:'submission-2'},
  ],
  submissions:[
   {id:'submission-1',judge_id:'judge-1',session_id:'session',rules_version:'rules',round_id:null,sources:[
    {entry_id:'entry-1',criterion_id:'technique',scores:{technique:8}},
    {entry_id:'entry-1',criterion_id:'stage',scores:{stage:9}},
   ]},
   {id:'submission-2',judge_id:'judge-2',session_id:'session',rules_version:'rules',round_id:null,sources:[
    {entry_id:'entry-1',criterion_id:'technique',scores:{technique:7}},
    {entry_id:'entry-1',criterion_id:'stage',scores:{stage:10}},
   ]},
  ],
 }
 const sheets=buildJudgeScoreSheetData(sources,{eventName:'Arts Festival',competitionName:'Dance',roundName:'Final'})
 expect(sheets).toHaveLength(2)
 expect(sheets[0]).toMatchObject({
  name:'Judge One',
  methodName:'Weighted Mean',
  total:100,
  rows:[
   {name:'Technique',weight:60,scores:[8]},
   {name:'Stage Presence',weight:40,scores:[9]},
  ],
 })
 expect(sheets[1].rows.map(row=>row.scores[0])).toEqual([7,10])
})

test('judge score sheet workbook styles the matrix and escapes formula-like text',()=>{
 let text
 vi.stubGlobal('Blob',class {constructor(parts){text=parts.join('')}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 downloadJudgeScoreSheetsExcel('judges.xls',[{
  name:'Judge One',
  judgeName:'Judge One',
  eventName:'Event & Festival',
  competitionName:'Dance',
  roundName:'Final',
  methodName:'Weighted Mean',
  pointsBasis:false,
  weightHeader:'WEIGHT',
  totalLabel:'TOTAL WEIGHT',
  total:100,
  entries:[{label:'Entry 1\n=Formula Contestant'}],
  rows:[{name:'Technique <Final>',weight:100,scores:[8]}],
 }])
 expect(text).toContain('ss:Name="Judge One"')
 expect(text).toContain('ss:MergeAcross="2"')
 expect(text).toContain('OFFICIAL JUDGE SCORE SHEET')
 expect(text).toContain('#172B56')
 expect(text).toContain('Technique &lt;Final&gt;')
 expect(text).toContain('Entry 1\n=Formula Contestant')
 expect(text).toContain('100%</Data>')
 expect(text).toContain('<Data ss:Type="Number">8</Data>')
 expect(text).not.toContain('ss:Formula')
})
