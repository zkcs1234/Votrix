import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'votrix.event-progress'

function loadProgress(module, eventId) {
  if (!eventId || eventId === 'new') return []
  try {
    const key = `${STORAGE_PREFIX}.${module}:${eventId}`
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveProgress(module, eventId, keys) {
  if (!eventId || eventId === 'new') return
  try {
    const key = `${STORAGE_PREFIX}.${module}:${eventId}`
    localStorage.setItem(key, JSON.stringify(keys))
  } catch {
    /* localStorage may be full or unavailable */
  }
}

/**
 * Tracks which event stages the user has visited/completed.
 * Persisted in localStorage so it survives page reloads.
 *
 * @param {string} module - 'election', 'competition', or 'polling'
 * @param {string} eventId - The event's UUID (or 'new' for fresh events)
 * @returns {{ completedKeys: string[], markComplete: (key: string) => void, seed: (keys: string[]) => void }}
 */
export default function useEventProgress(module, eventId) {
  const [completedKeys, setCompletedKeys] = useState(() =>
    loadProgress(module, eventId),
  )

  useEffect(() => {
    setCompletedKeys(loadProgress(module, eventId))
  }, [module, eventId])

  useEffect(() => {
    saveProgress(module, eventId, completedKeys)
  }, [module, eventId, completedKeys])

  const markComplete = useCallback(
    (key) => {
      setCompletedKeys((prev) => {
        if (prev.includes(key)) return prev
        return [...prev, key]
      })
    },
    [],
  )

  const seed = useCallback(
    (keys) => {
      setCompletedKeys((prev) => {
        const merged = [...prev]
        for (const k of keys) {
          if (!merged.includes(k)) merged.push(k)
        }
        return merged
      })
    },
    [],
  )

  return { completedKeys, markComplete, seed }
}
