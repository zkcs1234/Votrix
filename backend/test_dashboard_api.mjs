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

// Import the actual service functions
async function testDashboard() {
  console.log('🔍 Testing voter dashboard with actual service functions...\n')

  const voterId = '806297d2-c758-42bd-9171-26fd2911ae7b'  // Your voter ID

  // Dynamically import the services
  const { getVoterDashboard } = await import('./src/services/voter.service.js')

  try {
    const dashboard = await getVoterDashboard(voterId)
    
    console.log('📊 Dashboard Response:')
    console.log(JSON.stringify(dashboard, null, 2))
    
    console.log('\n📈 Stats Summary:')
    console.log(`   Total: ${dashboard.stats.total}`)
    console.log(`   Assigned: ${dashboard.stats.assigned}`)
    console.log(`   Active: ${dashboard.stats.active}`)
    console.log(`   Completed: ${dashboard.stats.completed}`)
    
    if (dashboard.events && dashboard.events.length > 0) {
      console.log('\n📋 Events:')
      dashboard.events.forEach((event, i) => {
        console.log(`   ${i + 1}. ${event.title}`)
        console.log(`      Type: ${event.eventType}`)
        console.log(`      Bucket: ${event.bucket}`)
        console.log(`      Status: ${event.statusLabel}`)
      })
    } else {
      console.log('\n⚠️  No events returned!')
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    console.error(err)
  }
}

testDashboard().then(() => {
  console.log('\n✅ Test complete')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
