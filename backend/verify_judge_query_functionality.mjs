#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

console.log('=== Judge Invitation Query Functionality Verification ===')
console.log('Testing Task: "The query successfully retrieves judge records when given a valid competition_judges.id value"')
console.log()

async function findTestData() {
  console.log('1. Finding available test data...')
  
  // Find events with competition judges
  const { data: events, error: eventsErr } = await client
    .from('event_participants')
    .select(`
      event_id, 
      id,
      user_id,
      first_name,
      last_name,
      participant_type,
      events (id, title, event_type),
      users (id, email, must_change_password)
    `)
    .eq('participant_type', 'COMPETITION_JUDGE')
    .limit(5)

  if (eventsErr) {
    console.error('❌ Error finding test events:', eventsErr.message)
    return null
  }

  if (!events || events.length === 0) {
    console.log('⚠️  No competition judges found in database')
    return null
  }

  console.log(`✅ Found ${events.length} competition judge(s)`)
  events.forEach((judge, index) => {
    console.log(`   ${index + 1}. Judge ID: ${judge.id}, Event: "${judge.events?.title}", User: ${judge.users?.email}`)
  })
  console.log()

  return events[0] // Return first judge for testing
}

async function testCorrectedQuery(testJudge) {
  console.log('2. Testing the corrected database query...')
  console.log(`   Judge ID (competition_judges.id): ${testJudge.id}`)
  console.log(`   Event ID: ${testJudge.event_id}`)
  console.log()

  // This is the CORRECTED query from the fix (using 'id' field)
  const { data: judgeRow, error: judgeRowErr } = await client
    .from('event_participants')  // This is the new table name for competition_judges
    .select('user_id, users (id, email, must_change_password)')
    .eq('id', testJudge.id)  // CORRECT: Using primary key 'id'
    .eq('event_id', testJudge.event_id)
    .maybeSingle()

  if (judgeRowErr) {
    console.error('❌ Database query error:', judgeRowErr.message)
    return false
  }

  if (!judgeRow) {
    console.error('❌ Query returned no results - judge not found')
    console.log('   This should NOT happen with a valid judge ID')
    return false
  }

  console.log('✅ Query successful - judge record retrieved!')
  console.log('   Results:')
  console.log(`     user_id: ${judgeRow.user_id}`)
  console.log(`     users.id: ${judgeRow.users?.id}`)
  console.log(`     users.email: ${judgeRow.users?.email}`)
  console.log(`     users.must_change_password: ${judgeRow.users?.must_change_password}`)
  console.log()

  // Verify data integrity
  if (judgeRow.user_id === judgeRow.users?.id) {
    console.log('✅ Foreign key relationship verified - user_id matches users.id')
  } else {
    console.error('❌ Data integrity issue - user_id does not match users.id')
    return false
  }

  return true
}

async function testInvalidJudgeId(eventId) {
  console.log('3. Testing with invalid judge ID (should fail appropriately)...')
  
  const fakeJudgeId = '00000000-0000-0000-0000-000000000000'
  console.log(`   Testing with fake judge ID: ${fakeJudgeId}`)

  const { data: judgeRow, error: judgeRowErr } = await client
    .from('event_participants')
    .select('user_id, users (id, email, must_change_password)')
    .eq('id', fakeJudgeId)  // Using non-existent ID
    .eq('event_id', eventId)
    .maybeSingle()

  if (judgeRowErr) {
    console.error('❌ Unexpected database error:', judgeRowErr.message)
    return false
  }

  if (!judgeRow) {
    console.log('✅ Correctly returned null for invalid judge ID')
    console.log('   This would properly trigger "Judge is not enrolled in this event" error')
    return true
  } else {
    console.error('❌ Unexpectedly found a judge record for fake ID')
    return false
  }
}

async function simulateFullInvitationFlow(testJudge) {
  console.log('4. Simulating full invitation flow (without sending email)...')

  try {
    // Step 1: Query judge record (the corrected query)
    const { data: judgeRow, error: judgeRowErr } = await client
      .from('event_participants')
      .select('user_id, users (id, email, must_change_password)')
      .eq('id', testJudge.id)
      .eq('event_id', testJudge.event_id)
      .maybeSingle()

    if (judgeRowErr) throw new Error(`Database error: ${judgeRowErr.message}`)
    if (!judgeRow) throw new Error('Judge is not enrolled in this event')

    // Step 2: Process the judge data (like the service does)
    const enrollment = { users: judgeRow.users, user_id: judgeRow.user_id }
    const judgeEmail = enrollment.users?.email
    const isExistingAccount = !enrollment.users?.must_change_password

    console.log('✅ Invitation flow completed successfully!')
    console.log('   Flow results:')
    console.log(`     Judge email: ${judgeEmail}`)
    console.log(`     Account type: ${isExistingAccount ? 'existing' : 'new'}`)
    console.log(`     Would send ${isExistingAccount ? 'existing' : 'new'} account invitation`)
    console.log()

    return true
  } catch (error) {
    console.error('❌ Invitation flow failed:', error.message)
    return false
  }
}

async function main() {
  try {
    // Find test data
    const testJudge = await findTestData()
    if (!testJudge) {
      console.log('❌ Cannot proceed without test data')
      console.log('   Recommendation: Create a competition event and register a judge first')
      process.exit(1)
    }

    // Run all tests
    const results = []
    
    results.push(await testCorrectedQuery(testJudge))
    results.push(await testInvalidJudgeId(testJudge.event_id))
    results.push(await simulateFullInvitationFlow(testJudge))

    // Summary
    console.log('=== VERIFICATION SUMMARY ===')
    const passCount = results.filter(Boolean).length
    const totalCount = results.length

    if (passCount === totalCount) {
      console.log(`✅ ALL TESTS PASSED (${passCount}/${totalCount})`)
      console.log()
      console.log('TASK VERIFICATION: SUCCESS')
      console.log('The query successfully retrieves judge records when given a valid competition_judges.id value')
      console.log()
      console.log('KEY FINDINGS:')
      console.log('- Database query correctly uses primary key (id) field')
      console.log('- Foreign key relationship to users table works correctly')
      console.log('- Query returns proper data for invitation processing')
      console.log('- Invalid judge IDs are handled appropriately')
      console.log('- Full invitation flow processes retrieved data without errors')
    } else {
      console.log(`❌ SOME TESTS FAILED (${passCount}/${totalCount})`)
      console.log('TASK VERIFICATION: FAILED')
      console.log('The query functionality needs additional investigation')
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  }
}

main()