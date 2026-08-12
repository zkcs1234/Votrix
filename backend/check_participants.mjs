#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDatabase() {
  console.log('🔍 Checking database state...\n')

  // Check event_participants table
  const { data: participants, error: pError } = await supabase
    .from('event_participants')
    .select('event_id, user_id, participant_type, has_voted, has_scored, has_responded')
    .limit(10)

  console.log('📊 event_participants table:')
  if (pError) {
    console.error('❌ Error:', pError.message)
  } else {
    console.log(`   Total rows (sample): ${participants.length}`)
    if (participants.length > 0) {
      console.log('   Sample data:')
      participants.forEach((p, i) => {
        console.log(`   ${i + 1}. Event ${p.event_id}, User ${p.user_id}, Type: ${p.participant_type}`)
      })
    } else {
      console.log('   ⚠️ No data found in event_participants table!')
    }
  }

  // Count by participant type
  const { count: voterCount } = await supabase
    .from('event_participants')
    .select('*', { count: 'exact', head: true })
    .eq('participant_type', 'ELECTION_VOTER')

  const { count: judgeCount } = await supabase
    .from('event_participants')
    .select('*', { count: 'exact', head: true })
    .eq('participant_type', 'COMPETITION_JUDGE')

  const { count: respondentCount } = await supabase
    .from('event_participants')
    .select('*', { count: 'exact', head: true })
    .eq('participant_type', 'POLLING_RESPONDENT')

  console.log('\n📈 Counts by participant type:')
  console.log(`   Election Voters: ${voterCount ?? 0}`)
  console.log(`   Competition Judges: ${judgeCount ?? 0}`)
  console.log(`   Polling Respondents: ${respondentCount ?? 0}`)

  // Check old event_voters table (if it exists)
  const { data: oldVoters, error: vError } = await supabase
    .from('event_voters')
    .select('event_id, voter_id, is_judge, has_voted')
    .limit(10)

  console.log('\n📊 event_voters table (legacy):')
  if (vError) {
    console.log('   ⚠️ Table may not exist or is not accessible:', vError.message)
  } else {
    console.log(`   Total rows (sample): ${oldVoters.length}`)
    if (oldVoters.length > 0) {
      console.log('   Sample data:')
      oldVoters.forEach((v, i) => {
        console.log(`   ${i + 1}. Event ${v.event_id}, Voter ${v.voter_id}, Judge: ${v.is_judge}`)
      })
    }
  }

  // Check v_event_voters view
  const { data: viewVoters, error: viewError } = await supabase
    .from('v_event_voters')
    .select('event_id, voter_id, is_judge, has_voted')
    .limit(10)

  console.log('\n📊 v_event_voters view:')
  if (viewError) {
    console.log('   ⚠️ View may not exist or is not accessible:', viewError.message)
  } else {
    console.log(`   Total rows (sample): ${viewVoters.length}`)
    if (viewVoters.length > 0) {
      console.log('   Sample data:')
      viewVoters.forEach((v, i) => {
        console.log(`   ${i + 1}. Event ${v.event_id}, Voter ${v.voter_id}, Judge: ${v.is_judge}`)
      })
    }
  }

  // Check events
  const { count: eventCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📅 Total events: ${eventCount ?? 0}`)

  // Check users with voter role
  const { count: userCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'voter')

  console.log(`👤 Total voter accounts: ${userCount ?? 0}`)

  console.log('\n✅ Database check complete!')
}

checkDatabase().catch(console.error)
