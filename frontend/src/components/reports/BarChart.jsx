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

export default function BarChart({ items, valueKey = 'count', labelKey = 'label', colorClass = 'bg-v-primary' }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  // Determine color based on colorClass prop
  const getColor = () => {
    if (colorClass.includes('success')) return '#10b981'
    if (colorClass.includes('warning')) return '#f59e0b'
    if (colorClass.includes('danger')) return '#ef4444'
    return '#3b82f6' // default primary
  }

  const barColor = getColor()

  // Transform items for Recharts
  const data = (items || []).map((item, index) => ({
    name: item[labelKey],
    value: item[valueKey] ?? 0,
    percentage: item.percentage,
    fill: COLORS[index % COLORS.length],
  }))

  if (!items || items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-v-text-subtle">
        No data available
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <XAxis
            type="number"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={{ stroke: '#374151' }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={{ stroke: '#374151' }}
            width={70}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload
                return (
                  <div className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 shadow-lg">
                    <p className="text-sm font-medium text-v-text">{data.name}</p>
                    <p className="text-sm text-v-text-subtle">
                      {data.value}
                      {data.percentage !== undefined ? ` (${data.percentage}%)` : ''}
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
            barSize={20}
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
  )
}
