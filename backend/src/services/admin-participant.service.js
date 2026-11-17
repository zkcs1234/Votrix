import * as XLSX from 'xlsx'
import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, PARTICIPANT_TYPES, ACCOUNT_STATUS, isParticipantRole } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { sanitizeUser } from '../utils/userMapper.js'
import { listActivePrograms } from './program.service.js'
import { sendVoterAccountCreatedEmail } from './mailer.service.js'
import { addParticipantTypeMembership, setParticipantTypeMembership } from './user-participant-type.service.js'

// Phase 3 of VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md.
// Admin-owned registration for the school-based election-voter and polling-
// respondent pools. Both use shared account profile fields and separate type
// memberships.

import { EMAIL_RE } from '../../../shared/form-rules.js'

// Canonical field -> accepted header aliases (compared after normalization).
const COLUMN_ALIASES = {
  email: ['email', 'e_mail', 'email_address', 'mail', 'emailaddress'],
  school_id: ['school_id', 'schoolid', 'student_id', 'studentid', 'student_no', 'student_number', 'id_number', 'school_no', 'school_number'],
  last_name: ['last_name', 'lastname', 'surname', 'family_name'],
  first_name: ['first_name', 'firstname', 'given_name', 'givenname'],
  program: ['program', 'course', 'strand'],
}

// Year & Section is no longer collected. An older file that still has that
// column is accepted and the column is simply ignored.
const REQUIRED_FIELDS = ['email', 'school_id', 'last_name', 'first_name', 'program']

export const VOTER_CSV_TEMPLATE_HEADERS = ['email', 'school id', 'last name', 'first name', 'program']

// Judges share the user identity fields; professional details are stored in
// profile_data and Competition Judge eligibility is stored as a membership.
const JUDGE_COLUMN_ALIASES = {
  email: ['email', 'e_mail', 'email_address', 'mail', 'emailaddress'],
  last_name: ['last_name', 'lastname', 'surname', 'family_name'],
  first_name: ['first_name', 'firstname', 'given_name', 'givenname'],
  title: ['title', 'designation', 'honorific', 'position', 'rank'],
  affiliation: ['affiliation', 'organization', 'organisation', 'org', 'institution', 'company', 'department'],
  expertise: ['expertise', 'specialization', 'specialisation', 'specialty', 'field', 'expertise_area'],
}
const JUDGE_REQUIRED_FIELDS = ['email', 'first_name', 'last_name']
const JUDGE_OPTIONAL_FIELDS = ['title', 'affiliation', 'expertise']

// Judges are a global pool visible to every organizer, so the template has no
// organizer column. A legacy "organizers" column in an older file is ignored.
export const JUDGE_CSV_TEMPLATE_HEADERS = ['email', 'last name', 'first name', 'title', 'affiliation', 'expertise']

function normalizeHeader(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// The exports neutralize text that starts with = + - @ by adding a leading apostrophe
// (so a spreadsheet will not run it as a formula). Take that apostrophe off again so a
// file exported from the system imports back unchanged.
function readCell(value) {
  return String(value ?? '').trim().replace(/^'(?=[=+\-@\t\r])/, '')
}

// Columns in the file that the import does not use, by their original heading.
function ignoredHeadings(headerRow, columnIndex) {
  const used = new Set(Object.values(columnIndex))
  return headerRow
    .map((heading, idx) => ({ heading: String(heading ?? '').trim(), idx }))
    .filter(({ heading, idx }) => heading && !used.has(idx))
    .map(({ heading }) => heading)
}

function matchField(normalized, aliasMap) {
  for (const [field, aliases] of Object.entries(aliasMap)) {
    if (aliases.includes(normalized)) return field
  }
  return null
}

function readFileMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
}

// Parse an uploaded CSV/Excel file into rows of the fixed student schema.
// Throws ApiError(400) when the file is unreadable, empty, or missing required
// columns. Row-level content errors are collected by the caller, not here.
function parseVoterFile(buffer) {
  let matrix
  try {
    matrix = readFileMatrix(buffer)
  } catch {
    throw new ApiError(400, 'Could not read the file. Upload a CSV or Excel (.xls, .xlsx) file with the required columns.')
  }

  const headerIdx = matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
  if (headerIdx === -1) throw new ApiError(400, 'The file is empty.')

  const headers = matrix[headerIdx].map(normalizeHeader)
  const columnIndex = {} // field -> column position
  headers.forEach((h, idx) => {
    const field = matchField(h, COLUMN_ALIASES)
    if (field && !(field in columnIndex)) columnIndex[field] = idx
  })

  const missing = REQUIRED_FIELDS.filter((f) => !(f in columnIndex))
  if (missing.length) {
    throw new ApiError(
      400,
      `The file is missing required column(s): ${missing.join(', ')}. Use the CSV template.`,
    )
  }

  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const cells = matrix[i] || []
    if (!cells.some((cell) => String(cell ?? '').trim() !== '')) continue // skip blank rows
    const cell = (field) => readCell(cells[columnIndex[field]])
    rows.push({
      email: cell('email').toLowerCase(),
      school_id: cell('school_id'),
      last_name: cell('last_name'),
      first_name: cell('first_name'),
      program: cell('program'),
      rowNumber: i + 1, // 1-based source line
    })
  }

  rows.ignoredColumns = ignoredHeadings(matrix[headerIdx], columnIndex)
  return rows
}

// Case-insensitive lookup of the programs table so typed/imported values are
// validated and canonicalized to the stored spelling (e.g. "bscs" -> "BSCS").
async function loadProgramMap() {
  const programs = await listActivePrograms()
  return new Map(programs.map((name) => [name.toLowerCase(), name]))
}

async function findStudentByEmail(email) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return data
}

// A participant is EITHER a student OR a judge, never both
// (docs/plans/student-judge-separation-migration.md). These helpers refuse to
// attach the other type to an account that already holds an active one. An
// inactive (removed) membership does not count.
const EXCLUSIVE_TYPE_LABEL = {
  [PARTICIPANT_TYPES.STUDENT]: 'student',
  [PARTICIPANT_TYPES.JUDGE]: 'judge',
}

async function otherCategoryConflict(userId, wantedType) {
  const otherType = wantedType === PARTICIPANT_TYPES.STUDENT ? PARTICIPANT_TYPES.JUDGE : PARTICIPANT_TYPES.STUDENT
  const { data, error } = await getClient()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .select('participant_type')
    .eq('user_id', userId)
    .eq('participant_type', otherType)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) return null
  return `This email already belongs to a ${EXCLUSIVE_TYPE_LABEL[otherType]} account. A person is either a student or a judge, not both.`
}

async function assertNoOtherCategory(userId, wantedType) {
  const conflict = await otherCategoryConflict(userId, wantedType)
  if (conflict) throw new ApiError(409, conflict)
}

async function findStudentBySchoolId(schoolId, { excludeUserId } = {}) {
  let query = getClient()
    .from(DB_TABLES.USERS)
    .select('id, email, school_id')
    .in('role', [USER_ROLES.PARTICIPANT, USER_ROLES.VOTER])
    .ilike('school_id', schoolId)
  if (excludeUserId) query = query.neq('id', excludeUserId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return data
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
async function listSchoolParticipantType(participantType, { search, program, status, page = 1, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const offset = (safePage - 1) * safeLimit

  let query = getClient()
    .from(DB_TABLES.USERS)
    .select('*, user_participant_types!user_participant_types_user_id_fkey!inner(participant_type, is_active)', { count: 'exact' })
    .eq('user_participant_types.participant_type', participantType)
    .eq('user_participant_types.is_active', true)
    .in('role', [USER_ROLES.PARTICIPANT, USER_ROLES.VOTER])

  if (search) {
    // Strip characters that would break the PostgREST `or` filter grammar.
    const s = String(search).replace(/[,()%]/g, '').trim()
    if (s) {
      query = query.or(
        `email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,school_id.ilike.%${s}%`,
      )
    }
  }
  if (program) query = query.eq('program', program)
  if (status) query = query.eq('account_status', status)

  query = query.order('created_at', { ascending: false }).range(offset, offset + safeLimit - 1)

  const { data, error, count } = await query
  if (error) throw new ApiError(500, error.message)

  return {
    participants: (data ?? []).map(sanitizeUser),
    total: count ?? 0,
    page: safePage,
    limit: safeLimit,
  }
}

export async function listVoters(options = {}) {
  const result = await listSchoolParticipantType(PARTICIPANT_TYPES.STUDENT, options)
  return { ...result, voters: result.participants }
}

export async function listRespondents(options = {}) {
  const result = await listSchoolParticipantType(PARTICIPANT_TYPES.STUDENT, options)
  return { ...result, respondents: result.participants }
}

// ---------------------------------------------------------------------------
// Validation shared by manual add and import
// ---------------------------------------------------------------------------
function validateRequired(row) {
  const errors = []
  if (!row.email) errors.push('email is required')
  else if (!EMAIL_RE.test(row.email)) errors.push('invalid email')
  for (const f of ['school_id', 'last_name', 'first_name', 'program']) {
    if (!String(row[f] ?? '').trim()) errors.push(`${f.replace('_', ' ')} is required`)
  }
  return errors
}

// Validate + canonicalize the program against the programs table.
// Returns a shallow copy of the row and any errors.
function applyProgram(row, programMap) {
  const errors = []
  const out = { ...row }
  if (row.program) {
    const canonical = programMap.get(row.program.toLowerCase())
    if (!canonical) errors.push(`program "${row.program}" is not in the program list`)
    else out.program = canonical
  }
  return { row: out, errors }
}

async function insertStudent(row, temporaryPassword, participantType) {
  const passwordHash = await hashPassword(temporaryPassword)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: row.email.toLowerCase(),
      password: passwordHash,
      role: USER_ROLES.PARTICIPANT,
      account_status: ACCOUNT_STATUS.ACTIVE,
      must_change_password: true,
      first_name: row.first_name,
      last_name: row.last_name,
      school_id: row.school_id,
      program: row.program,
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  await addParticipantTypeMembership(data.id, participantType)
  return data
}

async function updateStudentProfile(userId, row) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({
      first_name: row.first_name,
      last_name: row.last_name,
      school_id: row.school_id,
      program: row.program,
    })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return data
}

// ---------------------------------------------------------------------------
// Manual single add
// ---------------------------------------------------------------------------
async function createSchoolParticipant(input, participantType) {
  const row = {
    email: String(input?.email ?? '').trim().toLowerCase(),
    school_id: String(input?.schoolId ?? '').trim(),
    last_name: String(input?.lastName ?? '').trim(),
    first_name: String(input?.firstName ?? '').trim(),
    program: String(input?.program ?? '').trim(),
  }

  const baseErrors = validateRequired(row)
  const { row: canonical, errors: programErrors } = applyProgram(row, await loadProgramMap())
  const errors = [...baseErrors, ...programErrors]
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const existingEmail = await findStudentByEmail(canonical.email)
  if (existingEmail && !isParticipantRole(existingEmail.role)) {
    throw new ApiError(409, 'This email belongs to an admin or organizer account')
  }
  if (existingEmail) {
    await assertNoOtherCategory(existingEmail.id, participantType)
    const sharedFields = ['school_id', 'first_name', 'last_name', 'program']
    const conflicts = sharedFields.filter((field) => {
      const current = String(existingEmail[field] ?? '').trim().toLowerCase()
      const incoming = String(canonical[field] ?? '').trim().toLowerCase()
      return current && incoming && current !== incoming
    })
    if (conflicts.length) {
      throw new ApiError(409, 'Existing account has conflicting shared profile details; edit the account before adding this participant type', { fields: conflicts })
    }
  }
  const existingSchoolId = await findStudentBySchoolId(canonical.school_id)
  if (existingSchoolId && existingSchoolId.id !== existingEmail?.id) {
    throw new ApiError(409, 'Another participant already uses this school ID')
  }

  if (existingEmail) {
    const user = await updateStudentProfile(existingEmail.id, canonical)
    await addParticipantTypeMembership(user.id, participantType)
    return { user: sanitizeUser(user), email: null, created: false }
  }

  const tempPassword = generateTemporaryPassword()
  const user = await insertStudent(canonical, tempPassword, participantType)
  const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })

  return { user: sanitizeUser(user), email, created: true }
}

export async function createVoter(input) {
  return createSchoolParticipant(input, PARTICIPANT_TYPES.STUDENT)
}

export async function createRespondent(input) {
  return createSchoolParticipant(input, PARTICIPANT_TYPES.STUDENT)
}

// ---------------------------------------------------------------------------
// Resend credentials
// ---------------------------------------------------------------------------
// The original temporary password is only ever stored as a hash, so it can't be
// re-sent. A resend issues a NEW temporary password (replacing the old one) and
// emails it. Only allowed while the account is still on its first-login
// password: once the person has set their own password, replacing it would
// lock them out; they use "Forgot password" instead.
async function resendCredentials(user) {
  if (user.account_status !== ACCOUNT_STATUS.ACTIVE) {
    throw new ApiError(409, 'Restore this account before sending credentials.')
  }
  if (!user.must_change_password) {
    throw new ApiError(
      409,
      'This person has already signed in and set their own password. Ask them to use "Forgot password" instead.',
    )
  }

  const tempPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(tempPassword)
  const { error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({ password: passwordHash, must_change_password: true })
    .eq('id', user.id)
  if (error) throw new ApiError(500, error.message)

  const email = await sendVoterAccountCreatedEmail({
    email: user.email,
    temporaryPassword: tempPassword,
    userId: user.id,
    dedupeKey: `participant-credentials-resend:${user.id}:${Date.now()}`,
  })

  return { user: sanitizeUser(user), email }
}

export async function resendStudentCredentials(userId) {
  return resendCredentials(await assertSchoolParticipant(userId, PARTICIPANT_TYPES.STUDENT))
}

export async function resendJudgeCredentials(userId) {
  return resendCredentials(await assertJudge(userId))
}

// ---------------------------------------------------------------------------
// Edit profile / status
// ---------------------------------------------------------------------------
async function assertSchoolParticipant(userId, participantType) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data || !isParticipantRole(data.role)) {
    throw new ApiError(404, 'Participant not found')
  }
  const { data: membership, error: membershipError } = await getClient()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .select('user_id')
    .eq('user_id', userId)
    .eq('participant_type', participantType)
    .eq('is_active', true)
    .maybeSingle()
  if (membershipError) throw new ApiError(500, membershipError.message)
  if (!membership) throw new ApiError(404, 'Participant type membership not found')
  return data
}

async function updateSchoolParticipant(userId, input, participantType) {
  const current = await assertSchoolParticipant(userId, participantType)
  const row = {
    email: current.email,
    school_id: String(input?.schoolId ?? current.school_id ?? '').trim(),
    last_name: String(input?.lastName ?? current.last_name ?? '').trim(),
    first_name: String(input?.firstName ?? current.first_name ?? '').trim(),
    program: String(input?.program ?? current.program ?? '').trim(),
  }

  const baseErrors = validateRequired(row).filter((e) => !e.startsWith('email')) // email not editable here
  const { row: canonical, errors: programErrors } = applyProgram(row, await loadProgramMap())
  const errors = [...baseErrors, ...programErrors]
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const clash = await findStudentBySchoolId(canonical.school_id, { excludeUserId: userId })
  if (clash) throw new ApiError(409, 'Another student already uses this school ID')

  const updated = await updateStudentProfile(userId, canonical)
  return { user: sanitizeUser(updated) }
}

export async function updateVoter(userId, input) {
  return updateSchoolParticipant(userId, input, PARTICIPANT_TYPES.STUDENT)
}

export async function updateRespondent(userId, input) {
  return updateSchoolParticipant(userId, input, PARTICIPANT_TYPES.STUDENT)
}

async function updateSchoolParticipantStatus(userId, accountStatus, participantType) {
  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    throw new ApiError(400, 'Invalid account status')
  }
  await assertSchoolParticipant(userId, participantType)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({ account_status: accountStatus })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data) }
}

export async function updateVoterStatus(userId, accountStatus) {
  return updateSchoolParticipantStatus(userId, accountStatus, PARTICIPANT_TYPES.STUDENT)
}

export async function updateRespondentStatus(userId, accountStatus) {
  return updateSchoolParticipantStatus(userId, accountStatus, PARTICIPANT_TYPES.STUDENT)
}

export async function removeVoterMembership(userId) {
  await assertSchoolParticipant(userId, PARTICIPANT_TYPES.STUDENT)
  await setParticipantTypeMembership(userId, PARTICIPANT_TYPES.STUDENT, false)
}

export async function removeRespondentMembership(userId) {
  await assertSchoolParticipant(userId, PARTICIPANT_TYPES.STUDENT)
  await setParticipantTypeMembership(userId, PARTICIPANT_TYPES.STUDENT, false)
}

// ---------------------------------------------------------------------------
// CSV import — preview (no writes) then register
// ---------------------------------------------------------------------------
async function previewSchoolParticipantImport(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer)) throw new ApiError(400, 'Invalid file data')

  const fileRows = parseVoterFile(fileBuffer)
  if (!fileRows.length) throw new ApiError(400, 'No data rows found in the file.')

  const programMap = await loadProgramMap()

  const errors = []
  const seenEmails = new Set()
  const seenSchoolIds = new Set()
  const validRows = []

  for (const raw of fileRows) {
    const rowErrors = validateRequired(raw)
    const { row, errors: programErrors } = applyProgram(raw, programMap)
    rowErrors.push(...programErrors)

    if (rowErrors.length) {
      errors.push(`Row ${raw.rowNumber}: ${rowErrors.join('; ')}`)
      continue
    }
    const emailKey = row.email
    const schoolKey = row.school_id.toLowerCase()
    if (seenEmails.has(emailKey)) {
      errors.push(`Row ${raw.rowNumber}: duplicate email in file (${row.email})`)
      continue
    }
    if (seenSchoolIds.has(schoolKey)) {
      errors.push(`Row ${raw.rowNumber}: duplicate school ID in file (${row.school_id})`)
      continue
    }
    seenEmails.add(emailKey)
    seenSchoolIds.add(schoolKey)
    validRows.push({ ...row, rowNumber: raw.rowNumber })
  }

  // Classify each valid row against the DB (existing account = profile update).
  const data = []
  let newCount = 0
  let existingCount = 0
  for (const row of validRows) {
    const existingEmail = await findStudentByEmail(row.email)
    if (existingEmail) {
      if (!isParticipantRole(existingEmail.role)) {
        errors.push(`Row ${row.rowNumber}: ${row.email} belongs to an admin or organizer account`)
        continue
      }
      const categoryConflict = await otherCategoryConflict(existingEmail.id, PARTICIPANT_TYPES.STUDENT)
      if (categoryConflict) {
        errors.push(`Row ${row.rowNumber}: ${categoryConflict}`)
        continue
      }
      const sharedFields = ['school_id', 'first_name', 'last_name', 'program']
      const conflicts = sharedFields.filter((field) => {
        const current = String(existingEmail[field] ?? '').trim().toLowerCase()
        const incoming = String(row[field] ?? '').trim().toLowerCase()
        return current && incoming && current !== incoming
      })
      if (conflicts.length) {
        errors.push(`Row ${row.rowNumber}: ${row.email} has conflicting shared profile fields (${conflicts.join(', ')}); edit the account before importing this type`)
        continue
      }
      // Guard against school_id collision with a different account.
      const clash = await findStudentBySchoolId(row.school_id, { excludeUserId: existingEmail.id })
      if (clash) {
        errors.push(`Row ${row.rowNumber}: school ID ${row.school_id} already belongs to another student`)
        continue
      }
      existingCount += 1
      data.push({ ...row, type: 'existing' })
    } else {
      const clash = await findStudentBySchoolId(row.school_id)
      if (clash) {
        errors.push(`Row ${row.rowNumber}: school ID ${row.school_id} already belongs to another student`)
        continue
      }
      newCount += 1
      data.push({ ...row, type: 'new' })
    }
  }

  return {
    total: fileRows.length,
    valid: data.length,
    errors,
    data,
    ignoredColumns: fileRows.ignoredColumns ?? [],
    summary: { newAccounts: newCount, existingAccounts: existingCount },
  }
}

export async function previewVoterImport(fileBuffer) {
  return previewSchoolParticipantImport(fileBuffer)
}

export async function previewRespondentImport(fileBuffer) {
  return previewSchoolParticipantImport(fileBuffer)
}

async function registerSchoolParticipantImport(parsedData, participantType) {
  if (!Array.isArray(parsedData) || !parsedData.length) {
    throw new ApiError(400, 'No rows to register')
  }

  const results = []
  let succeeded = 0
  let failed = 0

  const BATCH_SIZE = 10
  for (let i = 0; i < parsedData.length; i += BATCH_SIZE) {
    const chunk = parsedData.slice(i, i + BATCH_SIZE)
    await Promise.all(
      chunk.map(async (row) => {
        try {
          if (row.type === 'existing') {
            const existing = await findStudentByEmail(row.email)
            if (!existing) throw new ApiError(409, 'account no longer exists')
            await assertNoOtherCategory(existing.id, participantType)
            await updateStudentProfile(existing.id, row)
            await addParticipantTypeMembership(existing.id, participantType)
            results.push({
              email: row.email,
              success: true,
              operation: 'updated',
              isNewParticipant: false,
              emailSent: false,
              emailStatus: 'not_sent',
              emailReason: 'Existing accounts are not sent a new credentials email.',
            })
          } else {
            const tempPassword = generateTemporaryPassword()
            const user = await insertStudent(row, tempPassword, participantType)
            let emailSent = false
            let emailStatus = 'queued'
            let emailReason = null

            if (parsedData.length <= 5) {
              const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })
              emailSent = Boolean(email?.sent)
              emailStatus = email?.sent ? 'sent' : email?.skipped ? 'skipped' : 'failed'
              emailReason = email?.sent ? null : email?.reason || email?.error || 'Email delivery failed'
            } else {
              sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword }).catch((err) =>
                console.error('[import] Background email dispatch failed for:', user.email, err.message),
              )
              emailSent = true
              emailStatus = 'sent'
            }

            results.push({
              email: row.email,
              success: true,
              operation: 'created',
              isNewParticipant: true,
              emailSent,
              emailStatus,
              emailReason,
            })
          }
          succeeded += 1
        } catch (err) {
          failed += 1
          results.push({
            email: row.email,
            success: false,
            operation: 'failed',
            emailSent: false,
            emailStatus: 'not_sent',
            error: err.message || 'Failed',
          })
        }
      }),
    )
  }

  return {
    total: parsedData.length,
    succeeded,
    failed,
    emailSent: results.filter((result) => result.emailStatus === 'sent').length,
    emailSkipped: results.filter((result) => result.emailStatus === 'skipped').length,
    emailFailed: results.filter((result) => result.emailStatus === 'failed').length,
    emailNotSent: results.filter((result) => result.emailStatus === 'not_sent').length,
    results,
  }
}

export async function registerVoterImport(parsedData) {
  return registerSchoolParticipantImport(parsedData, PARTICIPANT_TYPES.STUDENT)
}

export async function registerRespondentImport(parsedData) {
  return registerSchoolParticipantImport(parsedData, PARTICIPANT_TYPES.STUDENT)
}

// ===========================================================================
// JUDGES — fixed judge-specific fields in profile_data; shared name/email and
// independently assignable Competition Judge membership.
// ===========================================================================

function parseJudgeFile(buffer) {
  let matrix
  try {
    matrix = readFileMatrix(buffer)
  } catch {
    throw new ApiError(400, 'Could not read the file. Upload a CSV or Excel (.xls, .xlsx) file with the required columns.')
  }

  const headerIdx = matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
  if (headerIdx === -1) throw new ApiError(400, 'The file is empty.')

  const headers = matrix[headerIdx].map(normalizeHeader)
  const columnIndex = {}
  headers.forEach((h, idx) => {
    const field = matchField(h, JUDGE_COLUMN_ALIASES)
    if (field && !(field in columnIndex)) columnIndex[field] = idx
  })

  const missing = JUDGE_REQUIRED_FIELDS.filter((f) => !(f in columnIndex))
  if (missing.length) {
    throw new ApiError(400, `The file is missing required column(s): ${missing.join(', ')}. Use the judge template.`)
  }

  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const cells = matrix[i] || []
    if (!cells.some((cell) => String(cell ?? '').trim() !== '')) continue
    const cell = (field) => (field in columnIndex ? readCell(cells[columnIndex[field]]) : '')
    rows.push({
      email: cell('email').toLowerCase(),
      first_name: cell('first_name'),
      last_name: cell('last_name'),
      title: cell('title'),
      affiliation: cell('affiliation'),
      expertise: cell('expertise'),
      rowNumber: i + 1,
    })
  }
  rows.ignoredColumns = ignoredHeadings(matrix[headerIdx], columnIndex)
  return rows
}

function validateJudgeRequired(row) {
  const errors = []
  if (!row.email) errors.push('email is required')
  else if (!EMAIL_RE.test(row.email)) errors.push('invalid email')
  if (!String(row.first_name ?? '').trim()) errors.push('first name is required')
  if (!String(row.last_name ?? '').trim()) errors.push('last name is required')
  return errors
}

// Build the profile_data JSON, omitting empty optional fields. Judges are a
// global pool: there is no per-organizer assignment, so any legacy
// `organizerIds` value is dropped whenever a judge row is written.
function judgeProfileData(row) {
  const data = {}
  for (const field of JUDGE_OPTIONAL_FIELDS) {
    const value = String(row[field] ?? '').trim()
    if (value) data[field] = value
  }
  return data
}

async function insertJudge(row, temporaryPassword) {
  const passwordHash = await hashPassword(temporaryPassword)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: row.email.toLowerCase(),
      password: passwordHash,
      role: USER_ROLES.PARTICIPANT,
      account_status: ACCOUNT_STATUS.ACTIVE,
      must_change_password: true,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_data: judgeProfileData(row),
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  await addParticipantTypeMembership(data.id, PARTICIPANT_TYPES.JUDGE)
  return data
}

async function updateJudgeRow(userId, row) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({
      first_name: row.first_name,
      last_name: row.last_name,
      profile_data: judgeProfileData(row),
    })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return data
}

async function assertJudge(userId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data || !isParticipantRole(data.role)) throw new ApiError(404, 'Judge not found')
  const { data: membership, error: membershipError } = await getClient()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .select('user_id')
    .eq('user_id', userId)
    .eq('participant_type', PARTICIPANT_TYPES.JUDGE)
    .eq('is_active', true)
    .maybeSingle()
  if (membershipError) throw new ApiError(500, membershipError.message)
  if (!membership) throw new ApiError(404, 'Judge type membership not found')
  return data
}

export async function listJudges({ search, status, page = 1, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const offset = (safePage - 1) * safeLimit

  let query = getClient()
    .from(DB_TABLES.USERS)
    .select('*, user_participant_types!user_participant_types_user_id_fkey!inner(participant_type, is_active)', { count: 'exact' })
    .eq('user_participant_types.participant_type', PARTICIPANT_TYPES.JUDGE)
    .eq('user_participant_types.is_active', true)
    .in('role', [USER_ROLES.PARTICIPANT, USER_ROLES.VOTER])

  if (search) {
    const s = String(search).replace(/[,()%]/g, '').trim()
    if (s) query = query.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`)
  }
  if (status) query = query.eq('account_status', status)

  query = query.order('created_at', { ascending: false }).range(offset, offset + safeLimit - 1)

  const { data, error, count } = await query
  if (error) throw new ApiError(500, error.message)

  return { judges: (data ?? []).map(sanitizeUser), total: count ?? 0, page: safePage, limit: safeLimit }
}

// Only admin and organizer accounts cannot be added to a participant pool.
function judgeEmailConflict(existing) {
  if (!existing) return null
  if (!isParticipantRole(existing.role)) {
    return 'used by another account type'
  }
  return null
}

export async function createJudge(input) {
  const row = {
    email: String(input?.email ?? '').trim().toLowerCase(),
    first_name: String(input?.firstName ?? '').trim(),
    last_name: String(input?.lastName ?? '').trim(),
    title: String(input?.title ?? '').trim(),
    affiliation: String(input?.affiliation ?? '').trim(),
    expertise: String(input?.expertise ?? '').trim(),
  }

  const errors = validateJudgeRequired(row)
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const existing = await findStudentByEmail(row.email)
  if (existing) {
    if (judgeEmailConflict(existing)) throw new ApiError(409, 'This email is used by another account type')
    await assertNoOtherCategory(existing.id, PARTICIPANT_TYPES.JUDGE)
    const nameConflicts = ['first_name', 'last_name'].filter((field) =>
      existing[field] && row[field] && existing[field].trim().toLowerCase() !== row[field].trim().toLowerCase(),
    )
    if (nameConflicts.length) {
      throw new ApiError(409, 'Existing account has conflicting shared name details; edit the account before adding this participant type', { fields: nameConflicts })
    }
    const user = await updateJudgeRow(existing.id, row)
    await addParticipantTypeMembership(existing.id, PARTICIPANT_TYPES.JUDGE)
    return { user: sanitizeUser(user), email: null, created: false }
  }

  const tempPassword = generateTemporaryPassword()
  const user = await insertJudge(row, tempPassword)
  const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })

  return { user: sanitizeUser(user), email, created: true }
}

export async function updateJudge(userId, input) {
  const current = await assertJudge(userId)
  const existingData = current.profile_data ?? {}
  const row = {
    first_name: String(input?.firstName ?? current.first_name ?? '').trim(),
    last_name: String(input?.lastName ?? current.last_name ?? '').trim(),
    title: String(input?.title ?? existingData.title ?? '').trim(),
    affiliation: String(input?.affiliation ?? existingData.affiliation ?? '').trim(),
    expertise: String(input?.expertise ?? existingData.expertise ?? '').trim(),
  }
  const errors = validateJudgeRequired({ ...row, email: current.email })
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const updated = await updateJudgeRow(userId, row)
  return { user: sanitizeUser(updated) }
}

export async function updateJudgeStatus(userId, accountStatus) {
  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    throw new ApiError(400, 'Invalid account status')
  }
  await assertJudge(userId)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({ account_status: accountStatus })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data) }
}

export async function removeJudgeMembership(userId) {
  await assertJudge(userId)
  await setParticipantTypeMembership(userId, PARTICIPANT_TYPES.JUDGE, false)
}

export async function previewJudgeImport(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer)) throw new ApiError(400, 'Invalid file data')

  const fileRows = parseJudgeFile(fileBuffer)
  if (!fileRows.length) throw new ApiError(400, 'No data rows found in the file.')

  const errors = []
  const seenEmails = new Set()
  const validRows = []

  for (const raw of fileRows) {
    const rowErrors = validateJudgeRequired(raw)
    if (rowErrors.length) {
      errors.push(`Row ${raw.rowNumber}: ${rowErrors.join('; ')}`)
      continue
    }
    if (seenEmails.has(raw.email)) {
      errors.push(`Row ${raw.rowNumber}: duplicate email in file (${raw.email})`)
      continue
    }
    seenEmails.add(raw.email)
    validRows.push(raw)
  }

  const data = []
  let newCount = 0
  let existingCount = 0
  for (const row of validRows) {
    const existing = await findStudentByEmail(row.email)
    if (existing) {
      if (judgeEmailConflict(existing)) {
        errors.push(`Row ${row.rowNumber}: ${row.email} is used by another account type`)
        continue
      }
      const categoryConflict = await otherCategoryConflict(existing.id, PARTICIPANT_TYPES.JUDGE)
      if (categoryConflict) {
        errors.push(`Row ${row.rowNumber}: ${categoryConflict}`)
        continue
      }
      const nameConflicts = ['first_name', 'last_name'].filter((field) =>
        existing[field] && row[field] && existing[field].trim().toLowerCase() !== row[field].trim().toLowerCase(),
      )
      if (nameConflicts.length) {
        errors.push(`Row ${row.rowNumber}: ${row.email} has conflicting shared profile fields (${nameConflicts.join(', ')}); edit the account before importing this type`)
        continue
      }
      existingCount += 1
      data.push({ ...row, type: 'existing' })
    } else {
      newCount += 1
      data.push({ ...row, type: 'new' })
    }
  }

  return {
    total: fileRows.length,
    valid: data.length,
    errors,
    data,
    ignoredColumns: fileRows.ignoredColumns ?? [],
    summary: { newAccounts: newCount, existingAccounts: existingCount },
  }
}

export async function registerJudgeImport(parsedData) {
  if (!Array.isArray(parsedData) || !parsedData.length) throw new ApiError(400, 'No rows to register')

  const results = []
  let succeeded = 0
  let failed = 0

  const BATCH_SIZE = 10
  for (let i = 0; i < parsedData.length; i += BATCH_SIZE) {
    const chunk = parsedData.slice(i, i + BATCH_SIZE)
    await Promise.all(
      chunk.map(async (row) => {
        try {
          if (row.type === 'existing') {
            const existing = await findStudentByEmail(row.email)
            if (!existing) throw new ApiError(409, 'account no longer exists')
            await assertNoOtherCategory(existing.id, PARTICIPANT_TYPES.JUDGE)
            await updateJudgeRow(existing.id, row)
            await addParticipantTypeMembership(existing.id, PARTICIPANT_TYPES.JUDGE)
            results.push({
              email: row.email,
              success: true,
              operation: 'updated',
              isNewJudge: false,
              emailSent: false,
              emailStatus: 'not_sent',
              emailReason: 'Existing accounts are not sent a new credentials email.',
            })
          } else {
            const tempPassword = generateTemporaryPassword()
            const user = await insertJudge(row, tempPassword)
            let emailSent = false
            let emailStatus = 'queued'
            let emailReason = null

            if (parsedData.length <= 5) {
              const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })
              emailSent = Boolean(email?.sent)
              emailStatus = email?.sent ? 'sent' : email?.skipped ? 'skipped' : 'failed'
              emailReason = email?.sent ? null : email?.reason || email?.error || 'Email delivery failed'
            } else {
              sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword }).catch((err) =>
                console.error('[import] Background email dispatch failed for:', user.email, err.message),
              )
              emailSent = true
              emailStatus = 'sent'
            }

            results.push({
              email: row.email,
              success: true,
              operation: 'created',
              isNewJudge: true,
              emailSent,
              emailStatus,
              emailReason,
            })
          }
          succeeded += 1
        } catch (err) {
          failed += 1
          results.push({
            email: row.email,
            success: false,
            operation: 'failed',
            emailSent: false,
            emailStatus: 'not_sent',
            error: err.message || 'Failed',
          })
        }
      }),
    )
  }

  return {
    total: parsedData.length,
    succeeded,
    failed,
    emailSent: results.filter((result) => result.emailStatus === 'sent').length,
    emailSkipped: results.filter((result) => result.emailStatus === 'skipped').length,
    emailFailed: results.filter((result) => result.emailStatus === 'failed').length,
    emailNotSent: results.filter((result) => result.emailStatus === 'not_sent').length,
    results,
  }
}
