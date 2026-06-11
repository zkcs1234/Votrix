import { Readable } from 'stream'
import csv from 'csv-parser'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteVoterToEvent } from './invitation.service.js'
import { getSupabase } from '../config/database.js'
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

  if (!tempassword) {
    return { error: `Row ${index + 2}: tempassword is required`, row: null }
  }

  if (tempassword.length < 8) {
    return { error: `Row ${index + 2}: tempassword must be at least 8 characters`, row: null }
  }

  return {
    row: { email, temporaryPassword: tempassword },
    error: null,
  }
}

export async function importVotersFromCsv(eventId, organizerId, fileBuffer) {
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

  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  const results = []

  for (const row of parsed) {
    try {
      const invite = await inviteVoterToEvent({
        eventId,
        email: row.email,
        organizerId,
        temporaryPassword: row.temporaryPassword,
      })

      results.push({
        email: row.email,
        success: true,
        isNewVoter: invite.isNewVoter,
        emailSent: invite.email?.sent,
      })
    } catch (err) {
      results.push({
        email: row.email,
        success: false,
        error: err.message,
      })
    }
  }

  const succeeded = results.filter((r) => r.success).length
  const failed = results.length - succeeded

  return {
    total: parsed.length,
    succeeded,
    failed,
    results,
  }
}
