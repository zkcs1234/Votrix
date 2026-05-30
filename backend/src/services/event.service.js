import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'
import { sendEventNotificationEmail } from './mailer.service.js'

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

export async function getEventById(eventId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select(
      `
      *,
      organizations (
        id,
        organization_name,
        organizer_id
      )
    `,
    )
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Event not found')
  return data
}

export async function assertOrganizerOwnsEvent(eventId, organizerId) {
  const event = await getEventById(eventId)

  if (event.organizations?.organizer_id !== organizerId) {
    throw new ApiError(403, 'You do not have access to this event')
  }

  return event
}

export async function getEventVoterEmails(eventId) {
  const { data, error } = await getClient()
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
    .eq('event_id', eventId)

  if (error) throw new ApiError(500, error.message)

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
  const voters = await getEventVoterEmails(eventId)

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

  return {
    sent,
    failed,
    total: voters.length,
    message: `Notification sent to ${sent} of ${voters.length} voter(s)`,
  }
}
