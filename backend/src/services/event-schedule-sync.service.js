import { db } from '../foundation/db.js'
import { DB_TABLES, EVENT_TYPES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { isWithinEventSchedule } from '../utils/eventSchedule.js'
import { emitToEvent } from '../websocket/ws-emitter.js'

let syncTimer = null
let syncInFlight = false

// Modules whose "publish at the end of setup" flow keeps an event in the
// `draft` (setup) state until the organizer explicitly publishes it. For these,
// a draft is deliberately excluded from schedule-driven activation: an
// unpublished event must never open voting/scoring/polling on its own, no matter
// what its start/end dates say. Publishing (see each module's publish*Event
// service) flips the status to 'scheduled', at which point the schedule below
// takes over. Competition/pageant is included too: it also builds as a draft and
// is published at the end of setup; its scoring still goes live via Live Control.
const PUBLISH_GATED_EVENT_TYPES = new Set([
  EVENT_TYPES.ELECTION,
  EVENT_TYPES.POLLING,
  ...COMPETITION_SCORING_EVENT_TYPES,
])

function getDesiredState(event, now, liveEventIds) {
  if (event.status === 'draft' && PUBLISH_GATED_EVENT_TYPES.has(event.event_type)) {
    return null
  }

  const withinSchedule = isWithinEventSchedule(event, now)
  const pastEnd = Boolean(event.end_date && new Date(event.end_date) < now)

  if (event.event_type === EVENT_TYPES.ELECTION) {
    if (pastEnd) {
      return { voting_enabled: false, status: 'completed' }
    }
    if (withinSchedule || event.status === 'active') {
      return { voting_enabled: true, status: 'active' }
    }
    return { voting_enabled: false, status: 'scheduled' }
  }

  if (COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    // Competition scoring follows the LIVE SESSION, not the calendar: the
    // organizer opens/closes it from Live Control (startSession/completeSession).
    // So an active or paused session means scoring is open, regardless of the
    // planned start/end dates — otherwise a past-end (or not-yet-started) event
    // would have its running session forced off within a minute. Deriving from
    // the session here also self-heals events whose scoring_enabled drifted.
    const hasLiveSession = liveEventIds.has(event.id)
    if (hasLiveSession) {
      return { scoring_enabled: true, status: 'active' }
    }
    if (pastEnd) {
      return { scoring_enabled: false, status: 'completed' }
    }
    return { scoring_enabled: false, status: withinSchedule || event.status === 'active' ? 'active' : 'scheduled' }
  }

  if (event.event_type === EVENT_TYPES.POLLING) {
    const pastPollExpiry = Boolean(event.poll_expires_at && new Date(event.poll_expires_at) < now)
    if (pastEnd || pastPollExpiry) {
      return { polling_enabled: false, status: 'completed' }
    }
    if (withinSchedule || event.status === 'active') {
      return { polling_enabled: true, status: 'active' }
    }
    return { polling_enabled: false, status: 'scheduled' }
  }

  return null
}

async function reconcileEvent(event, now, liveEventIds) {
  const desiredState = getDesiredState(event, now, liveEventIds)
  if (!desiredState) return false

  const updates = {}
  if (desiredState.voting_enabled !== undefined && desiredState.voting_enabled !== event.voting_enabled) {
    updates.voting_enabled = desiredState.voting_enabled
  }
  if (desiredState.scoring_enabled !== undefined && desiredState.scoring_enabled !== event.scoring_enabled) {
    updates.scoring_enabled = desiredState.scoring_enabled
  }
  if (desiredState.polling_enabled !== undefined && desiredState.polling_enabled !== event.polling_enabled) {
    updates.polling_enabled = desiredState.polling_enabled
  }
  if (desiredState.status && desiredState.status !== event.status) {
    updates.status = desiredState.status
  }

  if (!Object.keys(updates).length) {
    return false
  }

  const { error } = await db()
    .from(DB_TABLES.EVENTS)
    .update(updates)
    .eq('id', event.id)

  if (error) throw error

  if (event.event_type === EVENT_TYPES.ELECTION) {
    emitToEvent(event.id, 'election:voting-toggled', {
      eventId: event.id,
      votingEnabled: Boolean(updates.voting_enabled ?? event.voting_enabled),
    })
  } else if (COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)) {
    emitToEvent(event.id, 'competition:scoring-toggled', {
      eventId: event.id,
      scoringEnabled: Boolean(updates.scoring_enabled ?? event.scoring_enabled),
    })
  } else if (event.event_type === EVENT_TYPES.POLLING) {
    emitToEvent(event.id, 'poll:polling-toggled', {
      eventId: event.id,
      pollingEnabled: Boolean(updates.polling_enabled ?? event.polling_enabled),
    })
  }

  return true
}

export async function syncEventSchedules() {
  if (syncInFlight) return { updated: 0 }
  syncInFlight = true

  const now = new Date()
  let updated = 0

  try {
    const { data, error } = await db()
      .from(DB_TABLES.EVENTS)
      .select('id, event_type, status, start_date, end_date, voting_enabled, scoring_enabled, polling_enabled, poll_expires_at')
      .in('event_type', [EVENT_TYPES.ELECTION, EVENT_TYPES.POLLING, ...Array.from(COMPETITION_SCORING_EVENT_TYPES)])
      .in('status', ['draft', 'scheduled', 'active'])

    if (error) throw error

    // Competition scoring is session-driven: fetch the events that currently have
    // an active/paused live session so getDesiredState can keep their scoring open
    // regardless of the calendar (and close it once the session ends).
    const { data: liveSessions } = await db()
      .from('competition_sessions')
      .select('event_id')
      .in('status', ['active', 'paused'])
    const liveEventIds = new Set((liveSessions ?? []).map((s) => s.event_id))

    // A live session can outlive the planned end date, which the schedule may have
    // already marked 'completed' — excluding it from the query above. Pull those
    // back in so their scoring is re-opened to match the running session.
    const events = [...(data ?? [])]
    const knownIds = new Set(events.map((e) => e.id))
    const missingLiveIds = [...liveEventIds].filter((id) => !knownIds.has(id))
    if (missingLiveIds.length) {
      const { data: extra } = await db()
        .from(DB_TABLES.EVENTS)
        .select('id, event_type, status, start_date, end_date, voting_enabled, scoring_enabled, polling_enabled, poll_expires_at')
        .in('id', missingLiveIds)
      for (const e of extra ?? []) events.push(e)
    }

    for (const event of events) {
      try {
        const changed = await reconcileEvent(event, now, liveEventIds)
        if (changed) updated += 1
      } catch (err) {
        console.error('[event-schedule-sync] Failed to reconcile event', event.id, err.message)
      }
    }

    return { updated }
  } finally {
    syncInFlight = false
  }
}

export function startEventScheduleSync(intervalMs = 60_000) {
  if (syncTimer) return syncTimer

  void syncEventSchedules().catch((err) => {
    console.error('[event-schedule-sync] Initial sync failed:', err.message)
  })

  syncTimer = setInterval(() => {
    void syncEventSchedules().catch((err) => {
      console.error('[event-schedule-sync] Periodic sync failed:', err.message)
    })
  }, intervalMs)

  return syncTimer
}