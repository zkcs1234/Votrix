/**
 * Shared hook that loads analytics + report data for a given module.
 *
 * Modules stay isolated:
 *   - The fetcher comes from the analytics registry, which is populated
 *     by the module itself.
 *   - This hook never imports any module service directly.
 *   - Data is only refreshed at the cadence the caller asks for.
 *
 * Usage:
 *   const { data, report, loading, refresh } = useModuleAnalytics({
 *     moduleId: 'election',
 *     eventId,
 *     pollIntervalMs: 30_000,
 *   })
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAnalyticsProvider } from '../services/registry'

export function useModuleAnalytics({
  moduleId,
  eventId,
  pollIntervalMs = 0,
  skipReport = false,
} = {}) {
  const [data, setData] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const aliveRef = useRef(true)
  const inflightRef = useRef(false)

  const load = useCallback(async () => {
    const provider = getAnalyticsProvider(moduleId)
    if (!provider) {
      setError(new Error(`No analytics provider registered for module "${moduleId}"`))
      setLoading(false)
      return
    }
    if (inflightRef.current) return
    inflightRef.current = true
    try {
      const tasks = [provider.fetchAnalytics(eventId)]
      if (!skipReport) tasks.push(provider.fetchReport(eventId))
      const results = await Promise.allSettled(tasks)
      if (!aliveRef.current) return

      const [analyticsRes, reportRes] = results

      if (analyticsRes.status === 'fulfilled') {
        setData(analyticsRes.value)
        setError(null)
      } else {
        setError(analyticsRes.reason)
      }

      if (reportRes && reportRes.status === 'fulfilled') {
        setReport(reportRes.value)
      } else if (reportRes && reportRes.status === 'rejected') {
        // Report failures are non-fatal for analytics views.
      }

      setLastUpdated(new Date())
    } finally {
      inflightRef.current = false
      if (aliveRef.current) setLoading(false)
    }
  }, [moduleId, eventId, skipReport])

  useEffect(() => {
    aliveRef.current = true
    // Reset state and kick off the first load asynchronously so we never
    // call setState (directly or via load()) synchronously inside the
    // effect body. This avoids cascading renders flagged by
    // react-hooks/set-state-in-effect.
    const start = () => {
      setLoading(true)
      setData(null)
      setReport(null)
      load()
    }
    const handle = setTimeout(start, 0)
    let intervalId = null
    if (pollIntervalMs > 0) {
      intervalId = setInterval(load, pollIntervalMs)
    }
    return () => {
      aliveRef.current = false
      clearTimeout(handle)
      if (intervalId) clearInterval(intervalId)
    }
  }, [load, pollIntervalMs])

  return {
    data,
    report,
    loading,
    error,
    lastUpdated,
    refresh: load,
  }
}
