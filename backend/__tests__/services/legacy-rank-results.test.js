import { beforeEach, expect, test, vi } from 'vitest'
const fixture=vi.hoisted(()=>({tables:{}}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:async()=>({id:'e',event_type:'competition_scoring',status:'active',official_rules_id:null}),getEventById:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({from:table=>{
 const filters=[]
 const rows=()=> (fixture.tables[table]??[]).filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value))
 const result=single=>({data:single?(rows()[0]??null):rows(),count:rows().length,error:null})
 const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},in:(key,value)=>{filters.push([key,value]);return q},or:()=>q,order:()=>q,single:async()=>result(true),then:resolve=>resolve(result(false))};return q
}})}))
import { getLiveRankings } from '../../src/services/pageant.service.js'
beforeEach(()=>{
 fixture.tables={events:[{id:'e',scoring_config:{calculationMethod:'rank_based',decimalPlaces:2},divisions_enabled:false}],competition_contestants:[{id:'a',event_id:'e',name:'A',contestant_number:1},{id:'b',event_id:'e',name:'B',contestant_number:2}],competition_criteria:[{id:'c',event_id:'e',name:'Quality',percentage:100,min_score:0,max_score:100}],event_participants:[{id:'enroll',event_id:'e',participant_type:'COMPETITION_JUDGE'}],competition_rounds:[],competition_categories:[],competition_minor_criteria:[],competition_scores:[{contestant_id:'a',criteria_id:'c',judge_id:'j',score:90},{contestant_id:'b',criteria_id:'c',judge_id:'j',score:80}]}
})
test('legacy rank-based public mapper handles actual engine rows and retains placements',async()=>{
 const result=await getLiveRankings('e','organizer')
 expect(result.rankings.map(row=>[row.contestantId,row.rank,row.placementTotal,row.finalScore])).toEqual([['a',1,1,-1],['b',2,2,-2]])
 expect(result.rankings[0]).toMatchObject({status:'Fully scored',criteriaBreakdown:[],perRound:[],perCategory:[]})
})
test('legacy round ranking fallback retains engine placement ordering when breakdown is absent',async()=>{
 const result=await getLiveRankings('e','organizer',{roundId:'legacy-round'})
 expect(result.rankings.map(row=>[row.contestantId,row.rank,row.rankingScore])).toEqual([['a',1,-1],['b',2,-2]])
})
