import { randomUUID } from 'node:crypto'
import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, EVENT_STATUS, EVENT_TYPES, PARTICIPANT_TYPES } from '../utils/constants.js'
import { isElectionVotingOpen, canVoterViewElectionResults } from '../utils/eventSchedule.js'
import { assertOrganizerOwnsEvent, getEventById } from './event.service.js'
import { getOrganizerScope, isStudentInScope, isAllAccess } from './organizer-scope.service.js'
import { getOrCreateElectionOrganization, mapOrganization } from './organization.service.js'
import { emitToEvent, emitToEventOrganizer, emitToUser, emitToRole } from '../websocket/ws-emitter.js'
import { mapEvent } from '../foundation/mapper.js'
import { recordAudit } from '../foundation/audit.js'
import { recordEventActivity } from '../foundation/activity.js'
import { syncEventSchedules } from './event-schedule-sync.service.js'
import { notifyAdminsEventPublished } from './notification.service.js'
import {
  assertEventUpdateAllowed,
  assertSetupEditable,
  assertParticipantsEditable,
  canUnpublishEventStatus,
} from '../utils/eventLifecycle.js'
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
    ballotSectionId: row.ballot_section_id,
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
      .neq('status', EVENT_STATUS.ARCHIVED)
      .order('created_at', { ascending: false })

    if (error) throw new ApiError(500, error.message)

    const eventIds = (events ?? []).map((e) => e.id)
    let registeredVoters = 0
    let votedCount = 0
    let votesCast = 0
    // Per-event participation so the dashboard can show an honest breakdown
    // instead of a single turnout rate blended across every election.
    const perEvent = new Map(eventIds.map((id) => [id, { registered: 0, voted: 0 }]))

    if (eventIds.length) {
      const [participantsRes, votesRes] = await Promise.all([
        getClient()
          .from(DB_TABLES.EVENT_PARTICIPANTS)
          .select('event_id, has_voted')
          .in('event_id', eventIds)
          .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER),
        getClient()
          .from(DB_TABLES.ELECTION_VOTES)
          .select('*', { count: 'exact', head: true })
          .in('event_id', eventIds),
      ])

      if (participantsRes.error) throw new ApiError(500, participantsRes.error.message)
      if (votesRes.error) throw new ApiError(500, votesRes.error.message)

      for (const row of participantsRes.data ?? []) {
        const bucket = perEvent.get(row.event_id)
        if (!bucket) continue
        bucket.registered += 1
        if (row.has_voted) bucket.voted += 1
        registeredVoters += 1
        if (row.has_voted) votedCount += 1
      }
      votesCast = votesRes.count ?? 0
    }

    const turnoutRate = computeTurnoutRate(votedCount, registeredVoters)

    const eventBreakdown = (events ?? []).map((e) => {
      const b = perEvent.get(e.id) ?? { registered: 0, voted: 0 }
      return {
        id: e.id,
        title: e.title,
        status: e.status,
        registered: b.registered,
        participated: b.voted,
        rate: computeTurnoutRate(b.voted, b.registered),
      }
    })

    const result = {
      organization: mapOrganization(org),
      events: (events ?? []).map(mapEvent),
      eventBreakdown,
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
    .neq('status', EVENT_STATUS.ARCHIVED)
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

  const { error: sectionError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .insert({ event_id: data.id, name: 'Main Election', display_order: 0 })

  if (sectionError) {
    await getClient().from(DB_TABLES.EVENTS).delete().eq('id', data.id)
    throw new ApiError(500, sectionError.message)
  }

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
  assertSetupEditable(event)

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

export async function getElectionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'This event is not an election')
  }
  return mapEvent(event)
}

// ——— Positions ———

async function assertElectionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'This event is not an election')
  }
  return event
}

async function getDefaultBallotSection(eventId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .select('id, event_id, name, description, display_order, created_at')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(409, 'Election event has no ballot sections')
  return data
}

function mapBallotSection(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description ?? null,
    displayOrder: row.display_order ?? 0,
  }
}

export async function listElectionBallotSections(eventId, organizerId) {
  await assertElectionEvent(eventId, organizerId)
  const { data, error } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .select('id, event_id, name, description, display_order, created_at')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapBallotSection)
}

export async function createElectionBallotSection(eventId, organizerId, payload) {
  assertSetupEditable(await assertElectionEvent(eventId, organizerId))
  const sections = await listElectionBallotSections(eventId, organizerId)
  const displayOrder = payload.displayOrder ?? sections.length
  const { data, error } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .insert({
      event_id: eventId,
      name: payload.name,
      description: payload.description ?? null,
      display_order: displayOrder,
    })
    .select('id, event_id, name, description, display_order, created_at')
    .single()

  if (error) throw new ApiError(500, error.message)
  await recordAudit({
    userId: organizerId,
    action: 'election.section.create',
    entity: 'election_ballot_sections',
    entityId: data.id,
    details: { eventId, name: data.name },
  })
  return mapBallotSection(data)
}

export async function updateElectionBallotSection(eventId, organizerId, sectionId, payload) {
  assertSetupEditable(await assertElectionEvent(eventId, organizerId))
  const updates = {}
  if (payload.name !== undefined) updates.name = payload.name
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.displayOrder !== undefined) updates.display_order = payload.displayOrder
  if (!Object.keys(updates).length) throw new ApiError(400, 'No section changes provided')

  const { data, error } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .update(updates)
    .eq('id', sectionId)
    .eq('event_id', eventId)
    .select('id, event_id, name, description, display_order, created_at')
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Ballot section not found')
  await recordAudit({
    userId: organizerId,
    action: 'election.section.update',
    entity: 'election_ballot_sections',
    entityId: sectionId,
    details: { eventId, changedKeys: Object.keys(updates) },
  })
  return mapBallotSection(data)
}

export async function deleteElectionBallotSection(eventId, organizerId, sectionId) {
  assertSetupEditable(await assertElectionEvent(eventId, organizerId))
  const sections = await listElectionBallotSections(eventId, organizerId)
  if (sections.length <= 1) throw new ApiError(409, 'An election must have at least one ballot section')

  const { count: submissionCount, error: submissionError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('ballot_section_id', sectionId)
  if (submissionError) throw new ApiError(500, submissionError.message)
  if ((submissionCount ?? 0) > 0) throw new ApiError(409, 'Cannot delete a section with submitted ballots')

  const { data: section } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .select('id, name')
    .eq('id', sectionId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!section) throw new ApiError(404, 'Ballot section not found')

  const { error } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .delete()
    .eq('id', sectionId)
    .eq('event_id', eventId)
  if (error) throw new ApiError(500, error.message)

  await recordAudit({
    userId: organizerId,
    action: 'election.section.delete',
    entity: 'election_ballot_sections',
    entityId: sectionId,
    details: { eventId, name: section.name },
  })
}

export async function listPositions(eventId, organizerId, sectionId = null) {
  await assertElectionEvent(eventId, organizerId)
  const section = sectionId
    ? { id: sectionId }
    : await getDefaultBallotSection(eventId)

  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('id, event_id, ballot_section_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
    .eq('event_id', eventId)
    .eq('ballot_section_id', section.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapPosition)
}

async function nextPositionDisplayOrder(eventId, sectionId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('display_order')
    .eq('event_id', eventId)
    .eq('ballot_section_id', sectionId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) return 0
  return (data.display_order ?? 0) + 1
}

export async function createPosition(eventId, organizerId, payload, sectionId = null) {
  assertSetupEditable(await assertElectionEvent(eventId, organizerId))

  const section = sectionId
    ? { id: sectionId }
    : await getDefaultBallotSection(eventId)
  const { data: ownedSection, error: sectionError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .select('id')
    .eq('id', section.id)
    .eq('event_id', eventId)
    .maybeSingle()
  if (sectionError) throw new ApiError(500, sectionError.message)
  if (!ownedSection) throw new ApiError(404, 'Ballot section not found')

  const displayOrder =
    payload.displayOrder !== undefined
      ? payload.displayOrder
      : await nextPositionDisplayOrder(eventId, section.id)

  const { data, error } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .insert({
      event_id: eventId,
      ballot_section_id: section.id,
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
  assertSetupEditable(await assertOrganizerOwnsEvent(eventId, organizerId))

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
  assertSetupEditable(await assertOrganizerOwnsEvent(eventId, organizerId))

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

export async function listCandidates(eventId, organizerId, positionId = null, sectionId = null) {
  await assertOrganizerOwnsEvent(eventId, organizerId)

  let positionIds = []
  if (positionId) {
    if (sectionId) {
      const { data: position, error } = await getClient()
        .from(DB_TABLES.POSITIONS)
        .select('id')
        .eq('id', positionId)
        .eq('event_id', eventId)
        .eq('ballot_section_id', sectionId)
        .maybeSingle()
      if (error) throw new ApiError(500, error.message)
      if (!position) throw new ApiError(404, 'Position not found in this ballot section')
    }
    positionIds = [positionId]
  } else {
    const positions = await listPositions(eventId, organizerId, sectionId)
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
  assertSetupEditable(await assertOrganizerOwnsEvent(eventId, organizerId))

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
  assertSetupEditable(await assertOrganizerOwnsEvent(eventId, organizerId))

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
  assertSetupEditable(await assertOrganizerOwnsEvent(eventId, organizerId))
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
      users!inner (id, email, first_name, last_name, school_id, program, year_section)
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

  let voters = voterRows.map((row) => ({
    id: row.id,
    voterId: row.users?.id,
    email: row.users?.email,
    // Prefer the account profile (admin-managed); fall back to legacy
    // participant-level name columns for pre-migration rows.
    firstName: row.users?.first_name ?? row.first_name,
    lastName: row.users?.last_name ?? row.last_name,
    schoolId: row.users?.school_id ?? null,
    program: row.users?.program ?? null,
    yearSection: row.users?.year_section ?? null,
    hasVoted: row.has_voted,
    createdAt: row.created_at,
    metadata: row.metadata ?? {},
    // Invitation status: true = sent, false = pending, no record = false
    invitationSent: invitationSentByVoter.get(row.user_id) ?? false,
  }))

  // Bound the roster to the organizer's scope (plan O9). No-op for all-access.
  const scope = await getOrganizerScope(organizerId)
  const scoped = !isAllAccess(scope)
  if (scoped) {
    voters = voters.filter((v) => isStudentInScope(scope, { program: v.program, yearSection: v.yearSection }))
  }

  return {
    voters,
    meta: {
      page,
      limit,
      total: scoped ? voters.length : (count ?? 0),
      totalPages: Math.ceil((scoped ? voters.length : (count ?? 0)) / limit),
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

  const { data: sections, error: sectionsError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .select('id, event_id, name, description, display_order, created_at')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (sectionsError) throw new ApiError(500, sectionsError.message)
  if (!sections?.length) throw new ApiError(409, 'Election event has no ballot sections')

  const { data: submissions, error: submissionsError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS)
    .select('ballot_section_id, submitted_at')
    .eq('event_id', eventId)
    .eq('participant_id', enrollment.id)
  if (submissionsError) throw new ApiError(500, submissionsError.message)

  const submittedBySection = new Map(
    (submissions ?? []).map((submission) => [submission.ballot_section_id, submission.submitted_at]),
  )
  const sectionProgress = sections.map((section) => ({
    ...mapBallotSection(section),
    completed: submittedBySection.has(section.id),
    submittedAt: submittedBySection.get(section.id) ?? null,
  }))
  const currentSection = sectionProgress.find((section) => !section.completed) ?? null
  const hasVoted = sectionProgress.every((section) => section.completed)

  if (currentSection && !enrollment.voting_nonce) {
    const { data: updated, error } = await getClient()
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .update({ voting_nonce: randomUUID() })
      .eq('id', enrollment.id)
      .select('id, event_id, user_id, participant_type, has_voted, first_name, last_name, voting_nonce')
      .single()
    if (error) throw new ApiError(500, error.message)
    enrollment = { ...updated, voter_id: updated.user_id, has_voted: Boolean(updated.has_voted) }
  }

  if (!currentSection) {
    return {
      event: mapEvent(event),
      sections: sectionProgress,
      currentSection: null,
      ballotSectionId: null,
      positions: [],
      hasVoted: true,
      sectionSubmitted: false,
      votingNonce: null,
      votingOpen: isElectionVotingOpen(event),
      resultsVisibility: event.results_visibility ?? 'public',
      canViewResults: canVoterViewElectionResults(event),
    }
  }

  const { data: positions, error: posErr } = await getClient()
    .from(DB_TABLES.POSITIONS)
    .select('id, event_id, ballot_section_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
    .eq('event_id', eventId)
    .eq('ballot_section_id', currentSection.id)
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
    sections: sectionProgress,
    currentSection,
    ballotSectionId: currentSection.id,
    positions: byPosition,
    hasVoted: false,
    sectionSubmitted: false,
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
  const ballot = await getVoterBallot(eventId, voterId)
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
  const requestedSectionId = payload?.ballotSectionId
  const legacySingleSectionRequest = !requestedSectionId && ballot.sections.length === 1
  if (
    !ballot.ballotSectionId ||
    (requestedSectionId !== ballot.ballotSectionId && !legacySingleSectionRequest)
  ) {
    throw new ApiError(409, 'This is not the next ballot section available to you')
  }
  if (ballot.votingNonce && submittedNonce !== ballot.votingNonce) {
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
    .select('id, event_id, ballot_section_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
    .eq('event_id', eventId)
    .eq('ballot_section_id', ballot.ballotSectionId)

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

  // The RPC serializes submissions for this voter and commits the section
  // completion together with every vote row.
  const { data: committed, error: castErr } = await getClient().rpc('cast_election_ballot', {
    p_event_id: eventId,
    p_voter_id: voterId,
    p_ballot_section_id: ballot.ballotSectionId,
    p_votes: voteRows,
  })

  if (castErr) {
    if (castErr.code === '23505') {
      throw new ApiError(409, 'You have already submitted this ballot section')
    }
    throw new ApiError(500, castErr.message)
  }
  if (committed === false) {
    throw new ApiError(409, 'This ballot section is already submitted or is not the next section')
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

  const { count: sectionVotedCount } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS)
    .select('*', { count: 'exact', head: true })
    .eq('ballot_section_id', ballot.ballotSectionId)

  const { count: sectionVoters } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)

  const { data: completionState, error: completionError } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select('has_voted')
    .eq('id', enrollment.id)
    .single()
  if (completionError) throw new ApiError(500, completionError.message)

  const turnoutRate = computeTurnoutRate(votedCount, totalVoters)

  emitToEventOrganizer(eventId, 'election:vote-submitted', {
    eventId,
    votesCast: votesCast ?? 0,
    votedCount: votedCount ?? 0,
    totalVoters: totalVoters ?? 0,
    turnoutRate,
    ballotSectionId: ballot.ballotSectionId,
    sectionVotedCount: sectionVotedCount ?? 0,
    sectionVoters: sectionVoters ?? 0,
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
    details: { selectionCount: voteRows.length, ballotSectionId: ballot.ballotSectionId },
  })

  return {
    success: true,
    message: 'Ballot section submitted successfully',
    ballotSectionId: ballot.ballotSectionId,
    eventComplete: Boolean(completionState.has_voted),
  }
}

export async function listVoterElectionEvents(voterId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_PARTICIPANTS)
    .select(
      `
      id,
      has_voted,
      events!inner (
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
          organization_name,
          users ( organization_logo )
        )
      )
    `,
    )
    .eq('user_id', voterId)
    .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER)
    .neq('events.status', EVENT_STATUS.ARCHIVED)

  if (error) throw new ApiError(500, error.message)

  const participants = data ?? []
  const participantIds = participants.map((row) => row.id)
  const eventIds = [...new Set(participants.map((row) => row.events?.id).filter(Boolean))]
  let sectionCountByEvent = new Map()
  let submissionCountByParticipant = new Map()

  if (eventIds.length) {
    const { data: sections, error: sectionError } = await getClient()
      .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
      .select('id, event_id')
      .in('event_id', eventIds)
    if (sectionError) throw new ApiError(500, sectionError.message)
    sectionCountByEvent = new Map()
    for (const section of sections ?? []) {
      sectionCountByEvent.set(section.event_id, (sectionCountByEvent.get(section.event_id) ?? 0) + 1)
    }
  }
  if (participantIds.length) {
    const { data: submissions, error: submissionError } = await getClient()
      .from(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS)
      .select('participant_id')
      .in('participant_id', participantIds)
    if (submissionError) throw new ApiError(500, submissionError.message)
    submissionCountByParticipant = new Map()
    for (const submission of submissions ?? []) {
      submissionCountByParticipant.set(
        submission.participant_id,
        (submissionCountByParticipant.get(submission.participant_id) ?? 0) + 1,
      )
    }
  }

  return participants
    .filter((r) => r.events?.event_type === EVENT_TYPES.ELECTION)
    .map((r) => ({
      ...mapEvent(r.events),
      hasVoted: r.has_voted,
      submittedSections: submissionCountByParticipant.get(r.id) ?? 0,
      totalSections: sectionCountByEvent.get(r.events.id) ?? 1,
    }))
}

// ——— Analytics ———

async function fetchElectionResultsData(eventId) {
  const [
    { count: totalVoters, error: evErr },
    { count: votedCount, error: votedErr },
    { data: participantRows, error: participantErr },
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
    getClient()
      .from(DB_TABLES.EVENT_PARTICIPANTS)
      .select('has_voted, users!inner (program, year_section)')
      .eq('event_id', eventId)
      .eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER),
    getClient().from(DB_TABLES.ELECTION_VOTES).select('candidate_id, position_id').eq('event_id', eventId),
    getClient().from(DB_TABLES.CANDIDATES).select('id, name, position_id, positions!inner(event_id)').eq('positions.event_id', eventId),
  ])

  if (evErr) throw new ApiError(500, evErr.message)
  if (votedErr) throw new ApiError(500, votedErr.message)
  if (participantErr) throw new ApiError(500, participantErr.message)
  if (voteErr) throw new ApiError(500, voteErr.message)
  if (candErr) throw new ApiError(500, candErr.message)

  const voteCountByCandidate = {}
  for (const v of voteRows ?? []) {
    voteCountByCandidate[v.candidate_id] = (voteCountByCandidate[v.candidate_id] || 0) + 1
  }

  const total = totalVoters ?? 0
  const voted = votedCount ?? 0
  const turnoutPercentage = computeTurnoutRate(voted, total)

  const participationBy = (field) => {
    const groups = new Map()
    for (const row of participantRows ?? []) {
      const label = row.users?.[field] || 'Unspecified'
      const current = groups.get(label) ?? { registered: 0, voted: 0 }
      current.registered += 1
      if (row.has_voted) current.voted += 1
      groups.set(label, current)
    }
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .map(([label, counts]) => ({
        label,
        registered: counts.registered,
        voted: counts.voted,
        notVoted: counts.registered - counts.voted,
        turnoutPercentage: computeTurnoutRate(counts.voted, counts.registered),
      }))
  }

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
    .select('id, event_id, ballot_section_id, name, description, max_vote, number_of_winners, display_order, allow_skip')
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
      ballotSectionId: position.ballotSectionId,
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

  const { data: sectionRows, error: sectionError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SECTIONS)
    .select('id, event_id, name, description, display_order, created_at')
    .eq('event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (sectionError) throw new ApiError(500, sectionError.message)

  const sectionNameById = new Map((sectionRows ?? []).map((section) => [section.id, section.name]))
  for (const position of positionSummaries) {
    position.ballotSectionName = sectionNameById.get(position.ballotSectionId) ?? null
  }

  const { data: sectionSubmissionRows, error: sectionSubmissionError } = await getClient()
    .from(DB_TABLES.ELECTION_BALLOT_SUBMISSIONS)
    .select('ballot_section_id')
    .eq('event_id', eventId)
  if (sectionSubmissionError) throw new ApiError(500, sectionSubmissionError.message)

  const submissionsBySection = new Map()
  for (const submission of sectionSubmissionRows ?? []) {
    submissionsBySection.set(
      submission.ballot_section_id,
      (submissionsBySection.get(submission.ballot_section_id) ?? 0) + 1,
    )
  }
  const sectionSummaries = (sectionRows ?? []).map((section) => {
    const sectionPositions = positionSummaries.filter(
      (position) => position.ballotSectionId === section.id,
    )
    const sectionVotedCount = submissionsBySection.get(section.id) ?? 0
    return {
      ...mapBallotSection(section),
      totalVoters: totalVoters ?? 0,
      votedCount: sectionVotedCount,
      turnoutPercentage: computeTurnoutRate(sectionVotedCount, totalVoters ?? 0),
      totalVotes: sectionPositions.reduce((sum, position) => sum + position.totalVotes, 0),
      positionSummaries: sectionPositions,
    }
  })

  return {
    totalVoters: total,
    votedCount: voted,
    turnoutPercentage,
    participationByProgram: participationBy('program'),
    participationByYearSection: participationBy('year_section'),
    liveTotalVotes,
    candidateResults,
    positionSummaries,
    ballotSections: sectionSummaries,
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
    // Only timestamps are needed for the turnout timeline — never pull voter_id
    // here, so the ballot↔identity link is not even loaded (plan D12).
    .select('created_at')
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

  const sections = await listElectionBallotSections(eventId, organizerId)
  const ballotSections = []
  for (const section of sections) {
    const positions = await listPositions(eventId, organizerId, section.id)
    const candidates = await listCandidates(eventId, organizerId, null, section.id)
    ballotSections.push({
      ...section,
      positions: positions.map((position) => ({
        ...position,
        candidates: candidates.filter((candidate) => candidate.positionId === position.id),
      })),
    })
  }

  return {
    event: mapEvent(event),
    sections: ballotSections,
    positions: ballotSections.flatMap((section) =>
      section.positions.map((position) => ({ ...position, ballotSectionName: section.name })),
    ),
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

  const originalSections = await listElectionBallotSections(eventId, organizerId)
  const newSections = await listElectionBallotSections(newEvent.id, organizerId)
  const sectionIdMap = new Map()
  if (originalSections.length && newSections.length) {
    const firstSection = originalSections[0]
    const defaultSection = newSections[0]
    const updatedDefault = await updateElectionBallotSection(newEvent.id, organizerId, defaultSection.id, {
      name: firstSection.name,
      description: firstSection.description,
      displayOrder: firstSection.displayOrder,
    })
    sectionIdMap.set(firstSection.id, updatedDefault.id)

    for (const section of originalSections.slice(1)) {
      const createdSection = await createElectionBallotSection(newEvent.id, organizerId, {
        name: section.name,
        description: section.description,
        displayOrder: section.displayOrder,
      })
      sectionIdMap.set(section.id, createdSection.id)
    }
  }

  const positionIdMap = new Map()

  for (const section of originalSections) {
    const originalPositions = await listPositions(eventId, organizerId, section.id)
    const newSectionId = sectionIdMap.get(section.id)
    for (const pos of originalPositions) {
      const newPos = await createPosition(newEvent.id, organizerId, {
        name: pos.name,
        description: pos.description,
        maxVote: pos.maxVote,
        numberOfWinners: pos.numberOfWinners,
        displayOrder: pos.displayOrder,
        allowSkip: pos.allowSkip,
      }, newSectionId)
      positionIdMap.set(pos.id, newPos.id)
    }
  }

  // Duplicate candidates
  for (const section of originalSections) {
    const originalCandidates = await listCandidates(eventId, organizerId, null, section.id)
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
 * minimum content needed to run: every ballot section has positions and
 * candidates.
 */
export async function publishElectionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }
  if (event.status !== 'draft') {
    throw new ApiError(400, 'This event has already been published')
  }

  const sections = await listElectionBallotSections(eventId, organizerId)
  for (const section of sections) {
    const positions = await listPositions(eventId, organizerId, section.id)
    if (positions.length === 0) {
      throw new ApiError(400, `Add at least one position to ${section.name} before publishing.`)
    }
    const candidates = await listCandidates(eventId, organizerId, null, section.id)
    if (candidates.length === 0) {
      throw new ApiError(400, `Add at least one candidate to ${section.name} before publishing.`)
    }
  }

  // Voters are no longer required at publish time — they are registered and
  // invited after publishing, on the Voters step, within email resend limits.

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

  // Let admins know a new event went live. Non-fatal — never block publishing.
  await notifyAdminsEventPublished({
    eventId,
    title: event.title,
    eventType: EVENT_TYPES.ELECTION,
  }).catch((err) => console.error('[election] admin publish notification failed (non-fatal):', err.message))

  invalidateDashboardCache(organizerId)

  // Re-read so the returned status reflects any reconciliation the sync applied.
  const published = await getEventById(eventId)
  return mapEvent(published)
}

/**
 * Pull a published election back to `draft` so its setup can be corrected.
 *
 * Only allowed while the event is still `scheduled` (published but voting has
 * not opened). Once `active` the schedule owns the event and this is one-way.
 * Drafts are excluded from the schedule sync, so voting stays closed.
 */
export async function unpublishElectionEvent(eventId, organizerId) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)

  if (event.event_type !== EVENT_TYPES.ELECTION) {
    throw new ApiError(400, 'Not an election event')
  }
  if (!canUnpublishEventStatus(event.status)) {
    throw new ApiError(400, 'Only a scheduled event can be unpublished. Voting has already opened or the event is closed.')
  }

  const { error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .update({ status: 'draft', voting_enabled: false })
    .eq('id', eventId)

  if (error) throw new ApiError(500, error.message)

  await recordAudit({
    userId: organizerId,
    action: 'election.event.unpublish',
    entity: 'events',
    entityId: eventId,
    details: { title: event.title },
  })

  invalidateDashboardCache(organizerId)

  const reverted = await getEventById(eventId)
  return mapEvent(reverted)
}
