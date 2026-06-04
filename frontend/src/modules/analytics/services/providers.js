/**
 * Built-in analytics providers — one per module.
 *
 * Each provider is the boundary between the shared analytics layer and
 * the module's own service. It calls only that module's endpoints and
 * returns that module's domain shape. No provider reaches across to
 * another module's data.
 *
 * Importing this file has the side effect of registering all three
 * providers. Views then use useModuleAnalytics({ moduleId, eventId })
 * to consume them.
 */

import { registerAnalyticsProvider } from './registry'
import { electionService } from '@/services/election.service'
import { pageantService } from '@/services/pageant.service'
import { reportsService } from '@/services/reports.service'
import { pollingService } from '@/services/polling.service'

const unwrap = (promise) =>
  promise.then((res) => res?.data?.analytics ?? res?.data?.report ?? res?.data ?? null)

registerAnalyticsProvider({
  id: 'election',
  label: 'Election',
  async fetchAnalytics(eventId) {
    return unwrap(electionService.getAnalytics(eventId))
  },
  async fetchReport(eventId) {
    const { data } = await reportsService.getElectionReport(eventId)
    return data?.report ?? null
  },
})

registerAnalyticsProvider({
  id: 'competition',
  label: 'Competition',
  async fetchAnalytics(eventId) {
    return unwrap(pageantService.getAnalytics(eventId))
  },
  async fetchReport(eventId) {
    const { data } = await reportsService.getPageantReport(eventId)
    return data?.report ?? null
  },
})

registerAnalyticsProvider({
  id: 'polling',
  label: 'Polling',
  async fetchAnalytics(eventId) {
    return unwrap(pollingService.getAnalytics(eventId))
  },
  async fetchReport(eventId) {
    const { data } = await reportsService.getPollingReport(eventId)
    return data?.report ?? null
  },
})
