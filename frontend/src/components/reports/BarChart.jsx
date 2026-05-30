export default function BarChart({ items, valueKey = 'count', labelKey = 'label', colorClass = 'bg-v-primary' }) {
  const max = Math.max(...items.map((i) => i[valueKey] ?? 0), 1)

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id ?? item.optionId ?? item.labelKey ?? item[labelKey]}>
          <div className="flex justify-between text-sm">
            <span className="text-v-text-muted">{item[labelKey]}</span>
            <span className="text-v-text-subtle">
              {item[valueKey]}
              {item.percentage !== undefined ? ` (${item.percentage}%)` : ''}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-v-surface-elevated">
            <div
              className={`h-full ${colorClass} transition-all`}
              style={{ width: `${((item[valueKey] ?? 0) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
