// Competition Live Session Service
// Extends the competition module with live session control.
// Does NOT replace any existing scoring workflow — it adds stage control on top.

import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { assertJudgeEnrolled } from './pageant.service.js'
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
    currentRoundId: row.current_round_id,
    currentRoundName: row.current_round_name ?? null,
    activeContestantId: row.active_contestant_id,
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

  // Get the first open round (ordered by display_order)
  const { data: rounds, error: roundsError } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('id, name, display_order')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (roundsError) throw new ApiError(500, roundsError.message)

  let firstRoundId = null
  let contestantOrder = []

  if (rounds && rounds.length > 0) {
    firstRoundId = rounds[0].id
    // Get contestants for this round
    const { data: roundContestants } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
      .select('contestant_id')
      .eq('round_id', firstRoundId)
      .order('created_at', { ascending: true })

    if (roundContestants && roundContestants.length > 0) {
      // Preserve order from round_contestants table
      const idSet = new Set(roundContestants.map(rc => rc.contestant_id))
      contestantOrder = roundContestants.map(rc => rc.contestant_id)
      // Also add any contestants not in the round (they appear at the end)
      const { data: allContestants } = await getClient()
        .from(DB_TABLES.CONTESTANTS)
        .select('id')
        .eq('event_id', eventId)
        .order('contestant_number', { ascending: true })

      for (const c of allContestants ?? []) {
        if (!idSet.has(c.id)) {
          contestantOrder.push(c.id)
        }
      }
    } else {
      // Round has no specific contestants — use all contestants
      const { data: allContestants } = await getClient()
        .from(DB_TABLES.CONTESTANTS)
        .select('id')
        .eq('event_id', eventId)
        .order('contestant_number', { ascending: true })

      contestantOrder = (allContestants ?? []).map(c => c.id)
    }
  } else {
    // No rounds defined — use all contestants ordered by number
    const { data: allContestants } = await getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('id')
      .eq('event_id', eventId)
      .order('contestant_number', { ascending: true })

    contestantOrder = (allContestants ?? []).map(c => c.id)
  }

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

  // Get contestant order for this round
  const { data: roundContestants } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUND_CONTESTANTS)
    .select('contestant_id')
    .eq('round_id', roundId)
    .order('created_at', { ascending: true })

  let contestantOrder = []
  if (roundContestants && roundContestants.length > 0) {
    contestantOrder = roundContestants.map(rc => rc.contestant_id)
  } else {
    // Fallback to all contestants
    const { data: allContestants } = await getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('id')
      .eq('event_id', eventId)
      .order('contestant_number', { ascending: true })

    contestantOrder = (allContestants ?? []).map(c => c.id)
  }

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
  const session = await assertActiveSession(eventId, organizerId)

  // Allow resuming even if status check fails — we need to find paused sessions too
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
  const session = await assertActiveSession(eventId, organizerId)

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
// Judge submits score for current contestant in the session
// ---------------------------------------------------------------------------
export async function submitJudgeSessionScore(eventId, judgeId, { scores }) {
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

  // Validate that this contestant is in the current round's order
  if (!session.contestantOrder.includes(session.activeContestantId)) {
    throw new ApiError(400, 'Active contestant is not in the current round')
  }

  // Check if judge already submitted for this contestant in this round
  const { data: existing } = await getClient()
    .from('competition_session_judge_scores')
    .select('id, is_locked')
    .eq('session_id', session.id)
    .eq('judge_id', judgeId)
    .eq('round_id', session.currentRoundId)
    .eq('contestant_id', session.activeContestantId)
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

  // Validate scores
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
    if (num < crit.minScore || num > crit.maxScore) {
      throw new ApiError(
        400,
        `Score for "${crit.name}" must be between ${crit.minScore} and ${crit.maxScore}`,
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

    // Notify organizer that a judge submitted
    emitToEventOrganizer(eventId, 'session:judge-score-submitted', {
      sessionId: session.id,
      roundId: session.currentRoundId,
      contestantId: session.activeContestantId,
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
      contestant_id: session.activeContestantId,
      judge_id: judgeId,
      scores: scoreMap,
      is_locked: true,
      locked_at: now,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  // Notify organizer
  emitToEventOrganizer(eventId, 'session:judge-score-submitted', {
    sessionId: session.id,
    roundId: session.currentRoundId,
    contestantId: session.activeContestantId,
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

  // Get the active contestant details
  const { data: contestant } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, event_id, name, photo, contestant_number')
    .eq('id', session.activeContestantId)
    .single()

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

  // Check if judge already submitted for this contestant
  const { data: existingScore } = await getClient()
    .from('competition_session_judge_scores')
    .select('*')
    .eq('session_id', session.id)
    .eq('judge_id', judgeId)
    .eq('round_id', session.currentRoundId)
    .eq('contestant_id', session.activeContestantId)
    .maybeSingle()

  const hasSubmitted = !!(existingScore && existingScore.is_locked)
  const existingScores = existingScore?.scores ?? {}

  return {
    session,
    event: { id: eventId, title: event.title, eventType: event.event_type },
    contestant: contestant ? mapContestant(contestant) : null,
    criteria,
    existingScores,
    hasSubmitted,
    totalContestants: session.contestantOrder.length,
    currentPosition: session.currentContestantOrder + 1,
  }
}

// ---------------------------------------------------------------------------
// Get judge progress for the current contestant (organizer view)
// ---------------------------------------------------------------------------
export async function getJudgeProgress(eventId, organizerId) {
  const session = await assertActiveSession(eventId, organizerId)

  // Get all judges for this event
  const { data: judges } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .select('id, user_id, display_name, role')
    .eq('event_id', eventId)
    .eq('is_active', true)

  if (!judges || judges.length === 0) {
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
    judges: (judges ?? []).map(j => ({
      judgeId: j.user_id,
      judgeRowId: j.id,
      displayName: j.display_name,
      role: j.role,
      hasSubmitted: submittedJudgeIds.has(j.user_id),
    })),
    totalJudges: judges.length,
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
