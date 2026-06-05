import { useState, useEffect, useRef } from 'react'

/**
 * useDelayedLoading hook
 * Only shows loading state after specified delay
 * Use to prevent flashing loading indicators for fast requests (<300ms)
 *
 * @param {boolean} loading - Whether data is loading
 * @param {number} delay - Delay in ms before showing loader (default: 300)
 * @returns {boolean} - Whether to show loading indicator
 */
export function useDelayedLoading(loading, delay = 300) {
  const [showLoader, setShowLoader] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (loading) {
      // Start timer when loading begins
      timerRef.current = setTimeout(() => {
        // setState is intentional here: the timer fires asynchronously after
        // the delay elapses, not synchronously with the effect — this is
        // the "show loader only after a delay" pattern, not a cascading
        // re-render. The rule is too strict for this case.
         
        setShowLoader(true)
      }, delay)
    } else {
      // Clear timer and hide loader when loading completes
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLoader(false)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [loading, delay])

  // Return whether to show loading (only true after delay when actually loading)
  return loading && showLoader
}

/**
 * useQuickLoad hook
 * For requests that typically complete under 300ms
 * Shows nothing until delay, then shows skeleton
 *
 * @param {Function} fetchFn - Function that returns a promise
 * @param {number} delay - Delay in ms (default: 300)
 * @returns {Object} - { data, loading, error, refetch }
 */
export function useQuickLoad(fetchFn, delay = 300) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showLoader, setShowLoader] = useState(false)

  const refetch = async () => {
    setLoading(true)
    setError(null)

    // Start timer for skeleton display
    const timer = setTimeout(() => {
      setShowLoader(true)
    }, delay)

    try {
      const result = await fetchFn()
      setData(result)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data')
    } finally {
      clearTimeout(timer)
      setLoading(false)
      setShowLoader(false)
    }
  }

  useEffect(() => {
    // Fetch-on-mount pattern. refetch is intentionally not in deps to
    // avoid recreating the effect on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If loading is false but we haven't shown loader, return null (show nothing)
  const shouldShowLoading = loading && showLoader

  return { data, loading: shouldShowLoading, error, refetch }
}

/**
 * useDebounceLoading hook
 * Debounce loading state to prevent flickering
 *
 * @param {boolean} loading - Loading state
 * @param {number} debounceMs - Debounce time in ms (default: 200)
 * @returns {boolean} - Debounced loading state
 */
export function useDebounceLoading(loading, debounceMs = 200) {
  const [debouncedLoading, setDebouncedLoading] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (loading) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        // Asynchronous timer-based state update — see comment above.
         
        setDebouncedLoading(true)
      }, debounceMs)
    } else {
      // Immediately hide when loading stops
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDebouncedLoading(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [loading, debounceMs])

  return debouncedLoading
}

export default useDelayedLoading