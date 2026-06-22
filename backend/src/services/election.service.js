import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_TYPES } from '../utils/constants.js'
import { isElectionVotingOpen, canVoterViewElectionResults } from '../utils/eventSchedule.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrCreateElectionOrganization, mapOrganization } from './organization.service.js'


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
    votingEnabled: Boolean(row.voting_enabled),
    resultsVisibility: row.results_visibility ?? 'public',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPosition(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description ?? null,
    minVote: row.min_vote,
    maxVote: row.max_vote,
    numberOfWinners: row.number_of_winners ?? 1,
    displayOrder: row.display_order ?? 0,
    allowSkip: row.allow_skip,
  }
}

function mapCandidate(row) {
  return {
    id: row.id,
    positionId: row.position_id,
    name: row.name,
    photo: row.photo,
    description: row.description,
    biography: row.biography ?? null,
    platform: row.platform ?? null,
    // Expose both names so existing clients (partylist) keep working and the
    // spec name (party) is available going forward.
    party: row.partylist,
    partylist: row.partylist,
  }
}

// ——— Dashboard ———

export async function getOrganizerDashboard(organizerId) {
    try {
      if (!organizerId) {
        throw new ApiError(400, 'organizerId is required')
      }

      const org = await getOrCreateElectionOrganization(organizerId)
      if (!org?.id) {
        // Prevent downstream TypeError crashes; return a clear 500.
        throw new ApiError(500, 'Failed to get or create organization')
      }


    const { data: events, error } = await getClient()
      .from(DB_TABLES.EVENTS)
      .select('id, title, status, voting_enabled, event_type')
      .eq('organization_id', org.id)
      .eq('event_type', EVENT_TYPES.ELECTION)
      .order('created_at', { ascending: false })

    if (error) throw new ApiError(500, error.message)

    const eventIds = (events ?? []).map((e) => e.id)
    let registeredVoters = 0
    let votedCount = 0
    let votesCast = 0

    if (eventIds.length) {
      const [assignedRes, votedRes, votesRes] = await Promise.all([
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
          .from(DB_TABLES.ELECTION_VOTES)
          .select('*', { count: 'exact', head: true })
          .in('event_id', eventIds),
      ])

      if (assignedRes.error) throw new ApiError(500, assignedRes.error.message)
      if (votedRes.error) throw new ApiError(500, votedRes.error.message)
      if (votesRes.error) throw new ApiError(500, votesRes.error.message)

      registeredVoters = assignedRes.count ?? 0
      votedCount = votedRes.count ?? 0
      votesCast = votesRes.count ?? 0
    }

    const turnoutRate =
      registeredVoters > 0 ? Math.round((votedCount / registeredVoters) * 10000) / 100 : 0

    return {
      organization: mapOrganization(org),
      events: (events ?? []).map(mapEvent),
      stats: {
        totalEvents: events?.length ?? 0,
        activeVoting: events?.filter((e) => e.voting_enabled).length ?? 0,
        registeredVoters,
        votedCount,
        votesCast,
        turnoutRate,
      },
    }
  } catch (error) {
    console.error('[getOrganizerDashboard] Error:', error.message)
    if (error.statusCode) throw error
    throw new ApiError(500, 'Failed to load dashboard')
  }
}

// ——— Events ———

export async function listElectionEvents(organizerId) {
  const org = await getOrCreateElectionOrganization(organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('*')
    .eq('organization_id', org.id)
    .eq('event_type', EVENT_TYPES.ELECTION)
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapEvent)
}

export async function createElectionEvent(organizerId, payload) {
  const org = await getOrCreateElectionOrganization(organizerId)

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
      event_type: EVENT_TYPES.ELECTION,
      voting_enabled: false,
      results_visibility: payload.resultsVisibility ?? 'public',
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapEvent(data)
}

export async function updateElectionEvent(eventId, organizerId, payload) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)

  const nextStart = payload.startDate !== undefined ? payload.startDate : event.start_date
  const nextEnd = payload.endDate !== undefined ? payload.endDate : event.end_date
  if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    throw new ApiError(400, 'End date must be on or after start date')
  }

  const updates = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.banner !== undefined) updates.banner = payload.banner
  if (payload.startDate !== undefined) updates.start_date = payload.startDate
  if (payload.endDate !== undefined) updates.end_date = payload.endDate
  if (payload.status !== undefined) updates.status = payload.status
  if (payload.resultsVisibility !== undefined) {
    updates.results_visibility = payload.resultsVisibility
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update(updates)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapEvent(data)
}

export async function setEventVoting(eventId, organizerId, votingEnabled) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  if (votingEnabled) {
    const { data: positions, error: posErr } = await getClient()
      .from(DB_TABLES.POSITIONS)
      .select('id')
      .eq('event_id', eventId)

    if (posErr) throw new ApiError(500, posErr.message)
    if (!positions?.length) {
      throw new ApiError(400, 'Add at least one position before opening voting')
    }

    const positionIds = positions.map((p) => p.id)
    const { data: candidates, error: candErr } = await getClient()
      .from(DB_TABLES.CANDIDATES)
      .select('position_id')
      .in('position_id', positionIds)

    if (candErr) throw new ApiError(500, candErr.message)

    const positionsWithCandidates = new Set((candidates ?? []).map((c) => c.position_id))
    const missing = positions.filter((p) => !positionsWithCandidates.has(p.id))
    if (missing.length) {
      throw new ApiError(
        400,
        'Every position must have at least one candidate before opening voting',
      )
    }
  }

  const updates = {
    voting_enabled: Boolean(votingEnabled),
    status: votingEnabled ? 'active' : 'scheduled',
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update(updates)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapEvent(data)
}

export async function getElectionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'This event is not an election')
  }
  return mapEvent(event)
}

// ——— Positions ———

export async function listPositions(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapPosition)
}

async function nextPositionDisplayOrder(eventId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('display_order')
    .eq('event_id', eventId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) return 0
  return (data.display_order ?? 0) + 1
}

export async function createPosition(eventId, organizerId, payload) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const displayOrder =
    payload.displayOrder !== undefined
      ? payload.displayOrder
      : await nextPositionDisplayOrder(eventId)

  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .insert({
      event_id: eventId,
      name: payload.name,
      description: payload.description ?? null,
      min_vote: payload.minVote ?? 1,
      max_vote: payload.maxVote ?? 1,
      number_of_winners: payload.numberOfWinners ?? 1,
      display_order: displayOrder,
      allow_skip: payload.allowSkip ?? false,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapPosition(data)
}

export async function updatePosition(eventId, organizerId, positionId, payload) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.minVote !== undefined) updates.min_vote = payload.minVote
  if (payload.maxVote !== undefined) updates.max_vote = payload.maxVote
  if (payload.numberOfWinners !== undefined) updates.number_of_winners = payload.numberOfWinners
  if (payload.displayOrder !== undefined) updates.display_order = payload.displayOrder
  if (payload.allowSkip !== undefined) updates.allow_skip = payload.allowSkip

  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .update(updates)
    .eq('id', positionId)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Position not found')
  return mapPosition(data)
}

export async function deletePosition(eventId, organizerId, positionId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const { count: voteCount, error: voteErr } = await getClient()
    .from(DB_TABLES.ELECTION_VOTES)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('position_id', positionId)

  if (voteErr) throw new ApiError(500, voteErr.message)
  if ((voteCount ?? 0) > 0) {
    throw new ApiError(409, 'Cannot delete a position that already has votes recorded')
  }

  const { error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .delete()
    .eq('id', positionId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)
}

// ——— Candidates ———

export async function listCandidates(eventId, organizerId, positionId = null) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  let positionIds = []
  if (positionId) {
    positionIds = [positionId]
  } else {
    const positions = await listPositions(eventId, organizerId)
    positionIds = positions.map((p) => p.id)
  }

  if (!positionIds.length) return []

  const { data, error } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .select('*')
    .in('position_id', positionIds)

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapCandidate)
}

export async function createCandidate(eventId, organizerId, positionId, payload) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const { data: pos } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('id')
    .eq('id', positionId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!pos) throw new ApiError(404, 'Position not found')

  const { data, error } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .insert({
      position_id: positionId,
      name: payload.name,
      photo: payload.photo ?? null,
      description: payload.description ?? null,
      biography: payload.biography ?? null,
      platform: payload.platform ?? null,
      partylist: payload.partylist ?? null,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapCandidate(data)
}

async function assertCandidateInEvent(eventId, candidateId) {
  const { data: cand } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .select('position_id')
    .eq('id', candidateId)
    .maybeSingle()

  if (!cand) throw new ApiError(404, 'Candidate not found')

  const { data: pos } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('event_id')
    .eq('id', cand.position_id)
    .maybeSingle()

  if (!pos || pos.event_id !== eventId) throw new ApiError(404, 'Candidate not found')
}

export async function updateCandidate(eventId, organizerId, candidateId, payload) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  await assertCandidateInEvent(eventId, candidateId)

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.photo !== undefined) updates.photo = payload.photo
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.biography !== undefined) updates.biography = payload.biography
  if (payload.platform !== undefined) updates.platform = payload.platform
  if (payload.partylist !== undefined) updates.partylist = payload.partylist

  const { data, error } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .update(updates)
    .eq('id', candidateId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return mapCandidate(data)
}

export async function deleteCandidate(eventId, organizerId, candidateId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  await assertCandidateInEvent(eventId, candidateId)

  const { count: voteCount, error: voteErr } = await getClient()
    .from(DB_TABLES.ELECTION_VOTES)
    .select('*', { count: 'exact', head: true })
    .eq('candidate_id', candidateId)

  if (voteErr) throw new ApiError(500, voteErr.message)
  if ((voteCount ?? 0) > 0) {
    throw new ApiError(409, 'Cannot delete a candidate that already has votes recorded')
  }

  const { error } = await getClient().from(DB_TABLES.CANDIDATES).delete().eq('id', candidateId)
  if (error) throw new ApiError(500, error.message)
}

// ——— Voters list ———

export async function listEventVoters(eventId, organizerId, page = 1, limit = 50) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select(
      `
      id,
      has_voted,
      first_name,
      last_name,
      created_at,
      users (id, email)
    `,
      { count: 'exact' }
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new ApiError(500, error.message)

  return {
    voters: (data ?? []).map((row) => ({
      id: row.id,
      voterId: row.users?.id,
      email: row.users?.email,
      firstName: row.first_name,
      lastName: row.last_name,
      hasVoted: row.has_voted,
      createdAt: row.created_at,
    })),
    meta: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    }
  }
}

// ——— Voting (voter) ———

export async function assertVoterEnrolled(eventId, voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('*')
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(403, 'You are not enrolled in this event')
  return data
}

export async function getVoterBallot(eventId, voterId) {
  const enrollment = await assertVoterEnrolled(eventId, voterId)
  const event = await getEventById(eventId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }

  const { data: positions, error: posErr } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (posErr) throw new ApiError(500, posErr.message)

  const positionIds = (positions ?? []).map((p) => p.id)
  let candidates = []

  if (positionIds.length) {
    const { data: cands, error: candErr } = await getClient()
      .from(DB_TABLES.CANDIDATES)
      .select('*')
      .in('position_id', positionIds)

    if (candErr) throw new ApiError(500, candErr.message)
    candidates = cands ?? []
  }

  const byPosition = (positions ?? []).map((p) => ({
    ...mapPosition(p),
    candidates: candidates.filter((c) => c.position_id === p.id).map(mapCandidate),
  }))

  return {
    event: mapEvent(event),
    positions: byPosition,
    hasVoted: enrollment.has_voted,
    votingOpen: isElectionVotingOpen(event),
    resultsVisibility: event.results_visibility ?? 'public',
    canViewResults: canVoterViewElectionResults(event),
  }
}

function validateBallotSelections(positions, selections) {
  for (const position of positions) {
    const selected = selections[position.id] ?? []
    const count = selected.length

    if (count === 0 && position.allow_skip) continue
    if (count === 0 && !position.allow_skip) {
      throw new ApiError(400, `You must vote for ${position.name} or allow skip`)
    }
    if (count < position.min_vote) {
      throw new ApiError(
        400,
        `${position.name}: select at least ${position.min_vote} candidate(s)`,
      )
    }
    if (count > position.max_vote) {
      throw new ApiError(
        400,
        `${position.name}: select at most ${position.max_vote} candidate(s)`,
      )
    }
  }
}

export async function submitBallot(eventId, voterId, selections) {
  await assertVoterEnrolled(eventId, voterId)

  const event = await getEventById(eventId)

  if (!isElectionVotingOpen(event)) {
    if (!event.voting_enabled) {
      throw new ApiError(403, 'Voting is not open for this event')
    }
    if (event.start_date && new Date(event.start_date) > new Date()) {
      throw new ApiError(403, 'Voting has not started yet for this event')
    }
    if (event.end_date && new Date(event.end_date) < new Date()) {
      throw new ApiError(403, 'Voting has ended for this event')
    }
    throw new ApiError(403, 'Voting is not open for this event')
  }

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }

  const { data: positions, error: posErr } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('*')
    .eq('event_id', eventId)

  if (posErr) throw new ApiError(500, posErr.message)

  const mappedPositions = (positions ?? []).map(mapPosition)
  validateBallotSelections(mappedPositions, selections)

  const positionIds = new Set(mappedPositions.map((p) => p.id))
  const voteRows = []

  const allCandidateIds = Object.values(selections).flat()
  const { data: validCandidates } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .select('id, position_id')
    .in('id', allCandidateIds)

  const validCandidateMap = new Map(
    (validCandidates ?? []).map((c) => [`${c.position_id}-${c.id}`, true])
  )

  for (const [positionId, candidateIds] of Object.entries(selections)) {
    if (!positionIds.has(positionId)) {
      throw new ApiError(400, 'Invalid position in ballot')
    }
    const unique = [...new Set(candidateIds)]
    if (unique.length !== candidateIds.length) {
      throw new ApiError(400, 'Duplicate candidate in same position')
    }

    for (const candidateId of unique) {
      if (!validCandidateMap.has(`${positionId}-${candidateId}`)) {
        throw new ApiError(400, 'Invalid candidate for position')
      }

      voteRows.push({
        event_id: eventId,
        voter_id: voterId,
        position_id: positionId,
        candidate_id: candidateId,
      })
    }
  }

  if (!voteRows.length) {
    throw new ApiError(400, 'Your ballot must include at least one selection')
  }

  const { data: locked, error: lockErr } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .update({ has_voted: true })
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .eq('has_voted', false)
    .select('id')

  if (lockErr) throw new ApiError(500, lockErr.message)
  if (!locked?.length) {
    throw new ApiError(409, 'You have already submitted your vote for this event')
  }

  try {
    if (voteRows.length) {
      const { error: voteErr } = await getClient().from(DB_TABLES.ELECTION_VOTES).insert(voteRows)
      if (voteErr) {
        if (voteErr.code === '23505') {
          throw new ApiError(409, 'You have already submitted your vote for this event')
        }
        throw new ApiError(500, voteErr.message)
      }
    }
  } catch (err) {
    await getClient()
      .from(DB_TABLES.EVENT_VOTERS)
      .update({ has_voted: false })
      .eq('event_id', eventId)
      .eq('voter_id', voterId)
    throw err
  }

  return { success: true, message: 'Ballot submitted successfully', locked: true }
}

export async function listVoterElectionEvents(voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select(
      `
      has_voted,
      events (
        id,
        title,
        description,
        voting_enabled,
        status,
        event_type,
        start_date,
        end_date
      )
    `,
    )
    .eq('voter_id', voterId)

  if (error) throw new ApiError(500, error.message)

  return (data ?? [])
    .filter((r) => r.events?.event_type === EVENT_TYPES.ELECTION)
    .map((r) => ({
      ...mapEvent(r.events),
      hasVoted: r.has_voted,
    }))
}

// ——— Analytics ———

async function fetchElectionResultsData(eventId) {
  const [
    { count: totalVoters, error: evErr },
    { count: votedCount, error: votedErr },
    { data: voteRows, error: voteErr },
    { data: candidates, error: candErr },
  ] = await Promise.all([
    getClient().from(DB_TABLES.EVENT_VOTERS).select('*', { count: 'exact', head: true }).eq('event_id', eventId),
    getClient().from(DB_TABLES.EVENT_VOTERS).select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('has_voted', true),
    getClient().from(DB_TABLES.ELECTION_VOTES).select('candidate_id, position_id').eq('event_id', eventId),
    getClient().from(DB_TABLES.CANDIDATES).select('id, name, position_id, positions!inner(event_id)').eq('positions.event_id', eventId),
  ])

  if (evErr) throw new ApiError(500, evErr.message)
  if (votedErr) throw new ApiError(500, votedErr.message)
  if (voteErr) throw new ApiError(500, voteErr.message)
  if (candErr) throw new ApiError(500, candErr.message)

  const voteCountByCandidate = {}
  for (const v of voteRows ?? []) {
    voteCountByCandidate[v.candidate_id] = (voteCountByCandidate[v.candidate_id] || 0) + 1
  }

  const total = totalVoters ?? 0
  const voted = votedCount ?? 0
  const turnoutPercentage = total > 0 ? Math.round((voted / total) * 10000) / 100 : 0

  const candidateResults = (candidates ?? []).map((c) => ({
    candidateId: c.id,
    candidateName: c.name,
    positionId: c.position_id,
    votes: voteCountByCandidate[c.id] || 0,
  }))

  candidateResults.sort((a, b) => b.votes - a.votes)

  const liveTotalVotes = voteRows?.length ?? 0

  const { data: positionRows, error: posListErr } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('*')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })

  if (posListErr) throw new ApiError(500, posListErr.message)

  const positions = (positionRows ?? []).map(mapPosition)
  const positionSummaries = positions.map((position) => {
    const inPosition = candidateResults.filter((c) => c.positionId === position.id)
    const totalPositionVotes = inPosition.reduce((s, c) => s + c.votes, 0)
    return {
      positionId: position.id,
      positionName: position.name,
      totalVotes: totalPositionVotes,
      candidates: inPosition
        .map((c) => ({
          ...c,
          votePercentage:
            totalPositionVotes > 0
              ? Math.round((c.votes / totalPositionVotes) * 10000) / 100
              : 0,
        }))
        .sort((a, b) => b.votes - a.votes),
    }
  })

  return {
    totalVoters: total,
    votedCount: voted,
    turnoutPercentage,
    liveTotalVotes,
    candidateResults,
    positionSummaries,
  }
}

export async function getVoterElectionResults(eventId, voterId) {
  await assertVoterEnrolled(eventId, voterId)
  const event = await getEventById(eventId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }

  if (!canVoterViewElectionResults(event)) {
    throw new ApiError(403, 'Results are not available yet')
  }

  return fetchElectionResultsData(eventId)
}

export async function getElectionAnalytics(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  return fetchElectionResultsData(eventId)
}
