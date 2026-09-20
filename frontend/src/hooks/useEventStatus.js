import { useEffect, useState, useCallback } from 'react'
import { isSetupLocked, isParticipantsLocked } from '@/utils/constants'

/**
 * Fetches an event's lifecycle status and derives the staged edit-locks so any
 * organizer setup/roster page can disable its controls consistently. The
 * backend enforces the same locks; this is UX only.
 *
 * @param {{ getEvent: (id: string) => Promise<{ data: { event: { status?: string } } }> }} service
 * @param {string} eventId
 * @returns {{ status: string|null, loading: boolean, setupLocked: boolean, rosterLocked: boolean, reload: () => void }}
 */
export default function useEventStatus(service, eventId) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!eventId || eventId === 'new') {
      setLoading(false)
      return
    }
    try {
      const { data } = await service.getEvent(eventId)
      setStatus(data.event?.status ?? null)
    } catch (err) {
      console.error('Failed to load event status:', err)
    } finally {
      setLoading(false)
    }
  }, [service, eventId])

  useEffect(() => {
    reload()
  }, [reload])

  return {
    status,
    loading,
    setupLocked: isSetupLocked(status),
    rosterLocked: isParticipantsLocked(status),
    reload,
  }
}
