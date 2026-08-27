import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function main() {
  const { data: events } = await supabase.from('events').select('id, title').order('created_at', { ascending: false }).limit(5)
  console.log('Recent events:', events)
  
  if (!events || events.length === 0) return
  
  const eventId = events.find(e => e.title.includes('competition') || e.title.includes('Competition') || true)?.id

  console.log('Using eventId:', eventId)
  
  const { data: ep } = await supabase.from('event_participants').select('user_id, participant_type').eq('event_id', eventId)
  console.log('Event participants:', ep)
  
  const { data: cj } = await supabase.from('competition_judges').select('id, user_id').eq('event_id', eventId)
  console.log('Competition judges:', cj)
  
  const { data: inv } = await supabase.from('invitations').select('voter_id, invitation_sent').eq('event_id', eventId)
  console.log('Invitations:', inv)
}

main()
