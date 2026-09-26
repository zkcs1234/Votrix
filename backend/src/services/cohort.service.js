import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, PROFILE_TYPES, ACCOUNT_STATUS } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { assertParticipantsEditable } from '../utils/eventLifecycle.js'
import { registerParticipant, resolveParticipantType } from './participant.service.js'
import { sendVoterInvitationEmailRegistered } from './mailer.service.js'
import { recordEventActivity } from '../foundation/activity.js'
import { getOrganizerScope, filterCohortsForScope, areCohortValuesInScope } from './organizer-scope.service.js'

// Phase 5 of VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md.
// Organizers no longer create voter/respondent accounts. Instead they invite
// COHORTS of already-registered students (by Program or Year & Section) into an
// event. Shared by the election and polling modules; the participant_type is
// resolved from the event type, so the same logic serves both.

const COHORT_COLUMN = { program: 'program', year_section: 'year_section' }

// Tally a list of {program, year_section} rows into per-value counts.
function tally(rows, column) {
  const counts = new Map()
  for (const row of rows) {
    const value = row[column]
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/**
 * Cohorts available for an event: every Program and Year & Section from the
 * managed taxonomy, annotated with how many active students are in the pool and
 * how many are already enrolled in this event.
 */
export async function getEventCohorts(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  // Active student pool.
  const { data: pool, error: poolErr } = await getClient()
    .from(DB_TABLES.USERS)
    .select('program, year_section')
    .eq('profile_type', PROFILE_TYPES.STUDENT)
    .eq('account_status', ACCOUNT_STATUS.ACTIVE)
  if (poolErr) throw new ApiError(500, poolErr.message)

  // Already-enrolled students for this event.
  const { data: enrolled, error: enrErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('users!inner (program, year_section, profile_type)')
    .eq('event_id', eventId)
  if (enrErr) throw new ApiError(500, enrErr.message)

  const enrolledStudents = (enrolled ?? [])
    .map((r) => r.users)
    .filter((u) => u && u.profile_type === PROFILE_TYPES.STUDENT)

  const poolPrograms = tally(pool ?? [], 'program')
  const poolSections = tally(pool ?? [], 'year_section')
  const enrProgramsMap = tally(enrolledStudents, 'program')
  const enrSectionsMap = tally(enrolledStudents, 'year_section')

  // Distinct values come from the actual pool (so admins don't have to keep the
  // taxonomy and the imported data in perfect lock-step for the picker to work).
  const programs = [...poolPrograms.keys()].sort().map((value) => ({
    value,
    poolCount: poolPrograms.get(value) ?? 0,
    enrolledCount: enrProgramsMap.get(value) ?? 0,
  }))
  const sections = [...poolSections.keys()].sort().map((value) => ({
    value,
    poolCount: poolSections.get(value) ?? 0,
    enrolledCount: enrSectionsMap.get(value) ?? 0,
  }))

  // Bound the picker to the organizer's scope (plan O9).
  const scope = await getOrganizerScope(organizerId)
  return filterCohortsForScope(scope, { programs, sections })
}

/**
 * Enroll every active student in the chosen cohort(s) into the event. Idempotent
 * (already-enrolled students are skipped). Only students are ever matched, so a
 * judge account can never be enrolled here (plan D7). Optionally emails an event
 * invitation (Email B — no credentials) to the newly enrolled.
 */
export async function inviteCohort(eventId, organizerId, { cohortType, values, notify = false } = {}) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)
  assertParticipantsEditable(event)

  const column = COHORT_COLUMN[cohortType]
  if (!column) throw new ApiError(400, "cohortType must be 'program' or 'year_section'")
  if (!Array.isArray(values) || values.length === 0) {
    throw new ApiError(400, 'Select at least one cohort value')
  }

  // Enforce the organizer's scope server-side (plan O9) — can't be bypassed
  // by crafting a request for a program/section they don't own.
  const scope = await getOrganizerScope(organizerId)
  if (!areCohortValuesInScope(scope, cohortType, values)) {
    throw new ApiError(403, 'One or more selected cohorts are outside your assigned scope')
  }

  const participantType = resolveParticipantType(event.event_type)

  // Matching active students.
  const { data: students, error } = await getClient()
    .from(DB_TABLES.USERS)
    .select('id, email')
    .eq('profile_type', PROFILE_TYPES.STUDENT)
    .eq('account_status', ACCOUNT_STATUS.ACTIVE)
    .in(column, values)
  if (error) throw new ApiError(500, error.message)

  if (!students?.length) {
    return { matched: 0, enrolled: 0, alreadyEnrolled: 0, notified: 0 }
  }

  // Which of them are already enrolled in this event.
  const ids = students.map((s) => s.id)
  const { data: existing, error: exErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('user_id')
    .eq('event_id', eventId)
    .in('user_id', ids)
  if (exErr) throw new ApiError(500, exErr.message)
  const enrolledSet = new Set((existing ?? []).map((r) => r.user_id))

  const toEnroll = students.filter((s) => !enrolledSet.has(s.id))

  let enrolled = 0
  for (const student of toEnroll) {
    await registerParticipant(eventId, student.id, { participantType })
    enrolled += 1
  }

  let notified = 0
  if (notify && toEnroll.length) {
    for (const student of toEnroll) {
      try {
        const result = await sendVoterInvitationEmailRegistered({
          email: student.email,
          eventId: event.id,
          eventTitle: event.title,
          eventType: event.event_type,
        })
        if (result?.sent) notified += 1
      } catch {
        // Best-effort — never fail the enrollment because of an email error.
      }
    }
  }

  recordEventActivity({
    eventId,
    action: 'participant.invite_cohort',
    userId: organizerId,
    module: event.event_type,
    details: { cohortType, values, enrolled, alreadyEnrolled: enrolledSet.size, notified },
  })

  return {
    matched: students.length,
    enrolled,
    alreadyEnrolled: enrolledSet.size,
    notified,
  }
}

/**
 * Remove a participant from an event (roster must still be editable).
 */
export async function removeEventParticipant(eventId, organizerId, userId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)
  assertParticipantsEditable(event)

  const { error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)
  if (error) throw new ApiError(500, error.message)

  recordEventActivity({
    eventId,
    action: 'participant.remove',
    userId: organizerId,
    module: event.event_type,
    details: { removedUserId: userId },
  })

  return { removed: true }
}
