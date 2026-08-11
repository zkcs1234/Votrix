import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const eventId = process.argv[2]
if (!eventId) {
  console.error('Usage: node tmp_debug_listjudges.mjs <eventId>')
  process.exit(1)
}

console.log('Testing listJudges for event:', eventId)
console.log()

// 1) Direct read from event_participants (the new path)
const { data: epData, error: epErr } = await client
  .from('event_participants')
  .select(`
    id,
    has_scored,
    first_name,
    last_name,
    metadata,
    user_id,
    participant_type,
    users!inner (id, email)
  `)
  .eq('event_id', eventId)
  .eq('participant_type', 'COMPETITION_JUDGE')

console.log('--- event_participants (new path) ---')
console.log('rows:', epData?.length ?? 0)
console.log('error:', epErr?.message ?? 'none')
console.log(JSON.stringify(epData, null, 2))
console.log()

// 2) Through the legacy v_event_voters view (old broken path)
const { data: vData, error: vErr } = await client
  .from('v_event_voters')
  .select(`
    id,
    has_scored,
    first_name,
    last_name,
    metadata,
    voter_id,
    users (id, email)
  `)
  .eq('event_id', eventId)
  .eq('is_judge', true)

console.log('--- v_event_voters (old broken path) ---')
console.log('rows:', vData?.length ?? 0)
console.log('error:', vErr?.message ?? 'none')
console.log(JSON.stringify(vData, null, 2))
console.log()

// 3) Just the FK join test through view
const { data: joinTest, error: joinErr } = await client
  .from('v_event_voters')
  .select('id, users (id, email)')
  .eq('event_id', eventId)
  .limit(1)

console.log('--- view FK join test ---')
console.log('error:', joinErr?.message ?? 'none')
console.log(JSON.stringify(joinTest, null, 2))
