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

async function debugVoter() {
  console.log('🔍 Debugging voter data...\n')

  // Get all voters with role='voter'
  const { data: voters, error: voterError } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('role', 'voter')

  if (voterError) {
    console.error('❌ Error fetching voters:', voterError.message)
    return
  }

  console.log(`👤 Found ${voters.length} user(s) with role='voter':\n`)

  for (const voter of voters) {
    console.log(`📧 ${voter.email} (ID: ${voter.id})`)

    // Check event_participants for this voter
    const { data: participants, error: pError } = await supabase
      .from('event_participants')
      .select('*')
      .eq('user_id', voter.id)

    if (pError) {
      console.log(`   ❌ Error checking event_participants: ${pError.message}`)
    } else if (!participants || participants.length === 0) {
      console.log(`   ⚠️  NOT enrolled in any events in event_participants table!`)
    } else {
      console.log(`   ✅ Enrolled in ${participants.length} event(s):`)
      participants.forEach((p, i) => {
        console.log(`      ${i + 1}. Event: ${p.event_id}`)
        console.log(`         Type: ${p.participant_type}`)
        console.log(`         Has voted: ${p.has_voted}`)
        console.log(`         Has scored: ${p.has_scored}`)
        console.log(`         Has responded: ${p.has_responded}`)
      })
    }

    // Check via view
    const { data: viewData, error: viewError } = await supabase
      .from('v_event_voters')
      .select('*')
      .eq('voter_id', voter.id)

    if (viewError) {
      console.log(`   ❌ Error checking v_event_voters view: ${viewError.message}`)
    } else if (viewData && viewData.length > 0) {
      console.log(`   📋 View v_event_voters shows ${viewData.length} enrollment(s)`)
    }

    console.log('')
  }

  // Check all events
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, event_type, status')

  if (!eventsError && events) {
    console.log(`\n📅 Events in system: ${events.length}`)
    events.forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.title} (${e.event_type}) - ${e.status}`)
      console.log(`      ID: ${e.id}`)
    })
  }

  // Check how getVoterDashboard would query
  console.log('\n🔍 Testing dashboard queries:')
  
  if (voters.length > 0) {
    const testVoterId = voters[0].id
    
    // Test election query
    const { data: electionData, error: electionError } = await supabase
      .from('event_participants')
      .select(`
        has_voted,
        events (
          id,
          title,
          event_type
        )
      `)
      .eq('user_id', testVoterId)
      .eq('participant_type', 'ELECTION_VOTER')

    console.log(`\n   Election query (participant_type='ELECTION_VOTER'):`)
    if (electionError) {
      console.log(`   ❌ Error: ${electionError.message}`)
    } else {
      console.log(`   ✅ Found ${electionData?.length || 0} election enrollment(s)`)
      if (electionData?.length > 0) {
        electionData.forEach(e => console.log(`      - ${e.events?.title} (${e.events?.event_type})`))
      }
    }

    // Test competition query
    const { data: compData, error: compError } = await supabase
      .from('event_participants')
      .select(`
        has_scored,
        events (
          id,
          title,
          event_type
        )
      `)
      .eq('user_id', testVoterId)
      .eq('participant_type', 'COMPETITION_JUDGE')

    console.log(`\n   Competition query (participant_type='COMPETITION_JUDGE'):`)
    if (compError) {
      console.log(`   ❌ Error: ${compError.message}`)
    } else {
      console.log(`   ✅ Found ${compData?.length || 0} judge enrollment(s)`)
      if (compData?.length > 0) {
        compData.forEach(e => console.log(`      - ${e.events?.title} (${e.events?.event_type})`))
      }
    }

    // Test polling query
    const { data: pollData, error: pollError } = await supabase
      .from('event_participants')
      .select(`
        has_responded,
        events (
          id,
          title,
          event_type
        )
      `)
      .eq('user_id', testVoterId)
      .eq('participant_type', 'POLLING_RESPONDENT')

    console.log(`\n   Polling query (participant_type='POLLING_RESPONDENT'):`)
    if (pollError) {
      console.log(`   ❌ Error: ${pollError.message}`)
    } else {
      console.log(`   ✅ Found ${pollData?.length || 0} respondent enrollment(s)`)
      if (pollData?.length > 0) {
        pollData.forEach(e => console.log(`      - ${e.events?.title} (${e.events?.event_type})`))
      }
    }
  }

  console.log('\n✅ Debug complete!')
}

debugVoter().then(() => {
  console.log('')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
