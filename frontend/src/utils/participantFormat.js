// Small display helpers shared by the participant pages (overview, my events,
// history, results).

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value) {
  const date = toDate(value)
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export function formatDate(value) {
  const date = toDate(value)
  return date ? date.toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'
}

/** "Mar 10 – Mar 12, 2026", a single date, or an em dash. */
export function formatWindow(start, end) {
  const from = toDate(start)
  const to = toDate(end)
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`
  return formatDate(from ?? to)
}

/** "November 2026" heading used to group History rows. */
export function monthHeading(value) {
  const date = toDate(value)
  return date ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Date unknown'
}

export const EVENT_TYPE_LABEL = {
  election: 'Election',
  polling: 'Poll',
  competition_scoring: 'Competition',
}

/** Where a participant opens an event, by type. */
export function eventPath(eventType, eventId) {
  if (eventType === 'polling') return `/participant/polling/events/${eventId}`
  if (eventType === 'competition_scoring') return `/participant/competition/events/${eventId}/score`
  return `/participant/events/${eventId}`
}

export const OUTCOME_TONE = { Submitted: 'success', Partial: 'warning', Missed: 'neutral' }

/** Why a History row did not end in a complete submission, in plain language. */
export function outcomeReason(row) {
  if (row.outcome === 'Partial') return 'Voting closed before every section was submitted.'
  if (row.outcome !== 'Missed') return null
  if (row.eventType === 'election') return 'You were enrolled, but voting closed before you submitted a ballot.'
  if (row.eventType === 'polling') return 'The poll closed before you responded.'
  return 'The round closed before your scores were submitted.'
}
