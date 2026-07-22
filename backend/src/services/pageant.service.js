import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  COMPETITION_SCORING_EVENT_TYPES,
  USER_ROLES,
} from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import {
  getOrCreatePageantOrganization,
  getOrCreateCompetitionScoringOrganization,
  mapOrganization,
} from './organization.service.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { findUserByEmail, sanitizeUser } from './user.service.js'
import { sendJudgeInvitationEmail, sendJudgeInvitationEmailRegistered } from './mailer.service.js'
import {
  computeRankings,
  resolveScoreBounds,
  mergeScoringConfig,
  isScoreInBounds,
} from '../modules/scoring-engine.js'
import { isCompetitionScoringOpen } from '../utils/eventSchedule.js'
import { emitToEvent } from '../websocket/ws-emitter.js'
import { mapEvent } from '../foundation/mapper.js'



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

// Backward-compat alias.
const assertPageantEvent = assertCompetitionEvent

// ——— Organization resolution ———
//
// The pageant/competition-scoring organization is created on first use. The
// helper in organization.service.js is the single source of truth.

async function getOrCreateOrg(organizerId) {
  if (typeof getOrCreateCompetitionScoringOrganization === 'function') {
    return getOrCreateCompetitionScoringOrganization(organizerId)
  }
  return getOrCreatePageantOrganization(organizerId)
}

// ——— Dashboard & events ———

export async function getOrganizerDashboard(organizerId) {
  const org = await getOrCreateOrg(organizerId)
  if (!org?.id) {
    throw new ApiError(500, 'Failed to get or create organization')
  }

  const { data: events, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, title, status, scoring_enabled, event_type')
    .eq('organization_id', org.id)
    .in('event_type', Array.from(COMPETITION_SCORING_EVENT_TYPES))
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  const eventIds = (events ?? []).map((e) => e.id)
  let totalContestants = 0
  let totalJudges = 0
  let completedJudges = 0
  let scoresSubmitted = 0

  if (eventIds.length) {
    const [contestantsRes, judgesRes, completedJudgesRes, scoresRes] = await Promise.all([
      getClient()
        .from(DB_TABLES.CONTESTANTS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds),
      getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .eq('is_judge', true),
      getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .eq('is_judge', true)
        .eq('has_scored', true),
      getClient()
        .from(DB_TABLES.JUDGE_SCORES)
        .select('id, competition_contestants!inner(event_id)', { count: 'exact', head: true })
        .in('competition_contestants.event_id', eventIds),
    ])

    if (contestantsRes.error) throw new ApiError(500, contestantsRes.error.message)
    if (judgesRes.error) throw new ApiError(500, judgesRes.error.message)
    if (completedJudgesRes.error) throw new ApiError(500, completedJudgesRes.error.message)
    if (scoresRes.error) throw new ApiError(500, scoresRes.error.message)

    totalContestants = contestantsRes.count ?? 0
    totalJudges = judgesRes.count ?? 0
    completedJudges = completedJudgesRes.count ?? 0
    scoresSubmitted = scoresRes.count ?? 0
  }

  const judgeCompletionRate =
    totalJudges > 0 ? Math.round((completedJudges / totalJudges) * 10000) / 100 : 0

  return {
    organization: mapOrganization(org),
    events: (events ?? []).map(mapEvent),
    stats: {
      totalEvents: events?.length ?? 0,
      activeScoring: events?.filter((e) => e.scoring_enabled).length ?? 0,
      totalContestants,
      totalJudges,
      completedJudges,
      scoresSubmitted,
      judgeCompletionRate,
    },
  }
}

export async function listPageantEvents(organizerId) {
  return listCompetitionEvents(organizerId)
}

export async function listCompetitionEvents(organizerId, { limit = 200, offset = 0 } = {}) {
  const org = await getOrCreateOrg(organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, title, description, banner, status, scoring_enabled, event_type, start_date, end_date, created_at, updated_at, organization_id, scoring_config')
    .eq('organization_id', org.id)
    .in('event_type', Array.from(COMPETITION_SCORING_EVENT_TYPES))
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapEvent)
}

export async function createPageantEvent(organizerId, payload) {
  return createCompetitionEvent(organizerId, payload)
}

export async function createCompetitionEvent(organizerId, payload) {
  const org = await getOrCreateOrg(organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .insert({
      organization_id: org.id,
      title: payload.title,
      description: payload.description ?? null,
      banner: payload.banner ?? null,
      start_date: payload.startDate ?? null,
      end_date: payload.endDate ?? null,
      status: payload.status ?? 'draft',
      event_type: 'competition_scoring',
      scoring_enabled: false,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapEvent(data)
}

export async function updatePageantEvent(eventId, organizerId, payload) {
  return updateCompetitionEvent(eventId, organizerId, payload)
}

export async function updateCompetitionEvent(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  const updates = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.banner !== undefined) updates.banner = payload.banner
  if (payload.startDate !== undefined) updates.start_date = payload.startDate
  if (payload.endDate !== undefined) updates.end_date = payload.endDate
  if (payload.status !== undefined) updates.status = payload.status

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update(updates)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapEvent(data)
}

export async function getPageantEvent(eventId, organizerId) {
  return getCompetitionEvent(eventId, organizerId)
}

export async function getCompetitionEvent(eventId, organizerId) {
  const event = await assertCompetitionEvent(eventId, organizerId)
  return mapEvent(event)
}

export async function setEventScoring(eventId, organizerId, scoringEnabled) {
  await assertCompetitionEvent(eventId, organizerId)

  if (scoringEnabled) {
    // Use the foundation validator so category, round, and criterion weights
    // are ALL checked against 100%. Phase 4 / 5 engine owns the rules.
    const { assertScoringWeightsValid } = await import('./competition.service.js')
    await assertScoringWeightsValid(eventId, organizerId)
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({
      scoring_enabled: Boolean(scoringEnabled),
      status: scoringEnabled ? 'active' : 'scheduled',
    })
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  
  emitToEvent(eventId, 'competition:scoring-toggled', {
    eventId,
    scoringEnabled: Boolean(scoringEnabled),
  })
  
  return mapEvent(data)
}

// ——— Contestants ———

export async function listContestants(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, event_id, name, photo, contestant_number')
    .eq('event_id', eventId)
    .order('contestant_number', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapContestant)
}

export async function createContestant(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .insert({
      event_id: eventId,
      name: payload.name,
      photo: payload.photo ?? null,
      contestant_number: payload.contestantNumber,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'Contestant number already exists for this event')
    }
    throw new ApiError(500, error.message)
  }
  return mapContestant(data)
}

export async function updateContestant(eventId, organizerId, contestantId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.photo !== undefined) updates.photo = payload.photo
  if (payload.contestantNumber !== undefined) updates.contestant_number = payload.contestantNumber

  const { data, error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .update(updates)
    .eq('id', contestantId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Contestant not found')
  return mapContestant(data)
}

export async function deleteContestant(eventId, organizerId, contestantId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .delete()
    .eq('id', contestantId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)
}

// ——— Criteria ———

export async function listCriteria(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .select('id, event_id, name, percentage, min_score, max_score')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapCriteria)
}

export async function createCriteria(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .insert({
      event_id: eventId,
      name: payload.name,
      percentage: payload.percentage,
      min_score: payload.minScore,
      max_score: payload.maxScore,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapCriteria(data)
}

export async function updateCriteria(eventId, organizerId, criteriaId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.percentage !== undefined) updates.percentage = payload.percentage
  if (payload.minScore !== undefined) updates.min_score = payload.minScore
  if (payload.maxScore !== undefined) updates.max_score = payload.maxScore

  const { data, error } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .update(updates)
    .eq('id', criteriaId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Criteria not found')
  return mapCriteria(data)
}

export async function deleteCriteria(eventId, organizerId, criteriaId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { error } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .delete()
    .eq('id', criteriaId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)
}

// ——— Judges (voters with is_judge) ———

async function ensureJudgeAccount(email, plainPassword, resetPasswordForExisting = true) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await findUserByEmail(normalizedEmail)

  if (existing && existing.role !== USER_ROLES.VOTER) {
    throw new ApiError(409, 'This email is already used by another account type')
  }

  // If user exists and we're not resetting password, just return them
  if (existing && !resetPasswordForExisting) {
    return { user: existing, isNew: false }
  }

  const passwordHash = await hashPassword(plainPassword)

  if (existing) {
    const { data, error } = await getClient()
      .from(DB_TABLES.USERS)
      .update({ password: passwordHash, must_change_password: true })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw new ApiError(500, error.message)
    return { user: sanitizeUser(data), isNew: false }
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.USERS)
    .insert({
      email: normalizedEmail,
      password: passwordHash,
      role: USER_ROLES.VOTER,
      must_change_password: true,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return { user: sanitizeUser(data), isNew: true }
}

export async function inviteJudge(eventId, organizerId, { email, temporaryPassword, firstName, lastName }) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const tempPassword = temporaryPassword || generateTemporaryPassword()
  const { user } = await ensureJudgeAccount(email, tempPassword)

  const { error: evError } = await getClient().from(DB_TABLES.EVENT_VOTERS).upsert(
    {
      event_id: eventId,
      voter_id: user.id,
      is_judge: true,
      has_scored: false,
      has_voted: false,
      first_name: firstName || null,
      last_name: lastName || null,
    },
    { onConflict: 'event_id,voter_id' },
  )

  if (evError) throw new ApiError(500, evError.message)

  const emailResult = await sendJudgeInvitationEmail({
    email: user.email,
    temporaryPassword: tempPassword,
    eventId: event.id,
    eventTitle: event.title,
  })

  return { user, email: emailResult }
}

/**
 * Register a judge WITHOUT sending invitation email.
 * @param {string} eventId
 * @param {string} organizerId
 * @param {Object} params
 * @param {string} params.email
 * @param {string} [params.temporaryPassword]
 * @param {string} [params.firstName]
 * @param {string} [params.lastName]
 * @param {boolean} [params.resetPasswordForExisting] - If false, won't reset password for existing judges (default: false for manual)
 */
export async function registerJudge(eventId, organizerId, { email, temporaryPassword, firstName, lastName, resetPasswordForExisting = false }) {
  await assertCompetitionEvent(eventId, organizerId)

  const tempPassword = temporaryPassword || generateTemporaryPassword()
  const { user, isNew } = await ensureJudgeAccount(email, tempPassword, resetPasswordForExisting)

  const { error: evError } = await getClient().from(DB_TABLES.EVENT_VOTERS).upsert(
    {
      event_id: eventId,
      voter_id: user.id,
      is_judge: true,
      has_scored: false,
      has_voted: false,
      first_name: firstName || null,
      last_name: lastName || null,
    },
    { onConflict: 'event_id,voter_id' },
  )

  if (evError) throw new ApiError(500, evError.message)

  try {
    await getClient().from(DB_TABLES.INVITATIONS).upsert(
      { event_id: eventId, voter_id: user.id, invitation_sent: false },
      { onConflict: 'event_id,voter_id', ignoreDuplicates: false },
    )
  } catch (dbErr) {
    console.error('[registerJudge] invitations upsert failed:', dbErr.message)
  }

  return { user, isNewJudge: isNew, invitationSent: false }
}

/**
 * Send invitation email for an already-registered judge.
 * If judge has an existing account, sends "you're invited" email without password reset.
 * If judge is new, generates temp password and sends it.
 */
export async function sendJudgeInvitation(eventId, organizerId, judgeId) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const { data: enrollment } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id, users (id, email)')
    .eq('event_id', eventId)
    .eq('voter_id', judgeId)
    .eq('is_judge', true)
    .maybeSingle()

  if (!enrollment) throw new ApiError(404, 'Judge is not enrolled in this event')

  const judgeEmail = enrollment.users?.email

  // Check if this judge has other sent invitations (existing account)
  const { data: otherInvitations } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select('id, invitation_sent')
    .eq('voter_id', judgeId)
    .neq('event_id', eventId)
    .limit(1)

  const isExistingAccount = otherInvitations && otherInvitations.length > 0 &&
    otherInvitations.some(inv => inv.invitation_sent === true)

  let tempPassword = null
  let emailResult = null
  let invitationType = isExistingAccount ? 'existing' : 'new'

  if (isExistingAccount) {
    // Existing account - send registered email without password reset
    console.log(`[sendJudgeInvitation] existing account detected for ${judgeEmail}, sending registered email`)

    emailResult = await sendJudgeInvitationEmailRegistered({
      email: judgeEmail,
      eventId: event.id,
      eventTitle: event.title,
    })
  } else {
    // New account - generate temp password
    tempPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(tempPassword)

    await getClient().from(DB_TABLES.USERS).update({ password: passwordHash, must_change_password: true }).eq('id', judgeId)

    emailResult = await sendJudgeInvitationEmail({
      email: judgeEmail,
      temporaryPassword: tempPassword,
      eventId: event.id,
      eventTitle: event.title,
    })
  }

  if (emailResult?.sent) {
    try {
      await getClient()
        .from(DB_TABLES.INVITATIONS)
        .update({
          invitation_sent: true,
          is_new_account: !isExistingAccount,
        })
        .eq('event_id', eventId)
        .eq('voter_id', judgeId)
    } catch (dbErr) {
      console.error('[sendJudgeInvitation] failed to mark invitation_sent=true:', dbErr.message)
    }
  }

  return {
    email: emailResult,
    invitationSent: emailResult?.sent,
    invitationType,
    temporaryPassword,
  }
}

/**
 * Send all pending judge invitations for an event.
 * Handles both new and existing accounts appropriately.
 */
export async function sendAllPendingJudgeInvitations(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const { data: pending, error } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select('voter_id, users (id, email)')
    .eq('event_id', eventId)
    .eq('invitation_sent', false)

  if (error) throw new ApiError(500, error.message)
  if (!pending?.length) return { total: 0, sent: 0, failed: 0, results: [] }

  // Only send to judges
  const { data: judgeRows } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('voter_id')
    .eq('event_id', eventId)
    .eq('is_judge', true)

  const judgeIds = new Set((judgeRows ?? []).map((r) => r.voter_id))
  const pendingJudges = pending.filter((p) => judgeIds.has(p.voter_id))

  // Check which judges are existing accounts
  const allJudgeIds = pendingJudges.map(p => p.voter_id)
  const { data: existingCheck } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select('voter_id')
    .in('voter_id', allJudgeIds)
    .eq('invitation_sent', true)

  const existingAccountIds = new Set()
  if (existingCheck) {
    existingCheck.forEach(inv => existingAccountIds.add(inv.voter_id))
  }

  let sent = 0, failed = 0
  const results = []

  for (const p of pendingJudges) {
    const judgeEmail = p.users?.email
    const isExistingAccount = existingAccountIds.has(p.voter_id)

    let tempPassword = null
    let emailResult = null
    let invitationType = isExistingAccount ? 'existing' : 'new'

    try {
      if (isExistingAccount) {
        // Existing account - send registered email without password reset
        emailResult = await sendJudgeInvitationEmailRegistered({
          email: judgeEmail,
          eventId: event.id,
          eventTitle: event.title,
        })
      } else {
        // New account - generate temp password
        tempPassword = generateTemporaryPassword()
        const passwordHash = await hashPassword(tempPassword)

        await getClient().from(DB_TABLES.USERS).update({ password: passwordHash, must_change_password: true }).eq('id', p.voter_id)

        emailResult = await sendJudgeInvitationEmail({
          email: judgeEmail,
          temporaryPassword: tempPassword,
          eventId: event.id,
          eventTitle: event.title,
        })
      }

      if (emailResult?.sent) {
        await getClient()
          .from(DB_TABLES.INVITATIONS)
          .update({
            invitation_sent: true,
            is_new_account: !isExistingAccount,
          })
          .eq('event_id', eventId)
          .eq('voter_id', p.voter_id)
        sent++
        results.push({
          judgeId: p.voter_id,
          email: judgeEmail,
          success: true,
          invitationType,
          temporaryPassword,
        })
      } else {
        failed++
        results.push({
          judgeId: p.voter_id,
          email: judgeEmail,
          success: false,
          invitationType,
          error: emailResult?.error || 'Email delivery failed',
        })
      }
    } catch (err) {
      failed++
      results.push({
        judgeId: p.voter_id,
        email: judgeEmail,
        success: false,
        invitationType,
        error: err.message,
      })
    }
  }

  return { total: pendingJudges.length, sent, failed, results }
}

export async function listJudges(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select(
      `
      id,
      has_scored,
      first_name,
      last_name,
      users (id, email)
    `,
    )
    .eq('event_id', eventId)
    .eq('is_judge', true)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  const judgeIds = (data ?? []).map((r) => r.users?.id).filter(Boolean)
  let invitationMap = {}

  if (judgeIds.length) {
    const { data: invitations } = await getClient()
      .from(DB_TABLES.INVITATIONS)
      .select('voter_id, invitation_sent')
      .eq('event_id', eventId)
      .in('voter_id', judgeIds)

    for (const inv of invitations ?? []) {
      invitationMap[inv.voter_id] = inv.invitation_sent
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    judgeId: row.users?.id,
    email: row.users?.email,
    firstName: row.first_name,
    lastName: row.last_name,
    hasScored: row.has_scored,
    invitationSent: invitationMap[row.users?.id] ?? null,
  }))
}

// ——— Judge scoring (voter/judge) ———

export async function assertJudgeEnrolled(eventId, judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id, event_id, voter_id, is_judge, has_scored, has_voted')
    .eq('event_id', eventId)
    .eq('voter_id', judgeId)
    .eq('is_judge', true)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(403, 'You are not a judge for this event')
  return data
}

// ---------------------------------------------------------------------------
// Phase 6 — Judge assignment enforcement.
// A first-class judge (competition_judges row) may have ZERO or MORE
// competition_judge_assignments rows. If the row is missing entirely, the
// judge is event-wide. If the rows exist, the judge can only score
// (contestant, criterion) pairs that belong to one of the assigned scopes.
//
// For Phase 6 we enforce this at submit time: the requested (round_id,
// category_id) must be covered by the judge's assignments; otherwise the
// submission is rejected.
// ---------------------------------------------------------------------------
export async function getJudgeAssignmentContext(eventId, judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGES)
    .select(
      'id, role, is_active, has_submitted, competition_judge_assignments (id, scope, scope_id)',
    )
    .eq('event_id', eventId)
    .eq('user_id', judgeId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) return { isFirstClass: false, role: 'judge', assignments: [] }
  return {
    isFirstClass: true,
    role: data.role,
    isActive: data.is_active,
    hasSubmitted: data.has_submitted,
    judgeRowId: data.id,
    assignments: data.competition_judge_assignments ?? [],
  }
}

export function canJudgeScore(assignmentContext, { roundId = null, categoryId = null } = {}) {
  if (!assignmentContext.isFirstClass) return true
  if (assignmentContext.role === 'score_reviewer') return false
  const list = assignmentContext.assignments
  if (!list || list.length === 0) return true
  return list.some((a) => {
    if (a.scope === 'event') return true
    if (a.scope === 'round' && roundId && a.scope_id === roundId) return true
    if (a.scope === 'category' && categoryId && a.scope_id === categoryId) return true
    return false
  })
}

export async function getJudgeScoringSheet(eventId, judgeId) {
  const enrollment = await assertJudgeEnrolled(eventId, judgeId)
  const event = await getEventById(eventId)

  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new ApiError(400, 'Not a competition scoring event')
  }

  const [contestants, criteria] = await Promise.all([
    getClient().from(DB_TABLES.CONTESTANTS).select('id, event_id, name, photo, contestant_number').eq('event_id', eventId).order('contestant_number'),
    getClient().from(DB_TABLES.CRITERIA).select('id, event_id, name, percentage, min_score, max_score').eq('event_id', eventId),
  ])

  if (contestants.error) throw new ApiError(500, contestants.error.message)
  if (criteria.error) throw new ApiError(500, criteria.error.message)

  const { data: existingScores } = await getClient()
    .from(DB_TABLES.JUDGE_SCORES)
    .select('contestant_id, criteria_id, score')
    .eq('judge_id', judgeId)
    .in(
      'contestant_id',
      (contestants.data ?? []).map((c) => c.id),
    )

  const scoreMap = {}
  for (const s of existingScores ?? []) {
    scoreMap[`${s.contestant_id}:${s.criteria_id}`] = Number(s.score)
  }

  return {
    event: mapEvent(event),
    contestants: (contestants.data ?? []).map(mapContestant),
    criteria: (criteria.data ?? []).map(mapCriteria),
    existingScores: scoreMap,
    hasScored: enrollment.has_scored,
    scoringOpen: isCompetitionScoringOpen(event),
  }
}

export async function submitJudgeScores(eventId, judgeId, scores) {
  await assertJudgeEnrolled(eventId, judgeId)

  const event = await getEventById(eventId)
  if (!isCompetitionScoringOpen(event)) {
    if (!event.scoring_enabled) {
      throw new ApiError(403, 'Scoring is not open for this event')
    }
    if (event.start_date && new Date(event.start_date) > new Date()) {
      throw new ApiError(403, 'Scoring has not started yet for this event')
    }
    if (event.end_date && new Date(event.end_date) < new Date()) {
      throw new ApiError(403, 'Scoring has ended for this event')
    }
    throw new ApiError(403, 'Scoring is not open for this event')
  }

  const scoringConfig = mergeScoringConfig(event.scoring_config)
  const eventBounds = resolveScoreBounds(scoringConfig)

  // Phase 6: if the judge has a first-class competition_judges row,
  // enforce their assignment scope. A score_reviewer is read-only.
  const judgeCtx = await getJudgeAssignmentContext(eventId, judgeId)
  if (judgeCtx.isFirstClass) {
    if (!judgeCtx.isActive) {
      throw new ApiError(403, 'This judge account is inactive for this event')
    }
    if (judgeCtx.role === 'score_reviewer') {
      throw new ApiError(403, 'Score reviewers cannot submit scores')
    }
  }

  const contestants = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id')
    .eq('event_id', eventId)

  const criteria = await getClient().from(DB_TABLES.CRITERIA).select('id, event_id, name, percentage, min_score, max_score').eq('event_id', eventId)

  if (contestants.error || criteria.error) {
    throw new ApiError(500, 'Failed to load competition scoring data')
  }

  const contestantIds = new Set((contestants.data ?? []).map((c) => c.id))
  const criteriaList = (criteria.data ?? []).map(mapCriteria)
  const criteriaMap = Object.fromEntries(criteriaList.map((c) => [c.id, c]))

  const expectedCells = contestantIds.size * criteriaList.length
  if (scores.length !== expectedCells) {
    throw new ApiError(
      400,
      `Submit a score for every contestant and criteria (${expectedCells} scores required)`,
    )
  }

  const seen = new Set()
  const rows = []

  for (const entry of scores) {
    const key = `${entry.contestantId}:${entry.criteriaId}`
    if (seen.has(key)) throw new ApiError(400, 'Duplicate score entry')
    seen.add(key)

    if (!contestantIds.has(entry.contestantId)) {
      throw new ApiError(400, 'Invalid contestant')
    }

    const crit = criteriaMap[entry.criteriaId]
    if (!crit) throw new ApiError(400, 'Invalid criteria')

    const score = Number(entry.score)
    if (Number.isNaN(score)) {
      throw new ApiError(400, `Score for ${crit.name} must be a number`)
    }

    // Per-criterion min/max continue to win if explicitly configured;
    // otherwise we fall back to the event-level score-type bounds.
    const min = crit.minScore ?? eventBounds.min
    const max = crit.maxScore ?? eventBounds.max
    if (score < min || score > max) {
      throw new ApiError(
        400,
        `Score for ${crit.name} must be between ${min} and ${max}`,
      )
    }
    if (!isScoreInBounds(score, scoringConfig)) {
      throw new ApiError(
        400,
        `Score for ${crit.name} is outside the configured score type (${eventBounds.min}–${eventBounds.max})`,
      )
    }

    // Phase 6: assignment scope check.
    if (judgeCtx.isFirstClass && !canJudgeScore(judgeCtx, {
      roundId: entry.roundId ?? null,
      categoryId: entry.categoryId ?? null,
    })) {
      throw new ApiError(
        403,
        `You are not assigned to score ${crit.name} for this contestant`,
      )
    }

    rows.push({
      judge_id: judgeId,
      contestant_id: entry.contestantId,
      criteria_id: entry.criteriaId,
      round_id: entry.roundId ?? null,
      category_id: entry.categoryId ?? null,
      score,
    })
  }

  const { data: locked, error: lockErr } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .update({ has_scored: true })
    .eq('event_id', eventId)
    .eq('voter_id', judgeId)
    .eq('has_scored', false)
    .select('id')

  if (lockErr) throw new ApiError(500, lockErr.message)
  if (!locked?.length) {
    throw new ApiError(409, 'You have already submitted scores for this event')
  }

  try {
    const { error: insertErr } = await getClient().from(DB_TABLES.JUDGE_SCORES).insert(rows)
    if (insertErr) {
      if (insertErr.code === '23505') {
        throw new ApiError(409, 'You have already submitted scores for this event')
      }
      throw new ApiError(500, insertErr.message)
    }
    
    if (event.organizations?.organizer_id) {
      const rankings = await getLiveRankings(eventId, event.organizations.organizer_id)
      emitToEvent(eventId, 'rankings:updated', { eventId, rankings })
      
      // Trigger organizer dashboard stats refresh
      const { emitToUser, emitToRole } = await import('../websocket/ws-emitter.js')
      emitToUser(event.organizations.organizer_id, 'organizer:stats-updated', { eventId })
      
      // Trigger admin platform stats refresh
      emitToRole('admin', 'platform:stats-updated', {})
    }
  } catch (err) {
    await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .update({ has_scored: false })
      .eq('event_id', eventId)
      .eq('voter_id', judgeId)
    throw err
  }

  return { success: true, message: 'Scores submitted and locked', locked: true }
}

export async function listJudgePageantEvents(judgeId) {
  return listJudgeCompetitionEvents(judgeId)
}

export async function listJudgeCompetitionEvents(judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select(
      `
      has_scored,
      events (
        id,
        title,
        description,
        banner,
        scoring_enabled,
        status,
        event_type,
        organization_id
      )
    `,
    )
    .eq('voter_id', judgeId)
    .eq('is_judge', true)

  if (error) throw new ApiError(500, error.message)

  return (data ?? [])
    .filter((r) => COMPETITION_SCORING_EVENT_TYPES.has(r.events?.event_type))
    .map((r) => ({
      ...mapEvent(r.events),
      hasScored: r.has_scored,
    }))
}

// ——— Live rankings ———

export async function getLiveRankings(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const [eventRes, contestantsRes, criteriaRes, judgesRes, roundsRes, categoriesRes, scoresRes] =
    await Promise.all([
      getClient()
        .from(DB_TABLES.EVENTS)
        .select('scoring_config')
        .eq('id', eventId)
        .single(),
      getClient().from(DB_TABLES.CONTESTANTS).select('id, event_id, name, photo, contestant_number').eq('event_id', eventId),
      getClient().from(DB_TABLES.CRITERIA).select('id, event_id, name, percentage, min_score, max_score').eq('event_id', eventId),
      getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('is_judge', true),
      getClient().from(DB_TABLES.COMPETITION_ROUNDS).select('*').eq('event_id', eventId),
      getClient().from(DB_TABLES.COMPETITION_CATEGORIES).select('*').eq('event_id', eventId),
      getClient()
        .from(DB_TABLES.JUDGE_SCORES)
        .select('contestant_id, criteria_id, round_id, category_id, score, judge_id')
    ])

  if (eventRes.error) throw new ApiError(500, eventRes.error.message)
  if (contestantsRes.error) throw new ApiError(500, contestantsRes.error.message)
  if (criteriaRes.error) throw new ApiError(500, criteriaRes.error.message)
  if (roundsRes.error) throw new ApiError(500, roundsRes.error.message)
  if (categoriesRes.error) throw new ApiError(500, categoriesRes.error.message)

  const contestantIds = (contestantsRes.data ?? []).map((c) => c.id)
  let scores = scoresRes.data ?? []
  if (contestantIds.length) {
    scores = scores.filter((s) => contestantIds.includes(s.contestant_id))
  } else {
    scores = []
  }

  const { count: totalJudges } = judgesRes
  const { count: submittedJudges } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('is_judge', true)
    .eq('has_scored', true)

  const { rankings, debug } = computeRankings({
    scores,
    contestants: contestantsRes.data ?? [],
    criteria: criteriaRes.data ?? [],
    rounds: roundsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    config: eventRes.data?.scoring_config,
  })

  // Map the engine's nested shape to the public shape the UI already uses.
  const publicRankings = rankings.map((row) => ({
    contestantId: row.contestantId,
    contestantName: row.contestantName,
    contestantNumber: row.contestantNumber,
    photo: row.photo,
    rank: row.rank,
    weightedScore: row.finalScore,
    finalScore: row.finalScore,
    criteriaBreakdown: Object.values(row.perCriterion).map((c) => ({
      criteriaId: c.criteriaId,
      criteriaName: c.criteriaName,
      percentage: c.percentage,
      average: c.average,
      judgeCount: c.judgeCount,
    })),
    perRound: Object.values(row.perRound),
    perCategory: Object.values(row.perCategory),
  }))

  return {
    rankings: publicRankings,
    criteriaTotalPercentage: debug.criterionTotals,
    roundWeightTotal: debug.roundTotals,
    categoryWeightTotal: debug.categoryTotals,
    scoringConfig: mergeScoringConfig(eventRes.data?.scoring_config),
    judges: {
      total: totalJudges ?? 0,
      submitted: submittedJudges ?? 0,
    },
  }
}

export async function getPageantAnalytics(eventId, organizerId) {
  return getCompetitionAnalytics(eventId, organizerId)
}

export async function getCompetitionAnalytics(eventId, organizerId) {
  const rankings = await getLiveRankings(eventId, organizerId)

  const [contestantsRes, criteriaRes, scoresRes] = await Promise.all([
    getClient().from(DB_TABLES.CONTESTANTS).select('id').eq('event_id', eventId),
    getClient().from(DB_TABLES.CRITERIA).select('id, name').eq('event_id', eventId),
    getClient()
      .from(DB_TABLES.JUDGE_SCORES)
      .select('score, criteria_id, competition_criteria!inner(event_id)')
      .eq('competition_criteria.event_id', eventId),
  ])

  if (contestantsRes.error) throw new ApiError(500, contestantsRes.error.message)
  if (criteriaRes.error) throw new ApiError(500, criteriaRes.error.message)
  if (scoresRes.error) throw new ApiError(500, scoresRes.error.message)

  const criteriaMap = new Map(
    (criteriaRes.data ?? []).map((criteria) => [criteria.id, criteria.name]),
  )

  const grouped = new Map()
  for (const scoreRow of scoresRes.data ?? []) {
    const key = scoreRow.criteria_id
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(Number(scoreRow.score))
  }

  const criteriaAnalytics = Array.from(criteriaMap.entries()).map(([criteriaId, criteriaName]) => {
    const scores = grouped.get(criteriaId) ?? []
    const total = scores.reduce((sum, score) => sum + score, 0)
    const averageScore = scores.length ? Math.round((total / scores.length) * 100) / 100 : 0
    const highestScore = scores.length ? Math.max(...scores) : 0
    const lowestScore = scores.length ? Math.min(...scores) : 0

    return {
      criteriaId,
      criteriaName,
      averageScore,
      highestScore,
      lowestScore,
    }
  })

  const totalJudges = rankings.judges.total ?? 0
  const submittedJudges = rankings.judges.submitted ?? 0

  return {
    totalContestants: (contestantsRes.data ?? []).length,
    totalJudges,
    scoresSubmitted: (scoresRes.data ?? []).length,
    judgeCompletionRate:
      totalJudges > 0 ? Math.round((submittedJudges / totalJudges) * 10000) / 100 : 0,
    rankings: rankings.rankings,
    criteriaAnalytics,
  }
}
