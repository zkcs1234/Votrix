/**
 * PieChartView.jsx
 *
 * Reusable pie / donut chart for composition / distribution data.
 * Ideal for "vote share", "module participation breakdown", etc.
 *
 * Props:
 *   data           — array: [{ name, value }]
 *   nameKey        — key for slice label (default: 'name')
 *   dataKey        — key for slice value (default: 'value')
 *   colors         — hex array; cycles per slice (default: CHART_COLORS_HEX_LIST)
 *   innerRadius    — 0 = full pie, >0 = donut hole (default: 0)
 *   outerRadius    — outer radius string/number (default: '75%')
 *   height         — number in px (default: 280)
 *   showLegend     — show legend below chart (default: true)
 *   showLabels     — show percent labels on slices (default: false)
 *   valueFormatter — (value, name) => string for tooltip
 *   emptyMessage   — shown when data is empty
 *   className      — wrapper class
 */
import { memo, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import { CHART_COLORS_HEX_LIST, LEGEND_STYLE } from './chartTokens'

/** Custom percent label rendered inside/near each slice */
function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null // skip tiny slices
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const PieChartView = memo(function PieChartView({
  data = [],
  nameKey = 'name',
  dataKey = 'value',
  colors,
  innerRadius = 0,
  outerRadius = '75%',
  height = 280,
  showLegend = true,
  showLabels = false,
  valueFormatter,
  emptyMessage = 'No data available.',
  className = '',
}) {
  const [activeIndex, setActiveIndex] = useState(null)
  const palette = colors ?? CHART_COLORS_HEX_LIST

  const normalized = useMemo(
    () =>
      data
        .filter((item) => Number(item[dataKey] ?? 0) > 0)
        .map((item, idx) => ({
          ...item,
          [nameKey]: item[nameKey] ?? '—',
          [dataKey]: Number(item[dataKey] ?? 0),
          _fill: item.fill ?? palette[idx % palette.length],
        })),
    [data, dataKey, nameKey, palette],
  )

  if (!normalized.length) {
    return (
      <div className={`flex items-center justify-center text-sm text-v-text-subtle ${className}`} style={{ height }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={normalized}
            dataKey={dataKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={normalized.length > 1 ? 2 : 0}
            labelLine={false}
            label={showLabels ? renderCustomLabel : undefined}
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {normalized.map((entry, index) => (
              <Cell
                key={`pie-cell-${index}`}
                fill={entry._fill}
                opacity={activeIndex !== null && activeIndex !== index ? 0.6 : 1}
                stroke={activeIndex === index ? '#fff' : 'transparent'}
                strokeWidth={activeIndex === index ? 2 : 0}
              />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={
                  valueFormatter ??
                  ((value) => {
                    const total = normalized.reduce((s, d) => s + d[dataKey], 0)
                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0
                    return `${value} (${pct}%)`
                  })
                }
              />
            }
          />
          {showLegend && <Legend wrapperStyle={LEGEND_STYLE} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
})

export default PieChartView
