// Phase 9 — refactored to use the shared `foundation/` helpers
// (`db`, `wrap`, `mapEvent`, error factories). Behaviour and the exported
// surface are unchanged; existing controllers/services keep working.

import { db, wrap } from '../foundation/db.js'
import { notFound, forbidden, badRequest } from '../foundation/errors.js'
import { DB_TABLES, COMPETITION_SCORING_EVENT_TYPES } from '../utils/constants.js'
import { sendEventNotificationEmail } from './mailer.service.js'
import { createNotificationsForUsers } from './notification.service.js'

export async function getEventById(eventId) {
  const data = wrap(
    await db()
      .from(DB_TABLES.EVENTS)
      .select(
        `
        *,
        organizations (
          id,
          organization_name,
          logo,
          organizer_id
        )
      `,
      )
      .eq('id', eventId)
      .maybeSingle(),
    { notFoundMessage: 'Event not found', context: 'event.getEventById' },
  )
  return data
}

export async function assertOrganizerOwnsEvent(eventId, organizerId) {
  const event = await getEventById(eventId)
  if (event.organizations?.organizer_id !== organizerId) {
    throw forbidden('You do not have access to this event')
  }
  return event
}

export async function getEventVoterAccounts(eventId) {
  const data = wrap(
    await db()
      .from(DB_TABLES.EVENT_VOTERS)
      .select(
        `
        voter_id,
        users (
          id,
          email,
          role
        )
      `,
      )
      .eq('event_id', eventId),
    { context: 'event.getEventVoterAccounts' },
  )

  return (data ?? [])
    .map((row) => row.users)
    .filter((u) => u?.email && u?.role === 'voter')
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export async function notifyEventParticipants(eventId, organizerId, { message }) {
  const event = await assertOrganizerOwnsEvent(eventId, organizerId)
  const voters = await getEventVoterAccounts(eventId)

  if (!voters.length) {
    return { sent: 0, failed: 0, total: 0, message: 'No voters enrolled for this event' }
  }

  const defaultMessage =
    message?.trim() ||
    `There is an update regarding "${event.title}". Please sign in to view details and participate.`

  const results = await Promise.all(
    voters.map((voter) =>
      sendEventNotificationEmail({
        email: voter.email,
        eventTitle: event.title,
        eventId: event.id,
        message: defaultMessage,
        organizationName: event.organizations?.organization_name,
        startDate: formatDate(event.start_date),
        endDate: formatDate(event.end_date),
      }),
    ),
  )

  const sent = results.filter((r) => r.sent).length
  const failed = results.length - sent

  const successfulVoterIds = voters
    .filter((_voter, index) => results[index]?.sent)
    .map((voter) => voter.id)

  if (successfulVoterIds.length) {
    await createNotificationsForUsers(successfulVoterIds, {
      type: 'event.notification',
      title: `New update for ${event.title}`,
      message: defaultMessage,
      actionUrl: COMPETITION_SCORING_EVENT_TYPES.has(event.event_type)
        ? `/voter/competition/events/${event.id}/score`
        : event.event_type === 'polling'
          ? `/voter/polling/events/${event.id}`
          : `/voter/events/${event.id}`,
      entity: 'events',
      entityId: event.id,
      metadata: {
        eventType: event.event_type,
        organizationName: event.organizations?.organization_name,
      },
    })
  }

  return {
    sent,
    failed,
    total: voters.length,
    message: `Notification sent to ${sent} of ${voters.length} voter(s)`,
  }
}
