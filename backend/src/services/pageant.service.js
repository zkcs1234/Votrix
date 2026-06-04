import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES, USER_ROLES } from '../utils/constants.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import {
  getOrCreatePageantOrganization,
  getOrCreateCompetitionScoringOrganization,
  mapOrganization,
} from './organization.service.js'
import { hashPassword } from '../utils/password.js'
import { generateTemporaryPassword } from '../utils/crypto.js'
import { findUserByEmail, sanitizeUser } from './user.service.js'
import { sendJudgeInvitationEmail } from './mailer.service.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

function mapEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    banner: row.banner,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    eventType: row.event_type,
    scoringEnabled: Boolean(row.scoring_enabled),
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

export async function listCompetitionEvents(organizerId) {
  const org = await getOrCreateOrg(organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('*')
    .eq('organization_id', org.id)
    .in('event_type', Array.from(COMPETITION_SCORING_EVENT_TYPES))
    .order('created_at', { ascending: false })

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
    const criteria = await listCriteria(eventId, organizerId)
    const totalPct = criteria.reduce((s, c) => s + c.percentage, 0)
    if (criteria.length && Math.abs(totalPct - 100) > 0.01) {
      throw new ApiError(
        400,
        `Criteria percentages must total 100% (currently ${totalPct}%)`,
      )
    }
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
  return mapEvent(data)
}

// ——— Contestants ———

export async function listContestants(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('*')
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
    .select('*')
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

async function ensureJudgeAccount(email, plainPassword) {
  const normalizedEmail = email.toLowerCase().trim()
  const existing = await findUserByEmail(normalizedEmail)

  if (existing && existing.role !== USER_ROLES.VOTER) {
    throw new ApiError(409, 'This email is already used by another account type')
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

  return (data ?? []).map((row) => ({
    id: row.id,
    judgeId: row.users?.id,
    email: row.users?.email,
    firstName: row.first_name,
    lastName: row.last_name,
    hasScored: row.has_scored,
  }))
}

// ——— Judge scoring (voter/judge) ———

export async function assertJudgeEnrolled(eventId, judgeId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*')
    .eq('event_id', eventId)
    .eq('voter_id', judgeId)
    .eq('is_judge', true)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(403, 'You are not a judge for this event')
  return data
}

export async function getJudgeScoringSheet(eventId, judgeId) {
  const enrollment = await assertJudgeEnrolled(eventId, judgeId)
  const event = await getEventById(eventId)

  if (!COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    throw new ApiError(400, 'Not a competition scoring event')
  }

  const [contestants, criteria] = await Promise.all([
    getClient().from(DB_TABLES.CONTESTANTS).select('*').eq('event_id', eventId).order('contestant_number'),
    getClient().from(DB_TABLES.CRITERIA).select('*').eq('event_id', eventId),
  ])

  if (contestants.error) throw new ApiError(500, contestants.error.message)
  if (criteria.error) throw new ApiError(500, criteria.error.message)

  const { data: existingScores } = await getClient()
    .from(DB_TABLES.JUDGE_SCORES)
    .select('*')
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
    scoringOpen: Boolean(event.scoring_enabled),
  }
}

export async function submitJudgeScores(eventId, judgeId, scores) {
  await assertJudgeEnrolled(eventId, judgeId)

  const event = await getEventById(eventId)
  if (!event.scoring_enabled) {
    throw new ApiError(403, 'Scoring is not open for this event')
  }

  const contestants = await getClient()
    .from(DB_TABLES.CONTESTANTS)
    .select('id')
    .eq('event_id', eventId)

  const criteria = await getClient().from(DB_TABLES.CRITERIA).select('*').eq('event_id', eventId)

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
    if (Number.isNaN(score) || score < crit.minScore || score > crit.maxScore) {
      throw new ApiError(
        400,
        `Score for ${crit.name} must be between ${crit.minScore} and ${crit.maxScore}`,
      )
    }

    rows.push({
      judge_id: judgeId,
      contestant_id: entry.contestantId,
      criteria_id: entry.criteriaId,
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
        scoring_enabled,
        status,
        event_type
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

  const [contestantsRes, criteriaRes, judgesRes] = await Promise.all([
    getClient().from(DB_TABLES.CONTESTANTS).select('*').eq('event_id', eventId),
    getClient().from(DB_TABLES.CRITERIA).select('*').eq('event_id', eventId),
    getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_judge', true),
  ])

  if (contestantsRes.error) throw new ApiError(500, contestantsRes.error.message)
  if (criteriaRes.error) throw new ApiError(500, criteriaRes.error.message)

  const contestants = (contestantsRes.data ?? []).map(mapContestant)
  const criteria = (criteriaRes.data ?? []).map(mapCriteria)
  const contestantIds = contestants.map((c) => c.id)

  let scores = []
  if (contestantIds.length) {
    const { data: scoresData, error: scoresErr } = await getClient()
      .from(DB_TABLES.JUDGE_SCORES)
      .select('contestant_id, criteria_id, score, judge_id')
      .in('contestant_id', contestantIds)

    if (scoresErr) throw new ApiError(500, scoresErr.message)
    scores = scoresData ?? []
  }

  const { count: totalJudges } = judgesRes
  const { count: submittedJudges } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('is_judge', true)
    .eq('has_scored', true)

  const results = contestants.map((contestant) => {
    const criteriaBreakdown = criteria.map((crit) => {
      const critScores = scores
        .filter((s) => s.contestant_id === contestant.id && s.criteria_id === crit.id)
        .map((s) => Number(s.score))

      const average =
        critScores.length > 0
          ? critScores.reduce((a, b) => a + b, 0) / critScores.length
          : 0

      return {
        criteriaId: crit.id,
        criteriaName: crit.name,
        percentage: crit.percentage,
        average: Math.round(average * 100) / 100,
        judgeCount: critScores.length,
      }
    })

    const weightedScore = criteriaBreakdown.reduce(
      (sum, c) => sum + c.average * (c.percentage / 100),
      0,
    )

    return {
      contestantId: contestant.id,
      contestantName: contestant.name,
      contestantNumber: contestant.contestantNumber,
      photo: contestant.photo,
      criteriaBreakdown,
      weightedScore: Math.round(weightedScore * 100) / 100,
    }
  })

  results.sort((a, b) => b.weightedScore - a.weightedScore)
  results.forEach((r, i) => {
    r.rank = i + 1
  })

  const totalPct = criteria.reduce((s, c) => s + c.percentage, 0)

  return {
    rankings: results,
    criteriaTotalPercentage: totalPct,
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
