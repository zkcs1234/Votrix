import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const { data } = await client
  .from('event_participants')
  .select('event_id, user_id, participant_type, events (id, title, event_type)')
  .eq('participant_type', 'COMPETITION_JUDGE')
  .limit(5)

console.log(JSON.stringify(data, null, 2))
