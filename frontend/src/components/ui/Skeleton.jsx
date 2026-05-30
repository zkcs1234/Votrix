export default function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-v-surface-elevated ${className}`}
      aria-hidden
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="space-y-4 rounded-2xl border border-v-border p-6">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
