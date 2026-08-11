import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Show all event types and counts
const { data: events } = await client
  .from('events')
  .select('id, title, event_type, status')

console.log('Events by type:')
const byType = {}
for (const e of events ?? []) {
  byType[e.event_type] = (byType[e.event_type] ?? 0) + 1
}
console.log(byType)

console.log('\nLast 10 events:')
console.log(JSON.stringify(events?.slice(-10), null, 2))
