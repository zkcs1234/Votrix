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

const supabase = createClient(supabaseUrl, supabaseKey)

const voterId = '806297d2-c758-42bd-9171-26fd2911ae7b'

async function testQueries() {
  console.log('🔍 Testing exact queries our service functions use...\n')

  // Test listVoterPollEvents query
  console.log('1️⃣ Testing listVoterPollEvents query:')
  const { data: pollData, error: pollError } = await supabase
    .from('event_participants')
    .select(`
      has_responded,
      events (
        id,
        title,
        description,
        banner,
        status,
        event_type,
        polling_enabled,
        poll_anonymous,
        poll_allow_multiple_submissions,
        poll_expires_at,
        start_date,
        end_date,
        organization_id
      )
    `)
    .eq('user_id', voterId)
    .eq('participant_type', 'POLLING_RESPONDENT')

  if (pollError) {
    console.log(`   ❌ Error: ${pollError.message}`)
  } else {
    console.log(`   ✅ Success! Found ${pollData?.length || 0} rows`)
    if (pollData && pollData.length > 0) {
      pollData.forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.events?.title} (${p.events?.event_type})`)
        console.log(`         Has responded: ${p.has_responded}`)
      })
    }
  }

  // Test listVoterElectionEvents query
  console.log('\n2️⃣ Testing listVoterElectionEvents query:')
  const { data: electionData, error: electionError } = await supabase
    .from('event_participants')
    .select(`
      has_voted,
      events (
        id,
        title,
        description,
        banner,
        voting_enabled,
        results_visibility,
        status,
        event_type,
        start_date,
        end_date,
        organization_id
      )
    `)
    .eq('user_id', voterId)
    .eq('participant_type', 'ELECTION_VOTER')

  if (electionError) {
    console.log(`   ❌ Error: ${electionError.message}`)
  } else {
    console.log(`   ✅ Success! Found ${electionData?.length || 0} rows`)
  }

  // Test listJudgeCompetitionEvents query
  console.log('\n3️⃣ Testing listJudgeCompetitionEvents query:')
  const { data: compData, error: compError } = await supabase
    .from('event_participants')
    .select(`
      has_scored,
      events (
        id,
        title,
        description,
        banner,
        scoring_enabled,
        status,
        event_type,
        organization_id
      )
    `)
    .eq('user_id', voterId)
    .eq('participant_type', 'COMPETITION_JUDGE')

  if (compError) {
    console.log(`   ❌ Error: ${compError.message}`)
  } else {
    console.log(`   ✅ Success! Found ${compData?.length || 0} rows`)
  }

  // Summary
  const total = (pollData?.length || 0) + (electionData?.length || 0) + (compData?.length || 0)
  console.log(`\n📊 Total events that should appear in dashboard: ${total}`)
  
  if (total === 0) {
    console.log('\n⚠️  PROBLEM: No events found! Voter is not enrolled in any events.')
    console.log('   The dashboard will show 0 assigned events because there really are 0.')
  } else {
    console.log(`\n✅ ${total} event(s) should appear in dashboard.`)
  }
}

testQueries().then(() => {
  console.log('\n✅ Test complete\n')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
