/**
 * DistributionList — horizontal-bar list used for "votes per candidate",
 * "most selected choices", "rating distributions", etc.
 *
 * Accepts items shaped as { id, label, value, percentage?, sublabel? }.
 * No module knowledge — the caller maps its data to this shape.
 */
export default function DistributionList({
  items = [],
  valueKey = 'value',
  labelKey = 'label',
  idKey = 'id',
  showCount = true,
  showPercentage = true,
  barClass = 'bg-v-primary',
  emptyMessage = 'No data yet.',
  className = '',
}) {
  if (!items.length) {
    return <p className="text-sm text-v-text-subtle">{emptyMessage}</p>
  }
  const max = Math.max(...items.map((i) => Number(i?.[valueKey] ?? 0)), 1)

  return (
    <ul className={`space-y-3 ${className}`}>
      {items.map((item, idx) => {
        const id = item?.[idKey] ?? `${item?.[labelKey]}-${idx}`
        const value = Number(item?.[valueKey] ?? 0)
        const label = item?.[labelKey] ?? '—'
        const sublabel = item?.sublabel
        const percentage = item?.percentage
        return (
          <li key={id}>
            <div className="flex flex-wrap justify-between gap-x-3 text-sm">
              <div className="min-w-0">
                <span className="text-v-text-muted">{label}</span>
                {sublabel && (
                  <span className="ml-2 text-xs text-v-text-subtle">{sublabel}</span>
                )}
              </div>
              <span className="text-v-text-subtle">
                {showCount && value}
                {showPercentage && percentage !== undefined ? ` (${percentage}%)` : ''}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-v-surface-elevated">
              <div
                className={`h-full ${barClass} transition-all`}
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
