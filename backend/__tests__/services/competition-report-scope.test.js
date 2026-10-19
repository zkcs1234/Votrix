import { beforeEach, expect, test, vi } from 'vitest'
const fixture=vi.hoisted(()=>({published:true,reads:[],rows:[{contestantId:'a',contestantName:'=1+1',divisionId:'men',rank:2,finalScore:89.33},{contestantId:'b',contestantName:'Other',divisionId:'women',rank:1,finalScore:92},{contestantId:'c',contestantName:'Pending',divisionId:'men',rank:null,finalScore:null}]}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:async()=>({id:'e',event_type:'competition_scoring',status:'completed'})}))
vi.mock('../../src/services/pageant.service.js',()=>({listCompetitionEvents:vi.fn(),getLiveRankings:async(_event,_actor,{divisionId}={})=>({rankings:fixture.rows.filter(row=>!divisionId||row.divisionId===divisionId),judges:{total:3,submitted:3},divisionsEnabled:true,criteriaTotalPercentage:100,rounds:[]}),getCompetitionResults:async()=>({overall:fixture.rows,publishedCalculationId:fixture.published?'calc':null,tabulationMethod:'weighted_average',publishedAt:'2026-10-12T00:00:00Z',rounds:[{roundId:'pre',standings:[{contestantId:'a',rank:2,score:89.33},{contestantId:'b',rank:1,score:92}]}],divisions:[{divisionId:'men',rankings:[fixture.rows[0]]},{divisionId:'women',rankings:[fixture.rows[1]]}],categoryAwards:[{contestantId:'a',categoryId:'award'},{contestantId:'b',categoryId:'award'}]})}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({from:table=>{const q={select:()=>q,eq:(key,value)=>{fixture.reads.push({table,key,value});return q},then:resolve=>resolve({data:[{id:'a',division_id:'men'},{id:'b',division_id:'women'},{id:'c',division_id:'men'}],error:null})};return q}})}))
import { getCompetitionReport, getCompetitionReportExport } from '../../src/services/reports.service.js'
beforeEach(()=>{fixture.published=true;fixture.reads=[]})
test('published division reports preserve official ranks and scope every result section',async()=>{
 const report=await getCompetitionReport('e','organizer',{divisionId:'men'})
 expect(report.isOfficial).toBe(true);expect(report.rankings.map(row=>row.contestantId)).toEqual(['a','c']);expect(report.rankings[0].rank).toBe(2)
 expect(report.roundResults[0].standings.map(row=>row.contestantId)).toEqual(['a'])
 expect(report.divisionResults.map(row=>row.divisionId)).toEqual(['men'])
 expect(report.categoryAwards.map(row=>row.contestantId)).toEqual(['a'])
 expect(fixture.reads).toContainEqual({table:'competition_contestants',key:'event_id',value:'e'})
})
test('unpublished report has the same requested division and preserves incomplete null',async()=>{
 fixture.published=false
 const report=await getCompetitionReport('e','organizer',{divisionId:'men'})
 expect(report.isOfficial).toBe(false);expect(report.rankings[1].finalScore).toBeNull()
 expect(report.rankings.some(row=>row.contestantId==='b')).toBe(false)
})
test('CSV export uses authoritative finalScore, keeps missing blank, and protects text formulas',async()=>{
 const output=await getCompetitionReportExport('e','organizer',{divisionId:'men'})
 expect(output.csv).toContain('"\'=1+1","89.33","2"')
 expect(output.csv).toContain('"Pending","",""')
 expect(output.csv).not.toContain('Other');expect(output.json.divisionId).toBe('men')
})
