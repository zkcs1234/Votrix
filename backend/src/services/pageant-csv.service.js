import { Readable } from 'stream'
import csv from 'csv-parser'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteJudge } from './pageant.service.js'

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
  const email = (row.email || '').trim().toLowerCase()
  const firstName = (row.firstname || row.first_name || '').trim()
  const lastName = (row.lastname || row.last_name || '').trim()

  if (!email) return { error: `Row ${index + 2}: email is required`, row: null }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) return { error: `Row ${index + 2}: invalid email`, row: null }

  return { row: { email, firstName, lastName }, error: null }
}

export async function importJudgesFromCsv(eventId, organizerId, fileBuffer) {
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
      const invite = await inviteJudge(eventId, organizerId, {
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
      })
      results.push({
        email: row.email,
        success: true,
        emailSent: invite.email?.sent,
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
