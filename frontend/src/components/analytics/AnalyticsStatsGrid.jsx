/**
 * AnalyticsStatsGrid — responsive grid of stat cards.
 *
 * Pure: receives an array of stat descriptors and renders them.
 * Each stat: { label, value, hint?, tone?: 'default' | 'success' | 'warning' | 'danger' }
 */
import AnalyticsStatCard from './AnalyticsStatCard'

const TONE_CLASS = {
  default: 'text-v-text',
  success: 'text-v-success',
  warning: 'text-v-warning',
  danger: 'text-v-danger',
  muted: 'text-v-text-muted',
}

export default function AnalyticsStatsGrid({ stats = [], columns = 4, className = '' }) {
  if (!stats.length) return null
  const colClass =
    {
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-3',
      4: 'sm:grid-cols-2 lg:grid-cols-4',
      5: 'sm:grid-cols-2 lg:grid-cols-5',
      6: 'sm:grid-cols-2 lg:grid-cols-6',
    }[columns] ?? 'sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div className={`grid gap-4 ${colClass} ${className}`}>
      {stats.map((stat, i) => (
        <AnalyticsStatCard
          key={stat.id ?? `${stat.label}-${i}`}
          label={stat.label}
          value={stat.value}
          hint={stat.hint}
          valueClassName={TONE_CLASS[stat.tone] ?? TONE_CLASS.default}
        />
      ))}
    </div>
  )
}
