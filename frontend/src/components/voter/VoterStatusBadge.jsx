import { Check, Clock3 } from 'lucide-react'

const BUCKET_STYLES = {
  active: 'bg-emerald-950/50 text-emerald-300 border-emerald-800',
  assigned: 'bg-amber-950/40 text-amber-300 border-amber-800',
  completed: 'bg-v-surface-elevated text-v-text-subtle border-v-border-strong',
}

export default function VoterStatusBadge({ bucket, label }) {
  const waitingToOpen = label?.trim().toLowerCase() === 'waiting to open'
  const scoringOpen = label?.trim().toLowerCase() === 'scoring open'

  return (
    <span
      role="status"
      className={`inline-flex w-max shrink-0 self-start items-center whitespace-nowrap rounded-full border font-semibold leading-none ${
        scoringOpen
          ? 'min-h-11 gap-2.5 border-emerald-500 bg-emerald-100 px-4 py-1.5 text-base text-emerald-800'
          : `h-7 gap-1.5 px-3 text-xs ${waitingToOpen ? '' : BUCKET_STYLES[bucket] ?? BUCKET_STYLES.assigned}`
      }`}
      style={waitingToOpen ? {
        backgroundColor: 'var(--v-warning-bg)',
        borderColor: 'color-mix(in srgb, var(--v-warning) 35%, transparent)',
        color: 'var(--v-warning)',
      } : undefined}
    >
      {scoringOpen && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /></span>}
      {waitingToOpen && <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
      {label}
    </span>
  )
}
