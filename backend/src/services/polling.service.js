import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrCreatePollingOrganization, mapOrganization } from './organization.service.js'
import {
  loadQuestionTypeRegistry,
  findQuestionType,
  requireQuestionType,
} from './polling-registry.service.js'
import {
  buildAutoOptions,
  validateAnswer as validateAnswerV2,
  serializeAnswer as serializeAnswerV2,
  validateTypeConfig,
  buildAnalytics,
} from '../modules/poll-question-types.js'

// Phase 7 — Polling question types are now registry-driven. The legacy
// POLL_QUESTION_TYPES constants and the `multiple_choice` alias are kept in
// utils/constants.js for backward compatibility with existing code, but the
// question creation / validation / analytics paths now go through
// poll-question-types.js so a new type is a single SQL INSERT away.

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

function mapPollEvent(row) {
  return {
    id: row.id,
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
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      sortOrder: o.sort_order,
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
  if (!event.polling_enabled) return false
  if (event.poll_expires_at && new Date(event.poll_expires_at) < new Date()) return false
  return true
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

export async function listPollEvents(organizerId) {
  const org = await getOrCreatePollingOrganization(organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('*')
    .eq('organization_id', org.id)
    .eq('event_type', EVENT_TYPES.POLLING)
    .order('created_at', { ascending: false })

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
      event_type: EVENT_TYPES.POLLING,
      status: 'draft',
      polling_enabled: false,
      poll_anonymous: Boolean(payload.pollAnonymous),
      poll_allow_multiple_submissions: Boolean(payload.pollAllowMultipleSubmissions),
      poll_expires_at: payload.pollExpiresAt ?? null,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapPollEvent(data)
}

export async function updatePollEvent(eventId, organizerId, payload) {
  await assertPollingEvent(eventId, organizerId)

  const updates = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.pollAnonymous !== undefined) updates.poll_anonymous = payload.pollAnonymous
  if (payload.pollAllowMultipleSubmissions !== undefined) {
    updates.poll_allow_multiple_submissions = payload.pollAllowMultipleSubmissions
  }
  if (payload.pollExpiresAt !== undefined) updates.poll_expires_at = payload.pollExpiresAt
  if (payload.banner !== undefined) updates.banner = payload.banner

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update(updates)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
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
    .select('*')
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
    .select('*')
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

  // Re-resolve the typeDef in case the type didn't change.
  const finalTypeDef = typeDef ?? registry.find((r) => r.key === question.type) ?? null
  const finalTypeConfig = question.type_config ?? {}

  let options = []
  if (payload.options) {
    await getClient().from(DB_TABLES.POLL_OPTIONS).delete().eq('question_id', questionId)
    options = await upsertQuestionOptions(question.id, finalTypeDef, finalTypeConfig, payload.options)
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

  const { error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .delete()
    .eq('id', questionId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)
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
  }))

  const { data, error } = await getClient().from(DB_TABLES.POLL_OPTIONS).insert(rows).select('*')
  if (error) throw new ApiError(500, error.message)
  return data ?? []
}

// ——— Voter: take poll ———

export async function assertVoterCanRespond(eventId, voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*')
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
    .select('*')
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

export async function submitPollResponse(eventId, voterId, answers) {
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

  const { data: submission, error: subErr } = await getClient()
    .from(DB_TABLES.POLL_SUBMISSIONS)
    .insert({ event_id: eventId, voter_id: voterId })
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
    .from(DB_TABLES.EVENT_VOTERS)
    .select(
      `
      has_voted,
      events (*)
    `,
    )
    .eq('voter_id', voterId)

  if (error) throw new ApiError(500, error.message)

  return (data ?? [])
    .filter((r) => r.events?.event_type === EVENT_TYPES.POLLING)
    .map((r) => ({
      ...mapPollEvent(r.events),
      hasResponded: r.has_voted,
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
    questions: questionAnalytics,
  }
}
