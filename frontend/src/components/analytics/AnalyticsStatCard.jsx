/**
 * AnalyticsStatCard — module-agnostic statistic card.
 * Replaces the two existing StatCard components with a single shared one
 * that accepts a customizable value color.
 */
export default function AnalyticsStatCard({
  label,
  value,
  hint,
  valueClassName = 'text-v-text',
  className = '',
}) {
  return (
    <div className={`v-card-sm ${className}`}>
      <p className="v-caption">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value ?? 0}</p>
      {hint && <p className="v-caption mt-1">{hint}</p>}
    </div>
  )
}
