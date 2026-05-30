const BUCKET_STYLES = {
  active: 'bg-emerald-950/50 text-emerald-300 border-emerald-800',
  assigned: 'bg-amber-950/40 text-amber-300 border-amber-800',
  completed: 'bg-v-surface-elevated text-v-text-subtle border-v-border-strong',
}

export default function VoterStatusBadge({ bucket, label }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${BUCKET_STYLES[bucket] ?? BUCKET_STYLES.assigned}`}
    >
      {label}
    </span>
  )
}
