import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from '../backend/node_modules/dotenv/lib/main.js'

const root = path.resolve(import.meta.dirname, '..')
const local = dotenv.parse(await fs.readFile(path.join(root, 'backend/.env')))
const config = {...local, ...process.env}
const base = new URL(config.SUPABASE_URL)
if (base.protocol !== 'https:') throw new Error('Expected HTTPS Supabase project URL')
const key = config.SUPABASE_SERVICE_ROLE_KEY
if (!key) throw new Error('Supabase application key is missing')
const headers = {apikey:key, Authorization:`Bearer ${key}`}
const output = {checkedAt:new Date().toISOString(),projectHost:base.hostname,schemaOnly:true,definitions:{},checks:[]}
const wanted = [
  'events','competition_rounds','competition_criteria','competition_minor_criteria',
  'competition_contestants','competition_divisions','competition_sessions',
  'competition_session_judge_scores','competition_scores','competition_deductions',
  'competition_result_calculations','competition_judge_assignments','event_participants',
  'competition_round_criteria','competition_round_contestants','competition_round_results',
  'competition_rule_versions','competition_lineups','competition_judge_drafts',
  'competition_round_submissions','competition_eligibility_decisions',
  'competition_advancement_decisions','competition_rule_amendments',
  'competition_criterion_lock_history','v_competition_active_session',
  'election_ballot_sections','election_group_voters','user_participant_types',
]
try {
  const response = await fetch(new URL('/rest/v1/',base),{
    headers:{...headers,Accept:'application/openapi+json'},signal:AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    console.error(`Schema metadata request failed: HTTP ${response.status}`)
    process.exitCode=1
  } else {
    const schema = await response.json()
    for (const table of wanted) {
      const definition=schema.definitions?.[table]
      if (definition) output.definitions[table]=Object.fromEntries(Object.entries(definition.properties??{}).map(([name,value])=>[name,{type:value.type,format:value.format,enum:value.enum}]))
    }
    output.rpcNames=Object.keys(schema.paths??{}).filter(p=>p.startsWith('/rpc/')).map(p=>p.slice(5))
    console.log(JSON.stringify({projectHost:output.projectHost,availableTables:Object.keys(output.definitions),workflowRpcs:output.rpcNames.filter(n=>n.startsWith('competition_')),sqlManagementRpcs:output.rpcNames.filter(n=>/sql|query|exec|migrat/i.test(n))},null,2))
    for (let i=0;i<wanted.length;i+=5) {
      const batch=await Promise.all(wanted.slice(i,i+5).map(async table=>{
        const url=new URL(`/rest/v1/${table}`,base)
        url.searchParams.set('select','*')
        url.searchParams.set('limit','0')
        const response=await fetch(url,{method:'HEAD',headers:{...headers,Prefer:'count=exact'},signal:AbortSignal.timeout(20000)})
        return {table,status:response.status,count:response.headers.get('content-range')?.split('/').at(-1)??null}
      }))
      output.checks.push(...batch)
    }
    await fs.writeFile(path.join(root,'.tmp/supabase-migration-preflight.json'),JSON.stringify(output,null,2)+'\n')
    console.log(JSON.stringify(output.checks,null,2))
    console.log('Saved schema-only report to .tmp/supabase-migration-preflight.json; no credentials or record contents included.')
  }
} catch (error) {
  console.error(JSON.stringify({error:error.name,cause:error.cause?.code??null,message:error.cause?.code?'Supabase connection failed':error.message}))
  process.exitCode=1
}
