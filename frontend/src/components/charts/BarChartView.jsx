/**
 * BarChartView.jsx
 *
 * Reusable vertical (horizontal layout) or standard bar chart.
 *
 * Props:
 *   data          — array of objects, e.g. [{ name, value, percentage? }]
 *   dataKey       — key for the bar value (default: 'value')
 *   nameKey       — key for the category label (default: 'name')
 *   layout        — 'vertical' | 'horizontal' (default: 'vertical')
 *   height        — number in px (default: 260)
 *   barSize       — bar thickness in px (default: 18)
 *   colors        — array of hex strings; cycles per bar (default: CHART_COLORS_HEX_LIST)
 *   showGrid      — show CartesianGrid (default: true)
 *   valueFormatter — (value, name) => string for tooltip
 *   labelFormatter — (label) => string for tooltip label
 *   unit          — unit string appended to tooltip values
 *   emptyMessage  — shown when data is empty
 *   className     — wrapper class
 */
import { memo, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import {
  CHART_COLORS_HEX_LIST,
  getAxisStyle,
  GRID_STYLE,
} from './chartTokens'

const BarChartView = memo(function BarChartView({
  data = [],
  dataKey = 'value',
  nameKey = 'name',
  layout = 'vertical',
  height = 260,
  barSize = 18,
  colors,
  showGrid = true,
  valueFormatter,
  labelFormatter,
  unit = '',
  emptyMessage = 'No data available.',
  className = '',
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const palette = colors ?? CHART_COLORS_HEX_LIST
  const axisStyle = useMemo(() => getAxisStyle(11), [])

  const normalized = useMemo(
    () =>
      data.map((item, idx) => ({
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

  const isVertical = layout === 'vertical'

  const xAxisProps = isVertical
    ? { type: 'number', ...axisStyle.tick && { tick: axisStyle.tick }, axisLine: axisStyle.axisLine, tickLine: axisStyle.tickLine }
    : { dataKey: nameKey, ...axisStyle.tick && { tick: axisStyle.tick }, axisLine: axisStyle.axisLine, tickLine: axisStyle.tickLine, angle: -35, textAnchor: 'end', height: 56, interval: 0 }

  const yAxisProps = isVertical
    ? { type: 'category', dataKey: nameKey, width: 90, tick: axisStyle.tick, axisLine: axisStyle.axisLine, tickLine: false }
    : { type: 'number', tick: axisStyle.tick, axisLine: axisStyle.axisLine, tickLine: axisStyle.tickLine }

  const margin = isVertical
    ? { top: 4, right: 24, left: 4, bottom: 4 }
    : { top: 4, right: 16, left: 4, bottom: 8 }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={normalized}
          layout={layout}
          margin={margin}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray={GRID_STYLE.strokeDasharray}
              stroke={GRID_STYLE.stroke}
              strokeOpacity={GRID_STYLE.strokeOpacity}
              horizontal={!isVertical}
              vertical={isVertical}
            />
          )}
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={labelFormatter}
                valueFormatter={valueFormatter}
                unit={unit}
              />
            }
          />
          <Bar
            dataKey={dataKey}
            radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            barSize={barSize}
            onMouseEnter={(_, index) => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            isAnimationActive
            animationDuration={600}
            animationEasing="ease-out"
          >
            {normalized.map((entry, index) => (
              <Cell
                key={`bar-cell-${index}`}
                fill={
                  hoveredIndex === index
                    ? '#a5b4fc' // lighten on hover (indigo-300)
                    : entry._fill
                }
                opacity={hoveredIndex !== null && hoveredIndex !== index ? 0.65 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})

export default BarChartView
