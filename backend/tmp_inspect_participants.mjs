import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// 1) Distinct participant_types in the table
const { data: types } = await client
  .from('event_participants')
  .select('participant_type')
console.log('Distinct participant_type values:', [...new Set(types?.map((r) => r.participant_type))])

// 2) Count rows per type
for (const t of [...new Set(types?.map((r) => r.participant_type))]) {
  const { count } = await client
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('participant_type', t)
  console.log(`  ${t}: ${count} rows`)
}

// 3) Sample row
const { data: sample } = await client
  .from('event_participants')
  .select('*')
  .limit(3)
console.log('Sample rows:')
console.log(JSON.stringify(sample, null, 2))
