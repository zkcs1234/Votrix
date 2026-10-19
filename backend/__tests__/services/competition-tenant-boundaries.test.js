import { beforeEach, expect, test, vi } from 'vitest'
const fixture=vi.hoisted(()=>({tables:{},writes:[],error:null}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:vi.fn(async()=>({id:'event-a',event_type:'competition_scoring',status:'draft',official_rules_id:null})),getEventById:vi.fn()}))
vi.mock('../../src/foundation/activity.js',()=>({recordEventActivity:vi.fn()}))
vi.mock('../../src/foundation/index.js',()=>({db:()=>({from(table){
 const filters=[];let write=null
 const rows=()=> (fixture.tables[table]??[]).filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value))
 const result=single=>({data:single?(rows()[0]??null):rows(),error:fixture.error?.table===table?fixture.error.error:null})
 const q={select:()=>q,order:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},in:(key,value)=>{filters.push([key,value]);return q},
 insert:payload=>{write={table,action:'insert',payload};fixture.writes.push(write);return q},update:payload=>{write={table,action:'update',payload};fixture.writes.push(write);return q},delete:()=>{write={table,action:'delete'};fixture.writes.push(write);return q},
 maybeSingle:async()=>result(true),single:async()=>result(true),then:resolve=>resolve(result(false))}
 return q
}})}))
import { addCriteriaToRound, removeCriteriaFromRound, createRound, updateRound, updateCategory, deleteCategory, deleteRound } from '../../src/services/competition.service.js'
beforeEach(()=>{
 fixture.writes=[];fixture.error=null
 fixture.tables={competition_rounds:[{id:'round-a',event_id:'event-a',name:'Round A',weight:100,display_order:0},{id:'round-b',event_id:'event-b',name:'Round B',weight:100,display_order:0}],competition_criteria:[{id:'criterion-a',event_id:'event-a',percentage:100,is_active:true},{id:'criterion-b',event_id:'event-b',percentage:100,is_active:true}],competition_categories:[{id:'category-a',event_id:'event-a'},{id:'category-b',event_id:'event-b'}],competition_round_criteria:[]}
})
test.each([addCriteriaToRound,removeCriteriaFromRound])('nested criterion operation rejects foreign round and criterion before any mutation',async operation=>{
 await expect(operation('event-a','organizer','round-b','criterion-a')).rejects.toMatchObject({statusCode:403})
 await expect(operation('event-a','organizer','round-a','criterion-b')).rejects.toMatchObject({statusCode:403})
 expect(fixture.writes).toEqual([])
})
test('same-event criterion attachment and removal retain their intended target',async()=>{
 await expect(addCriteriaToRound('event-a','organizer','round-a','criterion-a')).resolves.toEqual({success:true})
 expect(fixture.writes[0]).toEqual({table:'competition_round_criteria',action:'insert',payload:{round_id:'round-a',criteria_id:'criterion-a'}})
 await expect(removeCriteriaFromRound('event-a','organizer','round-a','criterion-a')).resolves.toEqual({success:true})
})
test('round category and next-round relationships reject foreign resources and self-progression',async()=>{
 for(const payload of [{categoryId:'category-b'},{nextRoundId:'round-b'},{nextRoundId:'round-a'}]) await expect(updateRound('event-a','organizer','round-a',payload)).rejects.toMatchObject({statusCode:expect.any(Number)})
 await expect(createRound('event-a','organizer',{name:'New',weight:0,nextRoundId:'round-b'})).rejects.toMatchObject({statusCode:403})
 expect(fixture.writes).toEqual([])
})
test('failed permission resource lookup never falls through to a membership mutation',async()=>{
 fixture.error={table:'competition_rounds',error:{message:'Fixture unavailable'}}
 await expect(addCriteriaToRound('event-a','organizer','round-a','criterion-a')).rejects.toMatchObject({statusCode:500})
 expect(fixture.writes).toEqual([])
})
test('foreign category/round edits and deletes reject rather than report a successful no-op',async()=>{
 await expect(updateCategory('event-a','organizer','category-b',{name:'Changed'})).rejects.toMatchObject({statusCode:403})
 await expect(deleteCategory('event-a','organizer','category-b')).rejects.toMatchObject({statusCode:403})
 await expect(deleteRound('event-a','organizer','round-b')).rejects.toMatchObject({statusCode:403})
 expect(fixture.writes).toEqual([])
})
