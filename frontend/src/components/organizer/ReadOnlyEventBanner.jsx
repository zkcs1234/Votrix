import { Lock } from 'lucide-react'

/**
 * Banner shown on an organizer setup page when the event's setup is locked.
 * Two cases:
 *   - `scheduled`: published but not yet started — setup is locked but the
 *     organizer can unpublish it back to draft to make corrections.
 *   - `active` / `completed` / `cancelled`: terminal or running — setup is
 *     locked with no way back.
 * Inputs are disabled and Save actions hidden; the backend enforces the same
 * lock on every mutation.
 *
 * @param {object} props
 * @param {string} [props.status] - the event status
 * @param {string} [props.noun] - what to call the event ('election' | 'poll' | 'competition' | 'event')
 */
export default function ReadOnlyEventBanner({ status, noun = 'event' }) {
  const isScheduled = status === 'scheduled'

  const title = isScheduled
    ? `Published — this ${noun}'s setup is locked`
    : status === 'cancelled'
      ? `Read-only — this ${noun} is cancelled`
      : status === 'active'
        ? `Read-only — this ${noun} is active`
        : `Read-only — this ${noun} is completed`

  const detail = isScheduled
    ? `Setup can no longer be edited while published. Go to Review & Publish to unpublish it back to draft, then make your changes.`
    : `You can view every section, but this ${noun} can no longer be edited.`

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-v-border bg-v-surface-elevated p-4">
      <div className="rounded-full bg-v-text-subtle/10 p-1.5 text-v-text-muted">
        <Lock className="h-5 w-5" strokeWidth={2} />
      </div>
      <div>
        <p className="text-sm font-semibold text-v-text">{title}</p>
        <p className="text-xs text-v-text-muted mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
