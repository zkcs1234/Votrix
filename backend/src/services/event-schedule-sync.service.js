import { db } from '../foundation/db.js'
import { DB_TABLES, EVENT_TYPES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { isWithinEventSchedule } from '../utils/eventSchedule.js'
import { emitToEvent } from '../websocket/ws-emitter.js'

let syncTimer = null
let syncInFlight = false

function getDesiredState(event, now) {
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
    if (pastEnd) {
      return { scoring_enabled: false, status: 'completed' }
    }
    if (withinSchedule || event.status === 'active') {
      return { scoring_enabled: true, status: 'active' }
    }
    return { scoring_enabled: false, status: 'scheduled' }
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

async function reconcileEvent(event, now) {
  const desiredState = getDesiredState(event, now)
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

    for (const event of data ?? []) {
      try {
        const changed = await reconcileEvent(event, now)
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