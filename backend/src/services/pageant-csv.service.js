import { Readable } from 'stream'
import csv from 'csv-parser'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteJudge, registerJudge } from './pageant.service.js'

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = []
    Readable.from(buffer)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_'),
        }),
      )
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject)
  })
}

function normalizeRow(row, index) {
  const email = (row.email || row.e_mail || '').trim().toLowerCase()

  if (!email) return { error: `Row ${index + 2}: email is required`, row: null }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) return { error: `Row ${index + 2}: invalid email`, row: null }

  // Email-only - password will be auto-generated
  return { row: { email }, error: null }
}

export async function importJudgesFromCsv(eventId, organizerId, fileBuffer) {
  // CWE-918: Reject non-Buffer inputs before passing to Readable.from().
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new ApiError(400, 'Invalid file data')
  }

  await assertOrganizerOwnsEvent(eventId, organizerId)

  const rawRows = await parseCsvBuffer(fileBuffer)
  if (!rawRows.length) throw new ApiError(400, 'CSV file is empty')

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
      errors.push(`Row ${index + 2}: duplicate email (${row.email})`)
      return
    }
    seenEmails.add(row.email)
    parsed.push(row)
  })

  if (errors.length) {
    throw new ApiError(400, 'CSV validation failed', { errors })
  }

  const results = []

  for (const row of parsed) {
    try {
      // Use registerJudge (no email) with resetPasswordForExisting = true
      const result = await registerJudge(eventId, organizerId, {
        email: row.email,
        resetPasswordForExisting: true,
      })
      results.push({
        email: row.email,
        success: true,
        isNewJudge: result.isNewJudge,
        invitationSent: false,
      })
    } catch (err) {
      results.push({ email: row.email, success: false, error: err.message })
    }
  }

  const succeeded = results.filter((r) => r.success).length

  return {
    total: parsed.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  }
}
