import { Readable } from 'stream'
import csv from 'csv-parser'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteVoterToEvent, inviteRegisteredVoter, registerVoterToEvent, registerExistingVoter } from './invitation.service.js'
import { db as getClient } from '../foundation/db.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = []
    Readable.from(buffer)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_'),
          skipLines: 0,
        }),
      )
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject)
  })
}

function validateRow(row, index) {
  const email = (row.email || row.e_mail || '').trim().toLowerCase()

  if (!email) {
    return { error: `Row ${index + 2}: email is required`, row: null }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    return { error: `Row ${index + 2}: invalid email`, row: null }
  }

  return {
    row: { email },
    error: null,
  }
}

async function rollbackCsvEnrollments(eventId, voterIds) {
  if (!voterIds.length) return

  const client = getClient()
  if (!client) return

  await client
    .from(DB_TABLES.EVENT_VOTERS)
    .delete()
    .eq('event_id', eventId)
    .in('voter_id', voterIds)
}

/**
 * Check which emails already exist in the users table.
 * Returns a map of email -> user exists (boolean)
 */
async function checkExistingAccounts(emails) {
  if (!emails || emails.length === 0) return new Map()

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('email, role')
    .in('email', emails)
    .eq('role', USER_ROLES.VOTER)

  if (error) {
    console.error('[csv-import] Error checking existing accounts:', error.message)
    throw new ApiError(500, 'Failed to validate email addresses')
  }

  const emailMap = new Map()
  // Initialize all as not existing
  emails.forEach(email => emailMap.set(email, false))
  // Mark existing voter accounts
  if (data) {
    data.forEach(user => emailMap.set(user.email, true))
  }

  return emailMap
}

export async function importVotersFromCsv(eventId, organizerId, fileBuffer) {
  // CWE-918: Reject non-Buffer inputs before passing to Readable.from().
  // A non-buffer value (e.g. a URL string) could be used to trigger SSRF
  // via the stream pipeline.
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new ApiError(400, 'Invalid file data')
  }

  await assertOrganizerOwnsEvent(eventId, organizerId)

  const rawRows = await parseCsvBuffer(fileBuffer)
  if (!rawRows.length) {
    throw new ApiError(400, 'CSV file is empty')
  }

  const parsed = []
  const errors = []
  const seenEmails = new Set()

  // First pass: validate and collect emails
  rawRows.forEach((raw, index) => {
    const { row, error } = validateRow(raw, index)
    if (error) {
      errors.push(error)
      return
    }
    if (seenEmails.has(row.email)) {
      errors.push(`Row ${index + 2}: duplicate email in file (${row.email})`)
      return
    }
    seenEmails.add(row.email)
    parsed.push(row)
  })

  if (errors.length) {
    throw new ApiError(400, 'CSV validation failed', { errors })
  }

  // Batch check which emails already exist in DB
  const emails = parsed.map(p => p.email)
  const existingAccountMap = await checkExistingAccounts(emails)

  // Classify each row based on DB lookup
  const classifiedRows = parsed.map(row => ({
    ...row,
    type: existingAccountMap.get(row.email) ? 'existing' : 'new',
  }))

  const results = []
  const enrolledVoterIds = []

  try {
    for (const row of classifiedRows) {
      let invite

      if (row.type === 'new') {
        // Create new voter with temp password
        invite = await inviteVoterToEvent({
          eventId,
          email: row.email,
          organizerId,
          temporaryPassword: row.temporaryPassword,
        })

        enrolledVoterIds.push(invite.user.id)

        if (!invite.email?.sent) {
          throw new ApiError(400, `Invitation email was not sent for ${row.email}`, {
            reason: invite.email?.reason || invite.email?.error || 'Email delivery failed',
          })
        }

        results.push({
          email: row.email,
          success: true,
          isNewVoter: true,
          emailSent: true,
        })
      } else {
        // Enroll existing voter
        invite = await inviteRegisteredVoter({
          eventId,
          email: row.email,
          organizerId,
        })

        enrolledVoterIds.push(invite.user.id)

        if (!invite.email?.sent) {
          throw new ApiError(400, `Invitation email was not sent for ${row.email}`, {
            reason: invite.email?.reason || invite.email?.error || 'Email delivery failed',
          })
        }

        results.push({
          email: row.email,
          success: true,
          isNewVoter: false,
          emailSent: true,
        })
      }
    }
  } catch (err) {
    await rollbackCsvEnrollments(eventId, enrolledVoterIds)
    if (err instanceof ApiError) throw err
    throw new ApiError(500, err.message || 'CSV import failed')
  }

  return {
    total: parsed.length,
    succeeded: results.length,
    failed: 0,
    results,
  }
}

// ============================================================================
// NEW FUNCTIONS: Preview and Register without sending emails
// ============================================================================

/**
 * Preview CSV data - parse and validate without creating any records.
 * Returns parsed data for review before registration.
 * NOW DB-AWARE: looks up existing accounts in the database.
 */
export async function previewCsv(eventId, organizerId, fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new ApiError(400, 'Invalid file data')
  }

  await assertOrganizerOwnsEvent(eventId, organizerId)

  const rawRows = await parseCsvBuffer(fileBuffer)
  if (!rawRows.length) {
    throw new ApiError(400, 'CSV file is empty')
  }

  const parsed = []
  const errors = []
  const seenEmails = new Set()

  // First pass: validate and collect emails
  rawRows.forEach((raw, index) => {
    const { row, error } = validateRow(raw, index)
    if (error) {
      errors.push(error)
      return
    }
    if (seenEmails.has(row.email)) {
      errors.push(`Row ${index + 2}: duplicate email in file (${row.email})`)
      return
    }
    seenEmails.add(row.email)
    parsed.push(row)
  })

  // Batch check which emails already exist in DB
  const emails = parsed.map(p => p.email)
  const existingAccountMap = await checkExistingAccounts(emails)

  // Classify each row based on DB lookup
  const classifiedData = parsed.map(row => ({
    email: row.email,
    type: existingAccountMap.get(row.email) ? 'existing' : 'new',
    rowNumber: parsed.indexOf(row) + 2, // +2 for 1-based and header row
  }))

  // Count summary
  const newCount = classifiedData.filter(r => r.type === 'new').length
  const existingCount = classifiedData.filter(r => r.type === 'existing').length

  // Return preview even if there are errors - organizer can see what would be imported
  return {
    total: rawRows.length,
    valid: parsed.length,
    errors: errors,
    data: classifiedData,
    summary: {
      newAccounts: newCount,
      existingAccounts: existingCount,
    },
  }
}

/**
 * Register voters from CSV WITHOUT sending invitation emails.
 * Parsed data should come from previewCsv result.
 */
export async function registerVotersFromCsv(eventId, organizerId, parsedData) {
  if (!parsedData || !Array.isArray(parsedData)) {
    throw new ApiError(400, 'Invalid parsed data')
  }

  await assertOrganizerOwnsEvent(eventId, organizerId)

  const results = []
  const enrolledVoterIds = []

  try {
    for (const row of parsedData) {
      let result

      if (row.type === 'new') {
        // Create new voter with temp password
        result = await registerVoterToEvent({
          eventId,
          email: row.email,
          organizerId,
          temporaryPassword: row.temporaryPassword,
          // Don't reset password for existing - this is a new account
          resetPasswordForExisting: false,
        })

        enrolledVoterIds.push(result.user.id)

        results.push({
          email: row.email,
          success: true,
          isNewVoter: true,
          invitationSent: false,
        })
      } else {
        // Enroll existing voter - this is an existing account
        result = await registerExistingVoter({
          eventId,
          email: row.email,
          organizerId,
        })

        enrolledVoterIds.push(result.user.id)

        results.push({
          email: row.email,
          success: true,
          isNewVoter: false,
          invitationSent: false,
        })
      }
    }
  } catch (err) {
    // Rollback on error
    await rollbackCsvEnrollments(eventId, enrolledVoterIds)
    if (err instanceof ApiError) throw err
    throw new ApiError(500, err.message || 'CSV registration failed')
  }

  return {
    total: parsedData.length,
    succeeded: results.length,
    failed: 0,
    results,
  }
}
