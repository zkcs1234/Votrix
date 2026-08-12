import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrCreatePollingOrganization, mapOrganization } from './organization.service.js'
import {
  loadQuestionTypeRegistry,
  findQuestionType,
  requireQuestionType,
  listCustomTypes,
  createCustomType,
  updateCustomType,
  deleteCustomType,
} from './polling-registry.service.js'
import {
  buildAutoOptions,
  validateAnswer as validateAnswerV2,
  serializeAnswer as serializeAnswerV2,
  validateTypeConfig,
  buildAnalytics,
} from '../modules/poll-question-types.js'
import { isPollOpen as isPollOpenForEvent } from '../utils/eventSchedule.js'
import { emitToEvent, emitToEventOrganizer } from '../websocket/ws-emitter.js'
import { registerParticipant } from './participant.service.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { findUserByEmail, findUserById, sanitizeUser } from './user.service.js'
import { sendVoterInvitationEmail, sendVoterInvitationEmailRegistered } from './mailer.service.js'
import { createNotification } from './notification.service.js'
import { USER_ROLES, COMPETITION_SCORING_EVENT_TYPES, PARTICIPANT_TYPES } from '../utils/constants.js'
import { syncEventSchedules } from './event-schedule-sync.service.js'
import { assertEventUpdateAllowed } from '../utils/eventLifecycle.js'
import { deleteDraft } from './draft.service.js'
import { removeReferenceAndDeleteIfUnused } from './imageAsset.service.js'

// Phase 7 — Polling question types are now registry-driven. The legacy
// POLL_QUESTION_TYPES constants and the `multiple_choice` alias are kept in
// utils/constants.js for backward compatibility with existing code, but the
// question creation / validation / analytics paths now go through
// poll-question-types.js so a new type is a single SQL INSERT away.


function mapPollEvent(row) {
  const org = row.organizations ?? null

  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    banner: row.banner,
    status: row.status,
    eventType: row.event_type,
    pollingEnabled: Boolean(row.polling_enabled),
    pollAnonymous: Boolean(row.poll_anonymous),
    pollAllowMultipleSubmissions: Boolean(row.poll_allow_multiple_submissions),
    pollExpiresAt: row.poll_expires_at,
    startDate: row.start_date,
    endDate: row.end_date,
    organization: org
      ? {
          id: org.id,
          name: org.organization_name,
          logo: null, // Logo moved to users table in migration 028
        }
      : null,
  }
}

function mapQuestion(row, options = [], typeDef = null) {
  const out = {
    id: row.id,
    eventId: row.event_id,
    question: row.question,
    type: row.type,
    sortOrder: row.sort_order,
    required: row.required,
    typeConfig: row.type_config ?? {},
    imageUrl: row.image_url,
    imageAssetId: row.image_asset_id ?? null,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      sortOrder: o.sort_order,
      imageUrl: o.image_url,
      imageAssetId: o.image_asset_id ?? null,
    })),
  }
  if (typeDef) {
    out.typeDef = {
      key: typeDef.key,
      label: typeDef.label,
      description: typeDef.description,
      answerFormat: typeDef.answerFormat,
      configSchema: typeDef.configSchema,
      ui: typeDef.ui,
    }
  }
  return out
}

async function assertPollingEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.POLLING) {
    throw new ApiError(400, 'This event is not a poll')
  }
  return event
}

async function getPollingOrgId(organizerId) {
  const org = await getOrCreatePollingOrganization(organizerId)
  return org.id
}

function isPollOpen(event) {
  return isPollOpenForEvent(event)
}

async function ensureRespondentAccount(email, plainPassword, resetPasswordForExisting = true) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await findUserByEmail(normalizedEmail)

  if (existing && existing.role !== USER_ROLES.VOTER) {
    throw new ApiError(409, 'This email is already used by another account type')
  }

  // Existing account that already has its own password — never reset it
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

export async function listEventRespondents(eventId, organizerId, page = 1, limit = 50) {
  await assertPollingEvent(eventId, organizerId)

  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(`
      id,
      has_responded,
      first_name,
      last_name,
      created_at,
      user_id,
      metadata,
      users!inner (id, email)
    `, { count: 'exact' })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.POLLING_RESPONDENT)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new ApiError(500, error.message)

  const invitationMap = new Map()
  const respondentIds = (data ?? []).map((row) => row.user_id).filter(Boolean)

  if (respondentIds.length) {
    const { data: invitations, error: inviteError } = await getClient()
      .from(DB_TABLES.INVITATIONS)
      .select('voter_id, invitation_sent')
      .eq('event_id', eventId)
      .in('voter_id', respondentIds)

    if (inviteError) throw new ApiError(500, inviteError.message)

    for (const inv of invitations ?? []) {
      invitationMap.set(inv.voter_id, inv.invitation_sent)
    }
  }

  const event = await getEventById(eventId)
  const informationFormSchema = event?.information_form_schema ?? { enabled: false, fields: [] }

  return {
    voters: (data ?? []).map((row) => ({
      id: row.id,
      voterId: row.users?.id,
      email: row.users?.email,
      firstName: row.first_name,
      lastName: row.last_name,
      hasResponded: row.has_responded,
      createdAt: row.created_at,
      metadata: row.metadata ?? {},
      invitationSent: invitationMap.get(row.user_id) ?? false,
    })),
    informationFormSchema,
    meta: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  }
}

export async function registerRespondentToPoll({ eventId, email, organizerId, temporaryPassword, resetPasswordForExisting = false }) {
  await assertPollingEvent(eventId, organizerId)

  const tempPassword = temporaryPassword || generateTemporaryPassword()
  const { user, isNew } = await ensureRespondentAccount(email, tempPassword, resetPasswordForExisting)

  await registerParticipant(eventId, user.id, {
    participantType: PARTICIPANT_TYPES.POLLING_RESPONDENT,
  })

  try {
    await getClient().from(DB_TABLES.INVITATIONS).upsert(
      { event_id: eventId, voter_id: user.id, invitation_sent: false },
      { onConflict: 'event_id,voter_id', ignoreDuplicates: false },
    )
  } catch (dbErr) {
    console.error('[polling] invitations upsert failed:', dbErr.message)
    throw new ApiError(500, 'Failed to create invitation record')
  }

  return {
    user: sanitizeUser(user),
    isNewRespondent: isNew,
    invitationSent: false,
    temporaryPassword: resetPasswordForExisting ? tempPassword : null,
  }
}

export async function registerExistingRespondent({ eventId, email, organizerId }) {
  await assertPollingEvent(eventId, organizerId)

  const voter = await findUserByEmail(email.toLowerCase().trim())
  if (!voter) {
    throw new ApiError(404, 'Respondent not found. Use the register flow to create a new respondent account.')
  }

  if (voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(400, 'This email belongs to a different account type')
  }

  const { data: existing } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', voter.id)
    .maybeSingle()

  if (existing) {
    throw new ApiError(409, 'Respondent is already enrolled in this event')
  }

  await registerParticipant(eventId, voter.id, { participantType: PARTICIPANT_TYPES.POLLING_RESPONDENT })

  try {
    await getClient().from(DB_TABLES.INVITATIONS).insert({
      event_id: eventId,
      voter_id: voter.id,
      invitation_sent: false,
    })
  } catch (dbErr) {
    console.error('[polling] invitations insert failed:', dbErr.message)
    throw new ApiError(500, 'Failed to create invitation record')
  }

  return { user: sanitizeUser(voter), invitationSent: false }
}

export async function sendRespondentInvitation({ eventId, voterId, organizerId }) {
  await assertPollingEvent(eventId, organizerId)
  const event = await getEventById(eventId)
  const voter = await findUserById(voterId)

  if (!voter || voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(404, 'Respondent not found')
  }

  const { data: enrollment, error: enrollmentError } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', voterId)
    .maybeSingle()

  if (enrollmentError) throw new ApiError(500, enrollmentError.message)
  if (!enrollment) {
    throw new ApiError(404, 'Respondent is not enrolled in this event')
  }

  // A voter who has already set their own password (must_change_password = false)
  // is an existing account — send the registered email and never reset their password.
  const isExistingAccount = !voter.must_change_password

  let tempPassword = null
  let emailResult = null

  if (isExistingAccount) {
    emailResult = await sendVoterInvitationEmailRegistered({
      email: voter.email,
      eventId: event.id,
      eventTitle: event.title,
    })
  } else {
    tempPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(tempPassword)

    await getClient()
      .from(DB_TABLES.USERS)
      .update({ password: passwordHash, must_change_password: true })
      .eq('id', voterId)

    emailResult = await sendVoterInvitationEmail({
      email: voter.email,
      temporaryPassword: tempPassword,
      eventId: event.id,
      eventTitle: event.title,
    })
  }

  if (emailResult?.sent) {
    try {
      await getClient()
        .from(DB_TABLES.INVITATIONS)
        .update({ invitation_sent: true, is_new_account: !isExistingAccount })
        .eq('event_id', eventId)
        .eq('voter_id', voterId)
    } catch (dbErr) {
      console.error('[polling] failed to mark invitation_sent=true:', dbErr.message)
    }

    try {
      await createNotification({
        userId: voterId,
        type: isExistingAccount ? 'voter.invitation.registered' : 'voter.invitation',
        title: `You're invited to ${event.title}`,
        message: isExistingAccount
          ? `You've been added to ${event.title}. Sign in with your existing password.`
          : `Your invitation for ${event.title} has been sent. Sign in to review your participation details.`,
        actionUrl: COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
          ? `/voter/competition/events/${event.id}/score`
          : event.event_type === 'polling'
            ? `/voter/polling/events/${event.id}`
            : `/voter/events/${event.id}`,
        entity: 'events',
        entityId: event.id,
        metadata: { eventType: event.event_type, organizationName: event.organizations?.organization_name },
      })
    } catch (notifErr) {
      console.error('[polling] createNotification failed:', notifErr.message)
    }
  }

  return { user: voter, email: emailResult, invitationSent: emailResult?.sent, temporaryPassword: tempPassword }
}

export async function sendAllPendingRespondentInvitations({ eventId, organizerId }) {
  await assertPollingEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  const { data: pendingRespondents, error: pendingError } = await getClient()
    .from(DB_TABLES.INVITATIONS)
    .select('id, voter_id, users (id, email, must_change_password)')
    .eq('event_id', eventId)
    .eq('invitation_sent', false)

  if (pendingError) throw new ApiError(500, pendingError.message)

  if (!pendingRespondents?.length) {
    return { total: 0, sent: 0, failed: 0, results: [] }
  }

  const results = []
  let sentCount = 0
  let failedCount = 0

  for (const pending of pendingRespondents) {
    const voter = pending.users
    // A voter who has already set their own password is an existing account.
    const isExistingAccount = !voter.must_change_password
    let tempPassword = null
    let emailResult = null

    try {
      if (isExistingAccount) {
        emailResult = await sendVoterInvitationEmailRegistered({
          email: voter.email,
          eventId: event.id,
          eventTitle: event.title,
        })
      } else {
        tempPassword = generateTemporaryPassword()
        const passwordHash = await hashPassword(tempPassword)

        await getClient()
          .from(DB_TABLES.USERS)
          .update({ password: passwordHash, must_change_password: true })
          .eq('id', voter.id)

        emailResult = await sendVoterInvitationEmail({
          email: voter.email,
          temporaryPassword: tempPassword,
          eventId: event.id,
          eventTitle: event.title,
        })
      }

      if (emailResult?.sent) {
        await getClient()
          .from(DB_TABLES.INVITATIONS)
          .update({ invitation_sent: true, is_new_account: !isExistingAccount })
          .eq('event_id', eventId)
          .eq('voter_id', voter.id)

        sentCount++
        results.push({ voterId: voter.id, email: voter.email, success: true, temporaryPassword: tempPassword })
      } else {
        failedCount++
        results.push({ voterId: voter.id, email: voter.email, success: false, error: emailResult?.error || 'Email delivery failed' })
      }
    } catch (err) {
      failedCount++
      results.push({ voterId: voter.id, email: voter.email, success: false, error: err.message })
    }
  }

  return { total: pendingRespondents.length, sent: sentCount, failed: failedCount, results }
}

// ——— Organizer: events ———

export async function getOrganizerDashboard(organizerId) {
  const org = await getOrCreatePollingOrganization(organizerId)
  if (!org?.id) {
    throw new ApiError(500, 'Failed to get or create organization')
  }
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, title, status, polling_enabled, poll_expires_at')
    .eq('organization_id', org.id)
    .eq('event_type', EVENT_TYPES.POLLING)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  const eventIds = (data ?? []).map((e) => e.id)
  let assignedUsers = 0
  let respondedUsers = 0
  let responsesSubmitted = 0

  if (eventIds.length) {
    const [assignedRes, respondedRes, answersRes] = await Promise.all([
      getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds),
      getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .select('*', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .eq('has_voted', true),
      getClient()
        .from(DB_TABLES.POLL_ANSWERS)
        .select('id, poll_questions!inner(event_id)', { count: 'exact', head: true })
        .in('poll_questions.event_id', eventIds),
    ])

    if (assignedRes.error) throw new ApiError(500, assignedRes.error.message)
    if (respondedRes.error) throw new ApiError(500, respondedRes.error.message)
    if (answersRes.error) throw new ApiError(500, answersRes.error.message)

    assignedUsers = assignedRes.count ?? 0
    respondedUsers = respondedRes.count ?? 0
    responsesSubmitted = answersRes.count ?? 0
  }

  const participationRate =
    assignedUsers > 0 ? Math.round((respondedUsers / assignedUsers) * 10000) / 100 : 0

  return {
    organization: mapOrganization(org),
    events: (data ?? []).map(mapPollEvent),
    stats: {
      totalPolls: data?.length ?? 0,
      activePolls: data?.filter((e) => e.polling_enabled).length ?? 0,
      assignedUsers,
      respondedUsers,
      responsesSubmitted,
      participationRate,
    },
  }
}

export async function listPollEvents(organizerId, { limit = 200, offset = 0 } = {}) {
  const org = await getOrCreatePollingOrganization(organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, title, description, banner, status, event_type, polling_enabled, poll_anonymous, poll_allow_multiple_submissions, poll_expires_at, start_date, end_date')
    .eq('organization_id', org.id)
    .eq('event_type', EVENT_TYPES.POLLING)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapPollEvent)
}

export async function createPollEvent(organizerId, payload) {
  const org = await getOrCreatePollingOrganization(organizerId)

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
      event_type: EVENT_TYPES.POLLING,
      status: 'draft',
      polling_enabled: false,
      poll_anonymous: Boolean(payload.pollAnonymous),
      poll_allow_multiple_submissions: Boolean(payload.pollAllowMultipleSubmissions),
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  await syncEventSchedules().catch((err) => {
    console.error('[polling] schedule sync failed after create:', err.message)
  })
  await deleteDraft(organizerId, 'polling').catch((err) => {
    console.error('[polling] failed to clear draft after create:', err.message)
  })
  return mapPollEvent(data)
}

export async function updatePollEvent(eventId, organizerId, payload) {
  const event = await assertPollingEvent(eventId, organizerId)
  assertEventUpdateAllowed(event, payload)

  // Capture old image_asset_id before updating so we can clean it up if replaced
  const oldAssetId = event.image_asset_id ?? null

  const updates = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.startDate !== undefined) updates.start_date = payload.startDate
  if (payload.endDate !== undefined) updates.end_date = payload.endDate
  if (payload.pollAnonymous !== undefined) updates.poll_anonymous = payload.pollAnonymous
  if (payload.pollAllowMultipleSubmissions !== undefined) {
    updates.poll_allow_multiple_submissions = payload.pollAllowMultipleSubmissions
  }
  if (payload.banner !== undefined) updates.banner = payload.banner
  if (payload.image_asset_id !== undefined) updates.image_asset_id = payload.image_asset_id

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
      console.error('[polling] Old banner asset cleanup error:', err.message),
    )
  }

  await syncEventSchedules().catch((err) => {
    console.error('[polling] schedule sync failed after update:', err.message)
  })
  return mapPollEvent(data)
}

export async function setPollOpen(eventId, organizerId, pollingEnabled) {
  await assertPollingEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({
      polling_enabled: Boolean(pollingEnabled),
      status: pollingEnabled ? 'active' : 'scheduled',
    })
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  emitToEvent(eventId, 'poll:polling-toggled', {
    eventId,
    pollingEnabled: Boolean(pollingEnabled),
  })

  return mapPollEvent(data)
}

export async function getPollSettings(eventId, organizerId) {
  const event = await assertPollingEvent(eventId, organizerId)
  return mapPollEvent(event)
}

// ——— Questions & options ———

async function loadOptionsForQuestions(questionIds) {
  if (!questionIds.length) return {}

const { data, error } = await getClient()
    .from(DB_TABLES.POLL_OPTIONS)
    .select('id, question_id, label, sort_order, image_url, image_asset_id')
    .in('question_id', questionIds)
    .order('sort_order', { ascending: true })

  if (error) throw new ApiError(500, error.message)

  const map = {}
  for (const o of data ?? []) {
    if (!map[o.question_id]) map[o.question_id] = []
    map[o.question_id].push(o)
  }
  return map
}

export async function listQuestions(eventId, organizerId) {
  await assertPollingEvent(eventId, organizerId)
  const orgId = await getPollingOrgId(organizerId)
  const registry = await loadQuestionTypeRegistry(orgId)

const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('id, event_id, question, type, sort_order, required, type_config, image_url, image_asset_id')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) throw new ApiError(500, error.message)

  const ids = (data ?? []).map((q) => q.id)
  const optMap = await loadOptionsForQuestions(ids)

  return (data ?? []).map((q) => {
    const typeDef = registry.find((r) => r.key === q.type) ?? null
    return mapQuestion(q, optMap[q.id] ?? [], typeDef)
  })
}

export async function createQuestion(eventId, organizerId, payload) {
  await assertPollingEvent(eventId, organizerId)

  const orgId = await getPollingOrgId(organizerId)
  const typeDef = await requireQuestionType(orgId, payload.type)
  const typeConfig = validateTypeConfig(typeDef, payload.typeConfig)

  const { data: question, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .insert({
      event_id: eventId,
      question: payload.question,
      type: typeDef.key,
      sort_order: payload.sortOrder ?? 0,
      required: payload.required !== false,
type_config: typeConfig,
      image_url: payload.imageUrl ?? null,
      image_asset_id: payload.image_asset_id ?? null,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const options = await upsertQuestionOptions(
    question.id,
    typeDef,
    typeConfig,
    payload.options,
  )

  return mapQuestion(question, options, typeDef)
}

export async function updateQuestion(eventId, organizerId, questionId, payload) {
  await assertPollingEvent(eventId, organizerId)

  const orgId = await getPollingOrgId(organizerId)
  const registry = await loadQuestionTypeRegistry(orgId)

  // Capture old image_asset_id before updating so we can clean it up if replaced
  let oldAssetId = null
  if (payload.image_asset_id !== undefined) {
    const { data: prev } = await getClient()
      .from(DB_TABLES.POLL_QUESTIONS)
      .select('image_asset_id')
      .eq('id', questionId)
      .maybeSingle()
    oldAssetId = prev?.image_asset_id ?? null
  }

  const updates = {}
  if (payload.question !== undefined) updates.question = payload.question
  let typeDef = null
  if (payload.type !== undefined) {
    typeDef = registry.find((r) => r.key === payload.type) ?? null
    if (!typeDef) throw new ApiError(400, `Unknown question type: ${payload.type}`)
    updates.type = typeDef.key
  }
  if (payload.sortOrder !== undefined) updates.sort_order = payload.sortOrder
  if (payload.required !== undefined) updates.required = payload.required
  if (payload.imageUrl !== undefined) updates.image_url = payload.imageUrl
  if (payload.image_asset_id !== undefined) updates.image_asset_id = payload.image_asset_id
  if (payload.typeConfig !== undefined) {
    let def = typeDef
    if (!def) {
      const currentKey = await currentTypeKey(questionId)
      def = registry.find((r) => r.key === currentKey) ?? null
    }
    if (!def) throw new ApiError(400, 'Cannot update typeConfig without a known type')
    updates.type_config = validateTypeConfig(def, payload.typeConfig)
  }

  const { data: question, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .update(updates)
    .eq('id', questionId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!question) throw new ApiError(404, 'Question not found')

  // Cleanup old image asset if it was replaced
  if (oldAssetId && oldAssetId !== payload.image_asset_id) {
    removeReferenceAndDeleteIfUnused(oldAssetId).catch((err) =>
      console.error('[polling] Old question image cleanup error:', err.message),
    )
  }

  // Re-resolve the typeDef in case the type didn't change.
  const finalTypeDef = typeDef ?? registry.find((r) => r.key === question.type) ?? null
  const finalTypeConfig = question.type_config ?? {}

let options = []
  if (payload.options) {
    // Capture old option image_asset_ids before deleting so we can clean them up if replaced
    const oldOptMap = await loadOptionsForQuestions([questionId])
    const oldOptAssetIds = (oldOptMap[questionId] ?? [])
      .map((o) => o.image_asset_id)
      .filter(Boolean)

    await getClient().from(DB_TABLES.POLL_OPTIONS).delete().eq('question_id', questionId)
    options = await upsertQuestionOptions(question.id, finalTypeDef, finalTypeConfig, payload.options)

    // Cleanup old option image assets that are no longer referenced
    for (const assetId of oldOptAssetIds) {
      removeReferenceAndDeleteIfUnused(assetId).catch((err) =>
        console.error('[polling] Old option image cleanup error:', err.message),
      )
    }
  } else {
    const optMap = await loadOptionsForQuestions([questionId])
    options = optMap[questionId] ?? []
  }

  return mapQuestion(question, options, finalTypeDef)
}

async function currentTypeKey(questionId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('type')
    .eq('id', questionId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return data?.type
}

export async function deleteQuestion(eventId, organizerId, questionId) {
  await assertPollingEvent(eventId, organizerId)

  // Fetch question image_asset_id before deleting for cleanup
  const { data: questionData } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('image_asset_id')
    .eq('id', questionId)
    .single()

  const assetId = questionData?.image_asset_id ?? null

  // Fetch option image_asset_ids before deleting options for cleanup
  const optMap = await loadOptionsForQuestions([questionId])
  const optAssetIds = (optMap[questionId] ?? [])
    .map((o) => o.image_asset_id)
    .filter(Boolean)

  const { error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .delete()
    .eq('id', questionId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)

  // Cleanup image assets if no other entities reference them
  if (assetId) {
    removeReferenceAndDeleteIfUnused(assetId).catch((err) =>
      console.error('[polling] Question image cleanup error:', err.message),
    )
  }
  for (const optAssetId of optAssetIds) {
    removeReferenceAndDeleteIfUnused(optAssetId).catch((err) =>
      console.error('[polling] Question option image cleanup error:', err.message),
    )
  }
}

export async function duplicateQuestion(eventId, organizerId, questionId) {
  await assertPollingEvent(eventId, organizerId)
  const orgId = await getPollingOrgId(organizerId)
  const registry = await loadQuestionTypeRegistry(orgId)

// Fetch the source question
  const { data: sourceQuestion, error: qError } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('id, event_id, question, type, sort_order, required, type_config, image_url, image_asset_id')
    .eq('id', questionId)
    .eq('event_id', eventId)
    .single()

  if (qError) throw new ApiError(500, qError.message)
  if (!sourceQuestion) throw new ApiError(404, 'Question not found')

  // Determine new sort_order (place immediately after the source)
  const newSortOrder = sourceQuestion.sort_order + 1

  // Shift subsequent questions' sort_order down by 1
  const { data: laterQuestions, error: laterErr } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('id, sort_order')
    .eq('event_id', eventId)
    .gte('sort_order', newSortOrder)
    .neq('id', sourceQuestion.id)
    .order('sort_order', { ascending: false })

  if (laterErr) throw new ApiError(500, laterErr.message)

  if (laterQuestions?.length) {
    const updates = laterQuestions.map((q) => ({
      id: q.id,
      sort_order: q.sort_order + 1,
    }))
    for (const u of updates) {
      const { error: upErr } = await getClient()
        .from(DB_TABLES.POLL_QUESTIONS)
        .update({ sort_order: u.sort_order })
        .eq('id', u.id)
      if (upErr) throw new ApiError(500, upErr.message)
    }
  }

  // Get the source question's options
  const optMap = await loadOptionsForQuestions([sourceQuestion.id])
  const sourceOptions = optMap[sourceQuestion.id] ?? []

  const typeDef = registry.find((r) => r.key === sourceQuestion.type) ?? null
  const typeConfig = sourceQuestion.type_config ?? {}

  // Create the duplicate question with " (copy)" suffix
  const { data: newQuestion, error: createErr } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .insert({
      event_id: eventId,
      question: `${sourceQuestion.question} (copy)`,
      type: sourceQuestion.type,
      sort_order: newSortOrder,
      required: sourceQuestion.required,
      type_config: typeConfig,
      image_url: sourceQuestion.image_url ?? null,
      image_asset_id: sourceQuestion.image_asset_id ?? null,
    })
    .select('*')
    .single()

  if (createErr) throw new ApiError(500, createErr.message)

  // Duplicate options if they exist
  let newOptions = []
  if (sourceOptions.length > 0) {
    const optionRows = sourceOptions.map((o, i) => ({
      question_id: newQuestion.id,
      label: o.label,
      sort_order: o.sort_order ?? i,
      image_url: o.image_url ?? null,
      image_asset_id: o.image_asset_id ?? null,
    }))

    const { data: opts, error: optErr } = await getClient()
      .from(DB_TABLES.POLL_OPTIONS)
      .insert(optionRows)
      .select('*')

    if (optErr) throw new ApiError(500, optErr.message)
    newOptions = opts ?? []
  }

  return mapQuestion(newQuestion, newOptions, typeDef)
}

export async function reorderQuestions(eventId, organizerId, orders) {
  await assertPollingEvent(eventId, organizerId)
  
  if (!orders || !Array.isArray(orders) || orders.length === 0) return []

  const updates = orders.map((o) => ({
    id: o.id,
    sort_order: o.sortOrder,
  }))

  for (const u of updates) {
    const { error } = await getClient()
      .from(DB_TABLES.POLL_QUESTIONS)
      .update({ sort_order: u.sort_order })
      .eq('id', u.id)
      .eq('event_id', eventId)
      
    if (error) throw new ApiError(500, error.message)
  }

  return listQuestions(eventId, organizerId)
}

// Legacy alias used in some admin code paths. The registry is the source of
// truth; this returns the key as-is if it is known.
function normalizeQuestionType(type) {
  return type
}

async function upsertQuestionOptions(questionId, typeDef, typeConfig, optionsInput) {
  if (!typeDef) return []
  const fmt = typeDef.answerFormat ?? {}
  const kind = fmt.kind

  // Numeric, text, ranking-as-options are free-form (no poll_options rows).
  // For ranking, options live in poll_options and the answer is a ranking map.
  let options = optionsInput ?? []

  // Auto-generated options (Yes/No, Likert).
  if ((kind === 'choice' && Array.isArray(fmt.autoOptions)) ||
      (kind === 'choice' && fmt.autoOptionsFromConfig)) {
    if (!options.length) {
      options = buildAutoOptions(typeDef, typeConfig)
    }
  }

  // Choice / ranking types need at least two poll_options rows.
  if (kind === 'choice' || kind === 'ranking') {
    if (!options.length) {
      throw new ApiError(400, 'Options are required for this question type')
    }
    if (options.length < 2) {
      throw new ApiError(400, 'Provide at least two options')
    }
  }

  if (!options.length) return []

const rows = options.map((o, i) => ({
    question_id: questionId,
    label: typeof o === 'string' ? o : o.label,
    sort_order: typeof o === 'string' ? i : o.sortOrder ?? i,
    image_url: typeof o === 'string' ? null : (o.imageUrl ?? null),
    image_asset_id: typeof o === 'string' ? null : (o.imageAssetId ?? o.image_asset_id ?? null),
  }))

  const { data, error } = await getClient().from(DB_TABLES.POLL_OPTIONS).insert(rows).select('*')
  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

// ——— Voter: take poll ———

export async function assertVoterCanRespond(eventId, voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id, event_id, voter_id, has_voted')
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(403, 'You are not enrolled in this poll')

  return data
}

export async function getPollForVoter(eventId, voterId) {
  await assertVoterCanRespond(eventId, voterId)
  const event = await getEventById(eventId)

  if (event.event_type !== EVENT_TYPES.POLLING) {
    throw new ApiError(400, 'Not a polling event')
  }

  const orgId = event.organizations?.id
  const registry = await loadQuestionTypeRegistry(orgId)
  const questions = await listQuestionsPublic(eventId, registry)
  const open = isPollOpen(event)

  const { count } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('voter_id', voterId)

  const canSubmitAgain =
    open && (event.poll_allow_multiple_submissions || (count ?? 0) === 0)

  return {
    event: mapPollEvent(event),
    questions,
    questionTypes: registry, // Phase 7 — voter UI uses this to render the right input
    pollOpen: open,
    canSubmit: canSubmitAgain,
    submissionCount: count ?? 0,
  }
}

async function listQuestionsPublic(eventId, registry = null) {
  registry = registry ?? (await loadQuestionTypeRegistry())
  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('id, event_id, question, type, sort_order, required, type_config, image_url, image_asset_id')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) throw new ApiError(500, error.message)

  const ids = (data ?? []).map((q) => q.id)
  const optMap = await loadOptionsForQuestions(ids)
  return (data ?? []).map((q) => {
    const typeDef = registry.find((r) => r.key === q.type) ?? null
    return mapQuestion(q, optMap[q.id] ?? [], typeDef)
  })
}

export async function submitPollResponse(eventId, voterId, answers, startedAt) {
  await assertVoterCanRespond(eventId, voterId)
  const event = await getEventById(eventId)

  if (!isPollOpen(event)) {
    throw new ApiError(403, 'This poll is closed or expired')
  }

  const orgId = event.organizations?.id
  const registry = await loadQuestionTypeRegistry(orgId)
  const questions = await listQuestionsPublic(eventId, registry)

  // Run the registry-driven validator on every answer.
  for (const q of questions) {
    const typeDef = registry.find((r) => r.key === q.type) ?? null
    if (!typeDef) {
      throw new ApiError(500, `Question ${q.id} uses unknown type: ${q.type}`)
    }
    try {
      validateAnswerV2(typeDef, q.typeConfig ?? {}, q.options, answers[q.id], {
        required: q.required,
      })
    } catch (err) {
      throw new ApiError(400, `${q.question}: ${err.message}`)
    }
  }

  if (!event.poll_allow_multiple_submissions) {
    const { data: locked, error: lockErr } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .update({ has_voted: true })
      .eq('event_id', eventId)
      .eq('voter_id', voterId)
      .eq('has_voted', false)
      .select('id')

    if (lockErr) throw new ApiError(500, lockErr.message)
    if (!locked?.length) {
      throw new ApiError(409, 'You have already submitted this poll')
    }
  }

  const submissionInsert = {
    event_id: eventId,
    voter_id: voterId,
    completed_at: new Date().toISOString(),
  }
  if (startedAt) {
    submissionInsert.started_at = startedAt
  }

  const { data: submission, error: subErr } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .insert(submissionInsert)
    .select('*')
    .single()

  if (subErr) {
    if (!event.poll_allow_multiple_submissions) {
      await getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .update({ has_voted: false })
        .eq('event_id', eventId)
        .eq('voter_id', voterId)
    }
    throw new ApiError(500, subErr.message)
  }

  const rows = []

  for (const q of questions) {
    const typeDef = registry.find((r) => r.key === q.type)
    const raw = answers[q.id]
    if (raw === undefined || raw === null || raw === '') continue

    const validated = validateAnswerV2(typeDef, q.typeConfig ?? {}, q.options, raw, {
      required: false, // already checked above
    })
    if (validated === null) continue

    rows.push({
      question_id: q.id,
      voter_id: voterId,
      submission_id: submission.id,
      answer: serializeAnswerV2(validated),
    })
  }

  try {
    if (rows.length) {
      const { error: ansErr } = await getClient().from(DB_TABLES.POLL_ANSWERS).insert(rows)
      if (ansErr) throw new ApiError(500, ansErr.message)
    }
  } catch (err) {
    if (!event.poll_allow_multiple_submissions) {
      await getClient()
        .from(DB_TABLES.EVENT_VOTERS)
        .update({ has_voted: false })
        .eq('event_id', eventId)
        .eq('voter_id', voterId)
    }
    throw err
  }

  if (event.poll_allow_multiple_submissions) {
    await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .update({ has_voted: true })
      .eq('event_id', eventId)
      .eq('voter_id', voterId)
  }

  // A voter who has cast a vote has clearly received/accessed their
  // invitation, so keep the invitation status consistent: a voted voter
  // should never appear as "Pending" in the organizer list.
  try {
    await getClient()
      .from(DB_TABLES.INVITATIONS)
      .upsert(
        { event_id: eventId, voter_id: voterId, invitation_sent: true },
        { onConflict: 'event_id,voter_id' },
      )
  } catch (dbErr) {
    console.error('[vote] failed to mark invitation_sent=true:', dbErr.message)
  }

  // Fetch updated stats for real-time dashboard update
  const { count: respondedCount } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('has_voted', true)

  const { count: totalVoters } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const { count: responsesSubmitted } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const participationRate = totalVoters > 0 ? ((respondedCount / totalVoters) * 100).toFixed(1) : '0.0'

  emitToEventOrganizer(eventId, 'poll:response-submitted', {
    eventId,
    responsesSubmitted: responsesSubmitted ?? 0,
    respondedCount: respondedCount ?? 0,
    totalVoters: totalVoters ?? 0,
    participationRate: parseFloat(participationRate),
  })

  // Trigger organizer dashboard stats refresh
  const organizerId = event.organizations?.organizer_id
  if (organizerId) {
    const { emitToUser } = await import('../websocket/ws-emitter.js')
    emitToUser(organizerId, 'organizer:stats-updated', { eventId })
  }

  // Trigger admin platform stats refresh
  const { emitToRole } = await import('../websocket/ws-emitter.js')
  emitToRole('admin', 'platform:stats-updated', {})

  return { success: true, submissionId: submission.id, message: 'Response submitted' }
}

function validateAnswers(questions, answers) {
  // Legacy path retained for backward compatibility — new code paths go
  // through submitPollResponse which validates per question.
  for (const q of questions) {
    const val = answers[q.id]
    if (q.required && (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length))) {
      throw new ApiError(400, `Answer required: ${q.question}`)
    }
  }
}

export async function listVoterPollEvents(voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      `
      has_responded,
      events (
        id,
        title,
        description,
        banner,
        status,
        event_type,
        polling_enabled,
        poll_anonymous,
        poll_allow_multiple_submissions,
        poll_expires_at,
        start_date,
        end_date,
        organization_id,
        organizations (
          id,
          organization_name
        )
      )
    `,
    )
    .eq('user_id', voterId)
    .eq('participant_type', PARTICIPANT_TYPES.POLLING_RESPONDENT)

  if (error) throw new ApiError(500, error.message)

  return (data ?? [])
    .filter((r) => r.events?.event_type === EVENT_TYPES.POLLING)
    .map((r) => ({
      ...mapPollEvent(r.events),
      hasResponded: r.has_responded,
    }))
}

// ——— Analytics ———

export async function getPollAnalytics(eventId, organizerId) {
  await assertPollingEvent(eventId, organizerId)
  const event = await getEventById(eventId)
  const anonymous = Boolean(event.poll_anonymous)

  const orgId = await getPollingOrgId(organizerId)
  const registry = await loadQuestionTypeRegistry(orgId)
  const questions = await listQuestions(eventId, organizerId)

const { count: totalSubmissions } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  // Compute average completion time (in seconds) for submissions that have started_at
  const { data: completionTimes, error: ctErr } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('started_at, completed_at')
    .eq('event_id', eventId)
    .not('started_at', 'is', null)
    .not('completed_at', 'is', null)

  if (ctErr) throw new ApiError(500, ctErr.message)

  let averageCompletionTimeSeconds = null
  if (completionTimes?.length > 0) {
    const totalSeconds = completionTimes.reduce((sum, s) => {
      const diff = new Date(s.completed_at) - new Date(s.started_at)
      return sum + Math.max(0, diff) / 1000
    }, 0)
    averageCompletionTimeSeconds = Math.round(totalSeconds / completionTimes.length)
  }

  const { data: allAnswers, error } = await getClient()
    .from(DB_TABLES.POLL_ANSWERS)
    .select('id, question_id, voter_id, answer, submission_id, created_at')
    .in(
      'question_id',
      questions.map((q) => q.id),
    )

  if (error) throw new ApiError(500, error.message)

  const questionAnalytics = questions.map((q) => {
    const qAnswers = (allAnswers ?? []).filter((a) => a.question_id === q.id)
    const typeDef = registry.find((r) => r.key === q.type) ?? null
    const stats = buildAnalytics({
      question: q,
      answers: qAnswers,
      options: q.options,
      typeDef,
      typeConfig: q.typeConfig ?? {},
      anonymous,
    })
    return {
      questionId: q.id,
      question: q.question,
      type: q.type,
      typeLabel: typeDef?.label ?? q.type,
      responseCount: qAnswers.length,
      ...stats,
    }
  })

  return {
    totalSubmissions: totalSubmissions ?? 0,
    pollAnonymous: anonymous,
    averageCompletionTimeSeconds,
    questions: questionAnalytics,
  }
}

// ——— Question-type wrappers (called by polling-organizer.controller.js) ———
// The controller passes req.user.id but the registry functions need an orgId.

export async function listQuestionTypes(userId) {
  const org = await getOrCreatePollingOrganization(userId)
  return loadQuestionTypeRegistry(org.id)
}

export async function listCustomQuestionTypes(userId) {
  const org = await getOrCreatePollingOrganization(userId)
  return listCustomTypes(org.id)
}

export async function createCustomQuestionType(userId, payload) {
  const org = await getOrCreatePollingOrganization(userId)
  return createCustomType(org.id, payload)
}

export async function updateCustomQuestionType(typeId, userId, payload) {
  const org = await getOrCreatePollingOrganization(userId)
  return updateCustomType(org.id, typeId, payload)
}

export async function deleteCustomQuestionType(typeId, userId) {
  const org = await getOrCreatePollingOrganization(userId)
  return deleteCustomType(org.id, typeId)
}
