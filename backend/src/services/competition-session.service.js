// Competition Live Session Service
// Extends the competition module with live session control.
// Does NOT replace any existing scoring workflow — it adds stage control on top.

import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES, PARTICIPANT_TYPES, SCORE_POLICIES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { mapEvent } from '../foundation/mapper.js'
import { assertJudgeEnrolled, canJudgeScore } from './pageant.service.js'
import { mergeScoringConfig, resolveScoreBounds, computeRankings } from '../modules/scoring-engine.js'
import { selectQualifiers, applyQualifierOverride } from '../modules/advancement.js'
import { recordAudit } from '../foundation/audit.js'
import { recordEventActivity } from '../foundation/activity.js'
import { emitToEvent, emitToEventOrganizer, emitToEventVoters, emitToUser } from '../websocket/ws-emitter.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSession(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    currentDivisionId: row.current_division_id ?? null,
    currentRoundId: row.current_round_id,
    currentRoundName: row.current_round_name ?? null,
    activeContestantId: row.active_contestant_id,
    activeContestantIds: Array.isArray(row.active_contestant_ids) ? row.active_contestant_ids : null,
    activeContestantName: row.active_contestant_name ?? null,
    activeContestantNumber: row.active_contestant_number ?? null,
    activeContestantPhoto: row.active_contestant_photo ?? null,
    currentContestantOrder: row.current_contestant_order,
    contestantOrder: row.contestant_order ?? [],
    // Live control: criteria of the current round open for scoring. Empty is
    // treated by the app as "all criteria open" (see loadActiveScoringCriteria).
    activeCriteriaIds: Array.isArray(row.active_criteria_ids) ? row.active_criteria_ids : [],
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContestant(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    photo: row.photo,
    contestantNumber: row.contestant_number,
  }
}

function mapCriteria(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    percentage: Number(row.percentage),
    minScore: Number(row.min_score),
    maxScore: Number(row.max_score),
  }
}

async function assertCompetitionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new ApiError(400, 'This event is not a competition scoring event')
  }
  return event
}

// The ids of the criteria that belong to the current round (round-scoped, else
// event-wide). Used to seed and bound the active-criteria gate.
async function loadRoundCriteriaIds(eventId, roundId) {
  if (roundId) {
    const { data: rc } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('criteria_id')
      .eq('round_id', roundId)
    if (rc && rc.length) return rc.map((x) => x.criteria_id)
  }
  const { data: crits } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .select('id')
    .eq('event_id', eventId)
  return (crits ?? []).map((c) => c.id)
}

// The criteria a judge should score in the current round, with their minor
// criteria (each carrying its own score type + resolved bounds). Applies the
// live active-criteria gate: an empty gate means "all criteria open" so
// pre-existing sessions and events keep working. A criterion with no minors
// (deploy window / not-yet-migrated) is returned with an empty `minors` array
// and its own bounds, and the callers score it directly by criterion id.
async function loadActiveScoringCriteria(eventId, session, fallbackBounds, { includeClosed = false } = {}) {
  // Fetch the current round's criteria (full rows), else event-wide criteria.
  let crits = []
  let orderedIds = []
  if (session.currentRoundId) {
    const { data: rc } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('criteria_id')
      .eq('round_id', session.currentRoundId)
    orderedIds = (rc ?? []).map((x) => x.criteria_id)
    if (orderedIds.length) {
      const { data } = await getClient()
        .from(DB_TABLES.CRITERIA)
        .select('id, event_id, name, percentage, min_score, max_score')
        .in('id', orderedIds)
      crits = data ?? []
    }
  }
  if (!crits.length) {
    const { data } = await getClient()
      .from(DB_TABLES.CRITERIA)
      .select('id, event_id, name, percentage, min_score, max_score')
      .eq('event_id', eventId)
    crits = data ?? []
    orderedIds = crits.map((c) => c.id)
  }

  // The live active-criteria gate (empty = all open). With includeClosed the
  // judge sheet keeps EVERY scope criterion and each carries an `open` flag
  // (show-but-lock); otherwise closed criteria are dropped (submit path).
  const active = Array.isArray(session.activeCriteriaIds) ? session.activeCriteriaIds : []
  const activeSet = new Set(active)
  const isOpen = (id) => active.length === 0 || activeSet.has(id)
  if (!includeClosed && active.length) {
    crits = crits.filter((c) => isOpen(c.id))
  }
  if (!crits.length) return []

  const openIds = crits.map((c) => c.id)
  const { data: minorRows } = await getClient()
    .from(DB_TABLES.MINOR_CRITERIA)
    .select('id, criteria_id, name, score_type, custom_min, custom_max, display_order')
    .in('criteria_id', openIds)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  const minorsByCrit = new Map()
  for (const m of minorRows ?? []) {
    if (!minorsByCrit.has(m.criteria_id)) minorsByCrit.set(m.criteria_id, [])
    minorsByCrit.get(m.criteria_id).push(m)
  }

  // Preserve the round's criteria order.
  const orderIndex = new Map(orderedIds.map((id, i) => [id, i]))
  return crits
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
    .map((c) => ({
      id: c.id,
      eventId: c.event_id,
      name: c.name,
      percentage: Number(c.percentage),
      // show-but-lock: judges see closed criteria disabled, so the sheet needs
      // to know which are open. Empty gate = all open.
      open: isOpen(c.id),
      minScore: fallbackBounds?.min ?? Number(c.min_score),
      maxScore: fallbackBounds?.max ?? Number(c.max_score),
      minors: (minorsByCrit.get(c.id) ?? []).map((m) => {
        const b = resolveScoreBounds({
          scoreType: m.score_type,
          customMin: m.custom_min,
          customMax: m.custom_max,
        })
        return {
          id: m.id,
          criteriaId: m.criteria_id,
          name: m.name,
          scoreType: m.score_type,
          minScore: b.min,
          maxScore: b.max,
        }
      }),
    }))
}

// ---------------------------------------------------------------------------
// Get active session for an event (public — used by both organizers and judges)
// ---------------------------------------------------------------------------
export async function getActiveSession(eventId) {
  const { data, error } = await getClient()
    .from('v_competition_active_session')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data ? mapSession(data) : null
}

// Find the current live session INCLUDING a paused one. The
// v_competition_active_session view filters to status='active', so a paused
// session is invisible to getActiveSession — which is correct for the scoring
// paths (judges must not score while paused) but wrong for the organizer's
// controls, which must still see (and resume) a paused session. Reads the base
// table directly so pause → resume works repeatedly.
async function getCurrentSession(eventId) {
  const { data, error } = await getClient()
    .from('competition_sessions')
    .select('*')
    .eq('event_id', eventId)
    .in('status', ['active', 'paused'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data ? mapSession(data) : null
}

// ---------------------------------------------------------------------------
// Enriched active session for the organizer Live Control page.
//
// The flat mapSession shape (currentRoundId, activeContestantId, contestantOrder…)
// is correct but the Live Control UI consumes a richer object: the active round
// with its criteria, the ordered contestant list resolved to objects, the active
// contestant object, the round list to switch between, and index/division. This
// assembles that WITHOUT changing the flat internal getActiveSession the scoring
// paths rely on — the extra fields are additive.
// ---------------------------------------------------------------------------
export async function getActiveSessionDetailed(eventId) {
  // Includes a paused session so Live Control keeps its controls (Resume/End)
  // after a pause instead of falling back to the "start" screen.
  const session = await getCurrentSession(eventId)
  if (!session) return null

  const { data: rounds } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('id, name, is_open, display_order, finalized_at')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  const availableRounds = (rounds ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isOpen: r.is_open,
    finalized: Boolean(r.finalized_at),
  }))

  // Resolve the session's contestant order into display objects.
  const order = session.contestantOrder ?? []
  const contestantsById = new Map()
  if (order.length) {
    const { data: cs } = await getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('id, name, contestant_number, photo')
      .in('id', order)
    for (const c of cs ?? []) {
      contestantsById.set(c.id, {
        id: c.id,
        name: c.name,
        contestantNumber: c.contestant_number,
        photo: c.photo,
      })
    }
  }
  // #4: mark each contestant open/closed from the gate (null = all open) so Live
  // Control can render per-contestant toggles.
  const contestantGate = Array.isArray(session.activeContestantIds) ? session.activeContestantIds : null
  const contestantGateSet = contestantGate ? new Set(contestantGate) : null
  const roundContestants = order
    .map((id) => contestantsById.get(id))
    .filter(Boolean)
    .map((c) => ({ ...c, open: !contestantGateSet || contestantGateSet.has(c.id) }))

  // Criteria control for Live Control — works with OR WITHOUT rounds. When a
  // round is active it's that round's criteria; for criteria-only events (no
  // rounds) it's the event-wide criteria. Each criterion carries an `active`
  // flag (from the live gate; empty gate = all open) and its minor criteria, so
  // Live Control can render the per-criterion toggles in either shape.
  const gate = session.activeCriteriaIds ?? []
  const isActive = (id) => gate.length === 0 || gate.includes(id)

  let scopeCriteria = []
  if (session.currentRoundId) {
    const { data: rcrit } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('criteria_id')
      .eq('round_id', session.currentRoundId)
    const ids = (rcrit ?? []).map((x) => x.criteria_id)
    if (ids.length) {
      const { data: crits } = await getClient()
        .from(DB_TABLES.CRITERIA)
        .select('id, name, percentage')
        .in('id', ids)
      scopeCriteria = crits ?? []
    }
  }
  if (!scopeCriteria.length) {
    const { data: crits } = await getClient()
      .from(DB_TABLES.CRITERIA)
      .select('id, name, percentage')
      .eq('event_id', eventId)
    scopeCriteria = crits ?? []
  }

  const scopeCritIds = scopeCriteria.map((c) => c.id)
  const minorsByCrit = new Map()
  if (scopeCritIds.length) {
    const { data: minorRows } = await getClient()
      .from(DB_TABLES.MINOR_CRITERIA)
      .select('id, criteria_id, name, score_type, custom_min, custom_max, display_order')
      .in('criteria_id', scopeCritIds)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    for (const m of minorRows ?? []) {
      if (!minorsByCrit.has(m.criteria_id)) minorsByCrit.set(m.criteria_id, [])
      minorsByCrit.get(m.criteria_id).push({
        id: m.id,
        name: m.name,
        scoreType: m.score_type,
        customMin: m.custom_min,
        customMax: m.custom_max,
      })
    }
  }

  const criteriaControl = scopeCriteria.map((c) => ({
    id: c.id,
    name: c.name,
    percentage: c.percentage,
    active: isActive(c.id),
    minors: minorsByCrit.get(c.id) ?? [],
  }))

  // Active round object — only when a round is open. Reuses criteriaControl.
  let activeRound = null
  if (session.currentRoundId) {
    const r = (rounds ?? []).find((x) => x.id === session.currentRoundId)
    activeRound = {
      id: session.currentRoundId,
      name: r?.name ?? session.currentRoundName ?? 'Round',
      isOpen: r?.is_open ?? true,
      finalized: Boolean(r?.finalized_at),
      contestants: roundContestants,
      criteria: criteriaControl,
      activeCriteriaIds: gate,
    }
  }

  const activeContestant = session.activeContestantId
    ? contestantsById.get(session.activeContestantId) ?? {
        id: session.activeContestantId,
        name: session.activeContestantName,
        contestantNumber: session.activeContestantNumber,
        photo: session.activeContestantPhoto,
      }
    : null

  const stageContestants = (session.activeContestantIds ?? [])
    .map((id) => contestantsById.get(id))
    .filter(Boolean)

  return {
    ...session,
    availableRounds,
    hasRounds: (rounds ?? []).length > 0,
    criteriaControl,
    activeRound,
    activeContestant,
    activeContestantIndex: session.currentContestantOrder ?? 0,
    roundContestants,
    stageContestants,
    activeDivisionId: session.currentDivisionId ?? null,
  }
}

// ---------------------------------------------------------------------------
// Get all sessions for an event (organizer)
// ---------------------------------------------------------------------------
export async function listSessions(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from('competition_sessions')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapSession)
}

// ---------------------------------------------------------------------------
// Get session details by ID
// ---------------------------------------------------------------------------
export async function getSession(sessionId, eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from('competition_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('event_id', eventId)
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Session not found')
  return mapSession(data)
}

async function buildContestantOrder(eventId, roundId, divisionId) {
  let query = getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id')
    .eq('event_id', eventId)
    .order('contestant_number', { ascending: true })

  if (divisionId) {
    query = query.eq('division_id', divisionId)
  }

  const { data: allContestants } = await query
  const eligibleContestants = allContestants ?? []

  if (!roundId) {
    return eligibleContestants.map(c => c.id)
  }

  const { data: roundContestants } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
    .select('contestant_id')
    .eq('round_id', roundId)
    .order('created_at', { ascending: true })

  if (roundContestants && roundContestants.length > 0) {
    const eligibleSet = new Set(eligibleContestants.map(c => c.id))
    const order = []
    const inRound = new Set()
    
    for (const rc of roundContestants) {
      if (eligibleSet.has(rc.contestant_id)) {
        order.push(rc.contestant_id)
        inRound.add(rc.contestant_id)
      }
    }
    
    for (const c of eligibleContestants) {
      if (!inRound.has(c.id)) {
        order.push(c.id)
      }
    }
    return order
  }

  return eligibleContestants.map(c => c.id)
}

// ---------------------------------------------------------------------------
// Start a live session — organizer initiates the competition
// ---------------------------------------------------------------------------
export async function startSession(eventId, organizerId) {
  const event = await assertCompetitionEvent(eventId, organizerId)

  // A live session can only run on a published event. While the event is still
  // in `draft` (setup), it has not been released to its schedule yet, so it
  // must be published from the Judges page before scoring can start.
  if (event.status === 'draft') {
    throw new ApiError(400, 'Publish this event before starting a live session.')
  }

  // Check if there's already an active session
  const existing = await getActiveSession(eventId)
  if (existing) {
    throw new ApiError(409, 'A live session is already active for this event')
  }

  // ===== PRE-FLIGHT VALIDATION (Requirements 13.1-13.6) =====
  
  // 13.1: Validate at least one contestant exists
  const { count: contestantCount, error: contestantError } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  if (contestantError) throw new ApiError(500, contestantError.message)
  
  if (contestantCount === 0) {
    throw new ApiError(
      400,
      'Cannot start session: No contestants added. Add contestants first.'
    )
  }

  // 13.2: Validate at least one active judge is enrolled
  const { count: judgeCount, error: judgeError } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .eq('is_active', true)

  if (judgeError) throw new ApiError(500, judgeError.message)
  
  if (judgeCount === 0) {
    throw new ApiError(
      400,
      'Cannot start session: No judges enrolled. Add judges first.'
    )
  }

  // 13.3: Validate at least one criterion exists
  const { data: criteriaData, error: criteriaError } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .select('id, percentage')
    .eq('event_id', eventId)

  if (criteriaError) throw new ApiError(500, criteriaError.message)

  if (!criteriaData || criteriaData.length === 0) {
    throw new ApiError(
      400,
      'Cannot start session: No criteria added. Add criteria first.'
    )
  }

  // Get rounds for validation
  const { data: rounds, error: roundsError } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('id, name, display_order')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (roundsError) throw new ApiError(500, roundsError.message)

  // 13.4: Validate criteria percentages sum to 100% (§8A, scope-aware).
  // If the event uses per-round criteria, each round's assigned criteria must
  // total 100% within that round; otherwise the legacy flat event-wide rule
  // applies. Feature-guarded so flat/existing events keep the same message.
  const roundIdList = (rounds ?? []).map((r) => r.id)
  let critMembership = []
  if (roundIdList.length) {
    const { data: rcRows, error: rcErr } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('round_id, criteria_id')
      .in('round_id', roundIdList)
    if (rcErr) throw new ApiError(500, rcErr.message)
    critMembership = rcRows ?? []
  }

  if (critMembership.length) {
    const pctById = new Map(criteriaData.map((c) => [c.id, Number(c.percentage)]))
    const nameById = new Map((rounds ?? []).map((r) => [r.id, r.name]))
    const byRound = new Map()
    for (const m of critMembership) {
      if (!byRound.has(m.round_id)) byRound.set(m.round_id, [])
      byRound.get(m.round_id).push(m.criteria_id)
    }
    for (const [roundId, critIds] of byRound) {
      const total = critIds.reduce((s, id) => s + (pctById.get(id) ?? 0), 0)
      if (Math.abs(total - 100) > 0.1) {
        const label = nameById.get(roundId) ?? 'round'
        throw new ApiError(
          400,
          `Cannot start session: Criteria for "${label}" total ${total.toFixed(1)}% (must equal 100%)`
        )
      }
    }
  } else {
    const totalPercentage = criteriaData.reduce(
      (sum, criterion) => sum + Number(criterion.percentage),
      0
    )
    if (Math.abs(totalPercentage - 100) > 0.1) {
      throw new ApiError(
        400,
        `Cannot start session: Criteria percentages total ${totalPercentage.toFixed(1)}% (must equal 100%)`
      )
    }
  }

  // 13.5 & 13.6: Validate rounds if they exist
  if (rounds && rounds.length > 0) {
    // Check if at least one round has assigned contestants
    const { data: roundContestants, error: roundContestantsError } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
      .select('round_id')
      .in('round_id', rounds.map(r => r.id))
      .limit(1)

    if (roundContestantsError) throw new ApiError(500, roundContestantsError.message)

    if (!roundContestants || roundContestants.length === 0) {
      throw new ApiError(
        400,
        'Cannot start session: No open rounds with assigned contestants'
      )
    }
  }

  // ===== END PRE-FLIGHT VALIDATION =====

  // Auto-enable scoring when starting a live session
  const { error: scoringError } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ scoring_enabled: true })
    .eq('id', eventId)

  if (scoringError) {
    console.warn('[startSession] Failed to auto-enable scoring:', scoringError.message)
  }

  // Use the rounds already fetched during validation
  let firstRoundId = null
  let contestantOrder = []

  if (rounds && rounds.length > 0) {
    firstRoundId = rounds[0].id
  }
  
  // By default a new session starts without an active division
  contestantOrder = await buildContestantOrder(eventId, firstRoundId, null)

  const now = new Date().toISOString()

  const { data, error } = await getClient()
    .from('competition_sessions')
    .insert({
      event_id: eventId,
      status: 'active',
      current_round_id: firstRoundId,
      active_contestant_id: contestantOrder.length > 0 ? contestantOrder[0] : null,
      current_contestant_order: 0,
      contestant_order: contestantOrder,
      started_at: now,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const session = mapSession(data)

  // Broadcast to all judges and organizer
  emitToEvent(eventId, 'session:status-changed', { session })
  emitToEventOrganizer(eventId, 'session:status-changed', { session })
  // Starting a session flips scoring_enabled = true, which moves the event from
  // "Waiting to open" (assigned) to "Scoring open" (active) on the voter
  // dashboard. Tell already-open dashboards to reload — otherwise a judge who
  // had the dashboard open before the session started never sees it go active.
  emitToEvent(eventId, 'competition:scoring-toggled', { eventId, scoringEnabled: true })

  recordEventActivity({
    eventId,
    action: 'competition.session.start',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id, roundId: firstRoundId },
  })

  return session
}

// ---------------------------------------------------------------------------
// Advance to next contestant
// ---------------------------------------------------------------------------
export async function nextContestant(eventId, organizerId) {
  const session = await assertActiveSession(eventId, organizerId)

  const nextOrder = session.currentContestantOrder + 1
  if (nextOrder >= session.contestantOrder.length) {
    throw new ApiError(400, 'No more contestants in this round')
  }

  const nextContestantId = session.contestantOrder[nextOrder]

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      active_contestant_id: nextContestantId,
      current_contestant_order: nextOrder,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  // Broadcast contestant change to all judges
  emitToEvent(eventId, 'session:contestant-changed', {
    session: updated,
    previousContestantId: session.activeContestantId,
  })

  return updated
}

// ---------------------------------------------------------------------------
// Go to previous contestant
// ---------------------------------------------------------------------------
export async function previousContestant(eventId, organizerId) {
  const session = await assertActiveSession(eventId, organizerId)

  const prevOrder = session.currentContestantOrder - 1
  if (prevOrder < 0) {
    throw new ApiError(400, 'Already at the first contestant')
  }

  const prevContestantId = session.contestantOrder[prevOrder]

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      active_contestant_id: prevContestantId,
      current_contestant_order: prevOrder,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:contestant-changed', {
    session: updated,
    previousContestantId: session.activeContestantId,
  })

  return updated
}

// ---------------------------------------------------------------------------
// Jump to a specific contestant
// ---------------------------------------------------------------------------
export async function setActiveContestant(eventId, organizerId, contestantId) {
  const session = await assertActiveSession(eventId, organizerId)

  const orderIndex = session.contestantOrder.indexOf(contestantId)
  if (orderIndex === -1) {
    throw new ApiError(400, 'Contestant is not in the current round order')
  }

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      active_contestant_id: contestantId,
      current_contestant_order: orderIndex,
      // Selecting a single contestant leaves any stage group (single mode).
      active_contestant_ids: null,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:contestant-changed', {
    session: updated,
    previousContestantId: session.activeContestantId,
  })

  return updated
}

// ---------------------------------------------------------------------------
// Stage group — put MULTIPLE contestants on stage at once (paired pageant,
// head-to-head battle). Each is still scored individually by the judges. Passing
// an empty list clears the group and returns to single-active mode.
// ---------------------------------------------------------------------------
export async function setStageGroup(eventId, organizerId, contestantIds) {
  const session = await assertActiveSession(eventId, organizerId)

  const ids = Array.isArray(contestantIds) ? [...new Set(contestantIds)] : []
  for (const id of ids) {
    if (!session.contestantOrder.includes(id)) {
      throw new ApiError(400, 'A selected contestant is not in the current round order')
    }
  }

  const primary = ids[0] ?? session.activeContestantId ?? null
  const orderIndex = primary ? Math.max(0, session.contestantOrder.indexOf(primary)) : 0

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      active_contestant_ids: ids.length ? ids : null,
      active_contestant_id: primary,
      current_contestant_order: orderIndex,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  // Judges reload their sheet on this event (same as a contestant change).
  emitToEvent(eventId, 'session:contestant-changed', {
    session: updated,
    previousContestantId: session.activeContestantId,
  })

  return updated
}

// ---------------------------------------------------------------------------
// #4 — Contestant gate. Set WHICH contestants judges may score right now. The
// full field is always shown to judges; closed ones render locked (show-but-lock).
//   contestantIds = array (incl. []) → exactly those are open ([] = none open)
//   contestantIds = null            → gate off, every contestant open (default)
// ---------------------------------------------------------------------------
export async function setOpenContestants(eventId, organizerId, contestantIds) {
  const session = await assertActiveSession(eventId, organizerId)

  let gate = null
  if (Array.isArray(contestantIds)) {
    gate = [...new Set(contestantIds)]
    for (const id of gate) {
      if (!session.contestantOrder.includes(id)) {
        throw new ApiError(400, 'A selected contestant is not in the current round')
      }
    }
  }

  const { data, error } = await getClient()
    .from('competition_sessions')
    // null = all open; [] = none open; [...] = only those open.
    .update({ active_contestant_ids: gate })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  // Judges reload their sheet so the newly (un)locked rows update immediately.
  emitToEvent(eventId, 'session:contestant-changed', {
    session: updated,
    previousContestantId: session.activeContestantId,
  })

  recordEventActivity({
    eventId,
    action: 'competition.session.set_open_contestants',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id, open: gate },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Change round (advance to next round or set a specific one)
// ---------------------------------------------------------------------------
export async function setActiveRound(eventId, organizerId, roundId) {
  const session = await assertActiveSession(eventId, organizerId)

  // Verify round belongs to this event
  const { data: round, error: roundErr } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('id')
    .eq('id', roundId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (roundErr) throw new ApiError(500, roundErr.message)
  if (!round) throw new ApiError(400, 'Round does not belong to this event')

  // Get contestant order for this round and current division
  const contestantOrder = await buildContestantOrder(eventId, roundId, session.currentDivisionId)

  // Seed the live active-criteria gate to ALL of this round's criteria so
  // scoring works immediately; the organizer can then close individual ones.
  const activeCriteriaIds = await loadRoundCriteriaIds(eventId, roundId)

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      current_round_id: roundId,
      active_contestant_id: contestantOrder.length > 0 ? contestantOrder[0] : null,
      current_contestant_order: 0,
      contestant_order: contestantOrder,
      active_criteria_ids: activeCriteriaIds,
      // #4: reset the contestant gate to all-open when the round changes (the new
      // round has a different field). Organizer can then close individual ones.
      active_contestant_ids: null,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:round-changed', {
    session: updated,
    previousRoundId: session.currentRoundId,
  })

  recordEventActivity({
    eventId,
    action: 'competition.session.set_round',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id, roundId, previousRoundId: session.currentRoundId },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Set the live active-criteria gate for the current round.
// `criteriaIds` is the set of the current round's criteria that judges may score
// right now. Must be a subset of the round's criteria. Opening a criterion
// exposes all of its minor criteria; minors are never gated individually.
// ---------------------------------------------------------------------------
export async function setActiveCriteria(eventId, organizerId, criteriaIds) {
  const session = await assertActiveSession(eventId, organizerId)

  // Scope: the current round's criteria, or — for criteria-only events with no
  // rounds — the event-wide criteria. loadRoundCriteriaIds handles both (a null
  // round falls back to event-wide).
  const roundCriteriaIds = await loadRoundCriteriaIds(eventId, session.currentRoundId)
  const allowed = new Set(roundCriteriaIds)
  const requested = Array.isArray(criteriaIds) ? [...new Set(criteriaIds)] : []
  const invalid = requested.filter((id) => !allowed.has(id))
  if (invalid.length) {
    throw new ApiError(400, 'One or more criteria do not belong to the current round')
  }

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({ active_criteria_ids: requested })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  const updated = mapSession(data)

  // Judges reload their sheet so closed criteria disappear immediately.
  emitToEvent(eventId, 'session:active-criteria-changed', {
    session: updated,
    activeCriteriaIds: updated.activeCriteriaIds,
  })

  recordEventActivity({
    eventId,
    action: 'competition.session.set_active_criteria',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id, roundId: session.currentRoundId, activeCriteriaIds: requested },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Set Active Division
// ---------------------------------------------------------------------------
export async function setActiveDivision(eventId, organizerId, divisionId) {
  const session = await assertActiveSession(eventId, organizerId)

  if (divisionId) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const contestantOrder = await buildContestantOrder(eventId, session.currentRoundId, divisionId || null)

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      current_division_id: divisionId || null,
      active_contestant_id: contestantOrder.length > 0 ? contestantOrder[0] : null,
      current_contestant_order: 0,
      contestant_order: contestantOrder,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:division-changed', {
    session: updated,
    previousDivisionId: session.currentDivisionId,
  })

  recordEventActivity({
    eventId,
    action: 'competition.session.set_division',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id, divisionId: divisionId || null, previousDivisionId: session.currentDivisionId },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Pause the session
// ---------------------------------------------------------------------------
export async function pauseSession(eventId, organizerId) {
  const session = await assertActiveSession(eventId, organizerId)

  const now = new Date().toISOString()

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      status: 'paused',
      paused_at: now,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:status-changed', { session: updated })

  recordEventActivity({
    eventId,
    action: 'competition.session.pause',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Resume the session
// ---------------------------------------------------------------------------
export async function resumeSession(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  // Find the active OR paused session (the active-only view hides paused ones).
  const session = await getCurrentSession(eventId)
  if (!session) throw new ApiError(404, 'No live session to resume for this event')

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      status: 'active',
      paused_at: null,
    })
    .eq('id', session.id)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:status-changed', { session: updated })

  recordEventActivity({
    eventId,
    action: 'competition.session.resume',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Complete the session
// ---------------------------------------------------------------------------
export async function completeSession(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  // Allow ending an active OR paused session.
  const session = await getCurrentSession(eventId)
  if (!session) throw new ApiError(404, 'No live session to end for this event')

  const now = new Date().toISOString()

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      status: 'completed',
      completed_at: now,
    })
    .eq('id', session.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const updated = mapSession(data)

  emitToEvent(eventId, 'session:status-changed', { session: updated })

  // Ending the session closes scoring: flip scoring_enabled = false so the voter
  // dashboard moves the event out of "Scoring open" immediately (the schedule
  // sync would also do this within a minute, but do it now for a clean handoff).
  const { error: scoringOffError } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ scoring_enabled: false })
    .eq('id', eventId)
  if (scoringOffError) {
    console.warn('[completeSession] Failed to disable scoring:', scoringOffError.message)
  } else {
    emitToEvent(eventId, 'competition:scoring-toggled', { eventId, scoringEnabled: false })
  }

  // Phase 3 (§7.1) safety net: bridge any live-session scores for this event
  // that predate the write-through (or that failed to mirror) into the ranking
  // store before we recompute rankings. Best-effort — never block completion.
  try {
    await backfillLiveScoresToRankingStore(eventId)
  } catch (e) {
    console.error('[session] Live-score backfill failed on complete:', e.message)
  }

  // Also trigger rankings update
  const { getLiveRankings } = await import('./pageant.service.js')
  try {
    const rankings = await getLiveRankings(eventId, organizerId)
    emitToEvent(eventId, 'rankings:updated', { eventId, rankings })
  } catch (e) {
    console.error('[session] Failed to fetch rankings on complete:', e.message)
  }

  recordEventActivity({
    eventId,
    action: 'competition.session.complete',
    userId: organizerId,
    module: 'competition',
    details: { sessionId: session.id },
  })

  return updated
}

// ---------------------------------------------------------------------------
// Phase 3 (§7.1) — bridge live-session scores into the ranking store.
//
// The live scoring flow persists a judge's scores as a JSONB blob in
// `competition_session_judge_scores`, but rankings/analytics read ONLY from
// `competition_scores` (DB_TABLES.JUDGE_SCORES). Without this bridge, scores
// entered live never reach the rankings. We flatten the per-criterion values
// and write them through to `competition_scores` so it stays the single source
// of truth for the ranking engine.
//
// Idempotency: we delete any prior rows for these exact cells (null-aware on
// round_id — a NULL round would otherwise never match a UNIQUE upsert) and
// re-insert, so a judge editing then re-locking never double-counts. The score
// values written here were already validated against criteria bounds and the
// judge's scope on the session path above.
// ---------------------------------------------------------------------------
async function bridgeSessionScoresToRankingStore(session, judgeId, scoreMap, contestantIdArg) {
  const keys = Object.keys(scoreMap ?? {})
  if (!keys.length) return

  const roundId = session.currentRoundId ?? null
  const divisionId = session.currentDivisionId ?? null
  const contestantId = contestantIdArg ?? session.activeContestantId

  // A score-map key is a MINOR criterion id (current model). Resolve each to its
  // parent criterion. Legacy blobs (pre-minor deploy window) key by CRITERION id
  // instead — those keys won't resolve as minors, so we treat them as criteria
  // and attach the criterion's single default minor when one exists.
  const { data: minorRows } = await getClient()
    .from(DB_TABLES.MINOR_CRITERIA)
    .select('id, criteria_id')
    .in('id', keys)
  const parentByMinor = new Map((minorRows ?? []).map((m) => [m.id, m.criteria_id]))

  const legacyKeys = keys.filter((k) => !parentByMinor.has(k))
  const defaultMinorByCrit = new Map()
  if (legacyKeys.length) {
    const { data: legacyMinors } = await getClient()
      .from(DB_TABLES.MINOR_CRITERIA)
      .select('id, criteria_id')
      .in('criteria_id', legacyKeys)
      .order('display_order', { ascending: true })
    for (const m of legacyMinors ?? []) {
      if (!defaultMinorByCrit.has(m.criteria_id)) defaultMinorByCrit.set(m.criteria_id, m.id)
    }
  }

  // Build (criteriaId, minorId, score) triples.
  const triples = keys.map((key) => {
    if (parentByMinor.has(key)) {
      return { criteriaId: parentByMinor.get(key), minorId: key, score: Number(scoreMap[key]) }
    }
    return { criteriaId: key, minorId: defaultMinorByCrit.get(key) ?? null, score: Number(scoreMap[key]) }
  })

  // Clear prior rows for these criteria (all their minors) in this cell, then
  // re-insert, so a judge editing then re-locking never double-counts.
  const criteriaIds = [...new Set(triples.map((t) => t.criteriaId))]
  let del = getClient()
    .from(DB_TABLES.JUDGE_SCORES)
    .delete()
    .eq('judge_id', judgeId)
    .eq('contestant_id', contestantId)
    .in('criteria_id', criteriaIds)
  del = roundId ? del.eq('round_id', roundId) : del.is('round_id', null)
  const { error: delErr } = await del
  if (delErr) throw new ApiError(500, `Failed to sync live scores: ${delErr.message}`)

  const rows = triples.map((t) => ({
    judge_id: judgeId,
    contestant_id: contestantId,
    criteria_id: t.criteriaId,
    minor_criteria_id: t.minorId,
    round_id: roundId,
    division_id: divisionId,
    category_id: null,
    score: t.score,
  }))

  const { error: insErr } = await getClient().from(DB_TABLES.JUDGE_SCORES).insert(rows)
  if (insErr) throw new ApiError(500, `Failed to sync live scores: ${insErr.message}`)
}

// ---------------------------------------------------------------------------
// Phase 3 (§7.1) safety net — bridge ALL locked live-session scores for an
// event into the ranking store. Used on session completion to catch rows that
// predate the write-through above. Division is not stored per session-score
// row, so backfilled rows carry division_id = NULL (still ranked in the
// default/unfiltered pool). Best-effort: raises only on a hard DB error.
// ---------------------------------------------------------------------------
async function backfillLiveScoresToRankingStore(eventId) {
  const { data: rows, error } = await getClient()
    .from('competition_session_judge_scores')
    .select('round_id, contestant_id, judge_id, scores')
    .eq('event_id', eventId)
    .eq('is_locked', true)

  if (error) throw new ApiError(500, error.message)
  if (!rows?.length) return

  for (const row of rows) {
    const scoreMap = row.scores ?? {}
    if (!Object.keys(scoreMap).length) continue
    await bridgeSessionScoresToRankingStore(
      {
        currentRoundId: row.round_id ?? null,
        currentDivisionId: null,
        activeContestantId: row.contestant_id,
      },
      row.judge_id,
      scoreMap,
    )
  }
}

// Organizer-triggered re-sync: mirror ALL locked live-session scores into the
// ranking store so rankings/results are computed from what judges actually
// entered. Use when the two stores may have drifted (e.g. scores entered before
// the live→rankings write-through existed). Idempotent.
export async function resyncRankingStore(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  await backfillLiveScoresToRankingStore(eventId)
  emitToEvent(eventId, 'rankings:updated', { eventId })
  recordEventActivity({
    eventId,
    action: 'competition.session.resync_scores',
    userId: organizerId,
    module: 'competition',
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Judge submits score for current contestant in the session
// ---------------------------------------------------------------------------
export async function submitJudgeSessionScore(eventId, judgeId, { scores, contestantId } = {}) {
  const enrollment = await assertJudgeEnrolled(eventId, judgeId)
  const event = await getEventById(eventId)

  // Get active session
  const session = await getActiveSession(eventId)
  if (!session) {
    throw new ApiError(400, 'No active live session for this event')
  }
  if (session.status !== 'active') {
    throw new ApiError(400, 'Session is not active')
  }
  if (!session.activeContestantId) {
    throw new ApiError(400, 'No active contestant to score')
  }

  // Resolve the target contestant. Round-driven: the whole round's field is on
  // stage, so any contestant in the round order can be scored (each submission
  // names its contestantId). Mirrors getJudgeSessionView's stage set exactly, or
  // valid submissions for non-primary contestants would be rejected.
  const onStage = session.contestantOrder ?? []
  const targetContestantId = contestantId ?? onStage[0]
  if (!onStage.includes(targetContestantId)) {
    throw new ApiError(400, 'That contestant is not currently on stage')
  }

  // Validate that this contestant is in the current round's order
  if (!session.contestantOrder.includes(targetContestantId)) {
    throw new ApiError(400, 'Active contestant is not in the current round')
  }

  // #4 contestant gate: if the organizer has opened a subset, reject scores for
  // any contestant not currently open (empty/null gate = all open).
  const openGate = Array.isArray(session.activeContestantIds) ? session.activeContestantIds : null
  if (openGate && !openGate.includes(targetContestantId)) {
    throw new ApiError(400, 'This contestant is not open for scoring yet')
  }

  // Phase 6: a finalized round is locked — no further score edits allowed.
  if (session.currentRoundId) {
    const { data: roundRow } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUNDS)
      .select('finalized_at')
      .eq('id', session.currentRoundId)
      .maybeSingle()
    if (roundRow?.finalized_at) {
      throw new ApiError(409, 'This round has been finalized and can no longer be scored')
    }
  }

  // Existing row for this (judge, round, contestant): its prior scores + per-
  // criterion lock set (#6). A judge commits one criterion at a time, so this
  // submission ADDS to whatever was already locked rather than replacing it.
  const { data: existing } = await getClient()
    .from('competition_session_judge_scores')
    .select('id, is_locked, scores, locked_criteria')
    .eq('session_id', session.id)
    .eq('judge_id', judgeId)
    .eq('round_id', session.currentRoundId)
    .eq('contestant_id', targetContestantId)
    .maybeSingle()

  const priorScores = existing?.scores ?? {}
  const priorLocked = Array.isArray(existing?.locked_criteria) ? existing.locked_criteria : []
  const lockedSet = new Set(priorLocked)

  // Criteria the judge may score right now: the current round's OPEN criteria,
  // each with its minor criteria. Skip any criterion already locked (#6) — what
  // remains is exactly what this submission commits. Judges score MINOR criteria,
  // each validated against its own bounds; a criterion with no minors is scored
  // directly against the event scale.
  const scoringConfig = mergeScoringConfig(event.scoring_config)
  const eventBounds = resolveScoreBounds(scoringConfig)
  // All of the round's criteria (open + closed) in one read, so we can both submit
  // the open, not-yet-locked ones AND derive whether the row is now FULLY locked.
  const allScopeCriteria = await loadActiveScoringCriteria(eventId, session, eventBounds, { includeClosed: true })
  if (!allScopeCriteria.length) {
    throw new ApiError(400, 'No criteria are configured for scoring')
  }
  const openCriteria = allScopeCriteria.filter((c) => c.open)
  if (!openCriteria.length) {
    throw new ApiError(400, 'No criteria are currently open for scoring')
  }
  const toSubmit = openCriteria.filter((c) => !lockedSet.has(c.id))
  if (!toSubmit.length) {
    throw new ApiError(409, 'You have already submitted every open criterion for this contestant')
  }

  const scoreMap = {}
  const submittedCriteriaIds = []
  for (const crit of toSubmit) {
    const targets = crit.minors.length
      ? crit.minors
      : [{ id: crit.id, name: crit.name, minScore: eventBounds.min, maxScore: eventBounds.max }]
    for (const t of targets) {
      const value = scores[t.id]
      if (value === undefined || value === null || value === '') {
        throw new ApiError(400, `Score for "${t.name}" is required`)
      }
      const num = Number(value)
      if (Number.isNaN(num)) {
        throw new ApiError(400, `Score for "${t.name}" must be a number`)
      }
      if (num < t.minScore || num > t.maxScore) {
        throw new ApiError(
          400,
          `Score for "${t.name}" must be between ${t.minScore} and ${t.maxScore}`,
        )
      }
      scoreMap[t.id] = num
    }
    submittedCriteriaIds.push(crit.id)
  }

  // Merge into the row; is_locked is DERIVED — true once every one of the round's
  // criteria is locked. locked_at marks when the row became fully locked.
  const mergedScores = { ...priorScores, ...scoreMap }
  const mergedLocked = [...new Set([...priorLocked, ...submittedCriteriaIds])]
  const roundCriteriaIds = allScopeCriteria.map((c) => c.id)
  const fullyLocked = roundCriteriaIds.length > 0 && roundCriteriaIds.every((id) => mergedLocked.includes(id))
  const now = new Date().toISOString()

  const rowPayload = {
    scores: mergedScores,
    locked_criteria: mergedLocked,
    is_locked: fullyLocked,
    locked_at: fullyLocked ? now : null,
  }

  if (existing) {
    const { error } = await getClient()
      .from('competition_session_judge_scores')
      .update(rowPayload)
      .eq('id', existing.id)
    if (error) throw new ApiError(500, error.message)
  } else {
    const { error } = await getClient()
      .from('competition_session_judge_scores')
      .insert({
        session_id: session.id,
        event_id: eventId,
        round_id: session.currentRoundId,
        contestant_id: targetContestantId,
        judge_id: judgeId,
        ...rowPayload,
      })
    if (error) throw new ApiError(500, error.message)
  }

  // Phase 3 (§7.1): mirror ONLY the newly submitted criteria into the ranking
  // store — the bridge deletes+reinserts per criterion, so prior locked criteria
  // keep their ranking rows and partial submits accumulate.
  await bridgeSessionScoresToRankingStore(session, judgeId, scoreMap, targetContestantId)

  // M3: audit the score submission (fire-and-forget; recordAudit never throws).
  recordAudit({
    userId: judgeId,
    action: 'competition.score.submitted',
    entity: 'competition_session',
    entityId: session.id,
    details: {
      eventId,
      roundId: session.currentRoundId,
      contestantId: targetContestantId,
      criteriaIds: submittedCriteriaIds,
      fullyLocked,
    },
  })

  emitToEventOrganizer(eventId, 'session:judge-score-submitted', {
    sessionId: session.id,
    roundId: session.currentRoundId,
    contestantId: targetContestantId,
    judgeId,
    lockedCriteria: mergedLocked,
    locked: fullyLocked,
  })

  return {
    success: true,
    locked: fullyLocked,
    lockedCriteria: mergedLocked,
    message: fullyLocked
      ? 'All criteria submitted and locked for this contestant'
      : 'Criteria submitted and locked',
  }
}

// ---------------------------------------------------------------------------
// Get judge's scoring view for the active session
// ---------------------------------------------------------------------------
export async function getJudgeSessionView(eventId, judgeId, { divisionId } = {}) {
  const enrollment = await assertJudgeEnrolled(eventId, judgeId)
  const event = await getEventById(eventId)

  // Full event DTO so the judge header can render the banner + organization
  // logo (mapEvent pulls the logo from the embedded organizations → users).
  const eventInfo = mapEvent(event)

  const session = await getActiveSession(eventId)
  if (!session) {
    return {
      session: null,
      event: eventInfo,
      message: 'No active live session',
    }
  }

  if (session.status !== 'active') {
    return {
      session,
      event: eventInfo,
      message: 'Session is not active',
    }
  }

  if (!session.activeContestantId) {
    return {
      session,
      event: eventInfo,
      message: 'Waiting for organizer to select a contestant',
    }
  }

  // Round-driven scoring: the WHOLE round's field is on stage, so a judge scores
  // every contestant in the round from one scoresheet. The organizer may gate
  // WHICH contestants are open for scoring via active_contestant_ids (#4):
  //   null  → gate off, every contestant open (default, backward compatible)
  //   [...] → only these are open; the rest show but are locked (show-but-lock)
  // The full field is always returned so judges SEE everyone.
  let stageIds = session.contestantOrder ?? []
  const contestantGate = Array.isArray(session.activeContestantIds) ? session.activeContestantIds : null
  const contestantGateSet = contestantGate ? new Set(contestantGate) : null
  const isContestantOpen = (id) => !contestantGateSet || contestantGateSet.has(id)

  // Optional division filter (judge-side): narrow the field to one division.
  if (divisionId) {
    const divisionOrder = await buildContestantOrder(eventId, session.currentRoundId, divisionId)
    const divSet = new Set(divisionOrder)
    stageIds = stageIds.filter((id) => divSet.has(id))
  }

  // Safety net: never end up with an empty field when a single active contestant
  // is known (e.g. order not yet built).
  if (!stageIds.length && session.activeContestantId) {
    stageIds = [session.activeContestantId]
  }

  const { data: stageRows } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, event_id, name, photo, contestant_number, division_id')
    .in('id', stageIds)
  const stageById = new Map((stageRows ?? []).map((c) => [c.id, c]))

  // Division names so the judge sheet can group + label contestants by division
  // (contestant numbers repeat across divisions, e.g. Male #1 and Female #1).
  const divisionNameById = new Map()
  if (event.divisions_enabled) {
    const { data: divisionRows } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id, name')
      .eq('event_id', eventId)
    for (const d of divisionRows ?? []) divisionNameById.set(d.id, d.name)
  }

  // §8C: the event scale is the fallback range for any criterion that has no
  // minors (deploy window). Minors carry their own bounds (see below).
  const scoringConfig = mergeScoringConfig(event.scoring_config)
  const eventBounds = resolveScoreBounds(scoringConfig)

  // Criteria the judge scores: current round, each with its minor criteria and
  // bounds. show-but-lock (#4): return EVERY scope criterion with an `open` flag
  // so closed ones render disabled rather than disappearing.
  const criteria = await loadActiveScoringCriteria(eventId, session, eventBounds, { includeClosed: true })

  // This judge's existing session scores for every on-stage contestant, plus the
  // per-criterion lock set (#6) so the sheet can lock committed criteria one by one.
  const { data: existingRows } = await getClient()
    .from('competition_session_judge_scores')
    .select('contestant_id, scores, is_locked, locked_criteria')
    .eq('session_id', session.id)
    .eq('judge_id', judgeId)
    .eq('round_id', session.currentRoundId)
    .in('contestant_id', stageIds)
  const existingByContestant = new Map((existingRows ?? []).map((r) => [r.contestant_id, r]))

  // Resolve the current round's NAME so the judge always sees a friendly label
  // (the socket-emitted session carries no join, so it can arrive name-less).
  let roundName = session.currentRoundName ?? null
  if (session.currentRoundId && !roundName) {
    const { data: roundRow } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUNDS)
      .select('name')
      .eq('id', session.currentRoundId)
      .maybeSingle()
    roundName = roundRow?.name ?? null
  }

  // One entry per on-stage contestant with that contestant's own scores/lock.
  const stageContestants = stageIds
    .map((id) => stageById.get(id))
    .filter(Boolean)
    .map((c) => {
      const ex = existingByContestant.get(c.id)
      return {
        ...mapContestant(c),
        // Division so the sheet can group + label (numbers repeat across divisions).
        divisionId: c.division_id ?? null,
        divisionName: c.division_id ? divisionNameById.get(c.division_id) ?? null : null,
        existingScores: ex?.scores ?? {},
        hasSubmitted: !!(ex && ex.is_locked),
        // #6 per-criterion lock: the criterion ids this judge has committed for
        // this contestant. The sheet locks each committed criterion individually.
        lockedCriteria: Array.isArray(ex?.locked_criteria) ? ex.locked_criteria : [],
        // #4 show-but-lock: closed contestants render disabled on the sheet.
        open: isContestantOpen(c.id),
      }
    })

  const primary = stageContestants[0] ?? null

  return {
    session,
    // The judge page reads `activeSession` on mount to set its state.
    activeSession: session,
    event: eventInfo,
    // The scoring form renders `contestants` — the on-stage set (one in single
    // mode, several in a stage group). Each entry carries its own scores/lock.
    contestants: stageContestants,
    // Back-compat single-contestant fields (the primary on-stage contestant).
    contestant: primary ? { id: primary.id, name: primary.name, photo: primary.photo, contestantNumber: primary.contestantNumber } : null,
    existingScores: primary?.existingScores ?? {},
    hasSubmitted: primary?.hasSubmitted ?? false,
    // Round-driven: more than one on-stage contestant means the judge scores the
    // whole field from one sheet (also true for an explicit stage-group subset).
    stageGroup: stageContestants.length > 1,
    stageContestants,
    divisionsEnabled: Boolean(event.divisions_enabled),
    roundName,
    roundId: session.currentRoundId ?? null,
    criteria,
    activeCriteriaIds: session.activeCriteriaIds ?? [],
    scoringConfig,
    scoreBounds: eventBounds,
    totalContestants: session.contestantOrder.length,
    currentPosition: session.currentContestantOrder + 1,
  }
}

// ---------------------------------------------------------------------------
// Get judge progress for the current contestant (organizer view)
// ---------------------------------------------------------------------------
export async function getJudgeProgress(eventId, organizerId) {
  const session = await assertActiveSession(eventId, organizerId)

  const { data: judges, error: judgeError } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id, user_id, display_name, judge_role')
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .eq('is_active', true)

  if (judgeError) throw new ApiError(500, judgeError.message)

  const judgeParticipantIds = (judges ?? []).map((j) => j.id)
  let assignmentsByJudgeId = new Map()

  if (judgeParticipantIds.length) {
    const { data: assignments, error: assignmentError } = await getClient()
      .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
      .select('participant_id, scope, scope_id')
      .in('participant_id', judgeParticipantIds)

    if (assignmentError) throw new ApiError(500, assignmentError.message)

    assignmentsByJudgeId = new Map(judgeParticipantIds.map((id) => [id, []]))
    for (const assignment of assignments ?? []) {
      assignmentsByJudgeId.get(assignment.participant_id)?.push(assignment)
    }
  }

  const eligibleJudges = (judges ?? []).filter(j => {
    const ctx = {
      isFirstClass: true,
      role: j.judge_role ?? 'judge',
      assignments: assignmentsByJudgeId.get(j.id) || []
    }
    return canJudgeScore(ctx, {
      divisionId: session.currentDivisionId,
      roundId: session.currentRoundId,
    })
  })

  if (eligibleJudges.length === 0) {
    return { judges: [] }
  }

  // Round-driven progress: judges score the WHOLE field, so progress is a
  // contestant × judge matrix. Pull every score row for this round (#6 tracks
  // partial per-criterion locking, so include rows that aren't fully locked yet).
  const { data: scoreRows } = await getClient()
    .from('competition_session_judge_scores')
    .select('judge_id, contestant_id, locked_at, is_locked, locked_criteria')
    .eq('session_id', session.id)
    .eq('round_id', session.currentRoundId)
  const submittedScores = (scoreRows ?? []).filter((s) => s.is_locked)
  // Round criteria (denominator for partial progress + names for per-criterion unlock).
  const roundCriteriaIds = await loadRoundCriteriaIds(eventId, session.currentRoundId)
  const criteriaTotal = roundCriteriaIds.length
  let criteriaList = []
  if (roundCriteriaIds.length) {
    const { data: critRows } = await getClient()
      .from(DB_TABLES.CRITERIA)
      .select('id, name')
      .in('id', roundCriteriaIds)
    const byId = new Map((critRows ?? []).map((c) => [c.id, c.name]))
    criteriaList = roundCriteriaIds.map((id) => ({ id, name: byId.get(id) ?? 'Criterion' }))
  }

  // The round's contestants, in order, with display info for the grid.
  const order = session.contestantOrder ?? []
  let contestants = []
  if (order.length) {
    const { data: contestantRows } = await getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('id, name, contestant_number')
      .in('id', order)
    const byId = new Map((contestantRows ?? []).map((c) => [c.id, c]))
    contestants = order
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name, contestantNumber: c.contestant_number }))
  }

  const submitted = (submittedScores ?? []).map((s) => ({
    judgeId: s.judge_id,
    contestantId: s.contestant_id,
    submittedAt: s.locked_at ?? null,
  }))

  // #6 partial progress: which criteria each (judge, contestant) has locked.
  const progress = (scoreRows ?? []).map((s) => ({
    judgeId: s.judge_id,
    contestantId: s.contestant_id,
    lockedCriteria: Array.isArray(s.locked_criteria) ? s.locked_criteria : [],
    lockedCount: Array.isArray(s.locked_criteria) ? s.locked_criteria.length : 0,
    fullyLocked: Boolean(s.is_locked),
  }))

  return {
    roundId: session.currentRoundId,
    divisionId: session.currentDivisionId,
    // Back-compat: the previously-active contestant id (unused by the grid).
    contestantId: session.activeContestantId,
    judges: eligibleJudges.map((j) => ({
      judgeId: j.user_id,
      judgeRowId: j.id,
      displayName: j.display_name,
      role: j.judge_role ?? 'judge',
    })),
    contestants,
    // Flat list of fully-locked (judge, contestant) submissions; the UI builds the grid.
    submitted,
    // Per-cell partial lock detail (#6) + the round's criteria (total + names).
    progress,
    criteria: criteriaList,
    criteriaTotal,
    totalJudges: eligibleJudges.length,
  }
}

// ---------------------------------------------------------------------------
// B5 — Organizer unlock: reopen a locked score so a judge can revise it.
// Unlocks one contestant's submissions in the current round — all judges by
// default, or a single judge when `judgeId` is given. Audited; judges are
// notified so their now-reopened row becomes editable again.
// ---------------------------------------------------------------------------
export async function unlockSessionScore(eventId, organizerId, { contestantId, judgeId, criteriaId } = {}) {
  const session = await assertActiveSession(eventId, organizerId)

  if (!contestantId) {
    throw new ApiError(400, 'contestantId is required')
  }
  if (!session.contestantOrder.includes(contestantId)) {
    throw new ApiError(400, 'Contestant is not in the current round')
  }

  // Fetch the affected rows so we can adjust their per-criterion lock set (#6).
  let sel = getClient()
    .from('competition_session_judge_scores')
    .select('id, judge_id, is_locked, locked_criteria')
    .eq('session_id', session.id)
    .eq('round_id', session.currentRoundId)
    .eq('contestant_id', contestantId)
  if (judgeId) sel = sel.eq('judge_id', judgeId)
  const { data: rows, error: selErr } = await sel
  if (selErr) throw new ApiError(500, selErr.message)

  let unlockedCount = 0
  for (const row of rows ?? []) {
    const locked = Array.isArray(row.locked_criteria) ? row.locked_criteria : []
    if (criteriaId) {
      // Per-criterion unlock: drop just this criterion; row is no longer fully locked.
      if (!locked.includes(criteriaId)) continue
      const next = locked.filter((id) => id !== criteriaId)
      const { error } = await getClient()
        .from('competition_session_judge_scores')
        .update({ locked_criteria: next, is_locked: false, locked_at: null })
        .eq('id', row.id)
      if (error) throw new ApiError(500, error.message)
      unlockedCount++
    } else {
      // Whole-contestant unlock: clear the lock set so every criterion reopens.
      if (!locked.length && row.is_locked !== true) continue
      const { error } = await getClient()
        .from('competition_session_judge_scores')
        .update({ locked_criteria: [], is_locked: false, locked_at: null })
        .eq('id', row.id)
      if (error) throw new ApiError(500, error.message)
      unlockedCount++
    }
  }

  recordAudit({
    userId: organizerId,
    action: 'competition.score.unlocked',
    entity: 'competition_session',
    entityId: session.id,
    details: {
      eventId,
      roundId: session.currentRoundId,
      contestantId,
      judgeId: judgeId ?? null,
      criteriaId: criteriaId ?? null,
      unlockedCount,
    },
  })

  // Judges reload their sheet; the reopened contestant becomes editable again.
  emitToEvent(eventId, 'session:contestant-changed', {
    session,
    previousContestantId: session.activeContestantId,
  })

  return { success: true, unlockedCount, contestantId, judgeId: judgeId ?? null }
}

// ---------------------------------------------------------------------------
// Internal: assert there is an active session and the organizer owns it
// ---------------------------------------------------------------------------
async function assertActiveSession(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const session = await getActiveSession(eventId)
  if (!session) {
    throw new ApiError(404, 'No active live session for this event')
  }
  return session
}

// ---------------------------------------------------------------------------
// Phase 6 — Round finalize & advancement (§8B)
// ---------------------------------------------------------------------------

// Standard-competition ("1224") ranking over a scored list, desc by score.
function rankByScore(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score)
  sorted.forEach((row, i) => {
    row.rank = i > 0 && row.score === sorted[i - 1].score ? sorted[i - 1].rank : i + 1
  })
  return sorted
}

// Compute a round's official standing. Honors round↔criteria membership and the
// round's score_policy (independent = this round only; cumulative = adds the
// scores from prior FINALIZED rounds, §8B). When `divisionId` is given (H1), the
// standing is scoped to that division so each division ranks and advances on its
// own — how real competitions with divisions actually run.
async function computeRoundStanding(eventId, round, scoringConfig, { divisionId = null } = {}) {
  const roundId = round.id

  // Contestants: the round's assigned set, else the whole event.
  const { data: rc } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
    .select('contestant_id')
    .eq('round_id', roundId)
  let contestantIds = (rc ?? []).map((r) => r.contestant_id)

  let contestantsQuery = getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, name, contestant_number, photo, division_id')
    .eq('event_id', eventId)
  if (contestantIds.length) contestantsQuery = contestantsQuery.in('id', contestantIds)
  if (divisionId) contestantsQuery = contestantsQuery.eq('division_id', divisionId)
  const { data: contestants } = await contestantsQuery
  contestantIds = (contestants ?? []).map((c) => c.id)
  if (!contestantIds.length) return []

  // Criteria: the round's assigned set, else all event criteria.
  const { data: rcrit } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
    .select('criteria_id')
    .eq('round_id', roundId)
  const critIds = (rcrit ?? []).map((r) => r.criteria_id)

  let criteriaQuery = getClient()
    .from(DB_TABLES.CRITERIA)
    .select('id, name, percentage')
    .eq('event_id', eventId)
  if (critIds.length) criteriaQuery = criteriaQuery.in('id', critIds)
  const { data: criteria } = await criteriaQuery

  // Nest minor criteria so the engine builds each criterion's score from them.
  const criteriaList = criteria ?? []
  if (criteriaList.length) {
    const { data: minorRows } = await getClient()
      .from(DB_TABLES.MINOR_CRITERIA)
      .select('id, criteria_id, name, score_type, custom_min, custom_max, display_order')
      .in('criteria_id', criteriaList.map((c) => c.id))
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    const byCrit = new Map()
    for (const m of minorRows ?? []) {
      if (!byCrit.has(m.criteria_id)) byCrit.set(m.criteria_id, [])
      byCrit.get(m.criteria_id).push({
        id: m.id,
        criteriaId: m.criteria_id,
        name: m.name,
        scoreType: m.score_type,
        customMin: m.custom_min,
        customMax: m.custom_max,
      })
    }
    for (const c of criteriaList) c.minorCriteria = byCrit.get(c.id) ?? []
  }

  // Scores for THIS round only.
  const { data: scores } = await getClient()
    .from(DB_TABLES.JUDGE_SCORES)
    .select('contestant_id, criteria_id, minor_criteria_id, round_id, score, judge_id')
    .eq('round_id', roundId)

  const { rankings } = computeRankings({
    scores: (scores ?? []).filter((s) => contestantIds.includes(s.contestant_id)),
    contestants: contestants ?? [],
    criteria: criteriaList,
    rounds: [{ id: roundId, name: round.name, weight: 100 }],
    roundCriteria: critIds.length ? { [roundId]: critIds } : null,
    config: scoringConfig,
  })

  const divisionById = new Map((contestants ?? []).map((c) => [c.id, c.division_id ?? null]))
  // `score` is the ranking value (becomes cumulative below when the policy is
  // cumulative). `roundScore` always stays this round's own score so THRESHOLD
  // advancement is per-round even under a cumulative policy (#5).
  let standing = rankings.map((r) => ({
    contestantId: r.contestantId,
    contestantName: r.contestantName,
    contestantNumber: r.contestantNumber,
    divisionId: divisionById.get(r.contestantId) ?? null,
    score: r.finalScore,
    roundScore: r.finalScore,
  }))

  // Cumulative policy: add the sum of prior finalized rounds' snapshot scores.
  if (round.score_policy === SCORE_POLICIES.CUMULATIVE) {
    const { data: priorRounds } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUNDS)
      .select('id, display_order, finalized_at')
      .eq('event_id', eventId)
      .not('finalized_at', 'is', null)
      .lt('display_order', round.display_order)
    const priorRoundIds = (priorRounds ?? []).map((r) => r.id)

    if (priorRoundIds.length) {
      const { data: priorResults } = await getClient()
        .from(DB_TABLES.COMPETITION_ROUND_RESULTS)
        .select('contestant_id, score')
        .in('round_id', priorRoundIds)
      const priorByContestant = new Map()
      for (const pr of priorResults ?? []) {
        priorByContestant.set(pr.contestant_id, (priorByContestant.get(pr.contestant_id) ?? 0) + Number(pr.score))
      }
      standing = standing.map((s) => ({
        ...s,
        score: s.score + (priorByContestant.get(s.contestantId) ?? 0),
      }))
    }
  }

  return rankByScore(standing)
}

// H1 — division-aware advancement. When the event uses divisions, compute the
// standing and select qualifiers PER division (top-N per division, etc.), then
// merge. Otherwise fall back to a single event-wide standing. Returns the merged
// standing (each row keeps its divisionId) + the auto-qualified set.
async function computeRoundAdvancement(eventId, round, scoringConfig, event) {
  const auto = new Set()

  if (event?.divisions_enabled) {
    const { data: divs } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('event_id', eventId)
    if (divs?.length) {
      const standing = []
      for (const d of divs) {
        const s = await computeRoundStanding(eventId, round, scoringConfig, { divisionId: d.id })
        for (const id of selectQualifiers(s, round.advancement_type, round.advancement_value)) {
          auto.add(id)
        }
        standing.push(...s)
      }
      return { standing, auto }
    }
  }

  const standing = await computeRoundStanding(eventId, round, scoringConfig, {})
  for (const id of selectQualifiers(standing, round.advancement_type, round.advancement_value)) {
    auto.add(id)
  }
  return { standing, auto }
}

async function getNextRound(eventId, round) {
  const { data } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('id, name, display_order')
    .eq('event_id', eventId)
    .gt('display_order', round.display_order)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// Preview a round's standing + auto-selected qualifiers WITHOUT committing, so
// the organizer can review and adjust before finalizing (real head-judge
// discretion). No writes, no locking.
export async function previewRoundAdvancement(eventId, organizerId, roundId) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)
  const scoringConfig = mergeScoringConfig(event.scoring_config)

  const { data: round, error: rErr } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('*')
    .eq('id', roundId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (rErr) throw new ApiError(500, rErr.message)
  if (!round) throw new ApiError(404, 'Round not found')

  const { standing, auto } = await computeRoundAdvancement(eventId, round, scoringConfig, event)

  const nextRound = await getNextRound(eventId, round)

  return {
    roundId,
    roundName: round.name,
    isOpen: round.is_open,
    finalized: Boolean(round.finalized_at),
    advancementType: round.advancement_type,
    advancementValue: round.advancement_value,
    scorePolicy: round.score_policy,
    divisionsEnabled: Boolean(event.divisions_enabled),
    nextRoundId: nextRound?.id ?? null,
    nextRoundName: nextRound?.name ?? null,
    standing: standing.map((s) => ({ ...s, qualified: auto.has(s.contestantId) })),
  }
}

// Finalize a round: compute its standing, snapshot it, choose qualifiers (auto +
// organizer override), lock the round, and seed the next round with qualifiers.
// Nothing is ever auto-deleted; the organizer confirms via `overrides`.
export async function finalizeRound(eventId, organizerId, roundId, { overrides = null, force = false } = {}) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)
  const scoringConfig = mergeScoringConfig(event.scoring_config)

  const { data: round, error: rErr } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('*')
    .eq('id', roundId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (rErr) throw new ApiError(500, rErr.message)
  if (!round) throw new ApiError(404, 'Round not found')
  // `force` allows RE-finalizing an already-finalized round to refresh its frozen
  // snapshot (e.g. after a scoring fix or a late criteria→round link). Without it,
  // a finalized round is immutable.
  if (round.finalized_at && !force) throw new ApiError(409, 'This round has already been finalized')
  if (round.is_open) throw new ApiError(400, 'Close the round before finalizing it')

  // On a forced recompute, first sync the ranking store from the live-session
  // scores so the refreshed snapshot reflects any score corrections made since the
  // original finalize (e.g. a direct edit to the session scores).
  if (force) {
    await backfillLiveScoresToRankingStore(eventId)
  }

  // H1: division-aware standing + qualifiers (per division when enabled).
  const { standing, auto } = await computeRoundAdvancement(eventId, round, scoringConfig, event)
  if (!standing.length) {
    throw new ApiError(400, 'No scored contestants to finalize in this round')
  }

  const qualifiedSet = applyQualifierOverride(auto, overrides)

  // M2: on a FIRST finalize, atomically CLAIM by flipping finalized_at from NULL
  // so concurrent/double-clicked finalizes can't both proceed. On a forced
  // re-finalize the round is already claimed, so we keep its original timestamp
  // and just refresh the snapshot below.
  let now
  let didClaim = false
  if (round.finalized_at && force) {
    now = round.finalized_at
  } else {
    now = new Date().toISOString()
    const { data: claimed, error: claimErr } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUNDS)
      .update({ finalized_at: now })
      .eq('id', roundId)
      .is('finalized_at', null)
      .select('id')
    if (claimErr) throw new ApiError(500, claimErr.message)
    if (!claimed?.length) throw new ApiError(409, 'This round has already been finalized')
    didClaim = true
  }

  const nextRound = await getNextRound(eventId, round)
  const qualifiers = [...qualifiedSet]
  let seededCount = 0

  try {
    // M1: after claiming, write the snapshot + seed the next round. If any of
    // this fails, the catch RELEASES the claim so the operation can be retried
    // cleanly (compensating action — the JS client has no multi-statement txn).
    await getClient().from(DB_TABLES.COMPETITION_ROUND_RESULTS).delete().eq('round_id', roundId)
    const resultRows = standing.map((s) => ({
      round_id: roundId,
      contestant_id: s.contestantId,
      division_id: s.divisionId ?? null,
      rank: s.rank,
      score: s.score,
      qualified: qualifiedSet.has(s.contestantId),
    }))
    const { error: insErr } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_RESULTS)
      .insert(resultRows)
    if (insErr) throw new ApiError(500, insErr.message)

    if (nextRound && qualifiers.length) {
      const rows = qualifiers.map((cid) => ({ round_id: nextRound.id, contestant_id: cid }))
      const { error: seedErr } = await getClient()
        .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
        .upsert(rows, { onConflict: 'round_id,contestant_id', ignoreDuplicates: true })
      if (seedErr) throw new ApiError(500, seedErr.message)
      seededCount = qualifiers.length
    }
  } catch (err) {
    // Only release the claim if THIS call created it — never un-finalize a round
    // that was already finalized before a forced recompute.
    if (didClaim) {
      await getClient()
        .from(DB_TABLES.COMPETITION_ROUNDS)
        .update({ finalized_at: null })
        .eq('id', roundId)
    }
    throw err
  }

  // M3: audit the elimination decision (fire-and-forget; recordAudit never throws).
  recordAudit({
    userId: organizerId,
    action: 'competition.round.finalized',
    entity: 'competition_round',
    entityId: roundId,
    details: {
      eventId,
      qualifiers,
      seededCount,
      nextRoundId: nextRound?.id ?? null,
      overrideApplied: Boolean(overrides && ((overrides.add?.length ?? 0) || (overrides.remove?.length ?? 0))),
    },
  })

  emitToEvent(eventId, 'session:round-finalized', {
    roundId,
    nextRoundId: nextRound?.id ?? null,
    qualifiedCount: qualifiers.length,
  })

  // Refresh live rankings so results surfaces reflect the finalized round.
  try {
    const { getLiveRankings } = await import('./pageant.service.js')
    const rankings = await getLiveRankings(eventId, organizerId)
    emitToEvent(eventId, 'rankings:updated', { eventId, rankings })
  } catch (e) {
    console.error('[finalize] rankings refresh failed:', e.message)
  }

  return {
    roundId,
    roundName: round.name,
    finalizedAt: now,
    standing: standing.map((s) => ({ ...s, qualified: qualifiedSet.has(s.contestantId) })),
    qualifiers,
    nextRoundId: nextRound?.id ?? null,
    nextRoundName: nextRound?.name ?? null,
    seededCount,
  }
}

// Read a finalized round's snapshot (for the review/results UI).
export async function getRoundResults(eventId, organizerId, roundId) {
  await assertCompetitionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_RESULTS)
    .select('contestant_id, division_id, rank, score, qualified')
    .eq('round_id', roundId)
    .order('rank', { ascending: true })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map((r) => ({
    contestantId: r.contestant_id,
    divisionId: r.division_id,
    rank: r.rank,
    score: Number(r.score),
    qualified: r.qualified,
  }))
}
