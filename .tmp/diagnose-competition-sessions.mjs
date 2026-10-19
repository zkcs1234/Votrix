import fs from 'node:fs/promises'
import dotenv from '../backend/node_modules/dotenv/lib/main.js'

const settings = {...dotenv.parse(await fs.readFile(new URL('../backend/.env',import.meta.url))),...process.env}
const base = new URL(settings.SUPABASE_URL)
const key = settings.SUPABASE_SERVICE_ROLE_KEY
const eventId = '3beb7871-cee3-42cf-8436-02c4d9af4bbd'
if (base.protocol !== 'https:' || !key) throw new Error('Supabase configuration missing')
const headers = {apikey:key,Authorization:`Bearer ${key}`}
async function read(table,select) {
  const url=new URL(`/rest/v1/${table}`,base)
  url.searchParams.set('event_id',`eq.${eventId}`)
  url.searchParams.set('select',select)
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)})
  if(!response.ok) throw new Error(`${table}: HTTP ${response.status}`)
  return response.json()
}
try {
  const [sessions,scores,results] = await Promise.all([
    read('competition_sessions','id,status,started_at,paused_at,completed_at,created_at,updated_at,current_round_id'),
    read('competition_session_judge_scores','session_id,is_locked,locked_criteria,updated_at'),
    read('competition_result_calculations','session_id,status'),
  ])
  const diagnostics=sessions.map(session=>{
    const rows=scores.filter(score=>score.session_id===session.id)
    return {...session,scoreRows:rows.length,fullyLockedRows:rows.filter(score=>score.is_locked).length,latestScoreUpdate:rows.map(score=>score.updated_at).filter(Boolean).sort().at(-1)??null,resultSnapshotStatuses:results.filter(result=>result.session_id===session.id).map(result=>result.status)}
  }).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
  const url=new URL('/rest/v1/competition_rule_versions?select=id&limit=0',base)
  const probe=await fetch(url,{method:'HEAD',headers,signal:AbortSignal.timeout(20000)})
  console.log(JSON.stringify({projectHost:base.hostname,eventId,sessions:diagnostics,workflowTableHttpStatus:probe.status,readOnly:true},null,2))
} catch(error) {
  console.error(JSON.stringify({error:error.name,cause:error.cause?.code??null,message:error.cause?.code?'Supabase connection failed':error.message}))
  process.exitCode=1
}
