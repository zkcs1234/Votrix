import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const eventId = process.argv[2]
const email = process.argv[3] || 'testjudge@example.com'

if (!eventId) {
  console.error('Usage: node tmp_debug_register.mjs <eventId> [email]')
  process.exit(1)
}

// 1) Find a real organizer for this event
const { data: ev } = await client
  .from('events')
  .select('id, organizer_id, title')
  .eq('id', eventId)
  .single()
console.log('Event:', JSON.stringify(ev, null, 2))

// 2) Find or create the user with email
let userId
const { data: existingUser } = await client
  .from('users')
  .select('id, email, role')
  .eq('email', email)
  .maybeSingle()

if (existingUser) {
  console.log('Found existing user:', existingUser.id)
  userId = existingUser.id
} else {
  const { data: newUser, error } = await client
    .from('users')
    .insert({
      email,
      password: '$2b$10$placeholder.hash.placeholder.hash.placeholder.hash.placeholder.hash.placeholder',
      role: 'voter',
      must_change_password: true,
    })
    .select('id')
    .single()
  if (error) {
    console.error('Failed to create user:', error.message)
    process.exit(1)
  }
  userId = newUser.id
  console.log('Created user:', userId)
}

// 3) Direct insert into event_participants (mirrors what registerJudge does)
const { data: ep, error: epErr } = await client
  .from('event_participants')
  .upsert({
    event_id: eventId,
    user_id: userId,
    participant_type: 'COMPETITION_JUDGE',
    first_name: null,
    last_name: null,
    metadata: {},
  }, { onConflict: 'event_id,user_id' })
  .select()
  .single()

if (epErr) {
  console.error('Failed to upsert event_participants:', epErr.message)
  process.exit(1)
}
console.log('Wrote event_participants row:', ep)

// 4) Now read it back the way the fixed listJudges does
const { data: judges, error: listErr } = await client
  .from('event_participants')
  .select(`
    id,
    has_scored,
    first_name,
    last_name,
    metadata,
    user_id,
    users!inner (id, email)
  `)
  .eq('event_id', eventId)
  .eq('participant_type', 'COMPETITION_JUDGE')

console.log('Read back:')
console.log(JSON.stringify(judges, null, 2))
if (listErr) console.error('Read error:', listErr.message)
