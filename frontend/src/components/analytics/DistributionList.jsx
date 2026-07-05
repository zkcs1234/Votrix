/**
 * DistributionList.jsx
 *
 * Horizontal-bar list used for "votes per candidate", "most selected choices",
 * "rating distributions", etc.
 *
 * Now powered by the unified chart system.
 * Supports an optional `chartType` prop to switch between:
 *   'bar' (default) — horizontal bar chart, great for rankings/categorical
 *   'pie'           — pie chart, great for composition/vote-share
 *
 * All original props are preserved for backward compatibility.
 */
import { memo, useMemo } from 'react'
import { BarChartView, PieChartView } from '@/components/charts'
import { CHART_COLORS_HEX_LIST, getChartColor } from '@/components/charts/chartTokens'

const DistributionList = memo(function DistributionList({
  items = [],
  valueKey = 'value',
  labelKey = 'label',
  idKey = 'id',
  showCount = true,
  showPercentage = true,
  barClass = 'bg-v-primary',
  chartType = 'bar',         // 'bar' | 'pie'
  showChart = true,
  emptyMessage = 'No data yet.',
  className = '',
}) {
  if (!items.length) {
    return <p className="text-sm text-v-text-subtle">{emptyMessage}</p>
  }

  // Resolve semantic base color from legacy barClass prop
  const baseColor = useMemo(() => {
    if (barClass.includes('success')) return getChartColor('success')
    if (barClass.includes('warning')) return getChartColor('warning')
    if (barClass.includes('danger'))  return getChartColor('danger')
    return getChartColor('primary')
  }, [barClass])

  // Normalize items for chart views
  const data = useMemo(
    () =>
      items.map((item, idx) => ({
        id: item?.[idKey] ?? `${item?.[labelKey]}-${idx}`,
        name: item?.[labelKey] ?? '—',
        value: Number(item?.[valueKey] ?? 0),
        sublabel: item?.sublabel,
        percentage: item?.percentage,
        fill: idx === 0 ? baseColor : CHART_COLORS_HEX_LIST[idx % CHART_COLORS_HEX_LIST.length],
      })),
    [items, valueKey, labelKey, idKey, baseColor],
  )

  return (
    <div className={className}>
      {/* Summary legend */}
      <ul className="mb-4 space-y-2">
        {items.map((item, idx) => {
          const id = item?.[idKey] ?? `${item?.[labelKey]}-${idx}`
          const value = Number(item?.[valueKey] ?? 0)
          const label = item?.[labelKey] ?? '—'
          const sublabel = item?.sublabel
          const percentage = item?.percentage

          return (
            <li key={id} className="flex items-center justify-between text-sm">
              {/* Color dot aligned with chart series */}
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: data[idx]?.fill }}
                />
                <span className="text-v-text-muted truncate">{label}</span>
                {sublabel && (
                  <span className="ml-1 text-xs text-v-text-subtle">{sublabel}</span>
                )}
              </div>
              <span className="ml-4 flex-shrink-0 text-v-text-subtle">
                {showCount && value}
                {showPercentage && percentage !== undefined ? ` (${percentage}%)` : ''}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Chart visualization */}
      {showChart && (
        <>
          {chartType === 'pie' ? (
            <PieChartView
              data={data}
              dataKey="value"
              nameKey="name"
              height={200}
              showLegend={false}
              valueFormatter={(value, _name) => {
                const total = data.reduce((s, d) => s + d.value, 0)
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0
                return `${value} (${pct}%)`
              }}
            />
          ) : (
            <BarChartView
              data={data}
              dataKey="value"
              nameKey="name"
              layout="vertical"
              height={Math.max(160, data.length * 32)}
              barSize={16}
              valueFormatter={(value, _name) => String(value)}
            />
          )}
        </>
      )}
    </div>
  )
})

export default DistributionList
