/**
 * LineChartView.jsx
 *
 * Reusable line chart for time-series / trend data.
 *
 * Props:
 *   data           — array of objects, e.g. [{ name, value }] or multi-series
 *   lines          — array of line configs: [{ dataKey, name?, color? }]
 *                    If omitted, falls back to a single line on 'value' key.
 *   xAxisKey       — key used for x-axis labels (default: 'name')
 *   height         — number in px (default: 260)
 *   showGrid       — show CartesianGrid (default: true)
 *   showDots       — show data point dots (default: true)
 *   showLegend     — show legend when multiple lines (default: true)
 *   valueFormatter — (value, name) => string for tooltip
 *   labelFormatter — (label) => string for tooltip label
 *   unit           — unit string appended to tooltip values
 *   emptyMessage   — shown when data is empty
 *   className      — wrapper class
 */
import { memo, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import {
  CHART_COLORS_HEX_LIST,
  getAxisStyle,
  GRID_STYLE,
  LEGEND_STYLE,
} from './chartTokens'

const LineChartView = memo(function LineChartView({
  data = [],
  lines,
  xAxisKey = 'name',
  height = 260,
  showGrid = true,
  showDots = true,
  showLegend = true,
  valueFormatter,
  labelFormatter,
  unit = '',
  emptyMessage = 'No data available.',
  className = '',
}) {
  const axisStyle = useMemo(() => getAxisStyle(11), [])

  const resolvedLines = useMemo(() => {
    if (lines?.length) {
      return lines.map((l, idx) => ({
        dataKey: l.dataKey,
        name: l.name ?? l.dataKey,
        color: l.color ?? CHART_COLORS_HEX_LIST[idx % CHART_COLORS_HEX_LIST.length],
      }))
    }
    return [{ dataKey: 'value', name: 'Value', color: CHART_COLORS_HEX_LIST[0] }]
  }, [lines])

  const multiSeries = resolvedLines.length > 1

  if (!data.length) {
    return (
      <div className={`flex items-center justify-center text-sm text-v-text-subtle ${className}`} style={{ height }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray={GRID_STYLE.strokeDasharray}
              stroke={GRID_STYLE.stroke}
              strokeOpacity={GRID_STYLE.strokeOpacity}
            />
          )}
          <XAxis
            dataKey={xAxisKey}
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
          />
          <YAxis
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
          />
          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={labelFormatter}
                valueFormatter={valueFormatter}
                unit={unit}
              />
            }
          />
          {multiSeries && showLegend && (
            <Legend wrapperStyle={LEGEND_STYLE} />
          )}
          {resolvedLines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              dot={showDots ? { r: 3, fill: line.color, strokeWidth: 0 } : false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})

export default LineChartView
