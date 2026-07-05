/**
 * TrendList — list of trend points with sparkline bars.
 * Useful for "Voting Progress", "Participation Trends", "Response Rate Over Time".
 *
 * Pure: takes items shaped { id, label, value, sublabel? } and renders them.
 *
 * Now uses Recharts for enhanced visualization
 */
import { useState } from 'react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
]

export default function TrendList({
  title,
  description,
  items = [],
  valueKey = 'value',
  labelKey = 'label',
  emptyMessage = 'No trend data yet.',
  barClass = 'bg-v-primary',
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
    id: item?.id ?? `${item?.[labelKey]}-${index}`,
    name: item?.[labelKey] ?? '—',
    value: Number(item?.[valueKey] ?? 0),
    sublabel: item?.sublabel,
    fill: COLORS[index % COLORS.length],
  }))

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

      {/* Recharts visualization */}
      <div className="mt-4 h-40">
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
              width={80}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 shadow-lg">
                      <p className="text-sm font-medium text-v-text">{item.name}</p>
                      <p className="text-sm text-v-text-subtle">{item.value}</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              barSize={14}
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
    </section>
  )
}
