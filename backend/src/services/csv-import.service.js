import * as XLSX from 'xlsx'
import { ApiError } from '../utils/ApiError.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { inviteVoterToEvent, inviteRegisteredVoter, registerVoterToEvent, registerExistingVoter } from './invitation.service.js'
import { db as getClient } from '../foundation/db.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'
import { recordEventActivity } from '../foundation/activity.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Header labels that identify the email column. Compared after normalization
// (trim, lowercase, spaces → underscores), so "Email Address" → email_address.
const EMAIL_HEADER_ALIASES = new Set([
  'email', 'e_mail', 'email_address', 'emailaddress', 'mail',
  'e_mail_address', 'emailaddr', 'email_add', 'address',
])

function normalizeHeader(header) {
  // .trim() also removes a leading UTF-8 BOM (U+FEFF is whitespace).
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * Read an uploaded participant file into a matrix of cells (array of rows,
 * each an array of cell strings). SheetJS reads real spreadsheets (.xlsx/.xls)
 * AND delimited text (CSV/TSV/semicolon-separated) uniformly, handling quoting,
 * BOM, and CRLF line endings — so a file that "looks like a CSV" but is really
 * an Excel workbook still parses.
 */
function readFileMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
}

/**
 * Parse an uploaded participant file into `[{ email, rowNumber }]`. Flexible by
 * design so organizers don't have to fight the format:
 *   - Any file/sheet name is accepted; only the content matters.
 *   - The email column may be titled email, e-mail, email address, mail, etc.,
 *     in any letter case, and may sit in any column.
 *   - A header-less file that is just a column of email addresses also works.
 *   - Blank rows are skipped rather than reported as errors.
 * Throws ApiError(400) when the file can't be read, is empty, or has no
 * recognizable email column.
 */
function parseParticipantFile(buffer) {
  let matrix
  try {
    matrix = readFileMatrix(buffer)
  } catch {
    throw new ApiError(
      400,
      'Could not read the file. Upload a CSV or Excel (.xlsx) file with an email column.',
    )
  }

  const headerIdx = matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
  if (headerIdx === -1) {
    throw new ApiError(400, 'The file is empty.')
  }

  const headers = matrix[headerIdx].map(normalizeHeader)
  let emailCol = headers.findIndex((header) => EMAIL_HEADER_ALIASES.has(header))
  let firstDataIdx = headerIdx + 1

  if (emailCol === -1) {
    // No recognizable header. If the first cell is itself an email address,
    // treat the whole first column as a header-less list of emails.
    const firstCell = String(matrix[headerIdx][0] ?? '').trim().toLowerCase()
    if (EMAIL_RE.test(firstCell)) {
      emailCol = 0
      firstDataIdx = headerIdx
    } else {
      throw new ApiError(
        400,
        'No email column found. Add a column titled "email" (use the CSV template), or upload a single column of email addresses.',
      )
    }
  }

  const rows = []
  for (let i = firstDataIdx; i < matrix.length; i += 1) {
    const cells = matrix[i] || []
    if (!cells.some((cell) => String(cell ?? '').trim() !== '')) continue // skip blank rows
    rows.push({
      email: String(cells[emailCol] ?? '').trim().toLowerCase(),
      rowNumber: i + 1, // 1-based line in the source file
    })
  }

  return rows
}

function validateEmail(email) {
  if (!email) return 'email is required'
  if (!EMAIL_RE.test(email)) return 'invalid email'
  return null
}

async function rollbackCsvEnrollments(eventId, voterIds) {
  if (!voterIds.length) return

  const client = getClient()
  if (!client) return

  await client
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .delete()
    .eq('event_id', eventId)
    .in('user_id', voterIds)
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

  const fileRows = parseParticipantFile(fileBuffer)
  if (!fileRows.length) {
    throw new ApiError(400, 'No email addresses found in the file.')
  }

  const parsed = []
  const errors = []
  const seenEmails = new Set()

  // First pass: validate and collect emails
  fileRows.forEach(({ email, rowNumber }) => {
    const error = validateEmail(email)
    if (error) {
      errors.push(`Row ${rowNumber}: ${error}`)
      return
    }
    if (seenEmails.has(email)) {
      errors.push(`Row ${rowNumber}: duplicate email in file (${email})`)
      return
    }
    seenEmails.add(email)
    parsed.push({ email })
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

  const fileRows = parseParticipantFile(fileBuffer)
  if (!fileRows.length) {
    throw new ApiError(400, 'No email addresses found in the file.')
  }

  const parsed = []
  const errors = []
  const seenEmails = new Set()

  // First pass: validate and collect emails (keep each row's source line number)
  fileRows.forEach(({ email, rowNumber }) => {
    const error = validateEmail(email)
    if (error) {
      errors.push(`Row ${rowNumber}: ${error}`)
      return
    }
    if (seenEmails.has(email)) {
      errors.push(`Row ${rowNumber}: duplicate email in file (${email})`)
      return
    }
    seenEmails.add(email)
    parsed.push({ email, rowNumber })
  })

  // Batch check which emails already exist in DB
  const emails = parsed.map(p => p.email)
  const existingAccountMap = await checkExistingAccounts(emails)

  // Also check which users are ALREADY enrolled in this specific event.
  // Use the canonical participant table so preview/register operations stay
  // aligned with the actual enrollment source of truth.
  const { data: enrolledVoters } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('user_id, users!inner(email)')
    .eq('event_id', eventId)

  const enrolledEmailSet = new Set((enrolledVoters ?? []).map(ev => ev.users?.email?.toLowerCase()).filter(Boolean))

  // Classify each row based on DB lookup
  const classifiedData = parsed.map(row => ({
    email: row.email,
    type: existingAccountMap.get(row.email) ? 'existing' : 'new',
    alreadyEnrolled: enrolledEmailSet.has(row.email),
    rowNumber: row.rowNumber, // 1-based source line captured during parsing
  }))

  // Count summary
  const newCount = classifiedData.filter(r => r.type === 'new').length
  const existingCount = classifiedData.filter(r => r.type === 'existing').length
  const alreadyEnrolledCount = classifiedData.filter(r => r.alreadyEnrolled).length

  // Add warnings for already enrolled voters
  classifiedData.forEach((row) => {
    if (row.alreadyEnrolled) {
      errors.push(`Row ${row.rowNumber}: ${row.email} is already enrolled in this event`)
    }
  })

  // Return preview even if there are errors - organizer can see what would be imported
  return {
    total: fileRows.length,
    valid: parsed.length,
    errors: errors,
    data: classifiedData,
    summary: {
      newAccounts: newCount,
      existingAccounts: existingCount,
      alreadyEnrolled: alreadyEnrolledCount,
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

  recordEventActivity({
    eventId,
    action: 'election.voter.csv_import',
    userId: organizerId,
    module: 'election',
    details: { total: parsedData.length, succeeded: results.length },
  })

  return {
    total: parsedData.length,
    succeeded: results.length,
    failed: 0,
    results,
  }
}
