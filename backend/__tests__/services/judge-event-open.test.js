import {beforeEach,expect,test,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'

const fixture=vi.hoisted(()=>({client:null,requests:[],rows:{},modern:vi.fn()}))
vi.mock('../../src/foundation/db.js',async original=>({...await original(),db:()=>fixture.client}))
vi.mock('../../src/services/competition-workflow.service.js',()=>({judgeSheet:fixture.modern}))
import {assertJudgeEnrolled} from '../../src/services/pageant.service.js'
import {getJudgeSessionView} from '../../src/services/competition-session.service.js'

let ids
beforeEach(()=>{
 fixture.requests=[];fixture.modern.mockReset().mockResolvedValue(null)
 ids=Object.fromEntries(['event','judge','participant','round','contestant','criterion','minor','session'].map(name=>[name,randomUUID()]))
 fixture.rows={
  events:[{id:ids.event,title:'Assigned competition',status:'active',event_type:'competition_scoring',scoring_config:{},divisions_enabled:false,organizations:{id:randomUUID(),organization_name:'Organizer organization'}}],
  event_participants:[{id:ids.participant,event_id:ids.event,user_id:ids.judge,participant_type:'COMPETITION_JUDGE',is_active:true,judge_role:'judge',has_scored:false,users:{id:ids.judge,account_status:'active',role:'participant'}}],
  competition_judge_assignments:[{participant_id:ids.participant,scope:'round',scope_id:ids.round}],
  v_competition_active_session:[{id:ids.session,event_id:ids.event,status:'active',current_round_id:ids.round,active_contestant_id:ids.contestant,contestant_order:[ids.contestant],current_contestant_order:0}],
  competition_rounds:[{id:ids.round,event_id:ids.event,name:'Preliminary',category_id:null}],
  competition_contestants:[{id:ids.contestant,event_id:ids.event,name:'Assigned contestant',contestant_number:1,division_id:null}],
  competition_round_criteria:[{round_id:ids.round,criteria_id:ids.criterion}],
  competition_criteria:[{id:ids.criterion,event_id:ids.event,name:'Configured criterion',percentage:100,min_score:1,max_score:100}],
  competition_minor_criteria:[{id:ids.minor,event_id:ids.event,criteria_id:ids.criterion,name:'Configured minor',score_type:'range_1_10',is_active:true,display_order:0}],
  competition_session_judge_scores:[],
 }
 // Isolated transport fixture; no database rows, schema or live authentication
 // are created. Use the real SDK to assert its serialized PostgREST request.
 fixture.client=createClient('https://judge-flow-test.supabase.co','test-only-server-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input)),table=url.pathname.split('/').at(-1),select=url.searchParams.get('select')??''
  fixture.requests.push({table,select,params:Object.fromEntries(url.searchParams)})
  if(table==='event_participants'&&url.searchParams.has('events.status')&&!select.includes('events!inner'))
   return new Response(JSON.stringify({code:'PGRST108',message:"'events' is not an embedded resource in this request"}),{status:400,headers:{'Content-Type':'application/json'}})
  let rows=(fixture.rows[table]??[]).map(row=>({...row}))
  for(const [key,value]of url.searchParams){
   if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3))
   if(value.startsWith('in.('))rows=rows.filter(row=>value.slice(4,-1).split(',').includes(String(row[key])))
  }
  if(table==='event_participants'&&select.includes('events!inner')){
   rows=rows.flatMap(row=>{const event=fixture.rows.events.find(e=>e.id===row.event_id);return event&&event.status!=='archived'?[{...row,events:{status:event.status}}]:[]})
  }
  return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}})
 }}})
})

test('enrollment request explicitly embeds the event filtered by status and retains judge/event/type predicates',async()=>{
 await expect(assertJudgeEnrolled(ids.event,ids.judge)).resolves.toMatchObject({event_id:ids.event,user_id:ids.judge})
 expect(fixture.requests).toContainEqual(expect.objectContaining({table:'event_participants',select:expect.stringContaining('events!inner(status)'),params:expect.objectContaining({event_id:`eq.${ids.event}`,user_id:`eq.${ids.judge}`,participant_type:'eq.COMPETITION_JUDGE','events.status':'neq.archived'})}))
})
test('assigned judge opens the current event, round criteria/minors and authorized contestant through the real session-view service',async()=>{
 const view=await getJudgeSessionView(ids.event,ids.judge)
 expect(view.event).toMatchObject({id:ids.event,title:'Assigned competition'})
 expect(view.session.currentRoundId).toBe(ids.round)
 expect(view.roundName).toBe('Preliminary')
 expect(view.criteria).toEqual([expect.objectContaining({id:ids.criterion,minors:[expect.objectContaining({id:ids.minor,minScore:1,maxScore:10})]})])
 expect(view.contestants.map(entry=>entry.id)).toEqual([ids.contestant])
 expect(fixture.requests.find(r=>r.table==='events').params.id).toBe(`eq.${ids.event}`)
})
test('opening another event or using an unenrolled judge remains forbidden',async()=>{
 await expect(getJudgeSessionView(randomUUID(),ids.judge)).rejects.toMatchObject({statusCode:403})
 await expect(getJudgeSessionView(ids.event,randomUUID())).rejects.toMatchObject({statusCode:403})
})
test('archived event exclusion still applies to the enrollment request',async()=>{
 fixture.rows.events[0].status='archived'
 await expect(assertJudgeEnrolled(ids.event,ids.judge)).rejects.toMatchObject({statusCode:403})
})
test('an existing versioned scoring context is returned unchanged without invoking the fallback enrollment query',async()=>{
 const modern={event:{id:ids.event},context:{judgeId:ids.judge,sessionId:ids.session,roundId:ids.round,rulesVersion:randomUUID()},criteria:[],contestants:[]}
 fixture.modern.mockResolvedValue(modern)
 expect(await getJudgeSessionView(ids.event,ids.judge)).toBe(modern)
 expect(fixture.requests).toEqual([])
})
