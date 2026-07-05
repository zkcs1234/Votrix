/**
 * RechartsWrapper.jsx
 *
 * Re-exports the unified chart system under legacy names so any code
 * that imports from this file continues to work unchanged.
 *
 * The old "PieChart" export here was actually a BarChart — it is now
 * a real PieChart backed by PieChartView.
 */
export { default }                      from './BarChart'          // default = BarChart
export { SimpleBarChart, PieChart }     from './BarChart'
export { default as BarChartView }      from '@/components/charts/BarChartView'
export { default as LineChartView }     from '@/components/charts/LineChartView'
export { default as AreaChartView }     from '@/components/charts/AreaChartView'
export { default as PieChartView }      from '@/components/charts/PieChartView'
export { default as ComposedChartView } from '@/components/charts/ComposedChartView'
