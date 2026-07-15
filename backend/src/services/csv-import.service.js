import { Readable } from 'stream'
import csv from 'csv-parser'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteVoterToEvent, inviteRegisteredVoter, registerVoterToEvent, registerExistingVoter } from './invitation.service.js'
import { db as getClient } from '../foundation/db.js'
import { DB_TABLES } from '../utils/constants.js'

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

function normalizeRow(row, index) {
  const email = (row.email || row.e_mail || '').trim().toLowerCase()

  if (!email) {
    return { error: `Row ${index + 2}: email is required`, row: null }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    return { error: `Row ${index + 2}: invalid email`, row: null }
  }

  // All rows are new voters - password will be auto-generated
  return {
    row: { email, type: 'new' },
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

  rawRows.forEach((raw, index) => {
    const { row, error } = normalizeRow(raw, index)
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

  const results = []
  const enrolledVoterIds = []

  try {
    for (const row of parsed) {
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

  rawRows.forEach((raw, index) => {
    const { row, error } = normalizeRow(raw, index)
    if (error) {
      errors.push(error)
      return
    }
    if (seenEmails.has(row.email)) {
      errors.push(`Row ${index + 2}: duplicate email in file (${row.email})`)
      return
    }
    seenEmails.add(row.email)
    parsed.push({
      email: row.email,
      type: row.type === 'new' ? 'new' : 'existing',
      rowNumber: index + 2,
    })
  })

  // Return preview even if there are errors - organizer can see what would be imported
  return {
    total: rawRows.length,
    valid: parsed.length,
    errors: errors,
    data: parsed,
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
        })

        enrolledVoterIds.push(result.user.id)

        results.push({
          email: row.email,
          success: true,
          isNewVoter: true,
          invitationSent: false,
        })
      } else {
        // Enroll existing voter
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
