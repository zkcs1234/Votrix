import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  EVENT_TYPES,
  EVENT_STATUS,
  COMPETITION_SCORING_EVENT_TYPES,
  USER_ROLES,
} from '../utils/constants.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

function monthKey(dateLike) {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildRecentMonths(size = 6) {
  const now = new Date()
  const buckets = []
  for (let i = size - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = monthKey(d)
    buckets.push({
      key,
      label: d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      value: 0,
    })
  }
  return buckets
}

function aggregateByMonth(rows, dateField = 'created_at') {
  const buckets = buildRecentMonths(6)
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const row of rows ?? []) {
    const key = monthKey(row?.[dateField])
    const idx = index.get(key)
    if (idx !== undefined) buckets[idx].value += 1
  }
  return buckets
}

function mapActivityItem(item) {
  return {
    type: item.type,
    label: item.label,
    timestamp: item.timestamp,
    metadata: item.metadata ?? null,
  }
}

async function countRows(queryBuilder) {
  const { count, error } = await queryBuilder
  if (error) throw new ApiError(500, error.message)
  return count ?? 0
}

async function getEventRowsByOrganizer(organizerId) {
  const { data: organizations, error: orgError } = await getClient()
    .from(DB_TABLES.ORGANIZATIONS)
    .select('id')
    .eq('organizer_id', organizerId)

  if (orgError) throw new ApiError(500, orgError.message)

  const organizationIds = (organizations ?? []).map((o) => o.id)
  if (!organizationIds.length) return []

  const { data: events, error: eventError } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, title, status, event_type, created_at, organization_id')
    .in('organization_id', organizationIds)

  if (eventError) throw new ApiError(500, eventError.message)
  return events ?? []
}

function collectEventIdsByType(events) {
  const electionEventIds = []
  const competitionEventIds = []
  const pollingEventIds = []

  for (const event of events ?? []) {
    if (event.event_type === EVENT_TYPES.ELECTION) electionEventIds.push(event.id)
    if (COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
      competitionEventIds.push(event.id)
    }
    if (event.event_type === EVENT_TYPES.POLLING) pollingEventIds.push(event.id)
  }

  return { electionEventIds, competitionEventIds, pollingEventIds }
}

async function loadRecentActivity({ eventIds, includeOrganizerCreations = false, organizerId = null }) {
  const activity = []
  const eventTitleById = new Map()

  if (eventIds?.length) {
    const { data: eventRows, error: eventError } = await getClient()
      .from(DB_TABLES.EVENTS)
      .select('id, title')
      .in('id', eventIds)

    if (eventError) throw new ApiError(500, eventError.message)
    for (const event of eventRows ?? []) eventTitleById.set(event.id, event.title)
  }

  if (includeOrganizerCreations) {
    const { data: organizers, error } = await getClient()
      .from(DB_TABLES.USERS)
      .select('id, email, created_at')
      .eq('role', USER_ROLES.ORGANIZER)
      .order('created_at', { ascending: false })
      .limit(8)
    if (error) throw new ApiError(500, error.message)

    for (const row of organizers ?? []) {
      activity.push({
        type: 'organizer_created',
        label: `Organizer created: ${row.email ?? row.id}`,
        timestamp: row.created_at,
      })
    }
  }

  if (eventIds?.length) {
    const { data: newEvents, error: eventsErr } = await getClient()
      .from(DB_TABLES.EVENTS)
      .select('id, title, created_at')
      .in('id', eventIds)
      .order('created_at', { ascending: false })
      .limit(8)

    if (eventsErr) throw new ApiError(500, eventsErr.message)
    for (const row of newEvents ?? []) {
      activity.push({
        type: 'event_created',
        label: `Event created: ${row.title}`,
        timestamp: row.created_at,
        metadata: { eventId: row.id },
      })
    }

    const { data: invitations, error: invErr } = await getClient()
      .from(DB_TABLES.INVITATIONS)
      .select('event_id, voter_id, created_at, updated_at, invitation_sent')
      .in('event_id', eventIds)
      .eq('invitation_sent', true)
      .order('updated_at', { ascending: false })
      .limit(8)

    if (invErr) throw new ApiError(500, invErr.message)
    for (const row of invitations ?? []) {
      activity.push({
        type: 'invitation_sent',
        label: `Invitation sent for ${eventTitleById.get(row.event_id) ?? 'an event'}`,
        timestamp: row.updated_at ?? row.created_at,
        metadata: { eventId: row.event_id, voterId: row.voter_id },
      })
    }

    const { data: csvRows, error: csvErr } = await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .select('event_id, voter_id, created_at, first_name, last_name')
      .in('event_id', eventIds)
      .or('first_name.not.is.null,last_name.not.is.null')
      .order('created_at', { ascending: false })
      .limit(8)

    if (csvErr) throw new ApiError(500, csvErr.message)
    for (const row of csvRows ?? []) {
      activity.push({
        type: 'csv_uploaded',
        label: `CSV import row added for ${eventTitleById.get(row.event_id) ?? 'an event'}`,
        timestamp: row.created_at,
        metadata: { eventId: row.event_id, voterId: row.voter_id },
      })
    }
  }

  if (organizerId) {
    const { data: myOrgs, error: myOrgErr } = await getClient()
      .from(DB_TABLES.ORGANIZATIONS)
      .select('id, organization_name, created_at')
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
      .limit(8)

    if (myOrgErr) throw new ApiError(500, myOrgErr.message)
    for (const row of myOrgs ?? []) {
      activity.push({
        type: 'organizer_created',
        label: `Organization created: ${row.organization_name}`,
        timestamp: row.created_at,
        metadata: { organizationId: row.id },
      })
    }
  }

  return activity
    .filter((a) => Boolean(a.timestamp))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 12)
    .map(mapActivityItem)
}

export async function getAdminDashboardStats() {
  const [
    organizationsRes,
    eventsRes,
    usersRes,
    electionVotesRes,
    judgeScoresRes,
    pollAnswersRes,
    organizersRes,
  ] = await Promise.all([
    getClient().from(DB_TABLES.ORGANIZATIONS).select('organizer_id, status'),
    getClient().from(DB_TABLES.EVENTS).select('id, status, event_type, created_at'),
    getClient().from(DB_TABLES.USERS).select('id, role').eq('role', USER_ROLES.VOTER),
    getClient().from(DB_TABLES.ELECTION_VOTES).select('*', { count: 'exact', head: true }),
    getClient().from(DB_TABLES.JUDGE_SCORES).select('*', { count: 'exact', head: true }),
    getClient().from(DB_TABLES.POLL_ANSWERS).select('*', { count: 'exact', head: true }),
    getClient().from(DB_TABLES.USERS).select('id').eq('role', USER_ROLES.ORGANIZER),
  ])

  if (organizationsRes.error) throw new ApiError(500, organizationsRes.error.message)
  if (eventsRes.error) throw new ApiError(500, eventsRes.error.message)
  if (usersRes.error) throw new ApiError(500, usersRes.error.message)
  if (electionVotesRes.error) throw new ApiError(500, electionVotesRes.error.message)
  if (judgeScoresRes.error) throw new ApiError(500, judgeScoresRes.error.message)
  if (pollAnswersRes.error) throw new ApiError(500, pollAnswersRes.error.message)
  if (organizersRes.error) throw new ApiError(500, organizersRes.error.message)

  const activeOrganizerIds = new Set(
    (organizationsRes.data ?? [])
      .filter((org) => org.status === 'active')
      .map((org) => org.organizer_id),
  )

  const events = eventsRes.data ?? []
  const totalVotesCast =
    (electionVotesRes.count ?? 0) + (judgeScoresRes.count ?? 0) + (pollAnswersRes.count ?? 0)

  // Count total organizers - both from users table (more accurate) and active organizations
  const totalOrganizersCount = (organizersRes.data ?? []).length

  const recentActivity = await loadRecentActivity({
    eventIds: events.map((e) => e.id),
    includeOrganizerCreations: true,
  })

  return {
    stats: {
      totalOrganizers: totalOrganizersCount,
      activeOrganizations: activeOrganizerIds.size,
      totalEvents: events.length,
      totalElectionEvents: events.filter((e) => e.event_type === EVENT_TYPES.ELECTION).length,
      totalPageantEvents: events.filter((e) => COMPETITION_SCORING_EVENT_TYPES.has(e.event_type)).length,
      totalPollingEvents: events.filter((e) => e.event_type === EVENT_TYPES.POLLING).length,
      activeEvents: events.filter((e) => e.status === EVENT_STATUS.ACTIVE).length,
      finishedEvents: events.filter((e) => e.status === EVENT_STATUS.COMPLETED).length,
      totalVoters: (usersRes.data ?? []).length,
      totalVotesCast,
    },
    recentActivity,
  }
}

export async function getAdminAnalytics() {
  const [eventsRes, usersRes, electionVotesRes, judgeScoresRes, pollAnswersRes] =
    await Promise.all([
      getClient().from(DB_TABLES.EVENTS).select('id, event_type, status, created_at'),
      getClient().from(DB_TABLES.USERS).select('id, role, created_at').eq('role', USER_ROLES.VOTER),
      getClient().from(DB_TABLES.ELECTION_VOTES).select('created_at'),
      getClient().from(DB_TABLES.JUDGE_SCORES).select('created_at'),
      getClient().from(DB_TABLES.POLL_ANSWERS).select('created_at'),
    ])

  if (eventsRes.error) throw new ApiError(500, eventsRes.error.message)
  if (usersRes.error) throw new ApiError(500, usersRes.error.message)
  if (electionVotesRes.error) throw new ApiError(500, electionVotesRes.error.message)
  if (judgeScoresRes.error) throw new ApiError(500, judgeScoresRes.error.message)
  if (pollAnswersRes.error) throw new ApiError(500, pollAnswersRes.error.message)

  const events = eventsRes.data ?? []
  const monthlyEvents = aggregateByMonth(events)
  const voterGrowth = aggregateByMonth(usersRes.data ?? [])
  const participationGrowth = aggregateByMonth([
    ...(electionVotesRes.data ?? []),
    ...(judgeScoresRes.data ?? []),
    ...(pollAnswersRes.data ?? []),
  ])

  return {
    charts: {
      monthlyEvents,
      voterGrowth,
      participationGrowth,
      eventTypes: [
        {
          type: EVENT_TYPES.ELECTION,
          count: events.filter((e) => e.event_type === EVENT_TYPES.ELECTION).length,
        },
        {
          type: 'competition_scoring',
          count: events.filter((e) => COMPETITION_SCORING_EVENT_TYPES.has(e.event_type)).length,
        },
        {
          type: EVENT_TYPES.POLLING,
          count: events.filter((e) => e.event_type === EVENT_TYPES.POLLING).length,
        },
      ],
      eventStatus: [
        { status: EVENT_STATUS.ACTIVE, count: events.filter((e) => e.status === EVENT_STATUS.ACTIVE).length },
        {
          status: EVENT_STATUS.COMPLETED,
          count: events.filter((e) => e.status === EVENT_STATUS.COMPLETED).length,
        },
        {
          status: EVENT_STATUS.SCHEDULED,
          count: events.filter((e) => e.status === EVENT_STATUS.SCHEDULED).length,
        },
        { status: EVENT_STATUS.DRAFT, count: events.filter((e) => e.status === EVENT_STATUS.DRAFT).length },
      ],
    },
  }
}

export async function getOrganizerDashboardStats(organizerId) {
  const events = await getEventRowsByOrganizer(organizerId)
  const { electionEventIds, competitionEventIds, pollingEventIds } = collectEventIdsByType(events)

  const [
    totalAssigned,
    electionVotes,
    judgeScores,
    pollAnswers,
    votedElection,
    submittedJudges,
    respondedPoll,
  ] = await Promise.all([
    events.length
      ? countRows(
          getClient().from(DB_TABLES.EVENT_VOTERS).select('*', { count: 'exact', head: true }).in('event_id', events.map((e) => e.id)),
        )
      : Promise.resolve(0),
    electionEventIds.length
      ? countRows(
          getClient().from(DB_TABLES.ELECTION_VOTES).select('*', { count: 'exact', head: true }).in('event_id', electionEventIds),
        )
      : Promise.resolve(0),
    competitionEventIds.length
      ? countRows(
          getClient()
            .from(DB_TABLES.JUDGE_SCORES)
            .select('id, competition_contestants!inner(event_id)', { count: 'exact', head: true })
            .in('competition_contestants.event_id', competitionEventIds),
        )
      : Promise.resolve(0),
    pollingEventIds.length
      ? countRows(
          getClient()
            .from(DB_TABLES.POLL_ANSWERS)
            .select('id, poll_questions!inner(event_id)', { count: 'exact', head: true })
            .in('poll_questions.event_id', pollingEventIds),
        )
      : Promise.resolve(0),
    electionEventIds.length
      ? countRows(
          getClient()
            .from(DB_TABLES.EVENT_VOTERS)
            .select('*', { count: 'exact', head: true })
            .in('event_id', electionEventIds)
            .eq('has_voted', true),
        )
      : Promise.resolve(0),
    competitionEventIds.length
      ? countRows(
          getClient()
            .from(DB_TABLES.EVENT_VOTERS)
            .select('*', { count: 'exact', head: true })
            .in('event_id', competitionEventIds)
            .eq('is_judge', true)
            .eq('has_scored', true),
        )
      : Promise.resolve(0),
    pollingEventIds.length
      ? countRows(
          getClient()
            .from(DB_TABLES.EVENT_VOTERS)
            .select('*', { count: 'exact', head: true })
            .in('event_id', pollingEventIds)
            .eq('has_voted', true),
        )
      : Promise.resolve(0),
  ])

  const recentActivity = await loadRecentActivity({
    eventIds: events.map((event) => event.id),
    organizerId,
  })

  return {
    stats: {
      totalEvents: events.length,
      activeEvents: events.filter((e) => e.status === EVENT_STATUS.ACTIVE).length,
      finishedEvents: events.filter((e) => e.status === EVENT_STATUS.COMPLETED).length,
      totalElectionEvents: electionEventIds.length,
      totalPageantEvents: competitionEventIds.length,
      totalPollingEvents: pollingEventIds.length,
      totalAssignedVoters: totalAssigned,
      totalVotesCast: electionVotes + judgeScores + pollAnswers,
      electionParticipants: votedElection,
      pageantParticipants: submittedJudges,
      pollingParticipants: respondedPoll,
    },
    recentActivity,
  }
}

export async function getOrganizerAnalytics(organizerId) {
  const events = await getEventRowsByOrganizer(organizerId)
  const { electionEventIds, competitionEventIds, pollingEventIds } = collectEventIdsByType(events)

  const [voterRowsRes, electionVotesRes, judgeScoresRes, pollAnswersRes] = await Promise.all([
    events.length
      ? getClient().from(DB_TABLES.EVENT_VOTERS).select('event_id, has_voted, is_judge, has_scored').in('event_id', events.map((e) => e.id))
      : Promise.resolve({ data: [], error: null }),
    electionEventIds.length
      ? getClient().from(DB_TABLES.ELECTION_VOTES).select('created_at, event_id').in('event_id', electionEventIds)
      : Promise.resolve({ data: [], error: null }),
    competitionEventIds.length
      ? getClient().from(DB_TABLES.JUDGE_SCORES).select('created_at, competition_contestants!inner(event_id)').in('competition_contestants.event_id', competitionEventIds)
      : Promise.resolve({ data: [], error: null }),
    pollingEventIds.length
      ? getClient().from(DB_TABLES.POLL_ANSWERS).select('created_at, poll_questions!inner(event_id)').in('poll_questions.event_id', pollingEventIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (voterRowsRes.error) throw new ApiError(500, voterRowsRes.error.message)
  if (electionVotesRes.error) throw new ApiError(500, electionVotesRes.error.message)
  if (judgeScoresRes.error) throw new ApiError(500, judgeScoresRes.error.message)
  if (pollAnswersRes.error) throw new ApiError(500, pollAnswersRes.error.message)

  const voterRows = voterRowsRes.data ?? []
  const electionAssigned = voterRows.filter((r) => electionEventIds.includes(r.event_id)).length
  const electionVoted = voterRows.filter((r) => electionEventIds.includes(r.event_id) && r.has_voted).length

  const pageantJudges = voterRows.filter(
    (r) => competitionEventIds.includes(r.event_id) && r.is_judge,
  ).length
  const pageantCompleted = voterRows.filter(
    (r) => competitionEventIds.includes(r.event_id) && r.is_judge && r.has_scored,
  ).length

  const pollingAssigned = voterRows.filter((r) => pollingEventIds.includes(r.event_id)).length
  const pollingResponded = voterRows.filter(
    (r) => pollingEventIds.includes(r.event_id) && r.has_voted,
  ).length

  const participationGrowth = aggregateByMonth([
    ...(electionVotesRes.data ?? []),
    ...(judgeScoresRes.data ?? []),
    ...(pollAnswersRes.data ?? []),
  ])

  return {
    charts: {
      monthlyEvents: aggregateByMonth(events),
      participationGrowth,
      eventParticipation: [
        {
          module: EVENT_TYPES.ELECTION,
          assigned: electionAssigned,
          participated: electionVoted,
          rate: electionAssigned > 0 ? Math.round((electionVoted / electionAssigned) * 10000) / 100 : 0,
        },
        {
          module: 'competition_scoring',
          assigned: pageantJudges,
          participated: pageantCompleted,
          rate: pageantJudges > 0 ? Math.round((pageantCompleted / pageantJudges) * 10000) / 100 : 0,
        },
        {
          module: EVENT_TYPES.POLLING,
          assigned: pollingAssigned,
          participated: pollingResponded,
          rate: pollingAssigned > 0 ? Math.round((pollingResponded / pollingAssigned) * 10000) / 100 : 0,
        },
      ],
    },
  }
}