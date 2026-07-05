/**
 * TrendList.jsx
 *
 * List of trend/time-series data with chart visualization.
 * Previously rendered a vertical bar chart — now renders an AreaChart
 * which is semantically correct for trend data.
 *
 * Falls back to BarChartView when `chartType="bar"` is explicitly passed,
 * so any caller that wants bars can still get them.
 *
 * All original props are preserved for backward compatibility.
 */
import { memo, useMemo } from 'react'
import { AreaChartView, BarChartView } from '@/components/charts'
import { getChartColor } from '@/components/charts/chartTokens'

const TrendList = memo(function TrendList({
  title,
  description,
  items = [],
  valueKey = 'value',
  labelKey = 'label',
  emptyMessage = 'No trend data yet.',
  barClass = 'bg-v-primary',
  chartType = 'area',   // 'area' | 'bar' | 'line'
  className = '',
}) {
  const seriesColor = useMemo(() => {
    if (barClass.includes('success')) return getChartColor('success')
    if (barClass.includes('warning')) return getChartColor('warning')
    if (barClass.includes('danger'))  return getChartColor('danger')
    return getChartColor('primary')
  }, [barClass])

  const data = useMemo(
    () =>
      items.map((item) => ({
        name: item?.[labelKey] ?? '—',
        value: Number(item?.[valueKey] ?? 0),
        sublabel: item?.sublabel,
        fill: seriesColor,
      })),
    [items, valueKey, labelKey, seriesColor],
  )

  if (!items.length) {
    return <p className="text-sm text-v-text-subtle">{emptyMessage}</p>
  }

  const chartHeight = 160

  return (
    <section className={`v-card p-6 ${className}`}>
      {title && <h3 className="font-medium text-v-text">{title}</h3>}
      {description && (
        <p className="mt-1 text-xs text-v-text-subtle">{description}</p>
      )}

      {/* Data table */}
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
              {item?.sublabel && (
                <p className="mt-1 text-xs text-v-text-subtle">{item.sublabel}</p>
              )}
            </li>
          )
        })}
      </ul>

      {/* Chart visualization */}
      <div className="mt-4">
        {chartType === 'bar' ? (
          <BarChartView
            data={data}
            dataKey="value"
            nameKey="name"
            layout="vertical"
            height={chartHeight}
            barSize={14}
            colors={[seriesColor]}
          />
        ) : (
          <AreaChartView
            data={data}
            areas={[{ dataKey: 'value', name: title ?? 'Value', color: seriesColor }]}
            xAxisKey="name"
            height={chartHeight}
            showDots={data.length <= 12}
            showLegend={false}
          />
        )}
      </div>
    </section>
  )
})

export default TrendList
