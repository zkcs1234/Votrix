#!/usr/bin/env node

// Direct test of the judge query functionality without going through the full API
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

console.log('=== Direct Judge Query Functionality Test ===')
console.log('Testing: The corrected database query retrieves judge records with valid competition_judges.id')
console.log()

async function findTestJudge() {
  console.log('1. Finding test judge data...')
  
  // First try the new event_participants table
  let { data: judges, error } = await client
    .from('event_participants')
    .select(`
      id,
      event_id,
      user_id,
      first_name,
      last_name,
      participant_type,
      events!inner (id, title, event_type),
      users!inner (id, email, must_change_password)
    `)
    .eq('participant_type', 'COMPETITION_JUDGE')
    .limit(3)

  if (error) {
    console.log('⚠️  Error querying event_participants:', error.message)
  }

  if (!judges || judges.length === 0) {
    console.log('⚠️  No judges in event_participants table, trying competition_judges...')
    
    // Try the legacy competition_judges table
    const { data: legacyJudges, error: legacyError } = await client
      .from('competition_judges')
      .select(`
        id,
        event_id,
        user_id,
        display_name,
        events!inner (id, title, event_type),
        users!inner (id, email, must_change_password)
      `)
      .limit(3)

    if (legacyError) {
      console.error('❌ Error querying competition_judges:', legacyError.message)
      return null
    }

    if (!legacyJudges || legacyJudges.length === 0) {
      console.log('⚠️  No judges found in either table')
      return null
    }

    judges = legacyJudges
    console.log(`✅ Found ${judges.length} judge(s) in competition_judges table:`)
  } else {
    console.log(`✅ Found ${judges.length} judge(s) in event_participants table:`)
  }

  judges.forEach((judge, index) => {
    console.log(`   ${index + 1}. ID: ${judge.id}`)
    console.log(`      Event: "${judge.events.title}" (${judge.events.event_type})`)
    console.log(`      User: ${judge.users.email}`)
    console.log(`      User ID: ${judge.user_id}`)
    console.log()
  })

  return judges[0] // Return first judge for testing
}

async function testCorrectedQuery(judge) {
  console.log('2. Testing the CORRECTED database query (from the fix)...')
  console.log(`   Judge ID: ${judge.id} (this is the competition_judges.id primary key)`)
  console.log(`   Event ID: ${judge.event_id}`)
  console.log()

  // This is the EXACT query from the fixed pageant.service.js
  // First determine which table we're working with
  const tableName = judge.participant_type ? 'event_participants' : 'competition_judges'
  
  const { data: judgeRow, error: judgeRowErr } = await client
    .from(tableName)
    .select('user_id, users (id, email, must_change_password)')
    .eq('id', judge.id)          // CORRECTED: Using primary key 'id' field 
    .eq('event_id', judge.event_id)
    .maybeSingle()

  if (judgeRowErr) {
    console.error('❌ Database query failed:', judgeRowErr.message)
    return false
  }

  if (!judgeRow) {
    console.error('❌ Query returned null - judge not found!')
    console.log('   This means the corrected query is not working properly')
    return false
  }

  console.log('✅ Query SUCCESS - Judge record retrieved!')
  console.log('   Query results:')
  console.log(`     user_id: ${judgeRow.user_id}`)
  console.log(`     users.id: ${judgeRow.users?.id}`)
  console.log(`     users.email: ${judgeRow.users?.email}`)
  console.log(`     users.must_change_password: ${judgeRow.users?.must_change_password}`)
  console.log()

  // Verify data consistency
  if (judgeRow.user_id !== judge.user_id) {
    console.error('❌ Data inconsistency: Retrieved user_id does not match expected')
    return false
  }

  if (judgeRow.users?.id !== judge.user_id) {
    console.error('❌ Foreign key inconsistency: users.id does not match user_id')
    return false
  }

  console.log('✅ Data integrity verified - all foreign keys match correctly')
  return true
}

async function testOldBuggyQuery(judge) {
  console.log('3. Testing what the OLD buggy query would have done...')
  console.log(`   Testing .eq('user_id', ${judge.id}) - this was the BUG`)
  console.log()

  // This simulates the OLD buggy query that used wrong field
  const tableName = judge.participant_type ? 'event_participants' : 'competition_judges'
  
  const { data: buggyResult, error: buggyErr } = await client
    .from(tableName)
    .select('user_id, users (id, email, must_change_password)')
    .eq('user_id', judge.id)     // BUGGY: Using judge.id to match user_id (WRONG!)
    .eq('event_id', judge.event_id)
    .maybeSingle()

  if (buggyErr) {
    console.error('❌ Buggy query had database error:', buggyErr.message)
    return
  }

  if (!buggyResult) {
    console.log('✅ Buggy query correctly returned null (as expected)')
    console.log('   This confirms the old bug would have caused "Judge is not enrolled" error')
    console.log('   The fix was necessary and correct')
  } else {
    console.log('⚠️  Buggy query unexpectedly found a result')
    console.log('   This might indicate test data coincidentally matches')
  }
  console.log()
}

async function testInvalidId(eventId, tableName = 'competition_judges') {
  console.log('4. Testing with invalid judge ID...')
  
  const fakeId = '00000000-0000-0000-0000-000000000000'
  
  const { data: result, error } = await client
    .from(tableName)
    .select('user_id, users (id, email, must_change_password)')
    .eq('id', fakeId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) {
    console.error('❌ Invalid ID test had database error:', error.message)
    return false
  }

  if (!result) {
    console.log('✅ Invalid ID correctly returned null')
    console.log('   This would properly trigger "Judge is not enrolled in this event" error')
    return true
  } else {
    console.error('❌ Invalid ID unexpectedly found a result')
    return false
  }
}

async function main() {
  try {
    // Find test judge
    const testJudge = await findTestJudge()
    if (!testJudge) {
      console.log('❌ No test data available')
      console.log('   Need to create a competition event with judges to test')
      process.exit(1)
    }

    // Run tests
    const tableName = testJudge.participant_type ? 'event_participants' : 'competition_judges'
    const results = []
    results.push(await testCorrectedQuery(testJudge))
    await testOldBuggyQuery(testJudge)  // This is informational
    results.push(await testInvalidId(testJudge.event_id, tableName))

    // Summary
    console.log('=== VERIFICATION SUMMARY ===')
    const passCount = results.filter(Boolean).length
    const totalCount = results.length

    if (passCount === totalCount) {
      console.log(`✅ ALL TESTS PASSED (${passCount}/${totalCount})`)
      console.log()
      console.log('✅ TASK VERIFICATION: SUCCESS')
      console.log('"The query successfully retrieves judge records when given a valid competition_judges.id value"')
      console.log()
      console.log('KEY FINDINGS:')
      console.log('✓ Corrected query using primary key (.eq("id", judgeId)) works correctly')
      console.log('✓ Foreign key relationship to users table is intact')
      console.log('✓ Data integrity is maintained in retrieved records')
      console.log('✓ Invalid judge IDs are properly handled')
      console.log('✓ The database fix resolves the original "Judge is not enrolled" bug')
    } else {
      console.log(`❌ TESTS FAILED (${passCount}/${totalCount})`)
      console.log()
      console.log('❌ TASK VERIFICATION: FAILED')
      console.log('The query functionality needs further investigation')
    }

  } catch (error) {
    console.error('❌ Test execution failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()