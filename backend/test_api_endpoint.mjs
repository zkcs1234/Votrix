#!/usr/bin/env node
/**
 * Test the actual voter dashboard API endpoint
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '.env') })

const voterId = '806297d2-c758-42bd-9171-26fd2911ae7b'

async function testEndpoint() {
  console.log('🧪 Testing voter dashboard API endpoint...\n')

  // Import and call the actual service function
  const { getVoterDashboard } = await import('./src/services/voter.service.js')

  try {
    console.log(`📞 Calling getVoterDashboard(${voterId})...`)
    const result = await getVoterDashboard(voterId)
    
    console.log('\n✅ Success! Response:')
    console.log(JSON.stringify(result, null, 2))

    console.log('\n📊 Dashboard Stats:')
    console.log(`   Total: ${result.stats.total}`)
    console.log(`   Assigned: ${result.stats.assigned}`)
    console.log(`   Active: ${result.stats.active}`)
    console.log(`   Completed: ${result.stats.completed}`)

    if (result.stats.total === 0) {
      console.log('\n❌ PROBLEM: Dashboard shows 0 total events!')
      console.log('   This means the list functions returned empty arrays.')
      console.log('   Let me check each module separately...\n')

      const { listVoterElectionEvents } = await import('./src/services/election.service.js')
      const { listJudgeCompetitionEvents } = await import('./src/services/pageant.service.js')
      const { listVoterPollEvents } = await import('./src/services/polling.service.js')

      console.log('🔍 Testing individual list functions:')
      
      try {
        const elections = await listVoterElectionEvents(voterId)
        console.log(`   ✅ listVoterElectionEvents: ${elections.length} events`)
        if (elections.length > 0) console.log('      Events:', elections.map(e => e.title || e.id))
      } catch (err) {
        console.log(`   ❌ listVoterElectionEvents ERROR: ${err.message}`)
      }

      try {
        const competitions = await listJudgeCompetitionEvents(voterId)
        console.log(`   ✅ listJudgeCompetitionEvents: ${competitions.length} events`)
        if (competitions.length > 0) console.log('      Events:', competitions.map(e => e.title || e.id))
      } catch (err) {
        console.log(`   ❌ listJudgeCompetitionEvents ERROR: ${err.message}`)
      }

      try {
        const polls = await listVoterPollEvents(voterId)
        console.log(`   ✅ listVoterPollEvents: ${polls.length} events`)
        if (polls.length > 0) console.log('      Events:', polls.map(e => e.title || e.id))
      } catch (err) {
        console.log(`   ❌ listVoterPollEvents ERROR: ${err.message}`)
      }
    } else {
      console.log('\n✅ Dashboard shows events correctly!')
      if (result.events && result.events.length > 0) {
        console.log('\n📋 Events:')
        result.events.forEach((evt, i) => {
          console.log(`   ${i + 1}. ${evt.title}`)
          console.log(`      Type: ${evt.eventType}`)
          console.log(`      Bucket: ${evt.bucket}`)
          console.log(`      Participant Type: ${evt.participantType}`)
        })
      }
    }

  } catch (err) {
    console.error('\n❌ Error calling getVoterDashboard:')
    console.error(err)
    
    if (err.message) console.error('\nError message:', err.message)
    if (err.statusCode) console.error('Status code:', err.statusCode)
    if (err.stack) console.error('\nStack trace:', err.stack)
  }
}

testEndpoint().then(() => {
  console.log('\n✅ Test complete\n')
  process.exit(0)
}).catch(err => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
