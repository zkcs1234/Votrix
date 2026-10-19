import { expect, test } from 'vitest'
import { buildCompetitionOverallRankings, buildCompetitionContestantPerformance, buildCompetitionRoundResults, buildCompetitionExportPayload, buildCompetitionCategoryResults, buildCompetitionReportSheets, buildCompetitionReportCsvRows } from './competitionMetrics'
const missing={contestantId:'missing',contestantName:'Pending',contestantNumber:1,rank:null,weightedScore:null,finalScore:null,status:'Incomplete'}
const zero={contestantId:'zero',contestantName:'Zero',contestantNumber:2,rank:1,weightedScore:0,finalScore:0,status:'Submitted'}
const manual={contestantId:'manual',contestantName:'Manual',contestantNumber:3,rank:1,weightedScore:null,finalScore:null,manual:true,status:'Official'}
test('report adapters keep incomplete scores distinct from valid zero and manual placement',()=>{
 const rows=buildCompetitionContestantPerformance({rankings:[missing,zero,manual]})
 expect(rows.map(row=>row.value)).toEqual([null,0,1]);expect(rows.map(row=>row.sublabel)).toEqual(['Incomplete','Weighted 0.00','Manual official decision'])
 expect(buildCompetitionRoundResults({roundResults:[{standings:[{score:null}]}]})[0].value).toBeNull()
 const report={rankings:[missing,zero,manual],roundResults:[{standings:[{score:null},{score:0},{score:null,manual:true}]}]}
 const payload=buildCompetitionExportPayload(report)
 expect(payload.sections[1].rows.map(row=>row.score)).toEqual(['Incomplete','0.00','Manual official decision'])
 expect(payload.sections[3].rows.map(row=>row.score)).toEqual(['Incomplete','0.00','Manual official decision'])
 expect(buildCompetitionReportSheets(report)[1].rows[0].weightedScore).toBeNull()
 expect(buildCompetitionReportCsvRows(report)[0].weightedScore).toBeNull()
})
test('top-N presentation preserves authoritative rank-based/manual ordering rather than sorting values descending',()=>{
 const ranks=[{...manual,contestantId:'first',rank:1},{...manual,contestantId:'second',rank:2},{...manual,contestantId:'third',rank:3}]
 expect(buildCompetitionOverallRankings({rankings:ranks},{limit:2}).map(row=>row.id)).toEqual(['first','second'])
 const placement=[{...zero,contestantId:'first',weightedScore:4,finalScore:4},{...zero,contestantId:'second',rank:2,weightedScore:9,finalScore:9}]
 expect(buildCompetitionOverallRankings({rankings:placement},{limit:1})[0].id).toBe('first')
})
test('incomplete category values and percentages do not become numeric zero',()=>{
 const rows=buildCompetitionCategoryResults({categoryResults:[{id:'c',entries:[{contestantId:'a',weightedScore:null},{contestantId:'b',weightedScore:0}]}]})[0].contestants
 expect(rows[0]).toMatchObject({value:null,percentage:null});expect(rows[1]).toMatchObject({value:0,percentage:0})
})
