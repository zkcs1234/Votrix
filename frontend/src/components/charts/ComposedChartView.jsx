/**
 * ComposedChartView.jsx
 *
 * Multi-metric chart that mixes Bars, Lines, and Areas in one canvas.
 * Useful for comparing votes + turnout, scores + participation, etc.
 *
 * Props:
 *   data           — array of objects with multiple keys
 *   series         — array of series configs:
 *                    {
 *                      type: 'bar' | 'line' | 'area',
 *                      dataKey: string,
 *                      name?: string,
 *                      color?: string,
 *                      yAxisId?: 'left' | 'right' (default 'left'),
 *                      barSize?: number,
 *                      stackId?: string,
 *                    }
 *   xAxisKey       — key for x-axis labels (default: 'name')
 *   height         — number in px (default: 300)
 *   showGrid       — show CartesianGrid (default: true)
 *   showLegend     — show legend (default: true)
 *   dualAxis       — render a right Y-axis (default: false)
 *   valueFormatter — (value, name) => string for tooltip
 *   labelFormatter — (label) => string for tooltip label
 *   unit           — unit string
 *   emptyMessage   — shown when data is empty
 *   className      — wrapper class
 */
import { memo, useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import {
  CHART_COLORS_HEX_LIST,
  getAxisStyle,
  GRID_STYLE,
  LEGEND_STYLE,
} from './chartTokens'

const ComposedChartView = memo(function ComposedChartView({
  data = [],
  series = [],
  xAxisKey = 'name',
  height = 300,
  showGrid = true,
  showLegend = true,
  dualAxis = false,
  valueFormatter,
  labelFormatter,
  unit = '',
  emptyMessage = 'No data available.',
  className = '',
}) {
  const axisStyle = useMemo(() => getAxisStyle(11), [])

  const resolvedSeries = useMemo(
    () =>
      series.map((s, idx) => ({
        type: s.type ?? 'bar',
        dataKey: s.dataKey,
        name: s.name ?? s.dataKey,
        color: s.color ?? CHART_COLORS_HEX_LIST[idx % CHART_COLORS_HEX_LIST.length],
        yAxisId: s.yAxisId ?? 'left',
        barSize: s.barSize ?? 18,
        stackId: s.stackId,
      })),
    [series],
  )

  if (!data.length || !resolvedSeries.length) {
    return (
      <div className={`flex items-center justify-center text-sm text-v-text-subtle ${className}`} style={{ height }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: dualAxis ? 40 : 16, left: 4, bottom: 4 }}>
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
            yAxisId="left"
            tick={axisStyle.tick}
            axisLine={axisStyle.axisLine}
            tickLine={axisStyle.tickLine}
          />
          {dualAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisStyle.tick}
              axisLine={axisStyle.axisLine}
              tickLine={axisStyle.tickLine}
            />
          )}
          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={labelFormatter}
                valueFormatter={valueFormatter}
                unit={unit}
              />
            }
          />
          {showLegend && <Legend wrapperStyle={LEGEND_STYLE} />}

          {resolvedSeries.map((s) => {
            if (s.type === 'bar') {
              return (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.name}
                  fill={s.color}
                  barSize={s.barSize}
                  yAxisId={s.yAxisId}
                  stackId={s.stackId}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive
                  animationDuration={600}
                />
              )
            }
            if (s.type === 'area') {
              return (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.12}
                  strokeWidth={2}
                  yAxisId={s.yAxisId}
                  isAnimationActive
                  animationDuration={700}
                />
              )
            }
            // default: line
            return (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                yAxisId={s.yAxisId}
                isAnimationActive
                animationDuration={700}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
})

export default ComposedChartView
