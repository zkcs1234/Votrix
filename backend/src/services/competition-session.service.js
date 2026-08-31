// Competition Live Session Service
// Extends the competition module with live session control.
// Does NOT replace any existing scoring workflow — it adds stage control on top.

import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES, PARTICIPANT_TYPES, SCORE_POLICIES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { assertJudgeEnrolled, canJudgeScore } from './pageant.service.js'
import { mergeScoringConfig, resolveScoreBounds, computeRankings } from '../modules/scoring-engine.js'
import { selectQualifiers, applyQualifierOverride } from '../modules/advancement.js'
import { recordAudit } from '../foundation/audit.js'
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
  const roundContestants = order.map((id) => contestantsById.get(id)).filter(Boolean)

  // Active round enriched with its criteria (round-scoped, else event-wide).
  let activeRound = null
  if (session.currentRoundId) {
    const r = (rounds ?? []).find((x) => x.id === session.currentRoundId)
    let criteria = []
    const { data: rcrit } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('criteria_id')
      .eq('round_id', session.currentRoundId)
    if (rcrit && rcrit.length) {
      const ids = rcrit.map((x) => x.criteria_id)
      const { data: crits } = await getClient()
        .from(DB_TABLES.CRITERIA)
        .select('id, name, percentage')
        .in('id', ids)
      criteria = crits ?? []
    } else {
      const { data: crits } = await getClient()
        .from(DB_TABLES.CRITERIA)
        .select('id, name, percentage')
        .eq('event_id', eventId)
      criteria = crits ?? []
    }
    activeRound = {
      id: session.currentRoundId,
      name: r?.name ?? session.currentRoundName ?? 'Round',
      isOpen: r?.is_open ?? true,
      finalized: Boolean(r?.finalized_at),
      contestants: roundContestants,
      criteria,
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
  await assertCompetitionEvent(eventId, organizerId)

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

  const { data, error } = await getClient()
    .from('competition_sessions')
    .update({
      current_round_id: roundId,
      active_contestant_id: contestantOrder.length > 0 ? contestantOrder[0] : null,
      current_contestant_order: 0,
      contestant_order: contestantOrder,
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
  const criteriaIds = Object.keys(scoreMap ?? {})
  if (!criteriaIds.length) return

  const roundId = session.currentRoundId ?? null
  const divisionId = session.currentDivisionId ?? null
  const contestantId = contestantIdArg ?? session.activeContestantId

  let del = getClient()
    .from(DB_TABLES.JUDGE_SCORES)
    .delete()
    .eq('judge_id', judgeId)
    .eq('contestant_id', contestantId)
    .in('criteria_id', criteriaIds)
  del = roundId ? del.eq('round_id', roundId) : del.is('round_id', null)
  const { error: delErr } = await del
  if (delErr) throw new ApiError(500, `Failed to sync live scores: ${delErr.message}`)

  const rows = criteriaIds.map((criteriaId) => ({
    judge_id: judgeId,
    contestant_id: contestantId,
    criteria_id: criteriaId,
    round_id: roundId,
    division_id: divisionId,
    category_id: null,
    score: Number(scoreMap[criteriaId]),
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

  // Resolve the target contestant. In stage-group mode multiple contestants are
  // on stage; the judge must say which one this submission is for. Without a
  // group, it defaults to the single active contestant (back-compat).
  const onStage = session.activeContestantIds?.length
    ? session.activeContestantIds
    : [session.activeContestantId]
  const targetContestantId = contestantId ?? onStage[0]
  if (!onStage.includes(targetContestantId)) {
    throw new ApiError(400, 'That contestant is not currently on stage')
  }

  // Validate that this contestant is in the current round's order
  if (!session.contestantOrder.includes(targetContestantId)) {
    throw new ApiError(400, 'Active contestant is not in the current round')
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

  // Check if judge already submitted for this contestant in this round
  const { data: existing } = await getClient()
    .from('competition_session_judge_scores')
    .select('id, is_locked')
    .eq('session_id', session.id)
    .eq('judge_id', judgeId)
    .eq('round_id', session.currentRoundId)
    .eq('contestant_id', targetContestantId)
    .maybeSingle()

  if (existing && existing.is_locked) {
    throw new ApiError(409, 'You have already submitted scores for this contestant')
  }

  // Get criteria for the current round (or event-wide)
  let criteria = []
  if (session.currentRoundId) {
    const { data: roundCriteria } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('criteria_id')
      .eq('round_id', session.currentRoundId)

    if (roundCriteria && roundCriteria.length > 0) {
      const criteriaIds = roundCriteria.map(rc => rc.criteria_id)
      const { data: crits } = await getClient()
        .from(DB_TABLES.CRITERIA)
        .select('id, event_id, name, percentage, min_score, max_score')
        .in('id', criteriaIds)

      criteria = (crits ?? []).map(mapCriteria)
    }
  }

  if (criteria.length === 0) {
    // Fallback to event-wide criteria
    const { data: crits } = await getClient()
      .from(DB_TABLES.CRITERIA)
      .select('id, event_id, name, percentage, min_score, max_score')
      .eq('event_id', eventId)

    criteria = (crits ?? []).map(mapCriteria)
  }

  // Validate scores. §8C: the event scale (scoring_config.scoreType) is the
  // source of truth for the range; the live path now enforces it too (it used to
  // check only the per-criterion min/max, so a scale of 1–10 was silently
  // ignored here while the batch path rejected out-of-scale scores). The
  // per-criterion min/max remains an optional override that must fit inside the
  // scale — matching submitJudgeScores.
  // §8C: the event scale is the single source of truth for the valid range, and
  // it must match what the judge FORM allows (the form uses these same scale
  // bounds). We deliberately IGNORE any stray per-criterion min_score/max_score
  // here — the UI no longer lets organizers set per-criterion ranges, so a
  // leftover value (e.g. an "Audience Impact" max of 10 on a 1–100 event) must
  // not silently cap a judge's score below the scale.
  const scoringConfig = mergeScoringConfig(event.scoring_config)
  const eventBounds = resolveScoreBounds(scoringConfig)

  const scoreMap = {}
  for (const crit of criteria) {
    const value = scores[crit.id]
    if (value === undefined || value === null || value === '') {
      throw new ApiError(400, `Score for "${crit.name}" is required`)
    }
    const num = Number(value)
    if (Number.isNaN(num)) {
      throw new ApiError(400, `Score for "${crit.name}" must be a number`)
    }
    if (num < eventBounds.min || num > eventBounds.max) {
      throw new ApiError(
        400,
        `Score for "${crit.name}" must be between ${eventBounds.min} and ${eventBounds.max}`,
      )
    }
    scoreMap[crit.id] = num
  }

  const now = new Date().toISOString()

  if (existing) {
    // Update existing (unlocked) record
    const { data, error } = await getClient()
      .from('competition_session_judge_scores')
      .update({
        scores: scoreMap,
        is_locked: true,
        locked_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw new ApiError(500, error.message)

    // Phase 3 (§7.1): mirror into the ranking store so live scores rank.
    await bridgeSessionScoresToRankingStore(session, judgeId, scoreMap, targetContestantId)

    // M3: audit the score submission (fire-and-forget; recordAudit never throws).
    recordAudit({
      userId: judgeId,
      action: 'competition.score.submitted',
      entity: 'competition_session',
      entityId: session.id,
      details: { eventId, roundId: session.currentRoundId, contestantId: targetContestantId },
    })

    // Notify organizer that a judge submitted
    emitToEventOrganizer(eventId, 'session:judge-score-submitted', {
      sessionId: session.id,
      roundId: session.currentRoundId,
      contestantId: targetContestantId,
      judgeId,
      locked: true,
    })

    return { success: true, locked: true, message: 'Scores submitted and locked' }
  }

  // Insert new score record
  const { data, error } = await getClient()
    .from('competition_session_judge_scores')
    .insert({
      session_id: session.id,
      event_id: eventId,
      round_id: session.currentRoundId,
      contestant_id: targetContestantId,
      judge_id: judgeId,
      scores: scoreMap,
      is_locked: true,
      locked_at: now,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  // Phase 3 (§7.1): mirror into the ranking store so live scores rank.
  await bridgeSessionScoresToRankingStore(session, judgeId, scoreMap, targetContestantId)

  // Notify organizer
  emitToEventOrganizer(eventId, 'session:judge-score-submitted', {
    sessionId: session.id,
    roundId: session.currentRoundId,
    contestantId: targetContestantId,
    judgeId,
    locked: true,
  })

  return { success: true, locked: true, message: 'Scores submitted and locked' }
}

// ---------------------------------------------------------------------------
// Get judge's scoring view for the active session
// ---------------------------------------------------------------------------
export async function getJudgeSessionView(eventId, judgeId) {
  const enrollment = await assertJudgeEnrolled(eventId, judgeId)
  const event = await getEventById(eventId)

  const session = await getActiveSession(eventId)
  if (!session) {
    return {
      session: null,
      event: { id: eventId, title: event.title, eventType: event.event_type },
      message: 'No active live session',
    }
  }

  if (session.status !== 'active') {
    return {
      session,
      event: { id: eventId, title: event.title, eventType: event.event_type },
      message: 'Session is not active',
    }
  }

  if (!session.activeContestantId) {
    return {
      session,
      event: { id: eventId, title: event.title, eventType: event.event_type },
      message: 'Waiting for organizer to select a contestant',
    }
  }

  // Stage contestants: the group when set, else just the single active one.
  const stageIds = session.activeContestantIds?.length
    ? session.activeContestantIds
    : [session.activeContestantId]

  const { data: stageRows } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, event_id, name, photo, contestant_number')
    .in('id', stageIds)
  const stageById = new Map((stageRows ?? []).map((c) => [c.id, c]))

  // Get criteria for the current round
  let criteria = []
  if (session.currentRoundId) {
    const { data: roundCriteria } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('criteria_id')
      .eq('round_id', session.currentRoundId)

    if (roundCriteria && roundCriteria.length > 0) {
      const criteriaIds = roundCriteria.map(rc => rc.criteria_id)
      const { data: crits } = await getClient()
        .from(DB_TABLES.CRITERIA)
        .select('id, event_id, name, percentage, min_score, max_score')
        .in('id', criteriaIds)

      criteria = (crits ?? []).map(mapCriteria)
    }
  }

  if (criteria.length === 0) {
    const { data: crits } = await getClient()
      .from(DB_TABLES.CRITERIA)
      .select('id, event_id, name, percentage, min_score, max_score')
      .eq('event_id', eventId)

    criteria = (crits ?? []).map(mapCriteria)
  }

  // This judge's existing session scores for every on-stage contestant.
  const { data: existingRows } = await getClient()
    .from('competition_session_judge_scores')
    .select('contestant_id, scores, is_locked')
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

  // §8C: the event scale is the single source of truth for the score range.
  const scoringConfig = mergeScoringConfig(event.scoring_config)
  const eventBounds = resolveScoreBounds(scoringConfig)
  const criteriaWithBounds = criteria.map((c) => ({
    ...c,
    minScore: eventBounds.min,
    maxScore: eventBounds.max,
  }))

  // One entry per on-stage contestant with that contestant's own scores/lock.
  const stageContestants = stageIds
    .map((id) => stageById.get(id))
    .filter(Boolean)
    .map((c) => {
      const ex = existingByContestant.get(c.id)
      return {
        ...mapContestant(c),
        existingScores: ex?.scores ?? {},
        hasSubmitted: !!(ex && ex.is_locked),
      }
    })

  const primary = stageContestants[0] ?? null

  return {
    session,
    // The judge page reads `activeSession` on mount to set its state.
    activeSession: session,
    event: { id: eventId, title: event.title, eventType: event.event_type },
    // The scoring form renders `contestants` — the on-stage set (one in single
    // mode, several in a stage group). Each entry carries its own scores/lock.
    contestants: stageContestants,
    // Back-compat single-contestant fields (the primary on-stage contestant).
    contestant: primary ? { id: primary.id, name: primary.name, photo: primary.photo, contestantNumber: primary.contestantNumber } : null,
    existingScores: primary?.existingScores ?? {},
    hasSubmitted: primary?.hasSubmitted ?? false,
    // Stage group: every on-stage contestant, each scored individually.
    stageGroup: Boolean(session.activeContestantIds?.length),
    stageContestants,
    roundName,
    roundId: session.currentRoundId ?? null,
    criteria: criteriaWithBounds,
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

  // Get submitted scores for this contestant in this round
  const { data: submittedScores } = await getClient()
    .from('competition_session_judge_scores')
    .select('judge_id, is_locked, scores')
    .eq('session_id', session.id)
    .eq('round_id', session.currentRoundId)
    .eq('contestant_id', session.activeContestantId)
    .eq('is_locked', true)

  const submittedJudgeIds = new Set((submittedScores ?? []).map(s => s.judge_id))

  return {
    contestantId: session.activeContestantId,
    roundId: session.currentRoundId,
    divisionId: session.currentDivisionId,
    judges: eligibleJudges.map(j => ({
      judgeId: j.user_id,
      judgeRowId: j.id,
      displayName: j.display_name,
      role: j.judge_role ?? 'judge',
      hasSubmitted: submittedJudgeIds.has(j.user_id),
    })),
    totalJudges: eligibleJudges.length,
    submittedCount: submittedJudgeIds.size,
  }
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

  // Scores for THIS round only.
  const { data: scores } = await getClient()
    .from(DB_TABLES.JUDGE_SCORES)
    .select('contestant_id, criteria_id, round_id, score, judge_id')
    .eq('round_id', roundId)

  const { rankings } = computeRankings({
    scores: (scores ?? []).filter((s) => contestantIds.includes(s.contestant_id)),
    contestants: contestants ?? [],
    criteria: criteria ?? [],
    rounds: [{ id: roundId, name: round.name, weight: 100 }],
    roundCriteria: critIds.length ? { [roundId]: critIds } : null,
    config: scoringConfig,
  })

  const divisionById = new Map((contestants ?? []).map((c) => [c.id, c.division_id ?? null]))
  let standing = rankings.map((r) => ({
    contestantId: r.contestantId,
    contestantName: r.contestantName,
    contestantNumber: r.contestantNumber,
    divisionId: divisionById.get(r.contestantId) ?? null,
    score: r.finalScore,
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
