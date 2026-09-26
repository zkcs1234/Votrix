import * as XLSX from 'xlsx'
import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, USER_ROLES, ORGANIZER_SCOPE_TYPES } from '../utils/constants.js'
import { sanitizeUser } from '../utils/userMapper.js'
import { createOrganizer } from './user.service.js'
import { getParticipantTaxonomy } from './participant-taxonomy.service.js'

// Phase B of ORGANIZER_REGISTRATION_AND_SCOPING_PLAN.md.
// Admin-owned organizer registration (manual + CSV) with a full profile and a
// voter scope, so organizers never see an onboarding step. Scope programs and
// year & sections are validated + canonicalized against the managed taxonomy.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COLUMN_ALIASES = {
  email: ['email', 'e_mail', 'email_address', 'mail'],
  organizer_name: ['organizer_name', 'organizername', 'name', 'full_name', 'organizer'],
  position: ['position', 'role', 'title', 'designation'],
  organization_name: ['organization_name', 'organization', 'org_name', 'org'],
  organization_type: ['organization_type', 'org_type', 'organization_type_display', 'type'],
  scope_type: ['scope_type', 'scope', 'access'],
  programs: ['programs', 'program', 'scope_programs', 'courses'],
  sections: ['sections', 'section', 'year_section', 'year_sections', 'year_and_section', 'scope_sections'],
}
const REQUIRED_FIELDS = ['email', 'organizer_name', 'position', 'organization_name', 'organization_type']

export const ORGANIZER_CSV_TEMPLATE_HEADERS = [
  'email', 'organizer name', 'position', 'organization name', 'organization type', 'scope type', 'programs', 'year & sections',
]

function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function matchField(normalized) {
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return field
  }
  return null
}
// Multi-value cells (programs / sections) may be separated by ; | or , inside a
// single column. Split on any of them.
function splitMulti(value) {
  return String(value ?? '')
    .split(/[;|,]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function readFileMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })
}

// Case-insensitive taxonomy matcher → canonical spelling (or null if unknown).
function taxonomyMatchers({ programs, sections }) {
  const toMap = (list) => new Map(list.map((v) => [v.toLowerCase(), v]))
  return { programMap: toMap(programs), sectionMap: toMap(sections) }
}

// Validate + canonicalize a raw scope against the taxonomy. Returns { scope, errors }.
function buildScope({ scopeTypeRaw, programsRaw, sectionsRaw }, matchers) {
  const errors = []
  const wantsScoped = String(scopeTypeRaw ?? '').trim().toLowerCase() === ORGANIZER_SCOPE_TYPES.SCOPED ||
    // Treat "programs present but no explicit type" as scoped.
    (!scopeTypeRaw && (programsRaw?.length || sectionsRaw?.length))

  if (!wantsScoped) {
    return { scope: { scopeType: ORGANIZER_SCOPE_TYPES.ALL, programs: [], sections: [] }, errors }
  }

  const programs = []
  for (const p of programsRaw ?? []) {
    const canonical = matchers.programMap.get(p.toLowerCase())
    if (!canonical) errors.push(`program "${p}" is not in the managed list`)
    else programs.push(canonical)
  }
  const sections = []
  for (const s of sectionsRaw ?? []) {
    const canonical = matchers.sectionMap.get(s.toLowerCase())
    if (!canonical) errors.push(`year & section "${s}" is not in the managed list`)
    else sections.push(canonical)
  }
  // Recommendation from the plan: a scoped organizer must have at least one program.
  if (!programs.length) errors.push('a scoped organizer needs at least one program')

  return { scope: { scopeType: ORGANIZER_SCOPE_TYPES.SCOPED, programs, sections }, errors }
}

// ---------------------------------------------------------------------------
// Listing (organizers with profile + scope)
// ---------------------------------------------------------------------------
export async function listOrganizers() {
  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('role', USER_ROLES.ORGANIZER)
    .order('created_at', { ascending: false })
  if (error) throw new ApiError(500, error.message)
  return { organizers: (data ?? []).map(sanitizeUser) }
}

// ---------------------------------------------------------------------------
// Manual single add
// ---------------------------------------------------------------------------
export async function createOrganizerAccount(input) {
  const row = {
    email: String(input?.email ?? '').trim().toLowerCase(),
    organizer_name: String(input?.organizerName ?? '').trim(),
    position: String(input?.position ?? '').trim(),
    organization_name: String(input?.organizationName ?? '').trim(),
    organization_type: String(input?.organizationType ?? '').trim(),
  }
  const errors = []
  if (!row.email) errors.push('email is required')
  else if (!EMAIL_RE.test(row.email)) errors.push('invalid email')
  for (const f of ['organizer_name', 'position', 'organization_name', 'organization_type']) {
    if (!row[f]) errors.push(`${f.replace(/_/g, ' ')} is required`)
  }

  const taxonomy = await getParticipantTaxonomy()
  const { scope, errors: scopeErrors } = buildScope(
    {
      scopeTypeRaw: input?.scopeType,
      programsRaw: Array.isArray(input?.programs) ? input.programs : splitMulti(input?.programs),
      sectionsRaw: Array.isArray(input?.sections) ? input.sections : splitMulti(input?.sections),
    },
    taxonomyMatchers(taxonomy),
  )
  errors.push(...scopeErrors)
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })

  const { user, email } = await createOrganizer({
    email: row.email,
    organizerName: row.organizer_name,
    position: row.position,
    organizationName: row.organization_name,
    organizationType: row.organization_type,
    scope,
  })
  return { user, email }
}

// ---------------------------------------------------------------------------
// Edit profile + scope
// ---------------------------------------------------------------------------
export async function updateOrganizer(userId, input) {
  const { data: current, error: curErr } = await getClient()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('id', userId)
    .eq('role', USER_ROLES.ORGANIZER)
    .maybeSingle()
  if (curErr) throw new ApiError(500, curErr.message)
  if (!current) throw new ApiError(404, 'Organizer not found')

  const updates = {}
  if (input?.organizerName !== undefined) updates.organizer_name = String(input.organizerName).trim()
  if (input?.position !== undefined) updates.position = String(input.position).trim()
  if (input?.organizationName !== undefined) updates.organization_name = String(input.organizationName).trim()
  if (input?.organizationType !== undefined) updates.organization_type_display = String(input.organizationType).trim()

  if (input?.scopeType !== undefined || input?.programs !== undefined || input?.sections !== undefined) {
    const taxonomy = await getParticipantTaxonomy()
    const { scope, errors } = buildScope(
      {
        scopeTypeRaw: input?.scopeType ?? current.scope?.scopeType,
        programsRaw: Array.isArray(input?.programs) ? input.programs : splitMulti(input?.programs),
        sectionsRaw: Array.isArray(input?.sections) ? input.sections : splitMulti(input?.sections),
      },
      taxonomyMatchers(taxonomy),
    )
    if (errors.length) throw new ApiError(400, 'Validation failed', { errors })
    updates.scope = scope
  }

  if (Object.keys(updates).length === 0) throw new ApiError(400, 'No fields to update')

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data) }
}

// ---------------------------------------------------------------------------
// CSV import — preview (no writes) then register
// ---------------------------------------------------------------------------
function parseOrganizerFile(buffer) {
  let matrix
  try {
    matrix = readFileMatrix(buffer)
  } catch {
    throw new ApiError(400, 'Could not read the file. Upload a CSV or Excel (.xlsx) file with the required columns.')
  }
  const headerIdx = matrix.findIndex((r) => r.some((c) => String(c ?? '').trim() !== ''))
  if (headerIdx === -1) throw new ApiError(400, 'The file is empty.')

  const headers = matrix[headerIdx].map(normalizeHeader)
  const col = {}
  headers.forEach((h, i) => {
    const f = matchField(h)
    if (f && !(f in col)) col[f] = i
  })
  const missing = REQUIRED_FIELDS.filter((f) => !(f in col))
  if (missing.length) {
    throw new ApiError(400, `The file is missing required column(s): ${missing.join(', ')}. Use the template.`)
  }

  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const cells = matrix[i] || []
    if (!cells.some((c) => String(c ?? '').trim() !== '')) continue
    const get = (f) => (f in col ? String(cells[col[f]] ?? '').trim() : '')
    rows.push({
      email: get('email').toLowerCase(),
      organizer_name: get('organizer_name'),
      position: get('position'),
      organization_name: get('organization_name'),
      organization_type: get('organization_type'),
      scope_type: get('scope_type'),
      programs: splitMulti(get('programs')),
      sections: splitMulti(get('sections')),
      rowNumber: i + 1,
    })
  }
  return rows
}

export async function previewOrganizerImport(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new ApiError(400, 'Invalid file data')
  const fileRows = parseOrganizerFile(buffer)
  if (!fileRows.length) throw new ApiError(400, 'No data rows found in the file.')

  const taxonomy = await getParticipantTaxonomy()
  const matchers = taxonomyMatchers(taxonomy)
  const errors = []
  const seen = new Set()
  const data = []

  // Existing organizer/other accounts by email (bulk).
  const emails = fileRows.map((r) => r.email).filter(Boolean)
  const { data: existing } = await getClient()
    .from(DB_TABLES.USERS)
    .select('email, role')
    .in('email', emails.length ? emails : ['__none__'])
  const existingByEmail = new Map((existing ?? []).map((u) => [u.email, u.role]))

  for (const raw of fileRows) {
    const rowErrors = []
    if (!raw.email) rowErrors.push('email is required')
    else if (!EMAIL_RE.test(raw.email)) rowErrors.push('invalid email')
    for (const f of ['organizer_name', 'position', 'organization_name', 'organization_type']) {
      if (!raw[f]) rowErrors.push(`${f.replace(/_/g, ' ')} is required`)
    }
    const { scope, errors: scopeErrors } = buildScope(
      { scopeTypeRaw: raw.scope_type, programsRaw: raw.programs, sectionsRaw: raw.sections },
      matchers,
    )
    rowErrors.push(...scopeErrors)
    if (seen.has(raw.email)) rowErrors.push(`duplicate email in file (${raw.email})`)
    if (existingByEmail.has(raw.email)) rowErrors.push(`${raw.email} already exists as ${existingByEmail.get(raw.email)}`)

    if (rowErrors.length) {
      errors.push(`Row ${raw.rowNumber}: ${rowErrors.join('; ')}`)
      continue
    }
    seen.add(raw.email)
    data.push({
      email: raw.email,
      organizerName: raw.organizer_name,
      position: raw.position,
      organizationName: raw.organization_name,
      organizationType: raw.organization_type,
      scope,
    })
  }

  return { total: fileRows.length, valid: data.length, errors, data }
}

export async function registerOrganizerImport(parsedData) {
  if (!Array.isArray(parsedData) || !parsedData.length) throw new ApiError(400, 'No rows to register')
  const results = []
  let succeeded = 0
  let failed = 0

  for (const row of parsedData) {
    try {
      const { email } = await createOrganizer({
        email: row.email,
        organizerName: row.organizerName,
        position: row.position,
        organizationName: row.organizationName,
        organizationType: row.organizationType,
        scope: row.scope,
      })
      results.push({ email: row.email, success: true, emailSent: Boolean(email?.sent) })
      succeeded += 1
    } catch (err) {
      failed += 1
      results.push({ email: row.email, success: false, error: err.message || 'Failed' })
    }
  }
  return { total: parsedData.length, succeeded, failed, results }
}
