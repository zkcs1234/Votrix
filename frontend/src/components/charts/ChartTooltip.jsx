/**
 * ChartTooltip.jsx
 *
 * Shared custom tooltip used across all Recharts chart types.
 * Renders using Votrix design tokens (v-* CSS classes) so it
 * automatically follows light/dark mode.
 *
 * Props (passed automatically by Recharts):
 *   active     — boolean, whether the tooltip is visible
 *   payload    — array of data points
 *   label      — the x-axis label
 *   labelFormatter — optional (string) => string to format the label
 *   valueFormatter — optional (number, name) => string to format each value
 *   unit       — optional unit string appended after each value
 */
import { memo } from 'react'

const ChartTooltip = memo(function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  unit = '',
}) {
  if (!active || !payload?.length) return null

  const displayLabel = labelFormatter ? labelFormatter(label) : label

  return (
    <div className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 shadow-v-shadow-md text-xs">
      {displayLabel !== undefined && displayLabel !== null && (
        <p className="mb-1.5 font-medium text-v-text">{displayLabel}</p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, idx) => {
          const rawValue = entry.value ?? 0
          const displayValue = valueFormatter
            ? valueFormatter(rawValue, entry.name)
            : `${rawValue}${unit}`

          return (
            <li key={idx} className="flex items-center gap-2">
              {/* Color dot */}
              <span
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color ?? entry.fill ?? '#818cf8' }}
              />
              {entry.name && (
                <span className="text-v-text-muted">{entry.name}:</span>
              )}
              <span className="font-medium text-v-text">{displayValue}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
})

export default ChartTooltip
