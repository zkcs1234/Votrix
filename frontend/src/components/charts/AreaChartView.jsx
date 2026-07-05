/**
 * AreaChartView.jsx
 *
 * Reusable area chart for cumulative / volume / trend data.
 * Ideal for "voting progress over time", "response rate trend", etc.
 *
 * Props:
 *   data           — array of objects, e.g. [{ name, value }] or multi-series
 *   areas          — array of area configs: [{ dataKey, name?, color?, gradient? }]
 *                    If omitted, falls back to a single area on 'value' key.
 *   xAxisKey       — key used for x-axis labels (default: 'name')
 *   height         — number in px (default: 260)
 *   showGrid       — show CartesianGrid (default: true)
 *   showDots       — show data point dots (default: false — cleaner for areas)
 *   showLegend     — show legend when multiple areas (default: true)
 *   stacked        — stack areas (default: false)
 *   valueFormatter — (value, name) => string for tooltip
 *   labelFormatter — (label) => string for tooltip label
 *   unit           — unit string appended to tooltip values
 *   emptyMessage   — shown when data is empty
 *   className      — wrapper class
 */
import { memo, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  defs,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import {
  CHART_COLORS_HEX_LIST,
  getAxisStyle,
  GRID_STYLE,
  LEGEND_STYLE,
} from './chartTokens'

const AreaChartView = memo(function AreaChartView({
  data = [],
  areas,
  xAxisKey = 'name',
  height = 260,
  showGrid = true,
  showDots = false,
  showLegend = true,
  stacked = false,
  valueFormatter,
  labelFormatter,
  unit = '',
  emptyMessage = 'No data available.',
  className = '',
}) {
  const axisStyle = useMemo(() => getAxisStyle(11), [])

  const resolvedAreas = useMemo(() => {
    if (areas?.length) {
      return areas.map((a, idx) => ({
        dataKey: a.dataKey,
        name: a.name ?? a.dataKey,
        color: a.color ?? CHART_COLORS_HEX_LIST[idx % CHART_COLORS_HEX_LIST.length],
        gradient: a.gradient !== false, // default true
      }))
    }
    return [{ dataKey: 'value', name: 'Value', color: CHART_COLORS_HEX_LIST[0], gradient: true }]
  }, [areas])

  const multiSeries = resolvedAreas.length > 1

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
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          {/* Gradient defs — one per area */}
          <defs>
            {resolvedAreas.map((area) => (
              <linearGradient
                key={`grad-${area.dataKey}`}
                id={`grad-${area.dataKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={area.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={area.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

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
          {resolvedAreas.map((area) => (
            <Area
              key={area.dataKey}
              type="monotone"
              dataKey={area.dataKey}
              name={area.name}
              stroke={area.color}
              strokeWidth={2}
              fill={area.gradient ? `url(#grad-${area.dataKey})` : area.color}
              fillOpacity={area.gradient ? 1 : 0.15}
              dot={showDots ? { r: 3, fill: area.color, strokeWidth: 0 } : false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              stackId={stacked ? 'stack' : undefined}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
})

export default AreaChartView
