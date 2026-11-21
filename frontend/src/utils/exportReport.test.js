import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
 buildJudgeScoreSheetData,
 downloadCsv,
 downloadExcel,
 downloadJudgeScoreSheetsExcel,
} from './exportReport'
import { readXlsx, toBytes } from '@/test/readXlsx'

beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.runOnlyPendingTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})

test('browser CSV download uses literal-safe text and retains numeric totals',()=>{
 let payload
 vi.stubGlobal('Blob',class {constructor(parts,options){payload={text:parts.join(''),type:options.type}}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 downloadCsv('competition.csv',[{contestant:'=1+1',score:89.33},{contestant:'Pending',score:null}])
 expect(payload).toEqual({text:'﻿"contestant","score"\n"\'=1+1","89.33"\n"Pending",""',type:'text/csv;charset=utf-8'})
 expect(click).toHaveBeenCalledTimes(1)
})

test('Excel download is a real .xlsx file that keeps formula-looking names as text',async()=>{
 let blob,name
 vi.stubGlobal('Blob',class {constructor(parts,options){this.parts=parts;this.type=options.type;blob=this}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){name=this.download})
 downloadExcel('competition.xls',[{name:'Results',rows:[{contestant:'=1+1',score:89.33}]}])
 expect(name).toBe('competition.xlsx')
 expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 const {sheets}=readXlsx(await toBytes(blob.parts[0]))
 expect(sheets.map(sheet=>sheet.name)).toEqual(['Results'])
 expect(sheets[0].xml).toContain('<t xml:space="preserve">=1+1</t>')
 expect(sheets[0].xml).toContain('<v>89.33</v>')
 expect(sheets[0].xml).toContain('state="frozen"')
 expect(sheets[0].xml).not.toContain('<f>')
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

test('judge score sheet workbook is a styled .xlsx and escapes formula-like text',async()=>{
 let blob,name
 vi.stubGlobal('Blob',class {constructor(parts,options){this.parts=parts;this.type=options.type;blob=this}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){name=this.download})
 downloadJudgeScoreSheetsExcel('judges.xlsx',[{
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
 expect(name).toBe('judges.xlsx')
 const {files,sheets}=readXlsx(await toBytes(blob.parts[0]))
 const xml=sheets[0].xml
 expect(sheets[0].name).toBe('Judge One')
 expect(xml).toContain('<mergeCell ref="A1:C1"/>')
 expect(xml).toContain('OFFICIAL JUDGE SCORE SHEET')
 expect(xml).toContain('Event &amp; Festival')
 expect(xml).toContain('Technique &lt;Final&gt;')
 expect(xml).toContain('Entry 1\n=Formula Contestant')
 expect(xml).toContain('100%')
 expect(xml).toContain('<v>8</v>')
 expect(xml).toContain('orientation="landscape"')
 expect(files['xl/styles.xml']).toContain('FF172B56')
 expect(xml).not.toContain('<f>')
})
