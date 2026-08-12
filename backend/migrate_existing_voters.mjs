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

async function migrateVoters() {
  console.log('🔄 Starting voter migration from event_voters to event_participants...\n')

  try {
    // 1. Get all data from event_voters
    const { data: oldVoters, error: fetchError } = await supabase
      .from('event_voters')
      .select('*')

    if (fetchError) {
      console.error('❌ Error fetching from event_voters:', fetchError.message)
      return
    }

    if (!oldVoters || oldVoters.length === 0) {
      console.log('✅ No data in event_voters table - nothing to migrate')
      return
    }

    console.log(`📊 Found ${oldVoters.length} rows in event_voters table`)

    // 2. Get all events to map event_type
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, event_type')

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError.message)
      return
    }

    const eventTypeMap = new Map(events.map(e => [e.id, e.event_type]))

    // 3. Transform and insert into event_participants
    let migrated = 0
    let skipped = 0
    let errors = 0

    for (const voter of oldVoters) {
      const eventType = eventTypeMap.get(voter.event_id)
      if (!eventType) {
        console.log(`⚠️  Skipping voter for unknown event ${voter.event_id}`)
        skipped++
        continue
      }

      // Determine participant_type based on is_judge flag and event_type
      let participantType
      if (voter.is_judge) {
        participantType = 'COMPETITION_JUDGE'
      } else if (eventType === 'polling') {
        participantType = 'POLLING_RESPONDENT'
      } else if (eventType === 'election') {
        participantType = 'ELECTION_VOTER'
      } else {
        participantType = 'ELECTION_VOTER' // default
      }

      // Check if already exists
      const { data: existing } = await supabase
        .from('event_participants')
        .select('id')
        .eq('event_id', voter.event_id)
        .eq('user_id', voter.voter_id)
        .maybeSingle()

      if (existing) {
        console.log(`   ⏭️  Already exists: Event ${voter.event_id}, User ${voter.voter_id}`)
        skipped++
        continue
      }

      // Insert into event_participants
      const { error: insertError } = await supabase
        .from('event_participants')
        .insert({
          event_id: voter.event_id,
          user_id: voter.voter_id,
          participant_type: participantType,
          has_voted: voter.has_voted ?? false,
          has_scored: voter.has_scored ?? false,
          has_responded: voter.has_voted ?? false, // Map has_voted to has_responded for old data
          first_name: voter.first_name,
          last_name: voter.last_name,
          metadata: voter.metadata ?? {},
          voting_nonce: voter.voting_nonce,
          created_at: voter.created_at,
          updated_at: voter.updated_at,
        })

      if (insertError) {
        console.error(`   ❌ Error migrating Event ${voter.event_id}, User ${voter.voter_id}:`, insertError.message)
        errors++
      } else {
        console.log(`   ✅ Migrated: Event ${voter.event_id}, User ${voter.voter_id} → ${participantType}`)
        migrated++
      }
    }

    console.log('\n📊 Migration Summary:')
    console.log(`   ✅ Migrated: ${migrated}`)
    console.log(`   ⏭️  Skipped (already exist): ${skipped}`)
    console.log(`   ❌ Errors: ${errors}`)

    if (migrated > 0) {
      console.log('\n✅ Migration complete! Voters should now appear in dashboard.')
    }

  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    console.error(err)
  }
}

migrateVoters().then(() => {
  console.log('\n🏁 Script complete')
  process.exit(0)
})
