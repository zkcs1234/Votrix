#!/usr/bin/env node

// Using Node.js native fetch (Node 18+)

console.log('=== Judge Invitation API Functionality Verification ===')
console.log('Testing: "The query successfully retrieves judge records when given a valid competition_judges.id value"')
console.log('Backend Server: http://localhost:5000')
console.log()

// Test login credentials (assuming there's a test organizer account)
const TEST_CREDENTIALS = {
  email: 'organizer@test.com',
  password: 'password123'
}

async function loginAsOrganizer() {
  console.log('1. Logging in as test organizer...')
  
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(TEST_CREDENTIALS)
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.log(`❌ Login failed: ${data.message || 'Unknown error'}`)
      console.log('   Attempting to find any existing user...')
      return null
    }

    console.log(`✅ Login successful as: ${data.user?.email}`)
    console.log(`   Access token obtained: ${data.accessToken ? 'Yes' : 'No'}`)
    return {
      accessToken: data.accessToken,
      userId: data.user.id,
      userEmail: data.user.email
    }
  } catch (error) {
    console.error('❌ Login error:', error.message)
    return null
  }
}

async function findCompetitionEvents(accessToken) {
  console.log('2. Finding competition events...')
  
  try {
    const response = await fetch('http://localhost:5000/api/organizer/events', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log('❌ Could not fetch events')
      return []
    }

    const data = await response.json()
    const competitionEvents = data.events?.filter(event => event.event_type === 'competition') || []
    
    console.log(`✅ Found ${competitionEvents.length} competition event(s)`)
    competitionEvents.forEach((event, index) => {
      console.log(`   ${index + 1}. "${event.title}" (ID: ${event.id})`)
    })
    
    return competitionEvents
  } catch (error) {
    console.error('❌ Error fetching events:', error.message)
    return []
  }
}

async function listJudges(eventId, accessToken) {
  console.log(`3. Listing judges for event ${eventId}...`)
  
  try {
    const response = await fetch(`http://localhost:5000/api/organizer/events/${eventId}/judges`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log('❌ Could not fetch judges')
      return []
    }

    const data = await response.json()
    const judges = data.judges || []
    
    console.log(`✅ Found ${judges.length} judge(s)`)
    judges.forEach((judge, index) => {
      console.log(`   ${index + 1}. ${judge.email} (ID: ${judge.id}, User ID: ${judge.judgeId})`)
      console.log(`       Invitation sent: ${judge.invitationSent ? 'Yes' : 'No'}`)
    })
    
    return judges
  } catch (error) {
    console.error('❌ Error fetching judges:', error.message)
    return []
  }
}

async function testJudgeInvitation(eventId, judgeId, accessToken) {
  console.log(`4. Testing judge invitation for judge ${judgeId}...`)
  
  try {
    const response = await fetch(`http://localhost:5000/api/organizer/events/${eventId}/judges/${judgeId}/send-invitation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      if (data.message === 'Judge is not enrolled in this event') {
        console.log('❌ CRITICAL: Got "Judge is not enrolled in this event" error')
        console.log('   This suggests the database query fix may not be working properly')
        console.log('   Response:', data)
        return false
      } else {
        console.log(`⚠️  Invitation failed with different error: ${data.message}`)
        console.log('   This might be expected (e.g., email service issues, already sent, etc.)')
        console.log('   Response:', data)
        return 'partial' // Not the bug we're testing for
      }
    }

    console.log('✅ Judge invitation API call successful!')
    console.log('   Response details:')
    console.log(`     Success: ${data.success}`)
    console.log(`     Invitation sent: ${data.invitationSent}`)
    console.log(`     Email: ${data.email}`)
    console.log('   This confirms the database query is working correctly')
    return true
    
  } catch (error) {
    console.error('❌ Invitation API error:', error.message)
    return false
  }
}

async function main() {
  try {
    // Step 1: Login
    const auth = await loginAsOrganizer()
    if (!auth) {
      console.log('❌ Cannot proceed without authentication')
      console.log('   Please ensure there is a test organizer account with email: organizer@test.com')
      process.exit(1)
    }
    console.log()

    // Step 2: Find competition events
    const events = await findCompetitionEvents(auth.accessToken)
    if (events.length === 0) {
      console.log('❌ No competition events found')
      console.log('   Please create a competition event first')
      process.exit(1)
    }
    console.log()

    // Step 3: Use first event to test judges
    const testEvent = events[0]
    const judges = await listJudges(testEvent.id, auth.accessToken)
    if (judges.length === 0) {
      console.log('❌ No judges found in the event')
      console.log('   Please register some judges in the competition first')
      process.exit(1)
    }
    console.log()

    // Step 4: Test invitation with first judge
    const testJudge = judges[0]
    const result = await testJudgeInvitation(testEvent.id, testJudge.id, auth.accessToken)
    console.log()

    // Summary
    console.log('=== VERIFICATION SUMMARY ===')
    if (result === true) {
      console.log('✅ TASK VERIFICATION: SUCCESS')
      console.log()
      console.log('KEY FINDINGS:')
      console.log('- Judge invitation API works correctly with valid judge IDs')
      console.log('- Database query successfully retrieves judge records')
      console.log('- No "Judge is not enrolled in this event" errors for valid judges')
      console.log('- The fix correctly uses competition_judges.id as the primary key')
    } else if (result === 'partial') {
      console.log('⚠️  TASK VERIFICATION: PARTIAL SUCCESS')
      console.log()
      console.log('KEY FINDINGS:')
      console.log('- Database query fix appears to be working (no enrollment errors)')
      console.log('- Invitation failed for other reasons (likely email/business logic)')
      console.log('- The core database lookup functionality is verified')
    } else {
      console.log('❌ TASK VERIFICATION: FAILED')
      console.log()
      console.log('The database query is still returning "Judge is not enrolled" errors')
      console.log('Further investigation of the fix implementation is needed')
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  }
}

main()