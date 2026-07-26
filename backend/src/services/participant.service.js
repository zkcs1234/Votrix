/**
 * Participant Service
 *
 * Manages event-specific participant roles and enrollment.
 * This is the core service for the Event-Based Participant Role System.
 *
 * A "participant" is a user enrolled in an event with a specific participant_type:
 *   - ELECTION_VOTER     → Can cast votes in elections
 *   - COMPETITION_JUDGE  → Can submit scores in competitions
 *   - POLLING_RESPONDENT → Can answer polls
 *
 * The global user role ('voter') stays unchanged. Participant type is
 * event-scoped and resolved from the event_participants table.
 */

import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, PARTICIPANT_TYPES, EVENT_TYPES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { recordAudit } from '../foundation/audit.js'

// ─── Lookup ────────────────────────────────────────────────────────────────

/**
 * Find a participant record for a user in a specific event.
 * Returns null if not enrolled.
 */
export async function findEventParticipant(eventId, userId) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data
}

/**
 * Assert the user is a participant in the event with one of the allowed types.
 * Throws 403 if not enrolled or wrong type.
 * Attaches the participant record to the return value (use with middleware).
 */
export async function assertEventParticipant(eventId, userId, ...allowedTypes) {
  const participant = await findEventParticipant(eventId, userId)

  if (!participant) {
    throw new ApiError(403, 'You are not a participant in this event')
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(participant.participant_type)) {
    throw new ApiError(
      403,
      `This action requires one of these roles: ${allowedTypes.join(', ')}`,
    )
  }

  return participant
}

/**
 * List all participant roles for a user across all events.
 * Returns an array of { eventId, eventTitle, eventType, participantType, status }
 */
export async function listUserParticipantRoles(userId) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(`
      event_id,
      participant_type,
      has_voted,
      has_scored,
      has_responded,
      events (
        id,
        title,
        event_type,
        status
      )
    `)
    .eq('user_id', userId)

  if (error) throw new ApiError(500, error.message)

  return (data ?? []).map((row) => ({
    eventId: row.event_id,
    eventTitle: row.events?.title,
    eventType: row.events?.event_type,
    participantType: row.participant_type,
    eventStatus: row.events?.status,
    hasVoted: row.has_voted,
    hasScored: row.has_scored,
    hasResponded: row.has_responded,
  }))
}

// ─── Registration ──────────────────────────────────────────────────────────

/**
 * Determine the correct participant_type based on an event's event_type.
 */
export function resolveParticipantType(eventType) {
  if (eventType === EVENT_TYPES.ELECTION) return PARTICIPANT_TYPES.ELECTION_VOTER
  if (COMPETITION_SCORING_EVENT_TYPES.has(eventType)) return PARTICIPANT_TYPES.COMPETITION_JUDGE
  if (eventType === EVENT_TYPES.POLLING) return PARTICIPANT_TYPES.POLLING_RESPONDENT
  throw new ApiError(400, `Unknown event type: ${eventType}`)
}

/**
 * Register a user as a participant in an event.
 * If the user is already enrolled, updates the participant type (if changed).
 */
export async function registerParticipant(eventId, userId, options = {}) {
  const { participantType, firstName, lastName, metadata } = options

  // If participantType not explicitly provided, resolve from event type
  let resolvedType = participantType
  if (!resolvedType) {
    const { data: event, error: evErr } = await db()
      .from(DB_TABLES.EVENTS)
      .select('event_type')
      .eq('id', eventId)
      .maybeSingle()

    if (evErr) throw new ApiError(500, evErr.message)
    if (!event) throw new ApiError(404, 'Event not found')

    resolvedType = resolveParticipantType(event.event_type)
  }

  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .upsert({
      event_id: eventId,
      user_id: userId,
      participant_type: resolvedType,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      metadata: metadata ?? {},
    }, {
      onConflict: 'event_id,user_id',
      ignoreDuplicates: false,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  return data
}

/**
 * Update participant information (metadata JSONB).
 * Used for dynamic participant information forms.
 */
export async function updateParticipantInformation(eventId, userId, metadata) {
  const participant = await assertEventParticipant(eventId, userId)

  // Merge new metadata with existing (shallow merge at top level)
  const mergedMetadata = {
    ...(participant.metadata ?? {}),
    ...metadata,
  }

  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update({ metadata: mergedMetadata })
    .eq('id', participant.id)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  return data
}

/**
 * Mark a participant's voting flag as complete (for elections).
 */
export async function markVoted(eventId, userId) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update({ has_voted: true })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('has_voted', false)
    .select('id')
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return !!data
}

/**
 * Mark a participant's scoring flag as complete (for competitions).
 */
export async function markScored(eventId, userId) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update({ has_scored: true })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('has_scored', false)
    .select('id')
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return !!data
}

/**
 * Mark a participant's responded flag as complete (for polling).
 */
export async function markResponded(eventId, userId) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update({ has_responded: true })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('has_responded', false)
    .select('id')
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return !!data
}

// ─── Enrichment ────────────────────────────────────────────────────────────

/**
 * Enrich an event object with its participant type label based on event_type.
 * Used by voter.service.js for dashboard display.
 */
export function enrichEventWithParticipantType(event, eventsEventType) {
  const eventType = eventsEventType || event.eventType || event.event_type

  const typeMap = {
    election: PARTICIPANT_TYPES.ELECTION_VOTER,
    pageant: PARTICIPANT_TYPES.COMPETITION_JUDGE,
    competition_scoring: PARTICIPANT_TYPES.COMPETITION_JUDGE,
    polling: PARTICIPANT_TYPES.POLLING_RESPONDENT,
  }

  return {
    ...event,
    participantType: typeMap[eventType] ?? null,
  }
}

// ─── Organizer helpers ─────────────────────────────────────────────────────

/**
 * List participants for an event, optionally filtered by participant_type.
 */
export async function listEventParticipants(eventId, options = {}) {
  const { participantType, limit = 200, offset = 0 } = options

  let query = db()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(`
      *,
      users (id, email)
    `)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (participantType) {
    query = query.eq('participant_type', participantType)
  }

  const { data, error } = await query.range(offset, offset + limit - 1)

  if (error) throw new ApiError(500, error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.users?.email,
    participantType: row.participant_type,
    firstName: row.first_name,
    lastName: row.last_name,
    hasVoted: row.has_voted,
    hasScored: row.has_scored,
    hasResponded: row.has_responded,
    metadata: row.metadata,
    createdAt: row.created_at,
  }))
}

