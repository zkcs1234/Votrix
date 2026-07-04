import { Readable } from 'stream'
import csv from 'csv-parser'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteVoterToEvent, inviteRegisteredVoter } from './invitation.service.js'
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
  const tempassword = (row.tempassword || row.temporarypassword || row.temp_password || row.temporary_password || '').trim()

  if (!email) {
    return { error: `Row ${index + 2}: email is required`, row: null }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    return { error: `Row ${index + 2}: invalid email`, row: null }
  }

  // Auto-detect: if tempassword provided → new voter, if not → registered voter
  if (tempassword && tempassword.length > 0) {
    if (tempassword.length < 8) {
      return { error: `Row ${index + 2}: tempassword must be at least 8 characters`, row: null }
    }
    return {
      row: { email, type: 'new', temporaryPassword: tempassword },
      error: null,
    }
  }

  // No tempassword → register existing voter
  return {
    row: { email, type: 'existing' },
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
