import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, ACCOUNT_STATUS, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { assertParticipantsEditable } from '../utils/eventLifecycle.js'
import { registerParticipant, resolveParticipantType } from './participant.service.js'
import { sendVoterInvitationEmailRegistered } from './mailer.service.js'
import { createNotificationsForUsers } from './notification.service.js'
import { recordEventActivity } from '../foundation/activity.js'
import { getOrganizerScope, filterCohortsForScope, areCohortValuesInScope } from './organizer-scope.service.js'
import { getEmailQuotaSettings } from './emailGuard.js'

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
  const event = await getEventById(eventId)
  const participantType = resolveParticipantType(event.event_type)

  // Active accounts in the pool for this event type.
  const { data: pool, error: poolErr } = await getClient()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .select('users!user_participant_types_user_id_fkey!inner(program, year_section, account_status)')
    .eq('participant_type', participantType)
    .eq('is_active', true)
    .eq('users.account_status', ACCOUNT_STATUS.ACTIVE)
  if (poolErr) throw new ApiError(500, poolErr.message)

  // Already-enrolled accounts for this event and participant type.
  const { data: enrolled, error: enrErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('users!inner (program, year_section)')
    .eq('event_id', eventId)
    .eq('participant_type', participantType)
  if (enrErr) throw new ApiError(500, enrErr.message)

  const enrolledStudents = (enrolled ?? [])
    .map((r) => r.users)
    .filter(Boolean)

  const poolProfiles = (pool ?? []).map((row) => row.users).filter(Boolean)
  const poolPrograms = tally(poolProfiles, 'program')
  const poolSections = tally(poolProfiles, 'year_section')
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
 * Enroll every active account in the chosen cohort(s) into the event. Idempotent
 * (already-enrolled students are skipped). Only students are ever matched, so a
 * judge-only account cannot be enrolled here. Optionally emails an event
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

  // Matching active accounts that have this event's participant type.
  const { data: students, error } = await getClient()
    .from(DB_TABLES.USER_PARTICIPANT_TYPES)
    .select('users!user_participant_types_user_id_fkey!inner(id, email, account_status, program, year_section)')
    .eq('participant_type', participantType)
    .eq('is_active', true)
    .eq('users.account_status', ACCOUNT_STATUS.ACTIVE)
    .in(`users.${column}`, values)
  if (error) throw new ApiError(500, error.message)
  const matchingAccounts = (students ?? []).map((row) => row.users).filter(Boolean)

  if (!matchingAccounts.length) {
    return { matched: 0, enrolled: 0, alreadyEnrolled: 0, notified: 0 }
  }

  // Which of them are already enrolled in this event.
  const ids = matchingAccounts.map((s) => s.id)
  const { data: existing, error: exErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('user_id')
    .eq('event_id', eventId)
    .in('user_id', ids)
  if (exErr) throw new ApiError(500, exErr.message)
  const enrolledSet = new Set((existing ?? []).map((r) => r.user_id))

  const toEnroll = matchingAccounts.filter((s) => !enrolledSet.has(s.id))
  if (notify) {
    const { bulkBatchLimit } = getEmailQuotaSettings()
    if (toEnroll.length > bulkBatchLimit) {
      throw new ApiError(400, `Cohort invite exceeds the email batch limit of ${bulkBatchLimit} recipients`)
    }
  }

  let enrolled = 0
  for (const student of toEnroll) {
    await registerParticipant(eventId, student.id, { participantType })
    enrolled += 1
  }

  if (toEnroll.length) {
    const actionUrl = COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
      ? `/participant/competition/events/${event.id}/score`
      : event.event_type === 'polling'
        ? `/participant/polling/events/${event.id}`
        : `/participant/events/${event.id}`

    try {
      await createNotificationsForUsers(
        toEnroll.map((student) => student.id),
        {
          type: 'voter.invitation.registered',
          title: `You're invited to ${event.title}`,
          message: `You've been added to ${event.title}. Sign in to review your participation details.`,
          actionUrl,
          entity: 'events',
          entityId: event.id,
          metadata: { eventType: event.event_type },
        },
      )
    } catch (error) {
      console.error('[cohort] failed to create participant invite notifications:', error.message)
    }
  }

  const emailSummary = {
    requested: notify ? toEnroll.length : 0,
    sent: 0,
    skipped: 0,
    duplicate: 0,
    quotaBlocked: 0,
    failed: 0,
    results: [],
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

        if (result?.sent) {
          notified += 1
          emailSummary.sent += 1
          emailSummary.results.push({ email: student.email, status: 'sent', reason: null })
          continue
        }

        if (result?.skipped) {
          emailSummary.skipped += 1
          if (result.duplicate) emailSummary.duplicate += 1
          if (result.quotaType) emailSummary.quotaBlocked += 1
          emailSummary.results.push({
            email: student.email,
            status: 'skipped',
            reason: result.reason || 'Email delivery skipped',
            duplicate: Boolean(result.duplicate),
            quotaType: result.quotaType || null,
          })
          continue
        }

        emailSummary.failed += 1
        emailSummary.results.push({ email: student.email, status: 'failed', reason: result?.error || 'Email delivery failed' })
      } catch (error) {
        emailSummary.failed += 1
        emailSummary.results.push({
          email: student.email,
          status: 'failed',
          reason: error?.message || 'Email delivery failed',
        })
        // Best-effort — never fail the enrollment because of an email error.
      }
    }
  }

  recordEventActivity({
    eventId,
    action: 'participant.invite_cohort',
    userId: organizerId,
    module: event.event_type,
    details: {
      cohortType,
      values,
      enrolled,
      alreadyEnrolled: enrolledSet.size,
      notified,
      emailSummary,
    },
  })

  return {
    matched: students.length,
    enrolled,
    alreadyEnrolled: enrolledSet.size,
    notified,
    emailSummary,
    summary: {
      requested: emailSummary.requested,
      sent: emailSummary.sent,
      skipped: emailSummary.skipped,
      duplicate: emailSummary.duplicate,
      quotaBlocked: emailSummary.quotaBlocked,
      failed: emailSummary.failed,
      results: emailSummary.results,
    },
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
