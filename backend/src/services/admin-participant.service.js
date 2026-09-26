import * as XLSX from 'xlsx'
import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, PROFILE_TYPES, ACCOUNT_STATUS } from '../utils/constants.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { sanitizeUser } from '../utils/userMapper.js'
import { getParticipantTaxonomy } from './participant-taxonomy.service.js'
import { sendVoterAccountCreatedEmail } from './mailer.service.js'

// Phase 3 of VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md.
// Admin-owned registration of STUDENT participants (election voters + polling
// respondents). Fixed 6-column profile (§4A), validated against the managed
// taxonomy (D13). Accounts are global voter accounts (profile_type='student').

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Canonical field -> accepted header aliases (compared after normalization).
const COLUMN_ALIASES = {
  email: ['email', 'e_mail', 'email_address', 'mail', 'emailaddress'],
  school_id: ['school_id', 'schoolid', 'student_id', 'studentid', 'student_no', 'student_number', 'id_number', 'school_no', 'school_number'],
  last_name: ['last_name', 'lastname', 'surname', 'family_name'],
  first_name: ['first_name', 'firstname', 'given_name', 'givenname'],
  program: ['program', 'course', 'strand'],
  year_section: ['year_section', 'year_and_section', 'yearsection', 'section', 'yr_section'],
}

const REQUIRED_FIELDS = ['email', 'school_id', 'last_name', 'first_name', 'program', 'year_section']

export const VOTER_CSV_TEMPLATE_HEADERS = ['email', 'school id', 'last name', 'first name', 'program', 'year & section']

// Judge fixed schema (§3.5). Judges are global accounts (profile_type='judge')
// with name columns on `users` and the professional fields in profile_data.
const JUDGE_COLUMN_ALIASES = {
  email: ['email', 'e_mail', 'email_address', 'mail', 'emailaddress'],
  last_name: ['last_name', 'lastname', 'surname', 'family_name'],
  first_name: ['first_name', 'firstname', 'given_name', 'givenname'],
  title: ['title', 'designation', 'honorific', 'position', 'rank'],
  affiliation: ['affiliation', 'organization', 'organisation', 'org', 'institution', 'company', 'department'],
  expertise: ['expertise', 'specialization', 'specialisation', 'specialty', 'field', 'expertise_area'],
  organizers: ['organizers', 'organizer', 'organizer_emails', 'assigned_organizers', 'organizer_email'],
}
const JUDGE_REQUIRED_FIELDS = ['email', 'first_name', 'last_name']
const JUDGE_OPTIONAL_FIELDS = ['title', 'affiliation', 'expertise']

export const JUDGE_CSV_TEMPLATE_HEADERS = ['email', 'last name', 'first name', 'title', 'affiliation', 'expertise', 'organizers']

function normalizeHeader(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
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
    throw new ApiError(400, 'Could not read the file. Upload a CSV or Excel (.xlsx) file with the required columns.')
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
    const cell = (field) => String(cells[columnIndex[field]] ?? '').trim()
    rows.push({
      email: cell('email').toLowerCase(),
      school_id: cell('school_id'),
      last_name: cell('last_name'),
      first_name: cell('first_name'),
      program: cell('program'),
      year_section: cell('year_section'),
      rowNumber: i + 1, // 1-based source line
    })
  }

  return rows
}

// Build case-insensitive lookup maps from the managed taxonomy so imported
// values are validated and canonicalized to the admin's stored spelling.
function taxonomyMatchers({ programs, sections }) {
  const toMap = (list) => new Map(list.map((v) => [v.toLowerCase(), v]))
  return { programMap: toMap(programs), sectionMap: toMap(sections) }
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

async function findStudentBySchoolId(schoolId, { excludeUserId } = {}) {
  let query = getClient()
    .from(DB_TABLES.USERS)
    .select('id, email, school_id')
    .eq('profile_type', PROFILE_TYPES.STUDENT)
    .ilike('school_id', schoolId)
  if (excludeUserId) query = query.neq('id', excludeUserId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return data
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export async function listVoters({ search, program, yearSection, status, page = 1, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const offset = (safePage - 1) * safeLimit

  let query = getClient()
    .from(DB_TABLES.USERS)
    .select('*', { count: 'exact' })
    .eq('profile_type', PROFILE_TYPES.STUDENT)

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
  if (yearSection) query = query.eq('year_section', yearSection)
  if (status) query = query.eq('account_status', status)

  query = query.order('created_at', { ascending: false }).range(offset, offset + safeLimit - 1)

  const { data, error, count } = await query
  if (error) throw new ApiError(500, error.message)

  return {
    voters: (data ?? []).map(sanitizeUser),
    total: count ?? 0,
    page: safePage,
    limit: safeLimit,
  }
}

// ---------------------------------------------------------------------------
// Validation shared by manual add and import
// ---------------------------------------------------------------------------
function validateRequired(row) {
  const errors = []
  if (!row.email) errors.push('email is required')
  else if (!EMAIL_RE.test(row.email)) errors.push('invalid email')
  for (const f of ['school_id', 'last_name', 'first_name', 'program', 'year_section']) {
    if (!String(row[f] ?? '').trim()) errors.push(`${f.replace('_', ' ')} is required`)
  }
  return errors
}

// Validate + canonicalize program/year_section against the taxonomy maps.
// Mutates a shallow copy and returns { row, errors }.
function applyTaxonomy(row, { programMap, sectionMap }) {
  const errors = []
  const out = { ...row }
  if (row.program) {
    const canonical = programMap.get(row.program.toLowerCase())
    if (!canonical) errors.push(`program "${row.program}" is not in the managed list`)
    else out.program = canonical
  }
  if (row.year_section) {
    const canonical = sectionMap.get(row.year_section.toLowerCase())
    if (!canonical) errors.push(`year & section "${row.year_section}" is not in the managed list`)
    else out.year_section = canonical
  }
  return { row: out, errors }
}

async function insertStudent(row, temporaryPassword) {
  const passwordHash = await hashPassword(temporaryPassword)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: row.email.toLowerCase(),
      password: passwordHash,
      role: USER_ROLES.VOTER,
      profile_type: PROFILE_TYPES.STUDENT,
      account_status: ACCOUNT_STATUS.ACTIVE,
      must_change_password: true,
      first_name: row.first_name,
      last_name: row.last_name,
      school_id: row.school_id,
      program: row.program,
      year_section: row.year_section,
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
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
      year_section: row.year_section,
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
export async function createVoter(input) {
  const row = {
    email: String(input?.email ?? '').trim().toLowerCase(),
    school_id: String(input?.schoolId ?? '').trim(),
    last_name: String(input?.lastName ?? '').trim(),
    first_name: String(input?.firstName ?? '').trim(),
    program: String(input?.program ?? '').trim(),
    year_section: String(input?.yearSection ?? '').trim(),
  }

  const baseErrors = validateRequired(row)
  const taxonomy = await getParticipantTaxonomy()
  const { row: canonical, errors: taxErrors } = applyTaxonomy(row, taxonomyMatchers(taxonomy))
  const errors = [...baseErrors, ...taxErrors]
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const existingEmail = await findStudentByEmail(canonical.email)
  if (existingEmail) throw new ApiError(409, 'A user with this email already exists')
  const existingSchoolId = await findStudentBySchoolId(canonical.school_id)
  if (existingSchoolId) throw new ApiError(409, 'A student with this school ID already exists')

  const tempPassword = generateTemporaryPassword()
  const user = await insertStudent(canonical, tempPassword)
  const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })

  return { user: sanitizeUser(user), email }
}

// ---------------------------------------------------------------------------
// Edit profile / status
// ---------------------------------------------------------------------------
async function assertStudent(userId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data || data.profile_type !== PROFILE_TYPES.STUDENT) {
    throw new ApiError(404, 'Voter not found')
  }
  return data
}

export async function updateVoter(userId, input) {
  const current = await assertStudent(userId)
  const row = {
    email: current.email,
    school_id: String(input?.schoolId ?? current.school_id ?? '').trim(),
    last_name: String(input?.lastName ?? current.last_name ?? '').trim(),
    first_name: String(input?.firstName ?? current.first_name ?? '').trim(),
    program: String(input?.program ?? current.program ?? '').trim(),
    year_section: String(input?.yearSection ?? current.year_section ?? '').trim(),
  }

  const baseErrors = validateRequired(row).filter((e) => !e.startsWith('email')) // email not editable here
  const taxonomy = await getParticipantTaxonomy()
  const { row: canonical, errors: taxErrors } = applyTaxonomy(row, taxonomyMatchers(taxonomy))
  const errors = [...baseErrors, ...taxErrors]
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const clash = await findStudentBySchoolId(canonical.school_id, { excludeUserId: userId })
  if (clash) throw new ApiError(409, 'Another student already uses this school ID')

  const updated = await updateStudentProfile(userId, canonical)
  return { user: sanitizeUser(updated) }
}

export async function updateVoterStatus(userId, accountStatus) {
  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    throw new ApiError(400, 'Invalid account status')
  }
  await assertStudent(userId)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update({ account_status: accountStatus })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data) }
}

// ---------------------------------------------------------------------------
// CSV import — preview (no writes) then register
// ---------------------------------------------------------------------------
export async function previewVoterImport(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer)) throw new ApiError(400, 'Invalid file data')

  const fileRows = parseVoterFile(fileBuffer)
  if (!fileRows.length) throw new ApiError(400, 'No data rows found in the file.')

  const taxonomy = await getParticipantTaxonomy()
  const matchers = taxonomyMatchers(taxonomy)

  const errors = []
  const seenEmails = new Set()
  const seenSchoolIds = new Set()
  const validRows = []

  for (const raw of fileRows) {
    const rowErrors = validateRequired(raw)
    const { row, errors: taxErrors } = applyTaxonomy(raw, matchers)
    rowErrors.push(...taxErrors)

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
      if (existingEmail.role !== USER_ROLES.VOTER || existingEmail.profile_type === PROFILE_TYPES.JUDGE) {
        errors.push(`Row ${row.rowNumber}: ${row.email} is used by another account type`)
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
    summary: { newAccounts: newCount, existingAccounts: existingCount },
  }
}

export async function registerVoterImport(parsedData) {
  if (!Array.isArray(parsedData) || !parsedData.length) {
    throw new ApiError(400, 'No rows to register')
  }

  const results = []
  let succeeded = 0
  let failed = 0

  for (const row of parsedData) {
    try {
      if (row.type === 'existing') {
        const existing = await findStudentByEmail(row.email)
        if (!existing) throw new ApiError(409, 'account no longer exists')
        await updateStudentProfile(existing.id, row)
        results.push({ email: row.email, success: true, isNewVoter: false, emailSent: false })
      } else {
        const tempPassword = generateTemporaryPassword()
        const user = await insertStudent(row, tempPassword)
        const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })
        results.push({ email: row.email, success: true, isNewVoter: true, emailSent: Boolean(email?.sent) })
      }
      succeeded += 1
    } catch (err) {
      failed += 1
      results.push({ email: row.email, success: false, error: err.message || 'Failed' })
    }
  }

  return { total: parsedData.length, succeeded, failed, results }
}

// ===========================================================================
// JUDGES — plan Phase 4. Fixed judge schema, global accounts (profile_type=
// 'judge'). No taxonomy, no school_id. Extras stored in profile_data.
// ===========================================================================

function parseJudgeFile(buffer) {
  let matrix
  try {
    matrix = readFileMatrix(buffer)
  } catch {
    throw new ApiError(400, 'Could not read the file. Upload a CSV or Excel (.xlsx) file with the required columns.')
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
    const cell = (field) => (field in columnIndex ? String(cells[columnIndex[field]] ?? '').trim() : '')
    rows.push({
      email: cell('email').toLowerCase(),
      first_name: cell('first_name'),
      last_name: cell('last_name'),
      title: cell('title'),
      affiliation: cell('affiliation'),
      expertise: cell('expertise'),
      // Assigned-organizer emails, separated by ; | or ,
      organizerEmails: cell('organizers').split(/[;|,]/).map((e) => e.trim()).filter(Boolean),
      rowNumber: i + 1,
    })
  }
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

// Build the profile_data JSON, omitting empty optional fields. Carries the
// admin-assigned organizer list (organizer plan O7/Phase E) when present.
function judgeProfileData(row) {
  const data = {}
  for (const field of JUDGE_OPTIONAL_FIELDS) {
    const value = String(row[field] ?? '').trim()
    if (value) data[field] = value
  }
  if (Array.isArray(row.organizerIds) && row.organizerIds.length) {
    data.organizerIds = [...new Set(row.organizerIds.map(String))]
  }
  return data
}

// Resolve a list of organizer emails to their user ids (skips unknown/non-
// organizer emails). Returns { ids, unknown }.
async function resolveOrganizerEmails(emails) {
  const cleaned = [...new Set((emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
  if (!cleaned.length) return { ids: [], unknown: [] }
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('id, email')
    .eq('role', USER_ROLES.ORGANIZER)
    .in('email', cleaned)
  if (error) throw new ApiError(500, error.message)
  const byEmail = new Map((data ?? []).map((u) => [u.email, u.id]))
  const ids = []
  const unknown = []
  for (const e of cleaned) {
    if (byEmail.has(e)) ids.push(byEmail.get(e))
    else unknown.push(e)
  }
  return { ids, unknown }
}

async function insertJudge(row, temporaryPassword) {
  const passwordHash = await hashPassword(temporaryPassword)
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: row.email.toLowerCase(),
      password: passwordHash,
      role: USER_ROLES.VOTER,
      profile_type: PROFILE_TYPES.JUDGE,
      account_status: ACCOUNT_STATUS.ACTIVE,
      must_change_password: true,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_data: judgeProfileData(row),
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
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
  if (!data || data.profile_type !== PROFILE_TYPES.JUDGE) throw new ApiError(404, 'Judge not found')
  return data
}

export async function listJudges({ search, status, page = 1, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const offset = (safePage - 1) * safeLimit

  let query = getClient()
    .from(DB_TABLES.USERS)
    .select('*', { count: 'exact' })
    .eq('profile_type', PROFILE_TYPES.JUDGE)

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

// Classify an existing email against the judge pool. Returns 'conflict' when the
// address belongs to a student (D7) or a non-voter account.
function judgeEmailConflict(existing) {
  if (!existing) return null
  if (existing.role !== USER_ROLES.VOTER || existing.profile_type === PROFILE_TYPES.STUDENT) {
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
    organizerIds: Array.isArray(input?.organizerIds) ? input.organizerIds : [],
  }

  const errors = validateJudgeRequired(row)
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const existing = await findStudentByEmail(row.email)
  if (existing) {
    if (judgeEmailConflict(existing)) throw new ApiError(409, 'This email is used by another account type')
    throw new ApiError(409, 'A judge with this email already exists')
  }

  const tempPassword = generateTemporaryPassword()
  const user = await insertJudge(row, tempPassword)
  const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })

  return { user: sanitizeUser(user), email }
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
    organizerIds: Array.isArray(input?.organizerIds) ? input.organizerIds : (existingData.organizerIds ?? []),
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
      existingCount += 1
      data.push({ ...row, type: 'existing' })
    } else {
      newCount += 1
      data.push({ ...row, type: 'new' })
    }
  }

  // Resolve assigned-organizer emails → ids for every kept row (Phase E).
  for (const row of data) {
    if (row.organizerEmails?.length) {
      const { ids, unknown } = await resolveOrganizerEmails(row.organizerEmails)
      row.organizerIds = ids
      if (unknown.length) {
        errors.push(`Row ${row.rowNumber}: unknown organizer email(s) ignored — ${unknown.join(', ')}`)
      }
    }
  }

  return {
    total: fileRows.length,
    valid: data.length,
    errors,
    data,
    summary: { newAccounts: newCount, existingAccounts: existingCount },
  }
}

export async function registerJudgeImport(parsedData) {
  if (!Array.isArray(parsedData) || !parsedData.length) throw new ApiError(400, 'No rows to register')

  const results = []
  let succeeded = 0
  let failed = 0

  for (const row of parsedData) {
    try {
      if (row.type === 'existing') {
        const existing = await findStudentByEmail(row.email)
        if (!existing) throw new ApiError(409, 'account no longer exists')
        await updateJudgeRow(existing.id, row)
        results.push({ email: row.email, success: true, isNewJudge: false, emailSent: false })
      } else {
        const tempPassword = generateTemporaryPassword()
        const user = await insertJudge(row, tempPassword)
        const email = await sendVoterAccountCreatedEmail({ email: user.email, temporaryPassword: tempPassword })
        results.push({ email: row.email, success: true, isNewJudge: true, emailSent: Boolean(email?.sent) })
      }
      succeeded += 1
    } catch (err) {
      failed += 1
      results.push({ email: row.email, success: false, error: err.message || 'Failed' })
    }
  }

  return { total: parsedData.length, succeeded, failed, results }
}
