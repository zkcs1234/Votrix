import { randomUUID } from 'node:crypto'
import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_TYPES, PARTICIPANT_TYPES } from '../utils/constants.js'
import { isElectionVotingOpen, canVoterViewElectionResults } from '../utils/eventSchedule.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrCreateElectionOrganization, mapOrganization } from './organization.service.js'
import { emitToEvent, emitToEventOrganizer, emitToUser, emitToRole } from '../websocket/ws-emitter.js'
import { mapEvent } from '../foundation/mapper.js'
import { recordAudit } from '../foundation/audit.js'
import { recordEventActivity } from '../foundation/activity.js'
import { syncEventSchedules } from './event-schedule-sync.service.js'
import { assertEventUpdateAllowed } from '../utils/eventLifecycle.js'
import { deleteDraft } from './draft.service.js'
import { removeReferenceAndDeleteIfUnused } from './imageAsset.service.js'

// Single source of truth for turnout so dashboard, results, and websocket
// payloads always agree (previously three call sites used two rounding
// conventions). Returns a number rounded to 2 decimal places (e.g. 42.86).
function computeTurnoutRate(voted, total) {
  if (!total || total <= 0) return 0
  return Math.round((voted / total) * 10000) / 100
}

function mapPosition(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description ?? null,
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

// ——— Dashboard Cache (30s TTL) ———

const dashboardCache = new Map()
const DASHBOARD_CACHE_TTL = 30_000

// Bust an organizer's cached dashboard after any write that changes its stats,
// so the 30s TTL never serves stale event counts / turnout. NOTE: this cache is
// process-local — under horizontal scaling it must move to a shared store
// (Redis) or be removed. See remediation plan Phase 5.
function invalidateDashboardCache(organizerId) {
  if (organizerId) dashboardCache.delete(organizerId)
}

export async function getOrganizerDashboard(organizerId) {
    try {
      if (!organizerId) {
        throw new ApiError(400, 'organizerId is required')
      }

      const cached = dashboardCache.get(organizerId)
      if (cached && Date.now() - cached.timestamp < DASHBOARD_CACHE_TTL) {
        return cached.data
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
          .from(DB_TABLES.EVENT_PARTICIPANTS)
          .select('*', { count: 'exact', head: true })
          .in('event_id', eventIds)
          .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER),
        getClient()
          .from(DB_TABLES.EVENT_PARTICIPANTS)
          .select('*', { count: 'exact', head: true })
          .in('event_id', eventIds)
          .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)
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

    const turnoutRate = computeTurnoutRate(votedCount, registeredVoters)

    const result = {
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

    dashboardCache.set(organizerId, { data: result, timestamp: Date.now() })
    return result
  } catch (error) {
    console.error('[getOrganizerDashboard] Error:', error.message)
    if (error.statusCode) throw error
    throw new ApiError(500, 'Failed to load dashboard')
  }
}

// ——— Events ———

export async function listElectionEvents(organizerId, { limit = 200, offset = 0 } = {}) {
  const org = await getOrCreateElectionOrganization(organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, title, description, banner, status, voting_enabled, event_type, results_visibility, start_date, end_date, created_at, updated_at, organization_id')
    .eq('organization_id', org.id)
    .eq('event_type', EVENT_TYPES.ELECTION)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

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
      image_asset_id: payload.image_asset_id ?? null,
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

  await syncEventSchedules().catch((err) => {
    console.error('[election] schedule sync failed after create:', err.message)
  })

  await deleteDraft(organizerId, 'election').catch((err) => {
    console.error('[election] failed to clear draft after create:', err.message)
  })

  await recordAudit({
    userId: organizerId,
    action: 'election.event.create',
    entity: 'events',
    entityId: data.id,
    details: { title: data.title, resultsVisibility: payload.resultsVisibility },
  })

  invalidateDashboardCache(organizerId)
  return mapEvent(data)
}

export async function updateElectionEvent(eventId, organizerId, payload) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)

  const nextStart = payload.startDate !== undefined ? payload.startDate : event.start_date
  const nextEnd = payload.endDate !== undefined ? payload.endDate : event.end_date
  if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    throw new ApiError(400, 'End date must be on or after start date')
  }

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

  // Cleanup old banner asset if it was replaced
  if (oldAssetId && updates.image_asset_id !== undefined && oldAssetId !== updates.image_asset_id) {
    removeReferenceAndDeleteIfUnused(oldAssetId).catch((err) =>
      console.error('[election] Old banner asset cleanup error:', err.message),
    )
  }

  await syncEventSchedules().catch((err) => {
    console.error('[election] schedule sync failed after update:', err.message)
  })

  await recordAudit({
    userId: organizerId,
    action: 'election.event.update',
    entity: 'events',
    entityId: eventId,
    details: { updates: Object.keys(updates) },
  })

  invalidateDashboardCache(organizerId)
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
  
  emitToEvent(eventId, 'election:voting-toggled', {
    eventId,
    votingEnabled: Boolean(votingEnabled),
  })

  await recordAudit({
    userId: organizerId,
    action: votingEnabled ? 'election.voting.enable' : 'election.voting.disable',
    entity: 'events',
    entityId: eventId,
    details: { title: data.title, votingEnabled: Boolean(votingEnabled) },
  })

  invalidateDashboardCache(organizerId)
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
    .select('id, event_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
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
      max_vote: payload.maxVote ?? 1,
      number_of_winners: payload.numberOfWinners ?? 1,
      display_order: displayOrder,
      allow_skip: payload.allowSkip ?? false,
    })
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  await recordAudit({
    userId: organizerId,
    action: 'election.position.create',
    entity: 'positions',
    entityId: data.id,
    details: { name: data.name, eventId },
  })

  return mapPosition(data)
}

export async function updatePosition(eventId, organizerId, positionId, payload) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
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

  await recordAudit({
    userId: organizerId,
    action: 'election.position.update',
    entity: 'positions',
    entityId: positionId,
    details: { name: data.name, changedKeys: Object.keys(updates), eventId },
  })

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

  // Fetch position name before deleting for audit trail
  const { data: posData } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('name')
    .eq('id', positionId)
    .single()

  const { error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .delete()
    .eq('id', positionId)
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)

  await recordAudit({
    userId: organizerId,
    action: 'election.position.delete',
    entity: 'positions',
    entityId: positionId,
    details: { name: posData?.name ?? 'unknown', eventId },
  })
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
    .select('id, position_id, name, photo, description, biography, platform, partylist')
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

  await recordAudit({
    userId: organizerId,
    action: 'election.candidate.create',
    entity: 'candidates',
    entityId: data.id,
    details: { name: data.name, positionId, eventId },
  })

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

  // Capture old image_asset_id before updating so we can clean it up if replaced
  let oldAssetId = null
  if (payload.image_asset_id !== undefined) {
    const { data: prev } = await getClient()
      .from(DB_TABLES.CANDIDATES)
      .select('image_asset_id')
      .eq('id', candidateId)
      .maybeSingle()
    oldAssetId = prev?.image_asset_id ?? null
  }

  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.photo !== undefined) updates.photo = payload.photo
  if (payload.image_asset_id !== undefined) updates.image_asset_id = payload.image_asset_id
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

  // Cleanup old photo asset if it was replaced
  if (oldAssetId && oldAssetId !== payload.image_asset_id) {
    removeReferenceAndDeleteIfUnused(oldAssetId).catch((err) =>
      console.error('[election] Old candidate photo cleanup error:', err.message),
    )
  }

  await recordAudit({
    userId: organizerId,
    action: 'election.candidate.update',
    entity: 'candidates',
    entityId: candidateId,
    details: { name: data.name, changedKeys: Object.keys(updates), eventId },
  })

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

  // Fetch candidate name + image_asset_id before deleting for audit and cleanup
  const { data: candData } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .select('name, image_asset_id')
    .eq('id', candidateId)
    .single()

  const assetId = candData?.image_asset_id ?? null

  const { error } = await getClient().from(DB_TABLES.CANDIDATES).delete().eq('id', candidateId)
  if (error) throw new ApiError(500, error.message)

  // Cleanup photo asset if no other entities reference it
  if (assetId) {
    removeReferenceAndDeleteIfUnused(assetId).catch((err) =>
      console.error('[election] Candidate photo cleanup error:', err.message),
    )
  }

  await recordAudit({
    userId: organizerId,
    action: 'election.candidate.delete',
    entity: 'candidates',
    entityId: candidateId,
    details: { name: candData?.name ?? 'unknown', eventId },
  })
}

// ——— Voters list ———

export async function listEventVoters(eventId, organizerId, page = 1, limit = 50) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const from = (page - 1) * limit
  const to = from + limit - 1

  // Read directly from event_participants (canonical table). The legacy
  // v_event_voters view cannot satisfy PostgREST's `users(...)` embed
  // because views don't carry FK relationships, so queries through it
  // either error or return rows with null `users`. Invitation status is
  // fetched separately because invitations has no FK back here.
  const { data, error, count } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      `
      id,
      has_voted,
      first_name,
      last_name,
      created_at,
      user_id,
      metadata,
      users!inner (id, email)
    `,
      { count: 'exact' }
    )
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new ApiError(500, error.message)

  const voterRows = data ?? []
  const voterIds = voterRows.map((row) => row.user_id).filter(Boolean)

  // Fetch invitation statuses in a single query and index by voter_id.
  const invitationSentByVoter = new Map()
  if (voterIds.length) {
    const { data: invites, error: inviteError } = await getClient()
      .from(DB_TABLES.INVITATIONS)
      .select('voter_id, invitation_sent')
      .eq('event_id', eventId)
      .in('voter_id', voterIds)

    if (inviteError) throw new ApiError(500, inviteError.message)

    for (const inv of invites ?? []) {
      invitationSentByVoter.set(inv.voter_id, inv.invitation_sent)
    }
  }

  // Fetch the event's information form schema for dynamic columns
  const event = await getEventById(eventId)
  const informationFormSchema = event?.information_form_schema ?? { enabled: false, fields: [] }

  return {
    voters: voterRows.map((row) => ({
      id: row.id,
      voterId: row.users?.id,
      email: row.users?.email,
      firstName: row.first_name,
      lastName: row.last_name,
      hasVoted: row.has_voted,
      createdAt: row.created_at,
      metadata: row.metadata ?? {},
      // Invitation status: true = sent, false = pending, no record = false
      invitationSent: invitationSentByVoter.get(row.user_id) ?? false,
    })),
    informationFormSchema,
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
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id, event_id, user_id, participant_type, has_voted, first_name, last_name, voting_nonce')
    .eq('event_id', eventId)
    .eq('user_id', voterId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(403, 'You are not enrolled in this event')

  return {
    ...data,
    voter_id: data.user_id,
    has_voted: Boolean(data.has_voted),
  }
}

export async function getVoterBallot(eventId, voterId) {
  let enrollment = await assertVoterEnrolled(eventId, voterId)
  const event = await getEventById(eventId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }

  // Generate voting_nonce if not present
  if (!enrollment.voting_nonce && !enrollment.has_voted) {
    const nonce = randomUUID()
    const { data: updated } = await getClient()
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .update({ voting_nonce: nonce })
      .eq('id', enrollment.id)
      .select('id, event_id, user_id, participant_type, has_voted, first_name, last_name, voting_nonce')
      .single()
    if (updated) {
      enrollment = {
        ...updated,
        voter_id: updated.user_id,
        has_voted: Boolean(updated.has_voted),
      }
    }
  }

  const { data: positions, error: posErr } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('id, event_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (posErr) throw new ApiError(500, posErr.message)

  const positionIds = (positions ?? []).map((p) => p.id)
  let candidates = []

  if (positionIds.length) {
    const { data: cands, error: candErr } = await getClient()
      .from(DB_TABLES.CANDIDATES)
      .select('id, position_id, name, photo, description, biography, platform, partylist')
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
    votingNonce: enrollment.voting_nonce ?? null,
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
    if (count > position.max_vote) {
      throw new ApiError(
        400,
        `${position.name}: select at most ${position.max_vote} candidate(s)`,
      )
    }
  }
}

export async function submitBallot(eventId, voterId, payload) {
  const enrollment = await assertVoterEnrolled(eventId, voterId)
  const event = await getEventById(eventId)

  // An unpublished (draft/setup) event can never accept votes, regardless of
  // its schedule. voting_enabled is already false for such events; this is an
  // explicit guard so the intent is unmistakable.
  if (event.status === 'draft') {
    throw new ApiError(403, 'This event has not been published yet')
  }

  // Replay Protection Check
  const submittedNonce = payload?.votingNonce || payload?._votingNonce
  if (enrollment.voting_nonce && submittedNonce && submittedNonce !== enrollment.voting_nonce) {
    throw new ApiError(400, 'Invalid or expired voting session token. Please refresh your ballot and try again.')
  }

  // Handle selections payload format
  const selections = payload?.selections || payload

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
    .select('id, event_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
    .eq('event_id', eventId)

  if (posErr) throw new ApiError(500, posErr.message)

  const mappedPositions = (positions ?? []).map(mapPosition)
  validateBallotSelections(mappedPositions, selections)

  const positionIds = new Set(mappedPositions.map((p) => p.id))
  const voteRows = []

  const allCandidateIds = Object.values(selections).filter(Array.isArray).flat()
  const { data: validCandidates } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .select('id, position_id')
    .in('id', allCandidateIds)

  const validCandidateMap = new Map(
    (validCandidates ?? []).map((c) => [`${c.position_id}-${c.id}`, true])
  )

  for (const [positionId, candidateIds] of Object.entries(selections)) {
    if (positionId === 'votingNonce' || positionId === '_votingNonce') continue
    if (!positionIds.has(positionId)) {
      throw new ApiError(400, 'Invalid position in ballot')
    }
    if (!Array.isArray(candidateIds)) continue

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

  // Atomic write: the RPC flips has_voted (FALSE→TRUE) and inserts every ballot
  // row inside a single Postgres transaction. Either the whole ballot commits or
  // nothing does — no more "locked out with zero votes" window. See migration
  // 059_election_cast_ballot_rpc.sql. `committed === false` means the voter had
  // already voted (or is not enrolled) so nothing was claimed or recorded.
  const { data: committed, error: castErr } = await getClient().rpc('cast_election_ballot', {
    p_event_id: eventId,
    p_voter_id: voterId,
    p_votes: voteRows,
  })

  if (castErr) {
    if (castErr.code === '23505') {
      throw new ApiError(409, 'You have already submitted your vote for this event')
    }
    throw new ApiError(500, castErr.message)
  }
  if (committed === false) {
    throw new ApiError(409, 'You have already submitted your vote for this event')
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
  const { count: votedCount } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)
    .eq('has_voted', true)

  const { count: totalVoters } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)

  const { count: votesCast } = await getClient()
    .from(DB_TABLES.ELECTION_VOTES)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const turnoutRate = computeTurnoutRate(votedCount, totalVoters)

  emitToEventOrganizer(eventId, 'election:vote-submitted', {
    eventId,
    votesCast: votesCast ?? 0,
    votedCount: votedCount ?? 0,
    totalVoters: totalVoters ?? 0,
    turnoutRate,
  })

  // Trigger organizer dashboard stats refresh
  const organizerId = event.organizations?.organizer_id
  if (organizerId) {
    invalidateDashboardCache(organizerId)
    emitToUser(organizerId, 'organizer:stats-updated', { eventId })
  }

  // Trigger admin platform stats refresh
  emitToRole('admin', 'platform:stats-updated', {})

  // Audit the vote cast (fire-and-forget; never throws). Record ONLY that a
  // ballot was submitted and how many selections it held — never the vote
  // choices themselves, to preserve secret-ballot confidentiality.
  recordEventActivity({
    eventId,
    action: 'election.vote.cast',
    userId: voterId,
    module: 'election',
    details: { selectionCount: voteRows.length },
  })

  return { success: true, message: 'Ballot submitted successfully', locked: true }
}

export async function listVoterElectionEvents(voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      `
      has_voted,
      events (
        id,
        title,
        description,
        banner,
        voting_enabled,
        results_visibility,
        status,
        event_type,
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
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)

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
    getClient()
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER),
    getClient()
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)
      .eq('has_voted', true),
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
  const turnoutPercentage = computeTurnoutRate(voted, total)

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
    .select('id, event_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
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

// ——— Time-Series Analytics (H3) ———

export async function getElectionVotingTimeline(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const { data: votes, error } = await getClient()
    .from(DB_TABLES.ELECTION_VOTES)
    .select('created_at, voter_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)

  const hourlyMap = new Map()
  const dailyMap = new Map()

  for (const v of votes ?? []) {
    if (!v.created_at) continue
    const date = new Date(v.created_at)
    
    // Hourly bucket: YYYY-MM-DD HH:00
    const hourKey = `${date.toISOString().slice(0, 13)}:00`
    hourlyMap.set(hourKey, (hourlyMap.get(hourKey) || 0) + 1)

    // Daily bucket: YYYY-MM-DD
    const dayKey = date.toISOString().slice(0, 10)
    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1)
  }

  const hourlyTimeline = Array.from(hourlyMap.entries()).map(([period, votes]) => ({ period, votes }))
  const dailyTimeline = Array.from(dailyMap.entries()).map(([period, votes]) => ({ period, votes }))

  return {
    eventId,
    totalVotes: votes?.length ?? 0,
    hourly: hourlyTimeline,
    daily: dailyTimeline,
  }
}

// ——— Organizer Ballot Preview (M3) ———

export async function getBallotPreview(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }

  const positions = await listPositions(eventId, organizerId)
  const candidates = await listCandidates(eventId, organizerId)

  const byPosition = positions.map((p) => ({
    ...p,
    candidates: candidates.filter((c) => c.positionId === p.id),
  }))

  return {
    event: mapEvent(event),
    positions: byPosition,
    isPreview: true,
  }
}

// ——— Event Duplication (M5) ———

export async function duplicateElectionEvent(eventId, organizerId) {
  const original = await assertOrganizerOwnsEvent(eventId, organizerId)

  // Create new event
  const newTitle = `${original.title} (Copy)`
  const newEventPayload = {
    title: newTitle,
    description: original.description,
    banner: original.banner,
    startDate: null,
    endDate: null,
    status: 'draft',
    resultsVisibility: original.results_visibility ?? 'public',
  }

  const newEvent = await createElectionEvent(organizerId, newEventPayload)

  // Duplicate positions
  const originalPositions = await listPositions(eventId, organizerId)
  const positionIdMap = new Map()

  for (const pos of originalPositions) {
    const newPos = await createPosition(newEvent.id, organizerId, {
      name: pos.name,
      description: pos.description,
      maxVote: pos.maxVote,
      numberOfWinners: pos.numberOfWinners,
      displayOrder: pos.displayOrder,
      allowSkip: pos.allowSkip,
    })
    positionIdMap.set(pos.id, newPos.id)
  }

  // Duplicate candidates
  const originalCandidates = await listCandidates(eventId, organizerId)
  for (const cand of originalCandidates) {
    const newPosId = positionIdMap.get(cand.positionId)
    if (newPosId) {
      await createCandidate(newEvent.id, organizerId, newPosId, {
        name: cand.name,
        photo: cand.photo,
        description: cand.description,
        biography: cand.biography,
        platform: cand.platform,
        partylist: cand.party || cand.partylist,
      })
    }
  }

  await recordAudit({
    userId: organizerId,
    action: 'election.event.duplicate',
    entity: 'events',
    entityId: newEvent.id,
    details: { originalEventId: eventId, newTitle },
  })

  return newEvent
}

// ——— Election Finalization (L1) ———

export async function finalizeElectionEvent(eventId, organizerId) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({
      voting_enabled: false,
      status: 'completed',
      election_status: 'finalized',
    })
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  await recordAudit({
    userId: organizerId,
    action: 'election.event.finalize',
    entity: 'events',
    entityId: eventId,
    details: { title: data.title, finalizedAt: new Date().toISOString() },
  })

  invalidateDashboardCache(organizerId)
  emitToEvent(eventId, 'election:finalized', { eventId })

  return mapEvent(data)
}

// ——— Publish (finish setup → release to schedule) ———

/**
 * Publish a fully-built election that is still in the `draft` (setup) state.
 *
 * Publishing does NOT open voting. It only releases the event from the setup
 * flow into the normal schedule-driven lifecycle by flipping `draft` →
 * `scheduled`; the schedule sync then reconciles it to `scheduled` / `active` /
 * `completed` based purely on the event's start/end dates. Voting timing always
 * comes from the dates, never from this action.
 *
 * Guarded so an event can only be published once, and only when it has the
 * minimum content needed to run: at least one position, one candidate, and one
 * registered voter.
 */
export async function publishElectionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }
  if (event.status !== 'draft') {
    throw new ApiError(400, 'This event has already been published')
  }

  const positions = await listPositions(eventId, organizerId)
  if (positions.length === 0) {
    throw new ApiError(400, 'Add at least one position before publishing.')
  }

  const candidates = await listCandidates(eventId, organizerId)
  if (candidates.length === 0) {
    throw new ApiError(400, 'Add at least one candidate before publishing.')
  }

  const { count: voterCount, error: voterErr } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)

  if (voterErr) throw new ApiError(500, voterErr.message)
  if (!voterCount || voterCount === 0) {
    throw new ApiError(400, 'Register at least one voter before publishing.')
  }

  const { error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ status: 'scheduled' })
    .eq('id', eventId)

  if (error) throw new ApiError(500, error.message)

  // Hand the event to the scheduler; it decides scheduled/active/completed
  // purely from the dates. The status may change again immediately here.
  await syncEventSchedules().catch((err) => {
    console.error('[election] schedule sync failed after publish:', err.message)
  })

  await recordAudit({
    userId: organizerId,
    action: 'election.event.publish',
    entity: 'events',
    entityId: eventId,
    details: { title: event.title },
  })

  invalidateDashboardCache(organizerId)

  // Re-read so the returned status reflects any reconciliation the sync applied.
  const published = await getEventById(eventId)
  return mapEvent(published)
}
