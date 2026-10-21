// Figma "Badge / Status": small pill with an optional leading dot.
// Original tones (default/success/danger/warning) are unchanged; `info`,
// `accent` and `neutral` are added for lifecycle and session states.
const tones = {
  default: 'bg-v-surface-elevated text-v-text-muted border-v-border',
  neutral: 'bg-v-surface-elevated text-v-text-muted border-v-border',
  success: 'bg-v-success-bg text-v-success border-transparent',
  danger: 'bg-v-danger-bg text-v-danger border-transparent',
  warning: 'bg-v-warning-bg text-v-warning border-transparent',
  info: 'bg-v-info-bg text-v-info border-transparent',
}

export default function Badge({ children, tone = 'default', dot = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.default} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}

// Figma "Lifecycle and operational language": event lifecycle, competition
// session and account/delivery states mapped to one tone each.
const STATUS_TONES = {
  draft: ['warning', 'Draft'],
  scheduled: ['info', 'Scheduled'],
  active: ['success', 'Active'],
  open: ['success', 'Open'],
  completed: ['success', 'Completed'],
  published: ['success', 'Published'],
  cancelled: ['neutral', 'Cancelled'],
  canceled: ['neutral', 'Cancelled'],
  archived: ['neutral', 'Archived'],
  closed: ['neutral', 'Closed'],
  idle: ['neutral', 'Idle'],
  paused: ['warning', 'Paused'],
  pending: ['warning', 'Pending'],
  suspended: ['danger', 'Suspended'],
  failed: ['danger', 'Failed'],
  delivered: ['success', 'Delivered'],
}

/** Tone for a lifecycle/status string; unknown values are neutral. */
export function statusTone(status) {
  const key = String(status ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  return (STATUS_TONES[key] ?? ['neutral'])[0]
}

/**
 * Status badge for any known lifecycle state; unknown values render neutral
 * with the raw text so nothing is hidden.
 */
export function StatusBadge({ status, label, className = '' }) {
  const key = String(status ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  const [tone, defaultLabel] = STATUS_TONES[key] ?? ['neutral', String(status ?? '—')]
  return (
    <Badge tone={tone} dot className={className}>
      {label ?? defaultLabel}
    </Badge>
  )
}
