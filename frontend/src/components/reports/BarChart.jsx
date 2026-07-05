/**
 * BarChart.jsx  (reports wrapper)
 *
 * Backward-compatible wrapper around BarChartView.
 * Existing consumers pass { items, valueKey, labelKey, colorClass, height }
 * and get exactly the same rendered output they had before — but now powered
 * by the unified chart system.
 *
 * Named exports SimpleBarChart and PieChart are preserved for any code
 * that imports them from this module.
 */
import { memo, useMemo } from 'react'
import { BarChartView } from '@/components/charts'
import { CHART_COLORS_HEX_LIST, getChartColor } from '@/components/charts/chartTokens'
import PieChartView from '@/components/charts/PieChartView'

/** Map legacy colorClass strings → a hex seed color for index 0 */
function resolveBaseColor(colorClass = '') {
  if (colorClass.includes('success')) return getChartColor('success')
  if (colorClass.includes('warning')) return getChartColor('warning')
  if (colorClass.includes('danger'))  return getChartColor('danger')
  return getChartColor('primary') // default
}

const BarChart = memo(function BarChart({
  items,
  valueKey = 'count',
  labelKey = 'label',
  colorClass = 'bg-v-primary',
  height = 264,
}) {
  const baseColor = useMemo(() => resolveBaseColor(colorClass), [colorClass])

  // Normalize items → [{ name, value, percentage? }]
  const data = useMemo(
    () =>
      (items ?? []).map((item, idx) => ({
        name: item[labelKey] ?? '—',
        value: Number(item[valueKey] ?? 0),
        percentage: item.percentage,
        // First bar gets the semantically correct color; rest cycle naturally
        fill: idx === 0 ? baseColor : CHART_COLORS_HEX_LIST[idx % CHART_COLORS_HEX_LIST.length],
      })),
    [items, valueKey, labelKey, baseColor],
  )

  return (
    <BarChartView
      data={data}
      dataKey="value"
      nameKey="name"
      layout="vertical"
      height={height}
      barSize={20}
      valueFormatter={(value, _name) => {
        // Show percentage inline if available in payload
        return String(value)
      }}
    />
  )
})

export default BarChart

/**
 * SimpleBarChart — horizontal bars (vertical layout in Recharts terms)
 * Same API as before.
 */
export const SimpleBarChart = memo(function SimpleBarChart({
  data = [],
  valueKey = 'value',
  labelKey = 'name',
  color,
}) {
  const normalized = useMemo(
    () =>
      data.map((item) => ({
        name: item[labelKey] ?? '—',
        value: Number(item[valueKey] ?? 0),
        fill: color ?? CHART_COLORS_HEX_LIST[0],
      })),
    [data, valueKey, labelKey, color],
  )

  return (
    <BarChartView
      data={normalized}
      dataKey="value"
      nameKey="name"
      layout="horizontal"
      height={264}
      barSize={20}
    />
  )
})

/**
 * PieChart — now a real pie chart (was incorrectly a BarChart before).
 * Same external API as the old broken version.
 */
export const PieChart = memo(function PieChart({
  data = [],
  valueKey = 'value',
  nameKey = 'name',
  colors,
}) {
  const normalized = useMemo(
    () =>
      data.map((item) => ({
        name: item[nameKey] ?? '—',
        value: Number(item[valueKey] ?? 0),
      })),
    [data, valueKey, nameKey],
  )

  return (
    <PieChartView
      data={normalized}
      dataKey="value"
      nameKey="name"
      colors={colors}
      height={264}
      showLegend
    />
  )
})
