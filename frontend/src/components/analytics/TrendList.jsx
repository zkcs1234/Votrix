/**
 * TrendList — list of trend points with simple sparkline bars.
 * Useful for "Voting Progress", "Participation Trends", "Response Rate Over Time".
 *
 * Pure: takes items shaped { id, label, value, sublabel? } and renders them.
 */
export default function TrendList({
  title,
  description,
  items = [],
  valueKey = 'value',
  labelKey = 'label',
  emptyMessage = 'No trend data yet.',
  barClass = 'bg-v-primary',
  className = '',
}) {
  if (!items.length) {
    return <p className="text-sm text-v-text-subtle">{emptyMessage}</p>
  }
  const max = Math.max(...items.map((i) => Number(i?.[valueKey] ?? 0)), 1)

  return (
    <section className={`v-card p-6 ${className}`}>
      {title && <h3 className="font-medium text-v-text">{title}</h3>}
      {description && (
        <p className="mt-1 text-xs text-v-text-subtle">{description}</p>
      )}
      <ul className="mt-4 space-y-3">
        {items.map((item, idx) => {
          const id = item?.id ?? `${item?.[labelKey]}-${idx}`
          const value = Number(item?.[valueKey] ?? 0)
          return (
            <li key={id}>
              <div className="flex justify-between text-sm">
                <span className="text-v-text-muted">{item?.[labelKey]}</span>
                <span className="text-v-text-subtle">{value}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-v-surface-elevated">
                <div
                  className={`h-full ${barClass} transition-all`}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
              {item?.sublabel && (
                <p className="mt-1 text-xs text-v-text-subtle">{item.sublabel}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
