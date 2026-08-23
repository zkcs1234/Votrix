import { useEffect, useMemo, useRef } from 'react'

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return value === true
  if (Array.isArray(value)) return value.some(hasMeaningfulValue)
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulValue)
  return false
}

export function hasMeaningfulDraftData(data) {
  if (!data || typeof data !== 'object') return false
  return hasMeaningfulValue(data.title) || hasMeaningfulValue(data.banner) || hasMeaningfulValue(data.payload)
}

/**
 * Debounced Create-session draft autosave.
 * The backend already treats draft payloads as opaque partial form snapshots,
 * so this hook only decides when a snapshot is worth sending.
 */
export default function useSilentDraftAutosave({
  enabled,
  data,
  saveDraftAsync,
  delay = 1000,
  onAutosave,
}) {
  const lastSavedRef = useRef('')
  const latestDataRef = useRef(data)
  const serialized = useMemo(() => JSON.stringify(data ?? null), [data])
  latestDataRef.current = data

  useEffect(() => {
    if (!enabled || !hasMeaningfulDraftData(latestDataRef.current)) return undefined

    if (serialized === lastSavedRef.current) return undefined

    const timer = window.setTimeout(() => {
      lastSavedRef.current = serialized
      onAutosave?.()
      saveDraftAsync(latestDataRef.current)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [delay, enabled, onAutosave, saveDraftAsync, serialized])
}
