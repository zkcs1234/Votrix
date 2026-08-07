import { useCallback, useEffect, useState } from 'react'
import { draftService } from '@/services/draft.service'

const CACHE_PREFIX = 'votrix.event-draft.cache'

function readCachedDraft(module) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}.${module}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCachedDraft(module, value) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}.${module}`, JSON.stringify(value))
  } catch {
    // Ignore storage failures and keep the in-memory state.
  }
}

function removeCachedDraft(module) {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}.${module}`)
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Draft persistence for unfinished Create sessions.
 * Drafts are scoped per (module); only one draft per module at a time.
 * Drafts are Create-only and must NEVER merge with existing events.
 *
 * @param {string} module - 'election' | 'competition' | 'polling'
 * @returns {{
 *   hasDraft: boolean,
 *   draft: object|null,
 *   saveDraft: (data: object) => Promise<object|null>,
 *   resumeDraft: () => object|null,
 *   deleteDraft: () => Promise<void>,
 *   refreshDraft: () => Promise<object|null>,
 *   loading: boolean,
 * }}
 */
export default function useDraft(module) {
  const [draft, setDraft] = useState(() => readCachedDraft(module))
  const [loading, setLoading] = useState(false)

  const refreshDraft = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await draftService.getDraft(module)
      const nextDraft = data?.draft ? { ...data.draft, module } : null
      if (nextDraft) {
        writeCachedDraft(module, nextDraft)
      } else {
        removeCachedDraft(module)
      }
      setDraft(nextDraft)
      return nextDraft
    } catch (error) {
      console.error(`[draft] failed to refresh draft for ${module}:`, error)
      const cachedDraft = readCachedDraft(module)
      setDraft(cachedDraft)
      return cachedDraft
    } finally {
      setLoading(false)
    }
  }, [module])

  useEffect(() => {
    void refreshDraft()
  }, [refreshDraft])

  const saveDraft = useCallback(async (data) => {
    const payload = {
      step: data?.step ?? 'details',
      title: data?.title ?? null,
      banner: data?.banner ?? null,
      payload: data?.payload ?? data ?? {},
    }

    const optimisticDraft = {
      module,
      step: payload.step,
      title: payload.title,
      banner: payload.banner,
      payload: payload.payload,
      updatedAt: new Date().toISOString(),
    }

    writeCachedDraft(module, optimisticDraft)
    setDraft(optimisticDraft)

    try {
      const { data: result } = await draftService.saveDraft(module, payload)
      const serverDraft = result?.draft ? { ...result.draft, module } : optimisticDraft
      writeCachedDraft(module, serverDraft)
      setDraft(serverDraft)
      return serverDraft
    } catch (error) {
      console.error(`[draft] failed to save draft for ${module}:`, error)
      throw error
    }
  }, [module])

  const resumeDraft = useCallback(() => draft, [draft])

  const deleteDraft = useCallback(async () => {
    removeCachedDraft(module)
    setDraft(null)

    try {
      await draftService.deleteDraft(module)
    } catch (error) {
      console.error(`[draft] failed to delete draft for ${module}:`, error)
    }
  }, [module])

  return {
    hasDraft: Boolean(draft),
    draft,
    saveDraft,
    resumeDraft,
    deleteDraft,
    refreshDraft,
    loading,
  }
}
