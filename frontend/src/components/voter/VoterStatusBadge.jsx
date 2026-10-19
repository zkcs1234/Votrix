import { Clock3 } from 'lucide-react'

const BUCKET_STYLES = {
  active: 'bg-emerald-950/50 text-emerald-300 border-emerald-800',
  assigned: 'bg-amber-950/40 text-amber-300 border-amber-800',
  completed: 'bg-v-surface-elevated text-v-text-subtle border-v-border-strong',
}

export default function VoterStatusBadge({ bucket, label }) {
  const waitingToOpen = label?.trim().toLowerCase() === 'waiting to open'

  return (
    <span
      role="status"
      className={`inline-flex h-7 w-max shrink-0 self-start items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold leading-none ${
        waitingToOpen ? '' : BUCKET_STYLES[bucket] ?? BUCKET_STYLES.assigned
      }`}
      style={waitingToOpen ? {
        backgroundColor: 'var(--v-warning-bg)',
        borderColor: 'color-mix(in srgb, var(--v-warning) 35%, transparent)',
        color: 'var(--v-warning)',
      } : undefined}
    >
      {waitingToOpen && <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
      {label}
    </span>
  )
}
