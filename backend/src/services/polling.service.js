import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_TYPES, POLL_QUESTION_TYPES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrCreatePollingOrganization, mapOrganization } from './organization.service.js'

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

function mapQuestion(row, options = []) {
  return {
    id: row.id,
    eventId: row.event_id,
    question: row.question,
    type: row.type,
    sortOrder: row.sort_order,
    required: row.required,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      sortOrder: o.sort_order,
    })),
  }
}

async function assertPollingEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.POLLING) {
    throw new ApiError(400, 'This event is not a poll')
  }
  return event
}

function isPollOpen(event) {
  if (!event.polling_enabled) return false
  if (event.poll_expires_at && new Date(event.poll_expires_at) < new Date()) return false
  return true
}

// ——— Organizer: events ———

export async function getOrganizerDashboard(organizerId) {
  const org = await getOrCreatePollingOrganization(organizerId)
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

  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) throw new ApiError(500, error.message)

  const ids = (data ?? []).map((q) => q.id)
  const optMap = await loadOptionsForQuestions(ids)

  return (data ?? []).map((q) => mapQuestion(q, optMap[q.id] ?? []))
}

export async function createQuestion(eventId, organizerId, payload) {
  await assertPollingEvent(eventId, organizerId)

  const type = normalizeQuestionType(payload.type)

  const { data: question, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .insert({
      event_id: eventId,
      question: payload.question,
      type,
      sort_order: payload.sortOrder ?? 0,
      required: payload.required !== false,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  const options = await upsertQuestionOptions(question.id, type, payload.options)

  return mapQuestion(question, options)
}

export async function updateQuestion(eventId, organizerId, questionId, payload) {
  await assertPollingEvent(eventId, organizerId)

  const updates = {}
  if (payload.question !== undefined) updates.question = payload.question
  if (payload.type !== undefined) updates.type = normalizeQuestionType(payload.type)
  if (payload.sortOrder !== undefined) updates.sort_order = payload.sortOrder
  if (payload.required !== undefined) updates.required = payload.required

  const { data: question, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .update(updates)
    .eq('id', questionId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!question) throw new ApiError(404, 'Question not found')

  let options = []
  if (payload.options) {
    await getClient().from(DB_TABLES.POLL_OPTIONS).delete().eq('question_id', questionId)
    options = await upsertQuestionOptions(question.id, question.type, payload.options)
  } else {
    const optMap = await loadOptionsForQuestions([questionId])
    options = optMap[questionId] ?? []
  }

  return mapQuestion(question, options)
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

function normalizeQuestionType(type) {
  const map = {
    multiple_choice: POLL_QUESTION_TYPES.SINGLE_CHOICE,
    single_choice: POLL_QUESTION_TYPES.SINGLE_CHOICE,
    checkbox: POLL_QUESTION_TYPES.CHECKBOX,
    yes_no: POLL_QUESTION_TYPES.YES_NO,
    text: POLL_QUESTION_TYPES.TEXT,
    rating: POLL_QUESTION_TYPES.RATING,
  }
  const normalized = map[type]
  if (!normalized) throw new ApiError(400, 'Invalid question type')
  return normalized
}

async function upsertQuestionOptions(questionId, type, optionsInput) {
  let options = optionsInput ?? []

  if (type === POLL_QUESTION_TYPES.YES_NO && !options.length) {
    options = [{ label: 'Yes' }, { label: 'No' }]
  }

  if ([POLL_QUESTION_TYPES.SINGLE_CHOICE, POLL_QUESTION_TYPES.CHECKBOX, POLL_QUESTION_TYPES.YES_NO].includes(type)) {
    if (!options.length) throw new ApiError(400, 'Options are required for this question type')
  }

  if (!options.length) return []

  const rows = options.map((o, i) => ({
    question_id: questionId,
    label: o.label,
    sort_order: o.sortOrder ?? i,
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

  const questions = await listQuestionsPublic(eventId)
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
    pollOpen: open,
    canSubmit: canSubmitAgain,
    submissionCount: count ?? 0,
  }
}

async function listQuestionsPublic(eventId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) throw new ApiError(500, error.message)

  const ids = (data ?? []).map((q) => q.id)
  const optMap = await loadOptionsForQuestions(ids)
  return (data ?? []).map((q) => mapQuestion(q, optMap[q.id] ?? []))
}

export async function submitPollResponse(eventId, voterId, answers) {
  await assertVoterCanRespond(eventId, voterId)
  const event = await getEventById(eventId)

  if (!isPollOpen(event)) {
    throw new ApiError(403, 'This poll is closed or expired')
  }

  const questions = await listQuestionsPublic(eventId)
  validateAnswers(questions, answers)

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
    const raw = answers[q.id]
    if (raw === undefined || raw === null || raw === '') {
      if (q.required) throw new ApiError(400, `Answer required for: ${q.question}`)
      continue
    }

    const stored = serializeAnswer(q, raw)
    rows.push({
      question_id: q.id,
      voter_id: voterId,
      submission_id: submission.id,
      answer: stored,
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

function serializeAnswer(question, raw) {
  if (question.type === POLL_QUESTION_TYPES.CHECKBOX) {
    const arr = Array.isArray(raw) ? raw : [raw]
    return JSON.stringify(arr)
  }
  return String(raw)
}

function validateAnswers(questions, answers) {
  for (const q of questions) {
    const val = answers[q.id]
    if (q.required && (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length))) {
      throw new ApiError(400, `Answer required: ${q.question}`)
    }

    if (val === undefined || val === null || val === '') continue

    if (q.type === POLL_QUESTION_TYPES.RATING) {
      const num = Number(val)
      if (Number.isNaN(num) || num < 1 || num > 5) {
        throw new ApiError(400, `Rating must be 1–5 for: ${q.question}`)
      }
    }

    if ([POLL_QUESTION_TYPES.SINGLE_CHOICE, POLL_QUESTION_TYPES.YES_NO].includes(q.type)) {
      const validIds = new Set(q.options.map((o) => o.id))
      if (!validIds.has(val)) throw new ApiError(400, 'Invalid option selected')
    }

    if (q.type === POLL_QUESTION_TYPES.CHECKBOX) {
      const arr = Array.isArray(val) ? val : [val]
      const validIds = new Set(q.options.map((o) => o.id))
      for (const id of arr) {
        if (!validIds.has(id)) throw new ApiError(400, 'Invalid checkbox option')
      }
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
    const responseCount = qAnswers.length

    return {
      questionId: q.id,
      question: q.question,
      type: q.type,
      responseCount,
      ...buildQuestionStats(q, qAnswers, anonymous),
    }
  })

  return {
    totalSubmissions: totalSubmissions ?? 0,
    pollAnonymous: anonymous,
    questions: questionAnalytics,
  }
}

function buildQuestionStats(question, answers, anonymous) {
  if (question.type === POLL_QUESTION_TYPES.TEXT) {
    const samples = answers.map((a) => ({
      text: a.answer,
      respondent: anonymous ? null : a.voter_id,
    }))
    return { type: 'text', responses: samples }
  }

  if (question.type === POLL_QUESTION_TYPES.RATING) {
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const a of answers) {
      const n = Math.round(Number(a.answer))
      if (dist[n] !== undefined) dist[n]++
    }
    return {
      type: 'rating',
      distribution: Object.entries(dist).map(([rating, count]) => ({
        rating: Number(rating),
        count,
        percentage: answers.length ? Math.round((count / answers.length) * 10000) / 100 : 0,
      })),
      average:
        answers.length > 0
          ? Math.round(
              (answers.reduce((s, a) => s + Number(a.answer), 0) / answers.length) * 100,
            ) / 100
          : 0,
    }
  }

  const optionCounts = {}
  for (const o of question.options) {
    optionCounts[o.id] = { optionId: o.id, label: o.label, count: 0 }
  }

  for (const a of answers) {
    if (question.type === POLL_QUESTION_TYPES.CHECKBOX) {
      let selected = []
      try {
        selected = JSON.parse(a.answer)
      } catch {
        selected = [a.answer]
      }
      for (const id of selected) {
        if (optionCounts[id]) optionCounts[id].count++
      }
    } else {
      if (optionCounts[a.answer]) optionCounts[a.answer].count++
    }
  }

  const total = answers.length
  const options = Object.values(optionCounts).map((o) => ({
    ...o,
    percentage: total ? Math.round((o.count / total) * 10000) / 100 : 0,
  }))

  return { type: 'choice', options, totalResponses: total }
}
