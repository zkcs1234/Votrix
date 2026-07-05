/**
 * DistributionList — horizontal-bar list used for "votes per candidate",
 * "most selected choices", "rating distributions", etc.
 *
 * Accepts items shaped as { id, label, value, percentage?, sublabel? }.
 * No module knowledge — the caller maps its data to this shape.
 *
 * Now uses Recharts for enhanced visualization
 */
import { useState } from 'react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
]

export default function DistributionList({
  items = [],
  valueKey = 'value',
  labelKey = 'label',
  idKey = 'id',
  showCount = true,
  showPercentage = true,
  barClass = 'bg-v-primary',
  emptyMessage = 'No data yet.',
  className = '',
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  if (!items.length) {
    return <p className="text-sm text-v-text-subtle">{emptyMessage}</p>
  }

  // Determine color based on barClass prop
  const getColor = () => {
    if (barClass.includes('success')) return '#10b981'
    if (barClass.includes('warning')) return '#f59e0b'
    if (barClass.includes('danger')) return '#ef4444'
    if (barClass.includes('primary')) return '#3b82f6'
    return '#3b82f6'
  }

  const barColor = getColor()

  // Transform items for Recharts
  const data = items.map((item, index) => ({
    id: item?.[idKey] ?? `${item?.[labelKey]}-${index}`,
    name: item?.[labelKey] ?? '—',
    value: Number(item?.[valueKey] ?? 0),
    sublabel: item?.sublabel,
    percentage: item?.percentage,
    fill: COLORS[index % COLORS.length],
  }))

  return (
    <div className={className}>
      {/* Legend table */}
      <ul className="mb-4 space-y-2">
        {items.map((item, idx) => {
          const id = item?.[idKey] ?? `${item?.[labelKey]}-${idx}`
          const value = Number(item?.[valueKey] ?? 0)
          const label = item?.[labelKey] ?? '—'
          const sublabel = item?.sublabel
          const percentage = item?.percentage

          return (
            <li key={id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <span className="text-v-text-muted">{label}</span>
                {sublabel && (
                  <span className="ml-2 text-xs text-v-text-subtle">{sublabel}</span>
                )}
              </div>
              <span className="text-v-text-subtle ml-4">
                {showCount && value}
                {showPercentage && percentage !== undefined ? ` (${percentage}%)` : ''}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Recharts visualization */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <XAxis
              type="number"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
              width={100}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 shadow-lg">
                      <p className="text-sm font-medium text-v-text">{item.name}</p>
                      <p className="text-sm text-v-text-subtle">
                        {item.value}
                        {item.percentage !== undefined ? ` (${item.percentage}%)` : ''}
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              barSize={16}
              onMouseEnter={(_, index) => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={hoveredIndex === index ? '#60a5fa' : entry.fill || barColor}
                />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
