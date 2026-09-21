import { db } from '../foundation/db.js'
import { DB_TABLES, EVENT_TYPES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { isWithinEventSchedule } from '../utils/eventSchedule.js'
import { emitToEvent } from '../websocket/ws-emitter.js'
import { notifyOrganizerEventStatus } from './notification.service.js'

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

function getDesiredState(event, now, liveEventIds, completedEventIds) {
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
    // Competition status is driven ENTIRELY by the LIVE SESSION, not the
    // calendar: the organizer opens/closes scoring from Live Control
    // (startSession/completeSession). This is the source of truth everywhere
    // events.status is read (admin Global Events, voter dashboard passthrough,
    // reports) and it self-heals events whose status/scoring_enabled drifted.
    //   - active/paused session → scoring open (active)
    //   - a completed session (and none currently live) → completed
    //   - never ran a session → 'scheduled'; it is NEVER marked completed from
    //     the planned end_date, so a competition that simply passed its planned
    //     window without ever running does not falsely show as completed.
    if (liveEventIds.has(event.id)) {
      return { scoring_enabled: true, status: 'active' }
    }
    if (completedEventIds.has(event.id)) {
      return { scoring_enabled: false, status: 'completed' }
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

async function reconcileEvent(event, now, liveEventIds, completedEventIds) {
  const desiredState = getDesiredState(event, now, liveEventIds, completedEventIds)
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

  // Tell the organizer when the scheduler flips their event open or closed.
  // Non-fatal: a notification failure must never break schedule reconciliation.
  if (updates.status === 'active' || updates.status === 'completed') {
    await notifyOrganizerOfStatusChange(event.id, updates.status).catch((err) =>
      console.error('[schedule-sync] organizer status notification failed (non-fatal):', err.message),
    )
  }

  return true
}

// Resolve the event's title and owning organizer, then notify them. Only runs on
// an actual open/close transition, so the extra lookup is rare.
async function notifyOrganizerOfStatusChange(eventId, status) {
  const { data } = await db()
    .from(DB_TABLES.EVENTS)
    .select('id, title, event_type, organizations ( organizer_id )')
    .eq('id', eventId)
    .single()

  if (!data) return
  await notifyOrganizerEventStatus({
    organizerId: data.organizations?.organizer_id,
    eventId: data.id,
    title: data.title,
    eventType: data.event_type,
    status,
  })
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

    // Competition status is session-driven: fetch the events with a live
    // (active/paused) session and the events with a completed session so
    // getDesiredState can derive status from the session, not the calendar.
    const [{ data: liveSessions }, { data: completedSessions }] = await Promise.all([
      db().from('competition_sessions').select('event_id').in('status', ['active', 'paused']),
      db().from('competition_sessions').select('event_id').eq('status', 'completed'),
    ])
    const liveEventIds = new Set((liveSessions ?? []).map((s) => s.event_id))
    const completedEventIds = new Set((completedSessions ?? []).map((s) => s.event_id))

    // The main query only pulls status draft/scheduled/active, so a competition
    // already marked 'completed' would be skipped. Pull competition events back
    // in when they either (a) have a live session that outlived the planned end
    // (re-open scoring), or (b) are currently 'completed' — so a status wrongly
    // set from the calendar self-heals to what the session actually says.
    const events = [...(data ?? [])]
    const knownIds = new Set(events.map((e) => e.id))
    const columns =
      'id, event_type, status, start_date, end_date, voting_enabled, scoring_enabled, polling_enabled, poll_expires_at'

    const missingLiveIds = [...liveEventIds].filter((id) => !knownIds.has(id))
    if (missingLiveIds.length) {
      const { data: extra } = await db().from(DB_TABLES.EVENTS).select(columns).in('id', missingLiveIds)
      for (const e of extra ?? []) {
        events.push(e)
        knownIds.add(e.id)
      }
    }

    const { data: completedComp } = await db()
      .from(DB_TABLES.EVENTS)
      .select(columns)
      .in('event_type', [...COMPETITION_SCORING_EVENT_TYPES])
      .eq('status', 'completed')
    for (const e of completedComp ?? []) {
      if (!knownIds.has(e.id)) {
        events.push(e)
        knownIds.add(e.id)
      }
    }

    for (const event of events) {
      try {
        const changed = await reconcileEvent(event, now, liveEventIds, completedEventIds)
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