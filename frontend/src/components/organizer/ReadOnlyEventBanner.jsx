import { Lock } from 'lucide-react'

/**
 * Banner shown on an organizer event form when the event is in a terminal
 * state (completed or cancelled) and can no longer be edited. Setup pages are
 * viewable but the inputs are disabled and Save actions are hidden; the backend
 * enforces the same lock on every mutation.
 *
 * @param {object} props
 * @param {string} [props.status] - the event status ('completed' | 'cancelled')
 * @param {string} [props.noun] - what to call the event ('election' | 'poll' | 'competition' | 'event')
 */
export default function ReadOnlyEventBanner({ status, noun = 'event' }) {
  const label = status === 'cancelled' ? 'cancelled' : 'completed'

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-v-border bg-v-surface-elevated p-4">
      <div className="rounded-full bg-v-text-subtle/10 p-1.5 text-v-text-muted">
        <Lock className="h-5 w-5" strokeWidth={2} />
      </div>
      <div>
        <p className="text-sm font-semibold text-v-text">Read-only — this {noun} is {label}</p>
        <p className="text-xs text-v-text-muted mt-0.5">
          You can view every section, but a {label} {noun} can no longer be edited.
        </p>
      </div>
    </div>
  )
}
