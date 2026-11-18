import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_STATUS } from '../utils/constants.js'
import { loadClassifiedEvents } from './voter.service.js'
import { judgePublishedResults } from './competition-workflow.service.js'
import { publicResults } from './competition-native-results.service.js'

// The participant portal: My events, History and Results.
//
// Everything here is derived from the CALLER'S OWN enrollments (the same
// classified events the overview uses), so a user can never see another
// account's rows, and each module's own visibility rules still decide what is
// listed. Privacy rules that are deliberate:
//   - History confirms participation only. It never returns a voter's
//     selections, poll answers, or any judge's scores.
//   - Results come from the existing visibility helpers / published snapshots.

const MAX_LIMIT = 50
const CLOSED_STATUSES = new Set([EVENT_STATUS.COMPLETED, EVENT_STATUS.CANCELLED, EVENT_STATUS.ARCHIVED])

const TYPE_ALIASES = {
  election: 'election',
  polling: 'polling',
  poll: 'polling',
  competition: 'competition_scoring',
  competition_scoring: 'competition_scoring',
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function paginate(list, query) {
  const limit = clampInt(query.limit, 20, 1, MAX_LIMIT)
  const page = clampInt(query.page, 1, 1, 10_000)
  const start = (page - 1) * limit
  return { items: list.slice(start, start + limit), total: list.length, page, limit }
}

function cleanSearch(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 100)
}

function matchesSearch(event, term) {
  if (!term) return true
  return `${event.title ?? ''} ${event.organizationName ?? ''}`.toLowerCase().includes(term)
}

async function rowsOf(promise) {
  const { data, error } = await promise
  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

/** An event is closed once it is completed/cancelled/archived or its end date passed. */
export function isEventClosed(event, now = new Date()) {
  if (CLOSED_STATUSES.has(event.eventStatus)) return true
  return Boolean(event.endDate && new Date(event.endDate) < now)
}

function startOf(event) {
  return event.startDate ? new Date(event.startDate).getTime() : Number.MAX_SAFE_INTEGER
}

// ---------------------------------------------------------------------------
// My events: things the participant can still act on (active and upcoming).
// Completed events live in History; closed events they missed too.
// ---------------------------------------------------------------------------
export async function getParticipantEvents(userId, query = {}) {
  const now = new Date()
  const bucket = ['active', 'assigned'].includes(query.bucket) ? query.bucket : null
  const type = TYPE_ALIASES[query.type] ?? null
  const term = cleanSearch(query.search)

  const open = (await loadClassifiedEvents(userId)).filter(
    (event) => event.bucket !== 'completed' && !isEventClosed(event, now),
  )
  const counts = {
    active: open.filter((e) => e.bucket === 'active').length,
    assigned: open.filter((e) => e.bucket === 'assigned').length,
  }

  const filtered = open
    .filter((e) => (!bucket || e.bucket === bucket) && (!type || e.eventType === type) && matchesSearch(e, term))
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket === 'active' ? -1 : 1
      return startOf(a) - startOf(b) || String(a.title).localeCompare(String(b.title))
    })

  const { items, total, page, limit } = paginate(filtered, query)
  return { events: items, total, page, limit, counts }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * What the participant did in a classified event, or null while it is still in
 * progress (not closed and not finished by them, so it belongs in My events).
 * Outcomes: Submitted, Partial (some of several parts), Missed.
 */
export function historyOutcome(event, now = new Date()) {
  const closed = isEventClosed(event, now)

  if (event.eventType === 'election') {
    const total = Math.max(Number(event.totalSections) || 1, 1)
    const submitted = Number(event.submittedSections) || 0
    if (event.hasVoted || submitted >= total) return { outcome: 'Submitted', summary: `${total} of ${total} sections submitted` }
    if (!closed) return null
    if (submitted > 0) return { outcome: 'Partial', summary: `${submitted} of ${total} sections submitted` }
    return { outcome: 'Missed', summary: 'No ballot submitted' }
  }

  if (event.eventType === 'polling') {
    if (event.hasResponded) return { outcome: 'Submitted', summary: 'Response recorded' }
    return closed ? { outcome: 'Missed', summary: 'No response recorded' } : null
  }

  if (Array.isArray(event.nativeContexts)) {
    const contexts = event.nativeContexts
    const submitted = contexts.filter((context) => context.state === 'submitted').length
    if (contexts.length && submitted === contexts.length) {
      return { outcome: 'Submitted', summary: `${submitted} round${submitted === 1 ? '' : 's'} submitted` }
    }
    if (!closed) return null
    if (submitted > 0) return { outcome: 'Partial', summary: `${submitted} of ${contexts.length} rounds submitted` }
    return { outcome: 'Missed', summary: 'No round submitted' }
  }

  if (event.hasScored) return { outcome: 'Submitted', summary: 'Scores submitted' }
  return closed ? { outcome: 'Missed', summary: 'No round submitted' } : null
}

function judgeRoleLabel(judgeRole) {
  if (judgeRole === 'head_judge') return 'Head judge'
  if (judgeRole === 'score_reviewer') return 'Score reviewer'
  return 'Judge'
}

function latest(dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d).getTime()).filter(Number.isFinite)
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null
}

// Reads the timestamps and per-part detail the participant tables don't carry.
// event_participants only has booleans, so the real "when" comes from the
// per-module submission tables. Every query is limited to the caller's own rows.
async function loadReceiptSources(userId, candidates) {
  const eventIds = candidates.map((c) => c.event.id)
  const byType = (type) => candidates.filter((c) => c.event.eventType === type).map((c) => c.event.id)
  const electionIds = byType('election')
  const pollIds = byType('polling')
  const competitionIds = byType('competition_scoring')

  const participants = eventIds.length
    ? await rowsOf(db().from(DB_TABLES.EVENT_PARTICIPANTS).select('id, event_id, judge_role').eq('user_id', userId).in('event_id', eventIds))
    : []
  const participantByEvent = new Map(participants.map((p) => [p.event_id, p]))

  let sections = []
  let ballotSubmissions = []
  if (electionIds.length) {
    sections = await rowsOf(
      db().from(DB_TABLES.ELECTION_BALLOT_SECTIONS).select('id, event_id, name, display_order').in('event_id', electionIds).order('display_order', { ascending: true }),
    )
    const participantIds = electionIds.map((id) => participantByEvent.get(id)?.id).filter(Boolean)
    if (participantIds.length) {
      ballotSubmissions = await rowsOf(
        db().from(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS).select('ballot_section_id, participant_id, submitted_at').in('participant_id', participantIds),
      )
    }
  }

  // Anonymous polls store voter_id as NULL at rest, so their time can't be read.
  const pollSubmissions = pollIds.length
    ? await rowsOf(db().from('poll_submissions').select('event_id, completed_at').eq('voter_id', userId).in('event_id', pollIds))
    : []

  let roundSubmissions = []
  let rounds = []
  let published = []
  if (competitionIds.length) {
    try {
      roundSubmissions = await rowsOf(
        db().from('competition_round_submissions').select('event_id, round_id, submitted_at').eq('judge_id', userId).eq('status', 'submitted').in('event_id', competitionIds),
      )
      const roundIds = [...new Set(roundSubmissions.map((s) => s.round_id).filter(Boolean))]
      if (roundIds.length) rounds = await rowsOf(db().from('competition_rounds').select('id, name').in('id', roundIds))
      published = await rowsOf(
        db().from('competition_result_calculations').select('event_id, published_at').eq('status', 'published').is('round_id', null).in('event_id', competitionIds),
      )
    } catch (err) {
      // Older environments without the workflow tables still get a History,
      // just without per-round detail.
      console.warn('[portal] competition history detail unavailable:', err.message)
    }
  }

  return { participantByEvent, sections, ballotSubmissions, pollSubmissions, roundSubmissions, rounds, published }
}

function electionReceipt(event, sources) {
  const participantId = sources.participantByEvent.get(event.id)?.id
  const sections = sources.sections.filter((s) => s.event_id === event.id)
  const submittedAt = new Map(
    sources.ballotSubmissions.filter((s) => s.participant_id === participantId).map((s) => [s.ballot_section_id, s.submitted_at]),
  )
  const rows = sections.map((section) => ({
    name: section.name,
    submittedAt: submittedAt.get(section.id) ?? null,
    status: submittedAt.has(section.id) ? 'Submitted' : 'Not submitted',
  }))
  return { receipt: { kind: 'sections', rows }, completedAt: latest(rows.map((r) => r.submittedAt)), submittedCount: rows.filter((r) => r.submittedAt).length, totalCount: rows.length }
}

function pollReceipt(event, sources) {
  const mine = sources.pollSubmissions.filter((s) => s.event_id === event.id)
  const count = Math.max(mine.length, event.hasResponded ? 1 : 0)
  return {
    receipt: { kind: 'poll', responses: count, anonymous: Boolean(event.pollAnonymous) },
    completedAt: latest(mine.map((s) => s.completed_at)),
  }
}

function competitionReceipt(event, sources) {
  if (Array.isArray(event.nativeContexts)) {
    const rows = event.nativeContexts.map((context) => ({
      name: [context.competitionName, context.roundName].filter(Boolean).join(' · ') || 'Round',
      submittedAt: null,
      status: context.state === 'submitted' ? 'Submitted' : context.statusLabel || 'Not submitted',
    }))
    return { receipt: { kind: 'rounds', rows }, completedAt: null }
  }
  const roundName = new Map(sources.rounds.map((r) => [r.id, r.name]))
  const mine = sources.roundSubmissions.filter((s) => s.event_id === event.id)
  const rows = mine
    .map((s) => ({ name: roundName.get(s.round_id) ?? 'Round', submittedAt: s.submitted_at, status: 'Submitted' }))
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
  return { receipt: { kind: 'rounds', rows }, completedAt: latest(rows.map((r) => r.submittedAt)), roundCount: rows.length }
}

function electionResultsState(event) {
  if (event.canViewResults) return { state: 'available' }
  if ((event.resultsVisibility ?? 'public') === 'hidden') return { state: 'none' }
  return { state: 'pending', availableAfter: event.endDate ?? null }
}

function buildHistoryRow(candidate, sources) {
  const { event, outcome } = candidate
  let { summary } = candidate
  const isJudge = event.eventType === 'competition_scoring'
  let detail
  if (event.eventType === 'election') detail = electionReceipt(event, sources)
  else if (event.eventType === 'polling') detail = pollReceipt(event, sources)
  else detail = competitionReceipt(event, sources)

  if (event.eventType === 'election' && detail.totalCount) {
    summary = `${detail.submittedCount} of ${detail.totalCount} sections submitted`
  }
  if (isJudge && !Array.isArray(event.nativeContexts) && detail.roundCount) {
    summary = `${detail.roundCount} round${detail.roundCount === 1 ? '' : 's'} submitted`
  }

  let results = { state: 'none' }
  if (event.eventType === 'election' || event.eventType === 'polling') results = electionResultsState(event)
  else if (isJudge) {
    const publication = sources.published.find((p) => p.event_id === event.id)
    if (publication) results = { state: 'available', publishedAt: publication.published_at }
  }

  const completedAt = outcome === 'Missed' ? null : detail.completedAt
  const sortDate = completedAt ?? event.endDate ?? event.startDate ?? null

  return {
    id: event.dashboardKey ?? `${event.eventType}:${event.id}`,
    eventId: event.id,
    eventType: event.eventType,
    title: event.title,
    organizationName: event.organizationName ?? null,
    role: isJudge ? judgeRoleLabel(sources.participantByEvent.get(event.id)?.judge_role) : 'Student',
    outcome,
    summary,
    completedAt,
    sortDate,
    window: { start: event.startDate ?? null, end: event.endDate ?? null },
    eventStatus: event.eventStatus ?? null,
    results,
    receipt: detail.receipt,
    scoresheetPath: isJudge && outcome !== 'Missed' ? event.actionPath ?? null : null,
  }
}

function inRange(row, range, now) {
  if (range === 'all' || !row.sortDate) return true
  const time = new Date(row.sortDate).getTime()
  if (!Number.isFinite(time)) return true
  if (range === 'year') return new Date(time).getFullYear() === now.getFullYear()
  return time >= now.getTime() - 365 * 24 * 60 * 60 * 1000
}

export function summarizeHistory(rows) {
  const tookPart = rows.filter((r) => r.outcome !== 'Missed')
  const total = rows.length
  return {
    total,
    tookPart: tookPart.length,
    missed: total - tookPart.length,
    participationRate: total ? Math.round((tookPart.length / total) * 100) : null,
    ballots: tookPart.filter((r) => r.eventType === 'election').length,
    partial: rows.filter((r) => r.outcome === 'Partial').length,
    polls: tookPart.filter((r) => r.eventType === 'polling').length,
    eventsJudged: tookPart.filter((r) => r.eventType === 'competition_scoring').length,
    roundsSubmitted: tookPart.reduce((sum, r) => sum + (r.receipt?.kind === 'rounds' ? r.receipt.rows.filter((x) => x.status === 'Submitted').length : 0), 0),
    lastCompletedAt: latest(tookPart.map((r) => r.completedAt)),
  }
}

export async function getParticipantHistory(userId, query = {}) {
  const now = new Date()
  const type = TYPE_ALIASES[query.type] ?? null
  const range = ['last12', 'year', 'all'].includes(query.range) ? query.range : 'last12'
  const outcome = ['done', 'missed'].includes(query.outcome) ? query.outcome : null
  const term = cleanSearch(query.search)

  const candidates = (await loadClassifiedEvents(userId))
    .map((event) => {
      const result = historyOutcome(event, now)
      return result ? { event, ...result } : null
    })
    .filter(Boolean)

  const sources = await loadReceiptSources(userId, candidates)
  const inScope = candidates.map((candidate) => buildHistoryRow(candidate, sources)).filter((row) => inRange(row, range, now))

  // Summary tiles cover the chosen range only, so they don't collapse when a
  // type/outcome/search filter is applied to the list below them.
  const summary = summarizeHistory(inScope)

  const filtered = inScope
    .filter((row) => (!type || row.eventType === type)
      && (!outcome || (outcome === 'missed' ? row.outcome === 'Missed' : row.outcome !== 'Missed'))
      && matchesSearch({ title: row.title, organizationName: row.organizationName }, term))
    .sort((a, b) => new Date(b.sortDate ?? 0) - new Date(a.sortDate ?? 0))

  const { items, total, page, limit } = paginate(filtered, query)
  return { items, total, page, limit, summary }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function electionResultItem(event, now) {
  const closed = isEventClosed(event, now)
  const base = {
    kind: 'election',
    id: `election:${event.id}`,
    eventId: event.id,
    title: event.title,
    organizationName: event.organizationName ?? null,
    closedAt: event.endDate ?? null,
    resultsVisibility: event.resultsVisibility ?? 'public',
  }
  if (event.canViewResults) return { ...base, state: closed ? 'final' : 'live' }
  if (base.resultsVisibility === 'hidden') return null
  return { ...base, state: 'pending', availableAfter: event.endDate ?? null }
}

// Polls use the same three visibility modes as elections. Hidden polls are never
// listed; a poll whose results appear later is listed as "pending".
function pollResultItem(event, now) {
  const closed = isEventClosed(event, now)
  const base = {
    kind: 'poll',
    id: `poll:${event.id}`,
    eventId: event.id,
    title: event.title,
    organizationName: event.organizationName ?? null,
    closedAt: event.endDate ?? null,
    resultsVisibility: event.resultsVisibility ?? 'hidden',
  }
  if (event.canViewResults) return { ...base, state: closed ? 'final' : 'live' }
  if (base.resultsVisibility === 'hidden') return null
  return { ...base, state: 'pending', availableAfter: event.endDate ?? null }
}

async function workflowCompetitionItem(event, userId) {
  const data = await judgePublishedResults(event.id, userId)
  if (!data?.publishedAt || !data.results?.length) return null
  return {
    kind: 'competition',
    id: `competition:${event.id}`,
    eventId: event.id,
    title: event.title,
    organizationName: event.organizationName ?? null,
    competitionName: null,
    roundName: null,
    state: 'published',
    publishedAt: data.publishedAt,
    method: data.method ?? null,
    standings: data.results.slice(0, 100).map((row) => ({
      rank: row.rank,
      entryNumber: row.contestantNumber ?? null,
      name: row.contestantName,
      score: row.manual ? null : row.finalScore ?? null,
      manual: Boolean(row.manual),
    })),
  }
}

async function nativeCompetitionItems(event) {
  const competitionIds = [...new Set(event.nativeContexts.map((c) => c.competitionId).filter(Boolean))]
  const settled = await Promise.allSettled(competitionIds.map((competitionId) => publicResults(event.id, competitionId, null)))
  const items = []
  settled.forEach((outcome, index) => {
    if (outcome.status !== 'fulfilled') return
    const published = outcome.value
    if (!published || published.withdrawn || !published.results?.standings?.length) return
    items.push({
      kind: 'competition',
      id: `competition:${event.id}:${competitionIds[index]}`,
      eventId: event.id,
      title: event.title,
      organizationName: event.organizationName ?? null,
      competitionName: published.results.competitionName ?? null,
      roundName: published.results.roundName ?? null,
      state: 'published',
      publishedAt: published.publishedAt ?? null,
      publicationVersion: published.publicationVersion ?? null,
      method: published.results.method ?? null,
      standings: published.results.standings.slice(0, 100).map((row) => ({
        rank: row.rank,
        entryNumber: row.entryNumber ?? null,
        name: row.name,
        score: row.manual ? null : row.score ?? null,
        manual: Boolean(row.manual),
      })),
    })
  })
  return items
}

/**
 * Results the participant may see. Lists only; election result bodies are
 * fetched on demand from the existing per-election endpoint. Hidden elections
 * and unpublished competitions are never listed; an election whose results
 * appear later is listed as "pending". Polls follow the same rules via their
 * own results visibility setting; poll result bodies are fetched on demand.
 */
export async function getParticipantResults(userId, query = {}) {
  const now = new Date()
  const kind = ['election', 'poll', 'competition'].includes(query.type) ? query.type : null
  const events = await loadClassifiedEvents(userId)

  const items = events
    .filter((e) => e.eventType === 'election')
    .map((e) => electionResultItem(e, now))
    .filter(Boolean)

  items.push(
    ...events
      .filter((e) => e.eventType === 'polling')
      .map((e) => pollResultItem(e, now))
      .filter(Boolean),
  )

  const competitionEvents = events.filter((e) => e.eventType === 'competition_scoring')
  const settled = await Promise.allSettled(
    competitionEvents.map((event) => (Array.isArray(event.nativeContexts) ? nativeCompetitionItems(event) : workflowCompetitionItem(event, userId))),
  )
  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled' || !outcome.value) continue
    items.push(...(Array.isArray(outcome.value) ? outcome.value : [outcome.value]))
  }

  const rank = (item) => (item.state === 'pending' ? 1 : 0)
  const when = (item) => new Date(item.publishedAt ?? item.closedAt ?? item.availableAfter ?? 0).getTime()
  const filtered = items
    .filter((item) => !kind || item.kind === kind)
    .sort((a, b) => rank(a) - rank(b) || when(b) - when(a))

  const { items: page, total, page: pageNumber, limit } = paginate(filtered, query)
  return { items: page, total, page: pageNumber, limit }
}
