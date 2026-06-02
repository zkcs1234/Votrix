/**
 * Skeleton Components
 * Use for loading states where layout is known
 */

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-v-surface-elevated ${className}`}
      aria-hidden
    />
  )
}

export { ProgressBarWithStats } from './ProgressBar'
export { ProgressBar } from './ProgressBar'

export default Skeleton

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

/**
 * Table skeleton - use for tables with known column count
 */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="v-table-wrap">
      <table className="v-table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <Skeleton className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j}>
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Stat card skeleton - use for dashboard stat cards
 */
export function SkeletonStatCard() {
  return (
    <div className="v-card-sm">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-2 h-8 w-12" />
    </div>
  )
}

/**
 * Event card skeleton - use for event lists (election, polling, pageant)
 */
export function SkeletonEventCard() {
  return (
    <div className="rounded-xl border border-v-border bg-v-surface p-4">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  )
}

/**
 * Event list skeleton - use for event list sections
 */
export function SkeletonEventList({ count = 3 }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonEventCard key={i} />
      ))}
    </div>
  )
}

/**
 * Dashboard skeleton - use for main dashboard pages
 */
export function SkeletonDashboard({ statCount = 4, cardCount = 2 }) {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: statCount }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div key={i} className="v-card p-6">
            <Skeleton className="h-5 w-1/3" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Form skeleton - use for form pages
 */
export function SkeletonForm({ fieldCount = 4 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fieldCount }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  )
}

/**
 * Grid skeleton - use for grid layouts (candidates, contestants)
 */
export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="v-card p-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="mt-3 h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/**
 * List skeleton - use for simple lists
 */
export function SkeletonList({ count = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-v-border px-4 py-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  )
}

/**
 * Chart skeleton - use for analytics charts
 */
export function SkeletonChart() {
  return (
    <div className="v-card p-6">
      <Skeleton className="h-5 w-1/3" />
      <div className="mt-4 h-48 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-16" />
            <div className="flex-1">
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Report skeleton - use for report pages
 */
export function SkeletonReport() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <SkeletonChart />
      <SkeletonChart />
    </div>
  )
}