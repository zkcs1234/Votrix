import { useCallback, useState } from 'react'

const DRAFT_PREFIX = 'votrix.event-draft'

/**
 * Draft persistence for unfinished Create sessions.
 * Drafts are scoped per (module); only one draft per module at a time.
 * Drafts are Create-only and must NEVER merge with existing events.
 *
 * @param {string} module - 'election' | 'competition' | 'polling'
 * @returns {{
 *   hasDraft: boolean,
 *   draft: object|null,
 *   saveDraft: (data: object) => void,
 *   resumeDraft: () => object|null,
 *   deleteDraft: () => void,
 *   refreshDraft: () => void,
 * }}
 */
export default function useDraft(module) {
  const key = `${DRAFT_PREFIX}.${module}`

  const readDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [key])

  const [draft, setDraft] = useState(() => readDraft())

  const refreshDraft = useCallback(() => {
    setDraft(readDraft())
  }, [readDraft])

  const saveDraft = useCallback(
    (data) => {
      const payload = {
        ...data,
        module,
        updatedAt: new Date().toISOString(),
      }
      try {
        localStorage.setItem(key, JSON.stringify(payload))
        setDraft(payload)
      } catch {
        /* localStorage may be full or unavailable */
      }
    },
    [key, module],
  )

  const resumeDraft = useCallback(() => {
    return readDraft()
  }, [readDraft])

  const deleteDraft = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    setDraft(null)
  }, [key])

  return {
    hasDraft: Boolean(draft),
    draft,
    saveDraft,
    resumeDraft,
    deleteDraft,
    refreshDraft,
  }
}
