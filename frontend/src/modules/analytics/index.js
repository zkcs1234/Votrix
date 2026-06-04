/**
 * Shared analytics module — public surface.
 *
 * Components and utilities exported here are used by Election,
 * Competition, and Polling views. Importing this file ensures the
 * built-in providers are registered. Modules do not import each
 * other through this surface.
 */

import './services/providers'

export { useModuleAnalytics } from './hooks/useModuleAnalytics'
export {
  registerAnalyticsProvider,
  getAnalyticsProvider,
  listAnalyticsProviders,
  unregisterAnalyticsProvider,
} from './services/registry'

export {
  formatCount,
  formatPercentage,
  formatDecimal,
  formatDuration,
  formatDate,
  safePercentage,
} from './utils/format'

export {
  sortByValue,
  topN,
  withPercentage,
  sumBy,
  groupDistribution,
  summarizeTrend,
} from './utils/aggregations'

export { default as AnalyticsLayout } from '@/components/analytics/AnalyticsLayout'
export { default as AnalyticsStatsGrid } from '@/components/analytics/AnalyticsStatsGrid'
export { default as AnalyticsStatCard } from '@/components/analytics/AnalyticsStatCard'
export { default as AnalyticsSection } from '@/components/analytics/AnalyticsSection'
export { default as DistributionList } from '@/components/analytics/DistributionList'
export { default as RankingList } from '@/components/analytics/RankingList'
export { default as TrendList } from '@/components/analytics/TrendList'
export { default as ReportActionsBar } from '@/components/analytics/ReportActionsBar'
export { default as EmptyAnalyticsState } from '@/components/analytics/EmptyAnalyticsState'
export { default as ReportDocument } from '@/components/analytics/ReportDocument'

export {
  downloadCsv,
  downloadJson,
  downloadExcel,
  downloadPdf,
} from '@/utils/exportReport'
