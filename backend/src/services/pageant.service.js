import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  COMPETITION_SCORING_EVENT_TYPES,
  PARTICIPANT_TYPES,
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
import { registerParticipant } from './participant.service.js'
import {
  computeRankings,
  resolveScoreBounds,
  mergeScoringConfig,
  isScoreInBounds,
} from '../modules/scoring-engine.js'
import { getTemplate } from '../modules/competition-templates.js'
import { isCompetitionScoringOpen } from '../utils/eventSchedule.js'
import { emitToEvent } from '../websocket/ws-emitter.js'
import { mapEvent } from '../foundation/mapper.js'
import { syncEventSchedules } from './event-schedule-sync.service.js'
import { assertEventUpdateAllowed } from '../utils/eventLifecycle.js'
import { deleteDraft } from './draft.service.js'
import { removeReferenceAndDeleteIfUnused } from './imageAsset.service.js'
import { getActiveSession } from './competition-session.service.js'



function mapContestant(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    divisionId: row.division_id ?? null,
    name: row.name,
    photo: row.photo,
    contestantNumber: row.contestant_number,
  }
}

function mapCriteria(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    divisionId: row.division_id ?? null,
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
  let activeSessions = 0

  if (eventIds.length) {
    const [contestantsRes, judgesRes, completedJudgesRes, scoresRes, sessionsRes] = await Promise.all([
      getClient()
        .from(DB_TABLES.CONTESTANTS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds),
      getClient()
        .from(DB_TABLES.EVENT_PARTICIPANTS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE),
      getClient()
        .from(DB_TABLES.EVENT_PARTICIPANTS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
        .eq('has_scored', true),
      getClient()
        .from(DB_TABLES.JUDGE_SCORES)
        .select('id, competition_contestants!inner(event_id)', { count: 'exact', head: true })
        .in('competition_contestants.event_id', eventIds),
      getClient()
        .from('competition_sessions')
        .select('event_id, status')
        .in('event_id', eventIds)
        .eq('status', 'active'),
    ])

    if (contestantsRes.error) throw new ApiError(500, contestantsRes.error.message)
    if (judgesRes.error) throw new ApiError(500, judgesRes.error.message)
    if (completedJudgesRes.error) throw new ApiError(500, completedJudgesRes.error.message)
    if (scoresRes.error) throw new ApiError(500, scoresRes.error.message)
    if (sessionsRes.error) throw new ApiError(500, sessionsRes.error.message)

    totalContestants = contestantsRes.count ?? 0
    totalJudges = judgesRes.count ?? 0
    completedJudges = completedJudgesRes.count ?? 0
    scoresSubmitted = scoresRes.count ?? 0
    activeSessions = sessionsRes.data?.length ?? 0

    // Add session status to each event
    const sessionsByEvent = new Map()
    if (sessionsRes.data) {
      for (const session of sessionsRes.data) {
        sessionsByEvent.set(session.event_id, session.status)
      }
    }

    // Enrich events with session status
    events.forEach((event) => {
      event.sessionStatus = sessionsByEvent.get(event.id) || null
    })
  }

  const judgeCompletionRate =
    totalJudges > 0 ? Math.round((completedJudges / totalJudges) * 10000) / 100 : 0

  return {
    organization: mapOrganization(org),
    events: (events ?? []).map(mapEvent),
    stats: {
      totalEvents: events?.length ?? 0,
      activeSessions,
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
      image_asset_id: payload.image_asset_id ?? null,
      start_date: payload.startDate ?? null,
      end_date: payload.endDate ?? null,
      status: payload.status ?? 'draft',
      event_type: 'competition_scoring',
      // Phase 1: optional sub-type label (display/template only). Nullable.
      competition_type: payload.competitionType ?? null,
      scoring_enabled: false,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  // Phase 2: if a template was chosen, seed editable structure. Best-effort —
  // a partial seed leaves fully editable rows, so we never fail event creation
  // over seeding (the organizer can adjust anything afterward).
  if (payload.templateKey) {
    try {
      await seedFromTemplate(data.id, payload.templateKey)
    } catch (err) {
      console.error('[competition] template seeding failed:', err.message)
    }
  }

  await syncEventSchedules().catch((err) => {
    console.error('[competition] schedule sync failed after create:', err.message)
  })
  await deleteDraft(organizerId, 'competition').catch((err) => {
    console.error('[competition] failed to clear draft after create:', err.message)
  })
  return mapEvent(data)
}

// Phase 2 — seed editable categories/rounds/criteria/scoring_config from a
// starter template. All rows are normal, editable records; the template is not
// referenced again after creation.
async function seedFromTemplate(eventId, templateKey) {
  const template = getTemplate(templateKey)
  if (!template) return

  if (template.scoringConfig) {
    await getClient()
      .from(DB_TABLES.EVENTS)
      .update({ scoring_config: template.scoringConfig })
      .eq('id', eventId)
  }

  if (template.categories?.length) {
    await getClient()
      .from(DB_TABLES.COMPETITION_CATEGORIES)
      .insert(
        template.categories.map((c, i) => ({
          event_id: eventId,
          name: c.name,
          weight: c.weight ?? 0,
          display_order: i,
          is_active: true,
        })),
      )
  }

  // §8C: criterion bounds inherit the event scale; store the scale's range.
  const bounds = resolveScoreBounds(template.scoringConfig)

  if (template.rounds?.length) {
    for (const [i, r] of template.rounds.entries()) {
      const { data: roundRow } = await getClient()
        .from(DB_TABLES.COMPETITION_ROUNDS)
        .insert({
          event_id: eventId,
          name: r.name,
          weight: r.weight ?? 0,
          display_order: i,
          is_open: false,
        })
        .select('id')
        .single()

      // Round-first: seed this round's own criteria + membership links.
      if (roundRow?.id && r.criteria?.length) {
        const { data: critRows } = await getClient()
          .from(DB_TABLES.CRITERIA)
          .insert(
            r.criteria.map((cr) => ({
              event_id: eventId,
              name: cr.name,
              percentage: cr.percentage ?? 0,
              min_score: bounds.min,
              max_score: bounds.max,
            })),
          )
          .select('id')

        if (critRows?.length) {
          await getClient()
            .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
            .insert(critRows.map((cr) => ({ round_id: roundRow.id, criteria_id: cr.id })))
        }
      }
    }
  }

  // Flat criteria (templates without per-round criteria — e.g. singing/talent).
  if (template.criteria?.length) {
    await getClient()
      .from(DB_TABLES.CRITERIA)
      .insert(
        template.criteria.map((cr) => ({
          event_id: eventId,
          name: cr.name,
          percentage: cr.percentage ?? 0,
          min_score: bounds.min,
          max_score: bounds.max,
        })),
      )
  }
}

export async function updatePageantEvent(eventId, organizerId, payload) {
  return updateCompetitionEvent(eventId, organizerId, payload)
}

export async function updateCompetitionEvent(eventId, organizerId, payload) {
  const event = await assertCompetitionEvent(eventId, organizerId)

  assertEventUpdateAllowed(event, payload)

  // Capture old image_asset_id before updating so we can clean it up if replaced
  const oldAssetId = event.image_asset_id ?? null

  const updates = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.banner !== undefined) updates.banner = payload.banner
  if (payload.image_asset_id !== undefined) updates.image_asset_id = payload.image_asset_id
  if (payload.startDate !== undefined) updates.start_date = payload.startDate
  if (payload.endDate !== undefined) updates.end_date = payload.endDate
  if (payload.status !== undefined) updates.status = payload.status
  if (payload.competitionType !== undefined) updates.competition_type = payload.competitionType

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update(updates)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  // Cleanup old banner asset if it was replaced
  if (oldAssetId && updates.image_asset_id !== undefined && oldAssetId !== updates.image_asset_id) {
    removeReferenceAndDeleteIfUnused(oldAssetId).catch((err) =>
      console.error('[competition] Old banner asset cleanup error:', err.message),
    )
  }

  await syncEventSchedules().catch((err) => {
    console.error('[competition] schedule sync failed after update:', err.message)
  })
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

export async function listContestants(eventId, organizerId, filters = {}) {
  await assertCompetitionEvent(eventId, organizerId)

  let query = getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id, event_id, division_id, name, photo, contestant_number')
    .eq('event_id', eventId)

  if (filters.divisionId !== undefined) {
    query = query.eq('division_id', filters.divisionId)
  }

  const { data, error } = await query.order('contestant_number', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapContestant)
}

export async function createContestant(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  if (payload.divisionId) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .insert({
      event_id: eventId,
      division_id: payload.divisionId ?? null,
      name: payload.name,
      photo: payload.photo ?? null,
      contestant_number: payload.contestantNumber,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new ApiError(
        409,
        payload.divisionId
          ? 'Contestant number already exists for this division'
          : 'Contestant number already exists for this event',
      )
    }
    throw new ApiError(500, error.message)
  }
  return mapContestant(data)
}

export async function updateContestant(eventId, organizerId, contestantId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  if (payload.divisionId !== undefined && payload.divisionId !== null) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  // Capture old image_asset_id before updating so we can clean it up if replaced
  let oldAssetId = null
  if (payload.image_asset_id !== undefined) {
    const { data: prev } = await getClient()
      .from(DB_TABLES.CONTESTANTS)
      .select('image_asset_id')
      .eq('id', contestantId)
      .maybeSingle()
    oldAssetId = prev?.image_asset_id ?? null
  }

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.photo !== undefined) updates.photo = payload.photo
  if (payload.image_asset_id !== undefined) updates.image_asset_id = payload.image_asset_id
  if (payload.contestantNumber !== undefined) updates.contestant_number = payload.contestantNumber
  if (payload.divisionId !== undefined) updates.division_id = payload.divisionId

  const { data, error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .update(updates)
    .eq('id', contestantId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Contestant not found')

  // Cleanup old photo asset if it was replaced
  if (oldAssetId && oldAssetId !== payload.image_asset_id) {
    removeReferenceAndDeleteIfUnused(oldAssetId).catch((err) =>
      console.error('[competition] Old contestant photo cleanup error:', err.message),
    )
  }

  return mapContestant(data)
}

export async function deleteContestant(eventId, organizerId, contestantId) {
  await assertCompetitionEvent(eventId, organizerId)

  // Fetch contestant image_asset_id before deleting for cleanup
  const { data: contestantData } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('image_asset_id')
    .eq('id', contestantId)
    .single()

  const assetId = contestantData?.image_asset_id ?? null

  const { error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .delete()
    .eq('id', contestantId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)

  // Cleanup photo asset if no other entities reference it
  if (assetId) {
    removeReferenceAndDeleteIfUnused(assetId).catch((err) =>
      console.error('[competition] Contestant photo cleanup error:', err.message),
    )
  }
}

export async function getNextContestantNumber(eventId, organizerId, divisionId = null) {
  await assertCompetitionEvent(eventId, organizerId)

  let query = getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('contestant_number')
    .eq('event_id', eventId)
    .order('contestant_number', { ascending: false })
    .limit(1)

  if (divisionId) {
    query = query.eq('division_id', divisionId)
  } else {
    query = query.is('division_id', null)
  }

  const { data, error } = await query
  if (error) throw new ApiError(500, error.message)

  const highest = data?.[0]?.contestant_number ?? 0
  return highest + 1
}

// ——— Criteria ———

export async function listCriteria(eventId, organizerId, filters = {}) {
  await assertCompetitionEvent(eventId, organizerId)

  let query = getClient()
    .from(DB_TABLES.CRITERIA)
    .select('id, event_id, division_id, name, percentage, min_score, max_score')
    .eq('event_id', eventId)

  if (filters.divisionId !== undefined) {
    query = query.eq('division_id', filters.divisionId)
  }

  const { data, error } = await query.order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapCriteria)
}

export async function createCriteria(eventId, organizerId, payload) {
  await assertCompetitionEvent(eventId, organizerId)

  if (payload.divisionId) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.CRITERIA)
    .insert({
      event_id: eventId,
      division_id: payload.divisionId ?? null,
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

  if (payload.divisionId !== undefined && payload.divisionId !== null) {
    const { data: div, error: divErr } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id')
      .eq('id', payload.divisionId)
      .eq('event_id', eventId)
      .maybeSingle()
    if (divErr) throw new ApiError(500, divErr.message)
    if (!div) throw new ApiError(400, 'Division does not belong to this event')
  }

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.percentage !== undefined) updates.percentage = payload.percentage
  if (payload.minScore !== undefined) updates.min_score = payload.minScore
  if (payload.maxScore !== undefined) updates.max_score = payload.maxScore
  if (payload.divisionId !== undefined) updates.division_id = payload.divisionId

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

// ——— Judges ———

async function ensureJudgeAccount(email, plainPassword, resetPasswordForExisting = true) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await findUserByEmail(normalizedEmail)

  if (existing && existing.role !== USER_ROLES.VOTER) {
    throw new ApiError(409, 'This email is already used by another account type')
  }

  // If user exists and we're not resetting password, just return them
  if (existing && !resetPasswordForExisting) {
    return { user: sanitizeUser(existing), isNew: false }
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

function resolveDisplayName(firstName, lastName, fallback = null) {
  return [firstName, lastName].filter(Boolean).join(' ') || fallback
}

async function upsertJudgeInvitationStatus(eventId, userId, values) {
  const { error } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .upsert(
      { event_id: eventId, voter_id: userId, ...values },
      { onConflict: 'event_id,voter_id', ignoreDuplicates: false },
    )

  if (error) throw new ApiError(500, error.message)
}

export async function inviteJudge(eventId, organizerId, { email, temporaryPassword, firstName, lastName }) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const tempPassword = temporaryPassword || generateTemporaryPassword()
  // Existing judges keep their own password — never reset. isNew decides which email to send.
  const { user, isNew } = await ensureJudgeAccount(email, tempPassword, false)

  await registerParticipant(eventId, user.id, {
    participantType: 'COMPETITION_JUDGE',
    firstName: firstName || null,
    lastName: lastName || null,
    judgeRole: 'judge',
    displayName: resolveDisplayName(firstName, lastName, user.email),
    isActive: true,
  })

  const emailResult = isNew
    ? await sendJudgeInvitationEmail({
        email: user.email,
        temporaryPassword: tempPassword,
        eventId: event.id,
        eventTitle: event.title,
      })
    : await sendJudgeInvitationEmailRegistered({
        email: user.email,
        eventId: event.id,
        eventTitle: event.title,
      })

  return { user: sanitizeUser(user), isNewJudge: isNew, email: emailResult }
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

  await registerParticipant(eventId, user.id, {
    participantType: PARTICIPANT_TYPES.COMPETITION_JUDGE,
    firstName: firstName || null,
    lastName: lastName || null,
    judgeRole: 'judge',
    displayName: resolveDisplayName(firstName, lastName, user.email),
    isActive: true,
  })

  try {
    await upsertJudgeInvitationStatus(eventId, user.id, { invitation_sent: false })
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

  const { data: judgeRow, error: judgeRowErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('user_id, users (id, email, must_change_password)')
    .eq('user_id', judgeId)
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .maybeSingle()

  if (judgeRowErr) throw new ApiError(500, judgeRowErr.message)
  if (!judgeRow) {
    console.error(`[sendJudgeInvitation] judge participant not found for judgeId=${judgeId}, eventId=${eventId}`)
    throw new ApiError(404, 'Judge is not enrolled in this event')
  }

  const userId = judgeRow.user_id
  const judgeEmail = judgeRow.users?.email
  const mustChangePassword = judgeRow.users?.must_change_password ?? true

  // A judge who has already set their own password is an existing account.
  const isExistingAccount = !mustChangePassword

  let tempPassword = null
  let emailResult = null
  let invitationType = isExistingAccount ? 'existing' : 'new'

  try {
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

      await getClient().from(DB_TABLES.USERS).update({ password: passwordHash, must_change_password: true }).eq('id', userId)

      emailResult = await sendJudgeInvitationEmail({
        email: judgeEmail,
        temporaryPassword: tempPassword,
        eventId: event.id,
        eventTitle: event.title,
      })
    }
  } catch (emailError) {
    console.error(`[sendJudgeInvitation] email sending failed for ${judgeEmail}:`, emailError.message)
    emailResult = { 
      sent: false, 
      error: emailError.message || 'Failed to send invitation email',
      retryable: emailError.message?.includes('Network connectivity') || emailError.message?.includes('Unable to reach')
    }
  }

  if (emailResult?.sent) {
    try {
      await upsertJudgeInvitationStatus(eventId, userId, {
        invitation_sent: true,
        is_new_account: !isExistingAccount,
      })
    } catch (dbErr) {
      console.error('[sendJudgeInvitation] failed to mark invitation_sent=true:', dbErr.message)
      throw new ApiError(500, 'Invitation email was sent, but the system could not mark it as sent. Please refresh and try again if it still shows pending.')
    }
  }

  return {
    email: emailResult,
    invitationSent: emailResult?.sent || false,
    invitationType,
    temporaryPassword: tempPassword,
    message: emailResult?.sent 
      ? `Invitation sent successfully to ${judgeEmail}` 
      : `Invitation failed: ${emailResult?.error || 'Unknown error'}`
  }
}

/**
 * Send all pending judge invitations for an event.
 * Handles both new and existing accounts appropriately.
 */
export async function sendAllPendingJudgeInvitations(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  // Start from event_participants — the source of truth for enrolled judges.
  const { data: judgeParticipants, error: jpErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('user_id, users (id, email, must_change_password)')
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)

  if (jpErr) throw new ApiError(500, jpErr.message)
  if (!judgeParticipants?.length) return { total: 0, sent: 0, failed: 0, results: [] }

  // Check which judges already had their invitation sent
  const judgeUserIds = judgeParticipants.map((j) => j.user_id)
  const { data: existingInvitations } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select('voter_id, invitation_sent')
    .eq('event_id', eventId)
    .in('voter_id', judgeUserIds)

  const sentSet = new Set(
    (existingInvitations ?? []).filter((inv) => inv.invitation_sent).map((inv) => inv.voter_id),
  )

  // Only process judges whose invitation hasn't been sent yet
  const pendingJudges = judgeParticipants.filter((j) => !sentSet.has(j.user_id))

  console.log(`[sendAllPendingJudgeInvitations] total=${judgeParticipants.length}, alreadySent=${sentSet.size}, pending=${pendingJudges.length}`)

  if (!pendingJudges.length) return { total: 0, sent: 0, failed: 0, results: [] }

  let sent = 0, failed = 0
  const results = []

  for (const p of pendingJudges) {
    const judgeEmail = p.users?.email
    // A judge who has already set their own password is an existing account.
    const isExistingAccount = !p.users?.must_change_password

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

        await getClient().from(DB_TABLES.USERS).update({ password: passwordHash, must_change_password: true }).eq('id', p.user_id)

        emailResult = await sendJudgeInvitationEmail({
          email: judgeEmail,
          temporaryPassword: tempPassword,
          eventId: event.id,
          eventTitle: event.title,
        })
      }

      if (emailResult?.sent) {
        await upsertJudgeInvitationStatus(eventId, p.user_id, {
          invitation_sent: true,
          is_new_account: !isExistingAccount,
        })
        sent++
        results.push({
          judgeId: p.user_id,
          email: judgeEmail,
          success: true,
          invitationType,
          temporaryPassword: tempPassword,
        })
      } else {
        failed++
        results.push({
          judgeId: p.user_id,
          email: judgeEmail,
          success: false,
          invitationType,
          error: emailResult?.error || 'Email delivery failed',
        })
      }
    } catch (err) {
      failed++
      results.push({
        judgeId: p.user_id,
        email: judgeEmail,
        success: false,
        invitationType,
        error: err.message,
      })
    }
  }

  return { total: pendingJudges.length, sent, failed, results }
}

export function mergeJudgeRows(participantRow = null, compatibilityRow = null) {
  const fromParticipant = participantRow ?? {}
  const fromCompatibility = compatibilityRow ?? {}

  const participantDisplayName = [fromParticipant.first_name, fromParticipant.last_name]
    .filter(Boolean)
    .join(' ') || fromParticipant.users?.email || null

  const compatibilityDisplayName = typeof fromCompatibility.display_name === 'string' && fromCompatibility.display_name.trim()
    ? fromCompatibility.display_name.trim()
    : null

  const compatibilityNameParts = compatibilityDisplayName ? compatibilityDisplayName.split(/\s+/) : []

  const displayName = compatibilityDisplayName ?? participantDisplayName

  return {
    id: fromParticipant.id ?? fromCompatibility.id ?? null,
    eventId: fromCompatibility.event_id ?? fromParticipant.event_id ?? null,
    judgeId: fromCompatibility.user_id ?? fromParticipant.user_id ?? fromParticipant.users?.id ?? null,
    email: fromCompatibility.users?.email ?? fromParticipant.users?.email ?? fromParticipant.email ?? null,
    firstName: fromParticipant.first_name ?? (compatibilityNameParts[0] ?? null),
    lastName: fromParticipant.last_name ?? (compatibilityNameParts.slice(1).join(' ') || null),
    displayName,
    hasScored: Boolean(fromParticipant.has_scored || fromCompatibility.has_submitted),
    metadata: fromParticipant.metadata ?? {},
    invitationSent: false,
    source: fromParticipant.id ? 'event_participants' : 'competition_judges_view',
    role: fromParticipant.judge_role ?? fromCompatibility.role ?? 'judge',
    isActive: fromParticipant.is_active ?? fromCompatibility.is_active ?? true,
    hasSubmitted: Boolean(fromParticipant.has_scored || fromCompatibility.has_submitted),
  }
}

export async function listJudges(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data: participantRows, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      `
      id,
      has_scored,
      first_name,
      last_name,
      metadata,
      user_id,
      judge_role,
      display_name,
      is_active,
      users!inner (id, email)
    `,
    )
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  const judgeUserIds = (participantRows ?? []).map((row) => row.user_id).filter(Boolean)
  let invitationMap = {}

  if (judgeUserIds.length) {
    const { data: invitations } = await getClient()
      .from(DB_TABLES.INVITATIONS)
      .select('voter_id, invitation_sent')
      .eq('event_id', eventId)
      .in('voter_id', judgeUserIds)

    for (const inv of invitations ?? []) {
      invitationMap[inv.voter_id] = inv.invitation_sent
    }
  }

  // Fetch the event's information form schema for dynamic columns
  const event = await getEventById(eventId)
  const informationFormSchema = event?.information_form_schema ?? { enabled: false, fields: [] }

  return {
    judges: (participantRows ?? []).map((row) => ({
      id: row.id,
      judgeId: row.user_id,
      email: row.users?.email ?? null,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name || resolveDisplayName(row.first_name, row.last_name, row.users?.email ?? null),
      role: row.judge_role ?? 'judge',
      isActive: row.is_active ?? true,
      hasScored: row.has_scored ?? false,
      metadata: row.metadata ?? {},
      invitationSent: invitationMap[row.user_id] ?? false,
    })),
    informationFormSchema,
  }
}

// ——— Judge scoring (voter/judge) ———

export async function assertJudgeEnrolled(eventId, judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id, event_id, user_id, has_scored')
    .eq('event_id', eventId)
    .eq('user_id', judgeId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(403, 'You are not a judge for this event')
  // Normalize to the shape callers expect
  return { ...data, voter_id: data.user_id, is_judge: true, has_voted: false }
}

// ---------------------------------------------------------------------------
// Phase 6 — Judge assignment enforcement.
// A judge participant may have ZERO or MORE competition_judge_assignments rows.
// If no rows exist, the judge is event-wide. If rows exist, the judge can only score
// (contestant, criterion) pairs that belong to one of the assigned scopes.
//
// For Phase 6 we enforce this at submit time: the requested (round_id,
// category_id) must be covered by the judge's assignments; otherwise the
// submission is rejected.
// ---------------------------------------------------------------------------
export async function getJudgeAssignmentContext(eventId, judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      'id, judge_role, is_active, has_scored',
    )
    .eq('event_id', eventId)
    .eq('user_id', judgeId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) return { isFirstClass: false, role: 'judge', assignments: [] }

  const { data: assignments, error: assignmentError } = await getClient()
    .from(DB_TABLES.COMPETITION_JUDGE_ASSIGNMENTS)
    .select('id, scope, scope_id')
    .eq('participant_id', data.id)

  if (assignmentError) throw new ApiError(500, assignmentError.message)

  return {
    isFirstClass: true,
    role: data.judge_role ?? 'judge',
    isActive: data.is_active ?? true,
    hasSubmitted: data.has_scored ?? false,
    judgeRowId: data.id,
    assignments: assignments ?? [],
  }
}

export async function resolveAllowedDivisions(eventId, judgeId) {
  const ctx = await getJudgeAssignmentContext(eventId, judgeId)
  if (!ctx.isFirstClass) return null
  if (ctx.role === 'score_reviewer') return new Set()
  const list = ctx.assignments
  if (!list || list.length === 0) return null

  const allowed = new Set()
  let hasEventScope = false
  const roundIds = []
  const categoryIds = []

  for (const a of list) {
    if (a.scope === 'event') {
      hasEventScope = true
      break
    }
    if (a.scope === 'division') allowed.add(a.scope_id)
    if (a.scope === 'round') roundIds.push(a.scope_id)
    if (a.scope === 'category') categoryIds.push(a.scope_id)
  }

  if (hasEventScope) return null

  if (roundIds.length > 0) {
    const { data } = await getClient().from(DB_TABLES.COMPETITION_ROUNDS).select('division_id').in('id', roundIds)
    for (const r of data ?? []) {
      if (r.division_id) allowed.add(r.division_id)
      else return null // Event-wide round grants access to all divisions for scoring purposes
    }
  }

  if (categoryIds.length > 0) {
    const { data } = await getClient().from(DB_TABLES.COMPETITION_CATEGORIES).select('division_id').in('id', categoryIds)
    for (const c of data ?? []) {
      if (c.division_id) allowed.add(c.division_id)
      else return null
    }
  }

  return allowed
}

export function canJudgeScore(assignmentContext, { roundId = null, categoryId = null, divisionId = null } = {}) {
  if (!assignmentContext.isFirstClass) return true
  if (assignmentContext.role === 'score_reviewer') return false
  const list = assignmentContext.assignments
  if (!list || list.length === 0) return true
  return list.some((a) => {
    if (a.scope === 'event') return true
    if (a.scope === 'division' && divisionId && a.scope_id === divisionId) return true
    if (a.scope === 'round' && roundId && a.scope_id === roundId) return true
    if (a.scope === 'category' && categoryId && a.scope_id === categoryId) return true
    return false
  })
}

export async function getJudgeScoringSheet(eventId, judgeId, options = {}) {
  const enrollment = await assertJudgeEnrolled(eventId, judgeId)
  const event = await getEventById(eventId)

  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new ApiError(400, 'Not a competition scoring event')
  }

  // Get active session to include live session state
  const activeSession = await getActiveSession(eventId).catch(() => null)

  // Query competition_divisions table to populate allowedDivisions array  
  const { data: divisionRows } = await getClient()
    .from(DB_TABLES.COMPETITION_DIVISIONS)
    .select('id, name, description')
    .eq('event_id', eventId)
    .order('name')

  const divisionsEnabled = (divisionRows?.length ?? 0) > 0
  const allowedDivisions = await resolveAllowedDivisions(eventId, judgeId)

  // Convert allowedDivisions Set to array with division details
  let allowedDivisionsArray = []
  if (allowedDivisions !== null && divisionsEnabled) {
    const divisionMap = new Map((divisionRows ?? []).map(div => [div.id, div]))
    allowedDivisionsArray = Array.from(allowedDivisions)
      .map(id => divisionMap.get(id))
      .filter(Boolean)
  }

  // Validate division access if specific division requested
  if (options.divisionId) {
    if (!allowedDivisions || !allowedDivisions.has(options.divisionId)) {
      throw new ApiError(403, 'You are not assigned to judge this division')
    }
  }

  let contestantsQuery = getClient().from(DB_TABLES.CONTESTANTS).select('id, event_id, division_id, name, photo, contestant_number').eq('event_id', eventId).order('contestant_number')
  let criteriaQuery = getClient().from(DB_TABLES.CRITERIA).select('id, event_id, division_id, name, percentage, min_score, max_score').eq('event_id', eventId)

  // Apply division filtering logic
  if (options.divisionId) {
    // Filter to specific division if requested AND judge is assigned to it
    contestantsQuery = contestantsQuery.or(`division_id.eq.${options.divisionId},division_id.is.null`)
    criteriaQuery = criteriaQuery.or(`division_id.eq.${options.divisionId},division_id.is.null`)
  } else if (allowedDivisions !== null) {
    // Apply normal division restrictions
    if (allowedDivisions.size === 0) {
      return {
        event: mapEvent(event),
        contestants: [],
        criteria: [],
        existingScores: {},
        hasScored: enrollment.has_scored,
        scoringOpen: isCompetitionScoringOpen(event),
        divisionsEnabled,
        allowedDivisions: allowedDivisionsArray,
        activeSession,
      }
    }
    const divIds = Array.from(allowedDivisions)
    contestantsQuery = contestantsQuery.or(`division_id.in.(${divIds.join(',')}),division_id.is.null`)
    criteriaQuery = criteriaQuery.or(`division_id.in.(${divIds.join(',')}),division_id.is.null`)
  }

  const [contestants, criteria] = await Promise.all([
    contestantsQuery,
    criteriaQuery,
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
    divisionsEnabled,
    allowedDivisions: allowedDivisionsArray,
    activeSession,
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

  // Phase 6: enforce assignment scope from the canonical judge participant.
  // A score_reviewer is read-only.
  const judgeCtx = await getJudgeAssignmentContext(eventId, judgeId)
  if (judgeCtx.isFirstClass) {
    if (!judgeCtx.isActive) {
      throw new ApiError(403, 'This judge account is inactive for this event')
    }
    if (judgeCtx.role === 'score_reviewer') {
      throw new ApiError(403, 'Score reviewers cannot submit scores')
    }
  }

  const allowedDivisions = await resolveAllowedDivisions(eventId, judgeId)

  let contestantsQuery = getClient().from(DB_TABLES.CONTESTANTS).select('id').eq('event_id', eventId)
  let criteriaQuery = getClient().from(DB_TABLES.CRITERIA).select('id, event_id, name, percentage, min_score, max_score').eq('event_id', eventId)

  if (allowedDivisions !== null) {
    if (allowedDivisions.size === 0) {
      throw new ApiError(403, 'You are not assigned to score any divisions')
    }
    const divIds = Array.from(allowedDivisions)
    contestantsQuery = contestantsQuery.or(`division_id.in.(${divIds.join(',')}),division_id.is.null`)
    criteriaQuery = criteriaQuery.or(`division_id.in.(${divIds.join(',')}),division_id.is.null`)
  }

  const [contestants, criteria] = await Promise.all([
    contestantsQuery,
    criteriaQuery,
  ])

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
      divisionId: entry.divisionId ?? null,
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
      division_id: entry.divisionId ?? null,
      round_id: entry.roundId ?? null,
      category_id: entry.categoryId ?? null,
      score,
    })
  }

  const { data: locked, error: lockErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .update({ has_scored: true })
    .eq('event_id', eventId)
    .eq('user_id', judgeId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
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
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .update({ has_scored: false })
      .eq('event_id', eventId)
      .eq('user_id', judgeId)
      .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)
    throw err
  }

  return { success: true, message: 'Scores submitted and locked', locked: true }
}

export async function listJudgePageantEvents(judgeId) {
  return listJudgeCompetitionEvents(judgeId)
}

export async function listJudgeCompetitionEvents(judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
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
        organization_id,
        organizations (
          id,
          organization_name
        )
      )
    `,
    )
    .eq('user_id', judgeId)
    .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)

  if (error) throw new ApiError(500, error.message)

  return (data ?? [])
    .filter((r) => COMPETITION_SCORING_EVENT_TYPES.has(r.events?.event_type))
    .map((r) => ({
      ...mapEvent(r.events),
      hasScored: r.has_scored,
    }))
}

// ——— Live rankings ———

export async function getLiveRankings(eventId, organizerId, { divisionId = null } = {}) {
  await assertCompetitionEvent(eventId, organizerId)

  // Build division-aware queries
  let contestantsQuery = getClient().from(DB_TABLES.CONTESTANTS).select('id, event_id, division_id, name, photo, contestant_number').eq('event_id', eventId)
  let criteriaQuery = getClient().from(DB_TABLES.CRITERIA).select('id, event_id, division_id, name, percentage, min_score, max_score').eq('event_id', eventId)
  let roundsQuery = getClient().from(DB_TABLES.COMPETITION_ROUNDS).select('*').eq('event_id', eventId)
  let categoriesQuery = getClient().from(DB_TABLES.COMPETITION_CATEGORIES).select('*').eq('event_id', eventId)

  if (divisionId) {
    contestantsQuery = contestantsQuery.or(`division_id.eq.${divisionId},division_id.is.null`)
    criteriaQuery = criteriaQuery.or(`division_id.eq.${divisionId},division_id.is.null`)
    roundsQuery = roundsQuery.or(`division_id.eq.${divisionId},division_id.is.null`)
    categoriesQuery = categoriesQuery.or(`division_id.eq.${divisionId},division_id.is.null`)
  }

  const [eventRes, contestantsRes, criteriaRes, judgesRes, roundsRes, categoriesRes, scoresRes] =
    await Promise.all([
      getClient()
        .from(DB_TABLES.EVENTS)
        .select('scoring_config, divisions_enabled')
        .eq('id', eventId)
        .single(),
      contestantsQuery,
      criteriaQuery,
      getClient()
        .from(DB_TABLES.EVENT_PARTICIPANTS)
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE),
      roundsQuery,
      categoriesQuery,
      getClient()
        .from(DB_TABLES.JUDGE_SCORES)
        .select('contestant_id, criteria_id, round_id, category_id, division_id, score, judge_id')
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

  // When filtering by division, also restrict scores to that division (or null)
  if (divisionId) {
    scores = scores.filter((s) => s.division_id === divisionId || !s.division_id)
  }

  const { count: totalJudges } = judgesRes
  // H3: derive "judges submitted" from judges who actually have scores in the
  // ranking store. Since Phase 3 writes live-session scores through to
  // competition_scores, this is accurate for BOTH the live and batch paths —
  // unlike the old event_participants.has_scored flag, which the live path never
  // set (so live-session events wrongly showed 0 submitted here).
  const submittedJudges = new Set((scores ?? []).map((s) => s.judge_id)).size

  // Phase 4 (§8A): supply round→criteria membership so the engine scores each
  // round with only its own criteria. Feature-guarded: when an event has NO
  // round_criteria rows this stays null and the engine runs the legacy path,
  // leaving pre-existing flat-model events' numbers unchanged.
  const roundIds = (roundsRes.data ?? []).map((r) => r.id)
  let roundCriteria = null
  if (roundIds.length) {
    const { data: rcRows } = await getClient()
      .from(DB_TABLES.COMPETITION_ROUND_CRITERIA)
      .select('round_id, criteria_id')
      .in('round_id', roundIds)
    if (rcRows && rcRows.length) {
      roundCriteria = {}
      for (const rc of rcRows) {
        ;(roundCriteria[rc.round_id] ??= []).push(rc.criteria_id)
      }
    }
  }

  // H2 note: the FINAL event ranking is the weighted combination of rounds
  // (Σ round.value × round.weight) — the standard model. A round's `score_policy`
  // (independent/cumulative) governs how that round's standing is computed for
  // ADVANCEMENT decisions (see computeRoundStanding), not the weighted final;
  // applying cumulative here as well would double-count across the round weights.
  const { rankings, debug } = computeRankings({
    scores,
    contestants: contestantsRes.data ?? [],
    criteria: criteriaRes.data ?? [],
    rounds: roundsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    config: eventRes.data?.scoring_config,
    roundCriteria,
  })

  // Map the engine's nested shape to the public shape the UI already uses.
  const publicRankings = rankings.map((row) => ({
    contestantId: row.contestantId,
    contestantName: row.contestantName,
    contestantNumber: row.contestantNumber,
    photo: row.photo,
    rank: row.rank,
    divisionId: divisionId ?? null,
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
    divisionId: divisionId ?? null,
    divisionsEnabled: Boolean(eventRes.data?.divisions_enabled),
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

// ——— Phase 7: Results & awards ———

// "Best in {category}" — the top per-category sub-score across the field.
function computeCategoryAwards(rankings) {
  const byCategory = new Map()
  for (const row of rankings) {
    for (const cat of row.perCategory ?? []) {
      const cur = byCategory.get(cat.categoryId)
      if (!cur || cat.value > cur.value) {
        byCategory.set(cat.categoryId, {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          value: cat.value,
          contestantId: row.contestantId,
          contestantName: row.contestantName,
          contestantNumber: row.contestantNumber,
        })
      }
    }
  }
  return [...byCategory.values()]
}

// Assemble the full results view real competitions announce: overall standings +
// champion, per-division winners, per-category ("Best in …") awards, and the
// finalized per-round standings (from the Phase 6 snapshots). Read-only — builds
// on getLiveRankings and competition_round_results; changes no scoring behavior.
export async function getCompetitionResults(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const overall = await getLiveRankings(eventId, organizerId)
  const categoryAwards = computeCategoryAwards(overall.rankings)
  const champion = overall.rankings[0] ?? null

  // Per-division standings + winners.
  const divisions = []
  if (overall.divisionsEnabled) {
    const { data: divList } = await getClient()
      .from(DB_TABLES.COMPETITION_DIVISIONS)
      .select('id, name')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    for (const d of divList ?? []) {
      const dr = await getLiveRankings(eventId, organizerId, { divisionId: d.id })
      divisions.push({
        divisionId: d.id,
        name: d.name,
        winner: dr.rankings[0] ?? null,
        rankings: dr.rankings,
      })
    }
  }

  // Finalized per-round standings (Phase 6 snapshots).
  const { data: rounds } = await getClient()
    .from(DB_TABLES.COMPETITION_ROUNDS)
    .select('id, name, display_order, finalized_at')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
  const finalizedRounds = (rounds ?? []).filter((r) => r.finalized_at)

  let roundStandings = []
  if (finalizedRounds.length) {
    const roundIds = finalizedRounds.map((r) => r.id)
    const [{ data: results }, { data: contestants }] = await Promise.all([
      getClient()
        .from(DB_TABLES.COMPETITION_ROUND_RESULTS)
        .select('round_id, contestant_id, rank, score, qualified')
        .in('round_id', roundIds),
      getClient()
        .from(DB_TABLES.CONTESTANTS)
        .select('id, name, contestant_number')
        .eq('event_id', eventId),
    ])
    const nameById = new Map((contestants ?? []).map((c) => [c.id, c]))
    roundStandings = finalizedRounds.map((r) => ({
      roundId: r.id,
      roundName: r.name,
      finalizedAt: r.finalized_at,
      standings: (results ?? [])
        .filter((x) => x.round_id === r.id)
        .sort((a, b) => a.rank - b.rank)
        .map((x) => ({
          contestantId: x.contestant_id,
          contestantName: nameById.get(x.contestant_id)?.name ?? 'Unknown',
          contestantNumber: nameById.get(x.contestant_id)?.contestant_number ?? null,
          rank: x.rank,
          score: Number(x.score),
          qualified: x.qualified,
        })),
    }))
  }

  return {
    divisionsEnabled: overall.divisionsEnabled,
    champion,
    overall: overall.rankings,
    categoryAwards,
    divisions,
    rounds: roundStandings,
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
