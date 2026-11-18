import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_STATUS, EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrganizerScope, isStudentInScope, isAllAccess } from './organizer-scope.service.js'
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
import { isPollOpen as isPollOpenForEvent, canVoterViewPollResults } from '../utils/eventSchedule.js'
import { emitToEvent, emitToEventOrganizer, emitToUser, emitToRole } from '../websocket/ws-emitter.js'
import { notifyAdminsEventPublished } from './notification.service.js'
import { POLLING_PARTICIPANT_TYPES } from '../utils/constants.js'
import { syncEventSchedules } from './event-schedule-sync.service.js'
import {
  assertPublishedEventUpdate,
  assertChangeReason,
  assertSetupEditable,
  assertEndDateNotPassed,
  buildEditPolicy,
  canUnpublishEventStatus,
  normalizeChangeReason,
  summarizeChanges,
} from '../utils/eventLifecycle.js'
import { deleteDraft } from './draft.service.js'
import { removeReferenceAndDeleteIfUnused } from './imageAsset.service.js'
import { recordEventActivity } from '../foundation/activity.js'
import { recordAudit } from '../foundation/audit.js'

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
    // Student-facing results visibility. Anything missing is hidden by default.
    resultsVisibility: row.results_visibility ?? 'hidden',
    startDate: row.start_date,
    endDate: row.end_date,
    organization: org
      ? {
          id: org.id,
          name: org.organization_name,
          // Logo lives on users.organization_logo (migration 028); populated
          // when the query embeds organizations → users ( organization_logo ).
          logo: org.users?.organization_logo ?? null,
        }
      : null,
  }
}

function assertPollExpirationWithinSchedule(pollExpiresAt, startDate, endDate) {
  if (!pollExpiresAt) return

  const expiration = new Date(pollExpiresAt)
  if (Number.isNaN(expiration.getTime())) {
    throw new ApiError(400, 'Invalid poll expiration date')
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || expiration < start || expiration > end) {
    throw new ApiError(400, 'Poll expiration must be between the start and end dates')
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

// Single source of truth for the participation-rate percentage so the dashboard
// and the live websocket payload always agree (2-dp number, e.g. 66.67).
function computeParticipationRate(responded, total) {
  if (!total || total <= 0) return 0
  return Math.round((responded / total) * 10000) / 100
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
      users!inner (id, email, first_name, last_name, school_id, program)
    `, { count: 'exact' })
    .eq('event_id', eventId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)
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

  let voters = (data ?? []).map((row) => ({
    id: row.id,
    voterId: row.users?.id,
    email: row.users?.email,
    firstName: row.users?.first_name ?? row.first_name,
    lastName: row.users?.last_name ?? row.last_name,
    schoolId: row.users?.school_id ?? null,
    program: row.users?.program ?? null,
    hasResponded: row.has_responded,
    createdAt: row.created_at,
    metadata: row.metadata ?? {},
    invitationSent: invitationMap.get(row.user_id) ?? false,
  }))

  // Bound the roster to the organizer's scope (plan O9). No-op for all-access.
  const scope = await getOrganizerScope(organizerId)
  const scoped = !isAllAccess(scope)
  if (scoped) {
    voters = voters.filter((v) => isStudentInScope(scope, { program: v.program }))
  }

  return {
    voters,
    meta: {
      page,
      limit,
      total: scoped ? voters.length : (count ?? 0),
      totalPages: Math.ceil((scoped ? voters.length : (count ?? 0)) / limit),
    },
  }
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
    .neq('status', EVENT_STATUS.ARCHIVED)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  const eventIds = (data ?? []).map((e) => e.id)
  let assignedUsers = 0
  let respondedUsers = 0
  let responsesSubmitted = 0
  // Per-poll participation so each poll's rate stands on its own rather than
  // being blended into one number across every poll.
  const perEvent = new Map(eventIds.map((id) => [id, { assigned: 0, responded: 0 }]))

  if (eventIds.length) {
    const [respondentRowsRes, answersRes] = await Promise.all([
      getClient()
        .from(DB_TABLES.EVENT_PARTICIPANTS)
        .select('event_id, has_responded, users(program)')
        .in('event_id', eventIds)
        .in('participant_type', POLLING_PARTICIPANT_TYPES),
      getClient()
        .from(DB_TABLES.POLL_ANSWERS)
        .select('id, poll_questions!inner(event_id)', { count: 'exact', head: true })
        .in('poll_questions.event_id', eventIds),
    ])

    if (respondentRowsRes.error) throw new ApiError(500, respondentRowsRes.error.message)
    if (answersRes.error) throw new ApiError(500, answersRes.error.message)

    // Respondent counts follow the organizer's program scope (as the roster does).
    const scope = await getOrganizerScope(organizerId)
    for (const row of respondentRowsRes.data ?? []) {
      if (!isAllAccess(scope) && !isStudentInScope(scope, { program: row.users?.program })) continue
      const bucket = perEvent.get(row.event_id)
      if (!bucket) continue
      bucket.assigned += 1
      assignedUsers += 1
      if (row.has_responded) {
        bucket.responded += 1
        respondedUsers += 1
      }
    }
    responsesSubmitted = answersRes.count ?? 0
  }

  const participationRate = computeParticipationRate(respondedUsers, assignedUsers)

  const eventBreakdown = (data ?? []).map((e) => {
    const b = perEvent.get(e.id) ?? { assigned: 0, responded: 0 }
    return {
      id: e.id,
      title: e.title,
      status: e.status,
      registered: b.assigned,
      participated: b.responded,
      rate: computeParticipationRate(b.responded, b.assigned),
    }
  })

  return {
    organization: mapOrganization(org),
    events: (data ?? []).map(mapPollEvent),
    eventBreakdown,
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
    .select('id, title, description, banner, status, event_type, polling_enabled, poll_anonymous, poll_allow_multiple_submissions, poll_expires_at, results_visibility, start_date, end_date')
    .eq('organization_id', org.id)
    .eq('event_type', EVENT_TYPES.POLLING)
    .neq('status', EVENT_STATUS.ARCHIVED)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapPollEvent)
}

export async function createPollEvent(organizerId, payload) {
  assertPollExpirationWithinSchedule(payload.pollExpiresAt, payload.startDate, payload.endDate)
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
      poll_expires_at: payload.pollExpiresAt ?? null,
      results_visibility: payload.resultsVisibility ?? 'hidden',
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
  recordEventActivity({
    eventId: data.id,
    action: 'polling.event.create',
    userId: organizerId,
    module: 'polling',
    details: { title: data.title },
  })
  return mapPollEvent(data)
}

export async function updatePollEvent(eventId, organizerId, payload) {
  const event = await assertPollingEvent(eventId, organizerId)
  // Draft: free edit. Published: safe fields + schedule changes with a reason.
  const changes = assertPublishedEventUpdate(event, payload)
  assertPollExpirationWithinSchedule(
    payload.pollExpiresAt !== undefined ? payload.pollExpiresAt : event.poll_expires_at,
    payload.startDate ?? event.start_date,
    payload.endDate ?? event.end_date,
  )

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
  if (payload.pollExpiresAt !== undefined) updates.poll_expires_at = payload.pollExpiresAt
  if (payload.resultsVisibility !== undefined) updates.results_visibility = payload.resultsVisibility
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
  recordEventActivity({
    eventId,
    action: 'polling.event.update',
    userId: organizerId,
    module: 'polling',
    details: {
      changedKeys: Object.keys(updates),
      changes: summarizeChanges(changes),
      ...(event.status !== EVENT_STATUS.DRAFT
        ? { statusAtEdit: event.status, reason: normalizeChangeReason(payload.changeReason) }
        : {}),
    },
  })
  return mapPollEvent(data)
}

export async function getPollSettings(eventId, organizerId) {
  const event = await assertPollingEvent(eventId, organizerId)
  return mapPollEvent(event)
}

// ——— Publish (finish setup → release to schedule) ———

/**
 * Publish a fully-built poll that is still in the `draft` (setup) state.
 *
 * Publishing does NOT open the poll. It only releases the event from the setup
 * flow into the normal schedule-driven lifecycle by flipping `draft` →
 * `scheduled`; the schedule sync then reconciles it to `scheduled` / `active` /
 * `completed` based purely on the event's start/end dates. Poll open/close
 * timing always comes from the dates, never from this action.
 *
 * Guarded so a poll can only be published once, and only when it has the
 * minimum content needed to run: at least one question and an end date that has
 * not already passed. Respondents are invited after publishing.
 */
export async function publishPollEvent(eventId, organizerId) {
  const event = await assertPollingEvent(eventId, organizerId)

  if (event.status !== 'draft') {
    throw new ApiError(400, 'This poll has already been published')
  }

  const questions = await listQuestions(eventId, organizerId)
  if (questions.length === 0) {
    throw new ApiError(400, 'Add at least one question before publishing.')
  }
  assertEndDateNotPassed(event, 'poll')

  // Respondents are no longer required at publish time — they are registered and
  // invited after publishing, on the Respondents step, within email resend limits.

  // Only flip a poll that is still a draft, so a double click or a second tab
  // cannot publish twice (and notify admins twice).
  const { data: changed, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ status: 'scheduled' })
    .eq('id', eventId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!changed) throw new ApiError(409, 'This poll has already been published')

  // Hand the event to the scheduler; it decides scheduled/active/completed
  // purely from the dates. The status may change again immediately here.
  await syncEventSchedules().catch((err) => {
    console.error('[polling] schedule sync failed after publish:', err.message)
  })

  recordEventActivity({
    eventId,
    action: 'polling.event.publish',
    userId: organizerId,
    module: 'polling',
    details: { title: event.title },
  })

  // Let admins know a new event went live. Non-fatal — never block publishing.
  await notifyAdminsEventPublished({
    eventId,
    title: event.title,
    eventType: EVENT_TYPES.POLLING,
  }).catch((err) => console.error('[polling] admin publish notification failed (non-fatal):', err.message))

  // Re-read so the returned status reflects any reconciliation the sync applied.
  const published = await getEventById(eventId)
  return mapPollEvent(published)
}

async function assertNoPollSubmissions(eventId, action = 'modify questions') {
  const { count } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
  if (count > 0) {
    throw new ApiError(409, `Cannot ${action} because submissions have already been received for this poll.`)
  }
}

async function countPollSubmissions(eventId) {
  const { count, error } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
  if (error) throw new ApiError(500, error.message)
  return count ?? 0
}

/** What the organizer may currently do to this poll (drives the UI). */
export async function getPollEditPolicy(eventId, organizerId) {
  const event = await assertPollingEvent(eventId, organizerId)
  const hasActivity =
    event.status === EVENT_STATUS.ACTIVE ? (await countPollSubmissions(eventId)) > 0 : false
  return buildEditPolicy(event, { hasActivity })
}

/**
 * Pull a published poll back to `draft` so its setup can be corrected.
 *
 * Allowed while the poll is `scheduled`, or while it is `active` ("pause and
 * revise") provided no response has been received yet and a reason is given.
 */
export async function unpublishPollEvent(eventId, organizerId, { reason } = {}) {
  const event = await assertPollingEvent(eventId, organizerId)

  const wasActive = event.status === EVENT_STATUS.ACTIVE
  if (!canUnpublishEventStatus(event.status) && !wasActive) {
    throw new ApiError(400, 'Only a scheduled or live poll can be unpublished. This poll is closed.')
  }

  if (wasActive) assertChangeReason(reason, 'pause a live poll')

  await assertNoPollSubmissions(eventId, wasActive ? 'pause this poll' : 'unpublish this poll')

  const { error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ status: 'draft', polling_enabled: false })
    .eq('id', eventId)

  if (error) throw new ApiError(500, error.message)

  // A response could have arrived between the check above and closing the poll.
  // Responses are rejected once the poll is a draft, so re-count and restore it
  // if anything slipped in.
  if (wasActive && (await countPollSubmissions(eventId)) > 0) {
    await getClient()
      .from(DB_TABLES.EVENTS)
      .update({ status: EVENT_STATUS.ACTIVE, polling_enabled: true })
      .eq('id', eventId)
    throw new ApiError(
      409,
      'A response was received while pausing, so the poll was left open and can no longer be paused.',
    )
  }

  recordEventActivity({
    eventId,
    action: 'polling.event.unpublish',
    userId: organizerId,
    module: 'polling',
    details: {
      title: event.title,
      fromStatus: event.status,
      ...(wasActive ? { reason: normalizeChangeReason(reason) } : {}),
    },
  })

  const reverted = await getEventById(eventId)
  return mapPollEvent(reverted)
}

// ——— Questions & options ———

// The question payload carries the image asset as imageAssetId (validator) or
// image_asset_id (internal callers). undefined means "not part of this update".
function questionImageAssetId(payload) {
  return payload.imageAssetId !== undefined ? payload.imageAssetId : payload.image_asset_id
}

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
  assertSetupEditable(await assertPollingEvent(eventId, organizerId))

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
      // The validator returns camelCase (imageAssetId). Reading only image_asset_id
      // left every question's asset unreferenced, so it was never counted as in use.
      image_asset_id: questionImageAssetId(payload) ?? null,
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

  recordEventActivity({
    eventId,
    action: 'polling.question.create',
    userId: organizerId,
    module: 'polling',
    details: { questionId: question.id, type: question.type },
  })

  return mapQuestion(question, options, typeDef)
}

export async function updateQuestion(eventId, organizerId, questionId, payload) {
  assertSetupEditable(await assertPollingEvent(eventId, organizerId))
  await assertNoPollSubmissions(eventId, 'modify questions')

  const orgId = await getPollingOrgId(organizerId)
  const registry = await loadQuestionTypeRegistry(orgId)

  // Capture old image_asset_id before updating so we can clean it up if replaced
  const newAssetId = questionImageAssetId(payload)
  let oldAssetId = null
  if (newAssetId !== undefined) {
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
  if (newAssetId !== undefined) updates.image_asset_id = newAssetId
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
  if (oldAssetId && oldAssetId !== newAssetId) {
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

  recordEventActivity({
    eventId,
    action: 'polling.question.update',
    userId: organizerId,
    module: 'polling',
    details: { questionId, changedKeys: Object.keys(updates) },
  })

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
  assertSetupEditable(await assertPollingEvent(eventId, organizerId))
  await assertNoPollSubmissions(eventId, 'delete questions')

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

  recordEventActivity({
    eventId,
    action: 'polling.question.delete',
    userId: organizerId,
    module: 'polling',
    details: { questionId },
  })
}

export async function duplicateQuestion(eventId, organizerId, questionId) {
  assertSetupEditable(await assertPollingEvent(eventId, organizerId))
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

  recordEventActivity({
    eventId,
    action: 'polling.question.duplicate',
    userId: organizerId,
    module: 'polling',
    details: { sourceQuestionId: questionId, questionId: newQuestion.id },
  })

  return mapQuestion(newQuestion, newOptions, typeDef)
}

export async function reorderQuestions(eventId, organizerId, orders) {
  assertSetupEditable(await assertPollingEvent(eventId, organizerId))
  await assertNoPollSubmissions(eventId, 'reorder questions')

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

  recordEventActivity({
    eventId,
    action: 'polling.question.reorder',
    userId: organizerId,
    module: 'polling',
    details: { count: updates.length },
  })

  return listQuestions(eventId, organizerId)
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
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    // events!inner makes `events.status` a valid filter; without the embed PostgREST
    // rejects it with "'events' is not an embedded resource".
    .select('id, event_id, user_id, has_responded, events!inner(status)')
    .eq('event_id', eventId)
    .eq('user_id', voterId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)
    .neq('events.status', EVENT_STATUS.ARCHIVED)
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
    canViewResults: canVoterViewPollResults(event),
  }
}

// ——— Voter: view poll results ———

const RESULT_PAGE_SIZE = 1000

/**
 * Aggregate poll results an enrolled student is allowed to see.
 *
 * Gated by the poll's results_visibility (hidden / real_time / public). Only
 * totals are returned: never respondent identities, the respondent list, or
 * free-text answers (which could identify someone even in a named poll).
 */
export async function getPollResultsForVoter(eventId, voterId) {
  await assertVoterCanRespond(eventId, voterId)
  const event = await getEventById(eventId)

  if (event.event_type !== EVENT_TYPES.POLLING) {
    throw new ApiError(400, 'Not a polling event')
  }
  if (event.status === 'draft') {
    throw new ApiError(403, 'Results are not available yet')
  }
  if (!canVoterViewPollResults(event)) {
    throw new ApiError(403, 'Results are not available yet')
  }

  const registry = await loadQuestionTypeRegistry(event.organizations?.id)
  const questions = await listQuestionsPublic(eventId, registry)

  const answersByQuestion = new Map(questions.map((q) => [q.id, []]))
  const questionIds = questions.map((q) => q.id)
  if (questionIds.length) {
    for (let from = 0; ; from += RESULT_PAGE_SIZE) {
      const { data, error } = await getClient()
        .from(DB_TABLES.POLL_ANSWERS)
        .select('question_id, answer')
        .in('question_id', questionIds)
        .order('id')
        .range(from, from + RESULT_PAGE_SIZE - 1)
      if (error) throw new ApiError(500, error.message)
      for (const row of data ?? []) answersByQuestion.get(row.question_id)?.push(row)
      if ((data ?? []).length < RESULT_PAGE_SIZE) break
    }
  }

  const { count: totalSubmissions, error: submissionError } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
  if (submissionError) throw new ApiError(500, submissionError.message)

  const { count: enrolled, error: enrolledError } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)
  if (enrolledError) throw new ApiError(500, enrolledError.message)

  let hiddenTextQuestions = 0
  const results = []
  for (const q of questions) {
    const typeDef = registry.find((r) => r.key === q.type) ?? null
    const answers = answersByQuestion.get(q.id) ?? []
    const stats = buildAnalytics({
      question: q,
      answers,
      options: q.options,
      typeDef,
      typeConfig: q.typeConfig ?? {},
      // Always treated as anonymous here so no respondent id is ever attached.
      anonymous: true,
    })
    if (stats.kind === 'text') {
      hiddenTextQuestions += 1
      continue
    }
    results.push({
      questionId: q.id,
      question: q.question,
      type: q.type,
      typeLabel: typeDef?.label ?? q.type,
      responseCount: answers.length,
      ...stats,
    })
  }

  const open = isPollOpen(event)
  return {
    event: {
      id: event.id,
      title: event.title,
      resultsVisibility: event.results_visibility ?? 'hidden',
      // "live" while the poll is still collecting responses.
      final: !open,
    },
    totalSubmissions: totalSubmissions ?? 0,
    enrolledRespondents: enrolled ?? 0,
    hiddenTextQuestions,
    questions: results,
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

  // An unpublished (draft/setup) poll can never accept responses, regardless of
  // its schedule. polling_enabled is already false for such polls; this is an
  // explicit guard so the intent is unmistakable.
  if (event.status === 'draft') {
    throw new ApiError(403, 'This poll has not been published yet')
  }

  if (!isPollOpen(event)) {
    throw new ApiError(403, 'This poll is closed or expired')
  }

  const orgId = event.organizations?.id
  const registry = await loadQuestionTypeRegistry(orgId)
  const questions = await listQuestionsPublic(eventId, registry)

  // Validate every answer once (registry-driven) and collect the serialized
  // rows to persist. Required-checking and value normalization happen in a
  // single pass — no second validation loop.
  const rows = []
  for (const q of questions) {
    const typeDef = registry.find((r) => r.key === q.type) ?? null
    if (!typeDef) {
      throw new ApiError(500, `Question ${q.id} uses unknown type: ${q.type}`)
    }
    let validated
    try {
      validated = validateAnswerV2(typeDef, q.typeConfig ?? {}, q.options, answers[q.id], {
        required: q.required,
      })
    } catch (err) {
      throw new ApiError(400, `${q.question}: ${err.message}`)
    }
    if (validated === null || validated === undefined) continue
    rows.push({ question_id: q.id, answer: serializeAnswerV2(validated) })
  }

  // Atomic write: the RPC claims the single-submission slot (or marks the
  // respondent responded for multi-submission polls), inserts the submission
  // row, and inserts every answer row inside ONE Postgres transaction. Either
  // the whole response commits or nothing does — no orphan submissions, no
  // "responded with zero answers" window, and no reopened single-submission
  // poll. See migration 060_poll_cast_response_rpc.sql. A NULL result means the
  // respondent had already responded (single-submission poll).
  const { data: submissionId, error: castErr } = await getClient().rpc('cast_poll_response', {
    p_event_id: eventId,
    p_voter_id: voterId,
    p_started_at: startedAt || null,
    p_allow_multiple: Boolean(event.poll_allow_multiple_submissions),
    p_answers: rows,
    p_is_anonymous: Boolean(event.poll_anonymous),
  })

  if (castErr) {
    if (castErr.code === '23505') {
      throw new ApiError(409, 'You have already submitted this poll')
    }
    throw new ApiError(500, castErr.message)
  }

  if (!submissionId) {
    throw new ApiError(409, 'You have already submitted this poll')
  }

  const submission = { id: submissionId }

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
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)
    .eq('has_responded', true)

  const { count: totalVoters } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)

  const { count: responsesSubmitted } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const participationRate = computeParticipationRate(respondedCount ?? 0, totalVoters ?? 0)

  emitToEventOrganizer(eventId, 'poll:response-submitted', {
    eventId,
    responsesSubmitted: responsesSubmitted ?? 0,
    respondedCount: respondedCount ?? 0,
    totalVoters: totalVoters ?? 0,
    participationRate,
  })

  // Trigger organizer dashboard stats refresh
  const organizerId = event.organizations?.organizer_id
  if (organizerId) {
    emitToUser(organizerId, 'organizer:stats-updated', { eventId })
  }

  // Trigger admin platform stats refresh
  emitToRole('admin', 'platform:stats-updated', {})

  // Audit the response submission (fire-and-forget; never throws). Record ONLY
  // that a response was submitted and how many answers it held — never the
  // answer content, to keep individual responses confidential.
  recordEventActivity({
    eventId,
    action: 'polling.response.submit',
    userId: voterId,
    module: 'polling',
    details: { answerCount: rows.length },
  })

  return { success: true, submissionId: submission.id, message: 'Response submitted' }
}

export async function listVoterPollEvents(voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      `
      has_responded,
      events!inner (
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
        results_visibility,
        start_date,
        end_date,
        organization_id,
        organizations (
          id,
          organization_name,
          users ( organization_logo )
        )
      )
    `,
    )
    .eq('user_id', voterId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)

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

  const { data: submissionRows, count: totalSubmissions, error: submissionErr } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .select('voter_id, completed_at', { count: 'exact' })
    .eq('event_id', eventId)

  if (submissionErr) throw new ApiError(500, submissionErr.message)

  const { data: allParticipantRows, error: participantErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id, has_responded, users!inner (id, email, first_name, last_name, school_id, program)')
    .eq('event_id', eventId)
    .in('participant_type', POLLING_PARTICIPANT_TYPES)

  if (participantErr) throw new ApiError(500, participantErr.message)

  // Respondent counts and breakdowns follow the organizer's program scope, the
  // same as the Respondents roster. Answer tallies stay poll-wide (an anonymous
  // poll cannot attribute answers to a program).
  const scope = organizerId ? await getOrganizerScope(organizerId) : null
  const participantRows = scope && !isAllAccess(scope)
    ? (allParticipantRows ?? []).filter((row) => isStudentInScope(scope, { program: row.users?.program }))
    : (allParticipantRows ?? [])
  // Enrolled respondents — the denominator for "Total respondents" and the
  // response-rate stat on the analytics dashboard.
  const enrolledRespondents = participantRows.length

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

  const participationBy = (field) => {
    const groups = new Map()
    for (const row of participantRows ?? []) {
      const label = row.users?.[field] || 'Unspecified'
      const current = groups.get(label) ?? { registered: 0, responded: 0 }
      current.registered += 1
      if (row.has_responded) current.responded += 1
      groups.set(label, current)
    }
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .map(([label, counts]) => ({
        label,
        registered: counts.registered,
        responded: counts.responded,
        notResponded: counts.registered - counts.responded,
        responseRate: computeParticipationRate(counts.responded, counts.registered),
      }))
  }

  const activityByDay = new Map()
  for (const submission of submissionRows ?? []) {
    if (!submission.completed_at) continue
    const day = new Date(submission.completed_at).toISOString().slice(0, 10)
    activityByDay.set(day, (activityByDay.get(day) ?? 0) + 1)
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

  const respondentParticipation = participantRows.map((row) => ({
    id: row.id,
    schoolId: row.users?.school_id ?? null,
    firstName: row.users?.first_name ?? '',
    lastName: row.users?.last_name ?? '',
    program: row.users?.program ?? 'Unspecified',
    hasResponded: Boolean(row.has_responded),
  }))

  respondentParticipation.sort((a, b) => {
    const progCmp = a.program.localeCompare(b.program, undefined, { numeric: true })
    if (progCmp !== 0) return progCmp
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, { numeric: true })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, { numeric: true })
  })

  return {
    totalSubmissions: totalSubmissions ?? 0,
    enrolledRespondents: enrolledRespondents ?? 0,
    respondedRespondents: (participantRows ?? []).filter((row) => row.has_responded).length,
    pollAnonymous: anonymous,
    participationByProgram: participationBy('program'),
    respondentParticipation,
    responseActivity: Array.from(activityByDay.entries()).map(([period, responses]) => ({ period, responses })),
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
  const created = await createCustomType(org.id, payload)
  recordAudit({
    userId,
    action: 'polling.question_type.create',
    entity: 'poll_question_types',
    entityId: created?.id ?? null,
    details: { key: created?.key ?? payload?.key ?? null, label: created?.label ?? payload?.label ?? null },
  })
  return created
}

export async function updateCustomQuestionType(typeId, userId, payload) {
  const org = await getOrCreatePollingOrganization(userId)
  const updated = await updateCustomType(org.id, typeId, payload)
  recordAudit({
    userId,
    action: 'polling.question_type.update',
    entity: 'poll_question_types',
    entityId: typeId,
    details: { label: updated?.label ?? payload?.label ?? null },
  })
  return updated
}

export async function deleteCustomQuestionType(typeId, userId) {
  const org = await getOrCreatePollingOrganization(userId)
  const result = await deleteCustomType(org.id, typeId)
  recordAudit({
    userId,
    action: 'polling.question_type.delete',
    entity: 'poll_question_types',
    entityId: typeId,
  })
  return result
}
