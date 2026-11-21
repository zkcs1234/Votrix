import { Link } from 'react-router-dom'
import { Plus, Edit2, Eye } from 'lucide-react'
import { EVENT_STATUS, isSetupLocked } from '@/utils/constants'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'

// Shared building blocks for the organizer event lists (Election, Polling,
// Competition), so the three pages cannot drift apart again. Each page keeps its
// own data loading and its own extras (preview modal, Live Control…); everything
// the organizer sees on a card — status, the Edit/View button, the order of the
// actions — comes from here.

export function EventListHeader({ title, newEventPath }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-semibold text-v-text">{title}</h2>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
        <Link to={newEventPath} className="v-btn-primary">
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          New event
        </Link>
      </div>
    </div>
  )
}

function statusTone(status) {
  if (status === EVENT_STATUS.ACTIVE) return 'success'
  if (status === EVENT_STATUS.CANCELLED) return 'danger'
  return 'default'
}

// The button that opens an event's details. Setup is editable only while the
// event is a draft, so the label tells the truth about what the next screen
// allows: "Edit" while it can be changed, "View" once it is locked.
export function EventEditViewLink({ to, status }) {
  const locked = isSetupLocked(status)
  const Icon = locked ? Eye : Edit2
  return (
    <Link to={to} className="v-btn-secondary">
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      {locked ? 'View' : 'Edit'}
    </Link>
  )
}

/**
 * One event row.
 *
 * `actions` are the module's own extras (Preview, Live Control…) and render
 * before the shared "Continue setup" (drafts only) and Edit/View buttons.
 */
export default function EventListCard({
  module,
  event,
  titleHref,
  editHref,
  continueSetupHref,
  badges = null,
  actions = null,
}) {
  const headingId = `${module}-event-${event.id}`
  return (
    <article
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-v-border bg-v-surface p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 id={headingId} className="min-w-0 wrap-break-word text-lg font-medium text-v-text">
            <Link to={titleHref} className="hover:text-v-primary">
              {event.title}
            </Link>
          </h3>
          <Badge tone={statusTone(event.status)} className="capitalize">
            {event.status === EVENT_STATUS.DRAFT ? 'Setup — not published' : event.status}
          </Badge>
          {badges}
        </div>
        {event.description && (
          <p className="mt-2 whitespace-pre-line wrap-break-word text-sm text-v-text-muted">{event.description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
        {actions}
        {event.status === EVENT_STATUS.DRAFT && continueSetupHref && (
          <Link to={continueSetupHref} className="v-btn-primary">
            Continue setup
          </Link>
        )}
        <EventEditViewLink to={editHref} status={event.status} />
      </div>
    </article>
  )
}

export function EventListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-v-border bg-v-surface p-5">
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="h-9 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EventListEmpty({ title, hint }) {
  return (
    <div className="rounded-2xl border border-v-border bg-v-surface p-6 text-center">
      <p className="font-medium text-v-text">{title}</p>
      <p className="v-caption mt-1">{hint}</p>
    </div>
  )
}

// Load failure with a retry, so a failed request is never shown as "no events".
export function EventListError({ message, retryLabel, onRetry }) {
  return (
    <div className="space-y-3">
      <FormAlert variant="error">{message}</FormAlert>
      <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>
    </div>
  )
}
