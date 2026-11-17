import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import useLatestRequest from '@/hooks/useLatestRequest'

/**
 * Loads one page of a participant list (My events, History, Results) and keeps
 * the latest response for the current filters. Changing the account or any filter
 * discards older responses, so a slow request can never overwrite a newer one.
 *
 * `fetcher(params)` returns an axios response whose data has `items` (or
 * `events`), `total`, and optional extras (counts, summary), kept in `meta`.
 */
export default function usePortalList(fetcher, params) {
  const { user } = useAuth()
  const key = `${user?.id}:${JSON.stringify(params)}`
  const beginRequest = useLatestRequest(key)
  const [state, setState] = useState({ items: [], total: 0, meta: null, page: 1, loading: true, loadingMore: false, error: null })

  const load = useCallback(
    async (page = 1, append = false) => {
      const isCurrent = beginRequest()
      try {
        const { data } = await fetcher({ ...params, page })
        if (!isCurrent()) return
        const incoming = data.items ?? data.events ?? []
        setState((prev) => ({
          items: append ? [...prev.items, ...incoming] : incoming,
          total: data.total ?? incoming.length,
          meta: data,
          page,
          loading: false,
          loadingMore: false,
          error: null,
        }))
      } catch (err) {
        if (!isCurrent()) return
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: err.response?.data?.message ?? 'This page could not be loaded.',
        }))
      }
    },
    // `key` already encodes the params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beginRequest, fetcher, key],
  )

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    void load(1)
  }, [load])

  const reload = useCallback(() => load(1), [load])
  const loadMore = useCallback(() => {
    setState((prev) => ({ ...prev, loadingMore: true }))
    return load(state.page + 1, true)
  }, [load, state.page])

  return { ...state, reload, loadMore, hasMore: state.items.length < state.total }
}
