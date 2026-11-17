import { stringify } from 'csv-stringify/sync'
import { db } from '../foundation/db.js'
import { getOrganizersList, getGlobalEvents } from './admin.service.js'
import { listVoters, listRespondents, listJudges } from './admin-participant.service.js'
import { listAuditTrail } from '../foundation/audit.js'
import { DB_TABLES } from '../utils/constants.js'

// ---------------------------------------------------------------------------
// CSV plumbing
// ---------------------------------------------------------------------------

// A cell that starts with = + - @ (or a control character) is run as a formula
// by Excel / Sheets. User-entered text (event titles, names, audit details) can
// start that way, so it is prefixed with an apostrophe and stays plain text.
// The import side removes the same apostrophe again, so a re-import round-trips.
const FORMULA_START = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/u
export function neutralizeCell(value) {
  return typeof value === 'string' && FORMULA_START.test(value) ? `'${value}` : value
}

const CAST = {
  string: (value) => neutralizeCell(value),
  boolean: (value) => (value ? 'true' : 'false'),
  date: (value) => value.toISOString(),
  // Objects (e.g. audit `details`) used to print as "[object Object]".
  object: (value) => (value === null ? '' : neutralizeCell(JSON.stringify(value))),
}

function toCSV(rows, columns) {
  return stringify(rows, { header: true, columns, cast: CAST })
}

const cols = (...headers) => headers.map((header) => ({ key: header, header }))

// ---------------------------------------------------------------------------
// Best-effort database reads
//
// Summary columns (counts, rosters) enrich an export but must never make it
// fail: a query that errors simply leaves its columns blank.
// ---------------------------------------------------------------------------

const PAGE = 1000
const CHUNK = 150 // ids per `in (...)` filter, to keep the request URL short

async function selectAll(table, columns, filter) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let query = db().from(table).select(columns)
    if (filter) query = filter(query)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) break
  }
  return rows
}

async function selectIn(table, columns, column, ids, extra) {
  const rows = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    rows.push(...(await selectAll(table, columns, (query) => {
      const filtered = query.in(column, slice)
      return extra ? extra(filtered) : filtered
    })))
  }
  return rows
}

async function safely(task, fallback) {
  try {
    return await task()
  } catch {
    return fallback
  }
}

function tally(rows, key) {
  const counts = new Map()
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1)
  return counts
}

const blankIfNone = (map, id) => (map ? map.get(id) ?? 0 : '')

// ---------------------------------------------------------------------------
// Organizers
// ---------------------------------------------------------------------------

export async function exportOrganizersCSV() {
  const organizers = await getOrganizersList()
  // Event counts come from the same list the Events page uses, grouped by organizer.
  const events = await safely(() => getGlobalEvents(), [])
  const eventsByOrganizer = new Map()
  for (const event of events) {
    const organizerId = event.organizations?.organizer?.id
    if (!organizerId) continue
    const entry = eventsByOrganizer.get(organizerId) ?? { total: 0, active: 0, completed: 0 }
    entry.total += 1
    if (event.status === 'active') entry.active += 1
    if (event.status === 'completed') entry.completed += 1
    eventsByOrganizer.set(organizerId, entry)
  }

  const rows = organizers.map((organizer) => {
    const counts = eventsByOrganizer.get(organizer.id) ?? { total: 0, active: 0, completed: 0 }
    return {
      organizer_id: organizer.id,
      email: organizer.email,
      organizer_name: organizer.organizer_name,
      position: organizer.position,
      organization_name: organizer.organization_name,
      organization_type: organizer.organization_type_display,
      account_status: organizer.account_status,
      profile_complete: organizer.profile_complete,
      student_access: organizer.scope?.scopeType ?? '',
      access_programs: Array.isArray(organizer.scope?.programs) ? organizer.scope.programs.join('; ') : '',
      events_total: counts.total,
      events_active: counts.active,
      events_completed: counts.completed,
      created_at: organizer.created_at,
      updated_at: organizer.updated_at,
    }
  })
  return toCSV(rows, cols(
    'organizer_id', 'email', 'organizer_name', 'position', 'organization_name', 'organization_type',
    'account_status', 'profile_complete', 'student_access', 'access_programs',
    'events_total', 'events_active', 'events_completed', 'created_at', 'updated_at',
  ))
}

// ---------------------------------------------------------------------------
// Students and judges
// ---------------------------------------------------------------------------

async function listAllParticipants(listPage, key) {
  const rows = []
  let page = 1
  let total = 0

  do {
    const result = await listPage({ page, limit: 200 })
    const pageRows = result[key] ?? []
    if (!pageRows.length) break
    rows.push(...pageRows)
    total = result.total
    page += 1
  } while (rows.length < total)

  return rows
}

// Events each person is enrolled in, as { user -> counts } (blank when unavailable).
async function enrolmentCounts(userIds) {
  if (!userIds.length) return new Map()
  const rows = await safely(
    () => selectIn(DB_TABLES.EVENT_PARTICIPANTS, 'user_id, has_voted, has_scored, has_responded', 'user_id', userIds),
    null,
  )
  if (!rows) return null
  const byUser = new Map()
  for (const row of rows) {
    const entry = byUser.get(row.user_id) ?? { enrolled: 0, completed: 0 }
    entry.enrolled += 1
    if (row.has_voted || row.has_scored || row.has_responded) entry.completed += 1
    byUser.set(row.user_id, entry)
  }
  return byUser
}

async function exportStudents(listPage, key) {
  const students = await listAllParticipants(listPage, key)
  const counts = await enrolmentCounts(students.map((student) => student.id).filter(Boolean))
  const rows = students.map((student) => {
    const entry = counts?.get(student.id)
    return {
      account_id: student.id,
      email: student.email,
      school_id: student.schoolId,
      first_name: student.firstName,
      last_name: student.lastName,
      program: student.program,
      account_status: student.accountStatus,
      password_change_pending: student.mustChangePassword,
      events_enrolled: counts ? entry?.enrolled ?? 0 : '',
      events_participated: counts ? entry?.completed ?? 0 : '',
      created_at: student.createdAt,
    }
  })
  return toCSV(rows, cols(
    'account_id', 'email', 'school_id', 'first_name', 'last_name', 'program', 'account_status',
    'password_change_pending', 'events_enrolled', 'events_participated', 'created_at',
  ))
}

export const exportVotersCSV = () => exportStudents(listVoters, 'voters')
export const exportRespondentsCSV = () => exportStudents(listRespondents, 'respondents')

export async function exportJudgesCSV() {
  const judges = await listAllParticipants(listJudges, 'judges')
  const counts = await enrolmentCounts(judges.map((judge) => judge.id).filter(Boolean))
  const rows = judges.map((judge) => ({
    judge_id: judge.id,
    email: judge.email,
    first_name: judge.firstName,
    last_name: judge.lastName,
    title: judge.profileData?.title,
    affiliation: judge.profileData?.affiliation,
    expertise: judge.profileData?.expertise,
    account_status: judge.accountStatus,
    password_change_pending: judge.mustChangePassword,
    events_assigned: counts ? counts.get(judge.id)?.enrolled ?? 0 : '',
    created_at: judge.createdAt,
  }))
  return toCSV(rows, cols(
    'judge_id', 'email', 'first_name', 'last_name', 'title', 'affiliation', 'expertise',
    'account_status', 'password_change_pending', 'events_assigned', 'created_at',
  ))
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function eventMatchesType(eventType, type) {
  if (!type || type === 'all') return true
  if (type === 'competition') return eventType === 'competition_scoring' || eventType === 'pageant'
  return eventType === type
}

const isCompetition = (type) => type === 'competition_scoring' || type === 'pageant'

function filterEvents(events, { status, type, search, eventId }) {
  const searchTerm = String(search ?? '').trim().toLowerCase()
  return events.filter((event) => {
    if (eventId && event.id !== eventId) return false
    if (status && status !== 'all' && event.status !== status) return false
    if (!eventMatchesType(event.event_type, type)) return false
    if (searchTerm) {
      const title = event.title?.toLowerCase() ?? ''
      const organization = event.organizations?.organization_name?.toLowerCase() ?? ''
      if (!title.includes(searchTerm) && !organization.includes(searchTerm)) return false
    }
    return true
  })
}

// Per-event counts from the module tables. Each is its own best-effort read, so a
// table that cannot be read leaves only its own columns blank.
async function eventCounts(events) {
  const ids = events.map((event) => event.id).filter(Boolean)
  if (!ids.length) return {}
  const countOf = (table, ...filterTypes) => {
    if (!events.some((event) => filterTypes.some((match) => match(event.event_type)))) return Promise.resolve(null)
    return safely(async () => tally(await selectIn(table, 'event_id', 'event_id', ids), 'event_id'), null)
  }
  const election = (type) => type === 'election'
  const polling = (type) => type === 'polling'
  const competition = isCompetition

  const [enrolled, positions, candidates, ballots, questions, submissions, contestants, rounds, criteria, judges] = await Promise.all([
    safely(() => selectIn(DB_TABLES.EVENT_PARTICIPANTS, 'event_id, has_voted, has_scored, has_responded', 'event_id', ids), null),
    countOf(DB_TABLES.POSITIONS, election),
    countOf(DB_TABLES.CANDIDATES, election),
    countOf(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS, election),
    countOf(DB_TABLES.POLL_QUESTIONS, polling),
    countOf(DB_TABLES.POLL_SUBMISSIONS, polling),
    countOf(DB_TABLES.CONTESTANTS, competition),
    countOf(DB_TABLES.COMPETITION_ROUNDS, competition),
    countOf(DB_TABLES.CRITERIA, competition),
    countOf(DB_TABLES.COMPETITION_JUDGES, competition),
  ])

  const enrolledByEvent = new Map()
  const completedByEvent = new Map()
  for (const row of enrolled ?? []) {
    enrolledByEvent.set(row.event_id, (enrolledByEvent.get(row.event_id) ?? 0) + 1)
    if (row.has_voted || row.has_scored || row.has_responded) {
      completedByEvent.set(row.event_id, (completedByEvent.get(row.event_id) ?? 0) + 1)
    }
  }
  return {
    enrolled: enrolled ? enrolledByEvent : null,
    completed: enrolled ? completedByEvent : null,
    positions, candidates, ballots, questions, submissions, contestants, rounds, criteria, judges,
  }
}

const EVENT_COLUMNS = [
  'event_id', 'title', 'description', 'event_type', 'status', 'start_date', 'end_date',
  'organization', 'organizer_name', 'organizer_email',
  'participants_enrolled', 'participants_completed',
  'positions', 'candidates', 'ballots_submitted',
  'poll_questions', 'poll_submissions',
  'contestants', 'rounds', 'criteria', 'judges',
  'created_at', 'updated_at',
]

async function buildEventRows(events) {
  const counts = await eventCounts(events)
  return events.map((event) => {
    const organizer = event.organizations?.organizer
    const election = event.event_type === 'election'
    const polling = event.event_type === 'polling'
    const competition = isCompetition(event.event_type)
    return {
      event_id: event.id,
      title: event.title,
      description: event.description,
      event_type: event.event_type,
      status: event.status,
      start_date: event.start_date,
      end_date: event.end_date,
      organization: event.organizations?.organization_name,
      organizer_name: organizer?.organizer_name,
      organizer_email: organizer?.email,
      participants_enrolled: blankIfNone(counts.enrolled, event.id),
      participants_completed: blankIfNone(counts.completed, event.id),
      positions: election ? blankIfNone(counts.positions, event.id) : '',
      candidates: election ? blankIfNone(counts.candidates, event.id) : '',
      ballots_submitted: election ? blankIfNone(counts.ballots, event.id) : '',
      poll_questions: polling ? blankIfNone(counts.questions, event.id) : '',
      poll_submissions: polling ? blankIfNone(counts.submissions, event.id) : '',
      contestants: competition ? blankIfNone(counts.contestants, event.id) : '',
      rounds: competition ? blankIfNone(counts.rounds, event.id) : '',
      criteria: competition ? blankIfNone(counts.criteria, event.id) : '',
      judges: competition ? blankIfNone(counts.judges, event.id) : '',
      created_at: event.created_at,
      updated_at: event.updated_at,
    }
  })
}

export async function exportEventsCSV({ status, type, search, eventId } = {}) {
  const events = filterEvents(await getGlobalEvents(), { status, type, search, eventId })
  return toCSV(await buildEventRows(events), cols(...EVENT_COLUMNS))
}

// A single event as a report: summary, enrolled participants and the event's own
// structure (positions and candidates / poll questions / contestants, rounds and
// criteria). Sections are separated by a titled blank-line break so the file opens
// as one readable sheet; a section whose data cannot be read is left out.
export async function exportEventReportCSV(eventId) {
  const events = filterEvents(await getGlobalEvents(), { eventId })
  const event = events[0]
  // The summary is built from rows (not split from text): a description can contain line breaks.
  const summary = toCSV(await buildEventRows(events), cols(...EVENT_COLUMNS))
  if (!event) return summary

  const sections = []
  const section = (title, body) => sections.push(`${toCSV([{ section: title }], cols('section')).trimEnd()}\n${body.trimEnd()}`)
  section('EVENT SUMMARY', summary)

  const participants = await safely(async () => {
    const enrolled = await selectAll(
      DB_TABLES.EVENT_PARTICIPANTS,
      'user_id, participant_type, has_voted, has_scored, has_responded, created_at',
      (query) => query.eq('event_id', eventId),
    )
    const users = await selectIn(DB_TABLES.USERS, 'id, email, first_name, last_name, school_id, program', 'id', enrolled.map((row) => row.user_id))
    const byId = new Map(users.map((user) => [user.id, user]))
    return enrolled.map((row) => {
      const user = byId.get(row.user_id) ?? {}
      return {
        email: user.email,
        school_id: user.school_id,
        first_name: user.first_name,
        last_name: user.last_name,
        program: user.program,
        participant_type: row.participant_type,
        voted: row.has_voted,
        scored: row.has_scored,
        responded: row.has_responded,
        enrolled_at: row.created_at,
      }
    })
  }, null)
  if (participants) {
    section('PARTICIPANTS', toCSV(participants, cols(
      'email', 'school_id', 'first_name', 'last_name', 'program', 'participant_type', 'voted', 'scored', 'responded', 'enrolled_at',
    )))
  }

  if (event.event_type === 'election') {
    const ballot = await safely(async () => {
      const positions = await selectAll(DB_TABLES.POSITIONS, 'id, name, max_vote, number_of_winners', (q) => q.eq('event_id', eventId))
      const candidates = await selectAll(DB_TABLES.CANDIDATES, 'name, partylist, position_id', (q) => q.eq('event_id', eventId))
      const positionName = new Map(positions.map((position) => [position.id, position.name]))
      return candidates.map((candidate) => ({
        position: positionName.get(candidate.position_id),
        candidate: candidate.name,
        party: candidate.partylist,
      }))
    }, null)
    if (ballot) section('BALLOT (POSITIONS AND CANDIDATES)', toCSV(ballot, cols('position', 'candidate', 'party')))
  } else if (event.event_type === 'polling') {
    const questions = await safely(
      () => selectAll(DB_TABLES.POLL_QUESTIONS, 'question, type, required, sort_order', (q) => q.eq('event_id', eventId).order('sort_order')),
      null,
    )
    if (questions) section('POLL QUESTIONS', toCSV(questions, cols('sort_order', 'question', 'type', 'required')))
  } else if (isCompetition(event.event_type)) {
    const [contestants, rounds, criteria] = await Promise.all([
      safely(() => selectAll(DB_TABLES.CONTESTANTS, 'contestant_number, name', (q) => q.eq('event_id', eventId).order('contestant_number')), null),
      safely(() => selectAll(DB_TABLES.COMPETITION_ROUNDS, 'name, display_order', (q) => q.eq('event_id', eventId).order('display_order')), null),
      safely(() => selectAll(DB_TABLES.CRITERIA, 'name, percentage', (q) => q.eq('event_id', eventId)), null),
    ])
    if (contestants) section('CONTESTANTS', toCSV(contestants, cols('contestant_number', 'name')))
    if (rounds) section('ROUNDS', toCSV(rounds, cols('display_order', 'name')))
    if (criteria) section('CRITERIA', toCSV(criteria, cols('name', 'percentage')))
  }

  return `${sections.join('\n\n')}\n`
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

// listAuditTrail caps a page at 200 rows, so the export pages through it; asking
// for one big page used to silently return only the newest 200 entries.
const AUDIT_EXPORT_MAX = 50000

export async function exportAuditLogsCSV({ startDate, endDate } = {}) {
  const entries = []
  const pageSize = 200
  for (let offset = 0; offset < AUDIT_EXPORT_MAX; offset += pageSize) {
    const { rows, total } = await listAuditTrail({ startDate, endDate, limit: pageSize, offset })
    entries.push(...rows)
    if (rows.length < pageSize || entries.length >= total) break
  }
  const rows = entries.map((entry) => ({
    created_at: entry.created_at,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id,
    user_id: entry.user_id,
    user_email: entry.users?.email ?? '',
    user_role: entry.users?.role ?? '',
    details: entry.details,
  }))
  return toCSV(rows, cols('created_at', 'action', 'entity', 'entity_id', 'user_id', 'user_email', 'user_role', 'details'))
}

// Excel opens a CSV as the machine's legacy code page unless it starts with a UTF-8
// byte-order mark, which garbles accented names (Ñ, é). Browsers and the importer
// both ignore the mark, so it is safe to add to every download.
export const csvWithBom = (csv) => `\uFEFF${csv}`
