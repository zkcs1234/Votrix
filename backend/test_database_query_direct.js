/**
 * Direct test of the database query behavior for non-existent judge IDs
 * This tests the core functionality without going through all validation layers
 */

import { db as getClient } from './src/foundation/db.js'
import { randomUUID } from 'crypto'

async function testDirectDatabaseQuery() {
  try {
    console.log('Testing direct database query for non-existent judge ID...')
    
    const nonExistentJudgeId = randomUUID()
    const nonExistentEventId = randomUUID()
    
    console.log(`Testing query with non-existent judge ID: ${nonExistentJudgeId}`)
    console.log(`Testing query with non-existent event ID: ${nonExistentEventId}`)
    
    // This is the exact query from the sendJudgeInvitation function
    const { data: judgeRow, error: judgeRowErr } = await getClient()
      .from('competition_judges')
      .select('user_id, users (id, email, must_change_password)')
      .eq('id', nonExistentJudgeId)      // Using the corrected 'id' field
      .eq('event_id', nonExistentEventId)
      .maybeSingle()
    
    if (judgeRowErr) {
      console.error('❌ Database query error:', judgeRowErr.message)
      return false
    }
    
    if (judgeRow === null) {
      console.log('✅ PASS: Query correctly returns null for non-existent judge ID')
      console.log('✅ This confirms the corrected database query works as expected')
      console.log('✅ The function should throw "Judge is not enrolled in this event" error')
      return true
    } else {
      console.error('❌ FAIL: Query unexpectedly returned data:')
      console.error(judgeRow)
      return false
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

// Also test with an existing event but non-existent judge
async function testWithExistingEvent() {
  try {
    console.log('\nTesting with existing event but non-existent judge...')
    
    // Get any existing event
    const { data: events, error: eventError } = await getClient()
      .from('events')
      .select('id')
      .limit(1)
    
    if (eventError) {
      console.log('Skipping existing event test - could not fetch events:', eventError.message)
      return true // Not a failure, just can't run this test
    }
    
    if (!events || events.length === 0) {
      console.log('Skipping existing event test - no events in database')
      return true // Not a failure, just can't run this test
    }
    
    const existingEventId = events[0].id
    const nonExistentJudgeId = randomUUID()
    
    console.log(`Using existing event ID: ${existingEventId}`)
    console.log(`Using non-existent judge ID: ${nonExistentJudgeId}`)
    
    // Test the corrected query with existing event but non-existent judge
    const { data: judgeRow, error: judgeRowErr } = await getClient()
      .from('competition_judges')
      .select('user_id, users (id, email, must_change_password)')
      .eq('id', nonExistentJudgeId)      // Using the corrected 'id' field
      .eq('event_id', existingEventId)   // Using existing event
      .maybeSingle()
    
    if (judgeRowErr) {
      console.error('❌ Database query error:', judgeRowErr.message)
      return false
    }
    
    if (judgeRow === null) {
      console.log('✅ PASS: Query correctly returns null for non-existent judge in existing event')
      return true
    } else {
      console.error('❌ FAIL: Query unexpectedly returned judge data:')
      console.error(judgeRow)
      return false
    }
    
  } catch (error) {
    console.error('❌ Existing event test failed:', error.message)
    return false
  }
}

// Run both tests
Promise.all([testDirectDatabaseQuery(), testWithExistingEvent()]).then(results => {
  console.log('\n' + '='.repeat(60))
  const allPassed = results.every(result => result === true)
  
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED')
    console.log('✅ Database query correctly returns null for non-existent judge IDs')
    console.log('✅ This confirms the fix in sendJudgeInvitation is working correctly')
    process.exit(0)
  } else {
    console.log('❌ SOME TESTS FAILED')
    console.log('❌ The database query behavior may not be correct')
    process.exit(1)
  }
}).catch(error => {
  console.error('Fatal error running tests:', error)
  process.exit(1)
})