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

/**
 * BarChart using Recharts library
 * Preserves the same API as the legacy BarChart for backward compatibility
 */
export default function BarChart({
  items,
  valueKey = 'count',
  labelKey = 'label',
  colorClass = 'bg-v-primary',
  height = 300,
}) {
  // Transform items for Recharts
  const data = items.map((item, index) => ({
    name: item[labelKey],
    value: item[valueKey] ?? 0,
    percentage: item.percentage,
    fill: COLORS[index % COLORS.length],
  }))

  // Determine color based on colorClass prop
  const getColor = () => {
    if (colorClass.includes('primary')) return '#3b82f6'
    if (colorClass.includes('success')) return '#10b981'
    if (colorClass.includes('warning')) return '#f59e0b'
    if (colorClass.includes('danger')) return '#ef4444'
    return '#3b82f6' // default primary
  }

  const barColor = getColor()

  if (!items || items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-v-text-subtle">
        No data available
      </div>
    )
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
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
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f3f4f6',
            }}
            formatter={(value) => [value, 'Value']}
            labelStyle={{ color: '#d1d5db' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill || barColor} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Simple bar chart with horizontal bars
 */
export function SimpleBarChart({ data, valueKey = 'value', labelKey = 'name', color = '#3b82f6' }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-v-text-subtle">
        No data available
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <XAxis
            dataKey={labelKey}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={{ stroke: '#374151' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={{ stroke: '#374151' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f3f4f6',
            }}
          />
          <Bar dataKey={valueKey} fill={color} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Pie chart for distribution data
 */
export function PieChart({ data, valueKey = 'value', nameKey = 'name', colors = COLORS }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-v-text-subtle">
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
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey={nameKey}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f3f4f6',
            }}
          />
          <Bar dataKey={valueKey} radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}