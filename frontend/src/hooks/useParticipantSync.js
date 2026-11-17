import { useEffect } from 'react'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { sameParticipantContext } from '@/utils/workspace'

// Throttle so moving between participant pages doesn't re-fetch every time.
const MIN_GAP_MS = 30_000
let lastSyncAt = 0

/**
 * Keeps a participant's account context (officership and participant types)
 * fresh while they use the student pages.
 *
 * These are assigned by someone else: an organizer can make a student an
 * officer or remove them at any time, and an admin can change the account type.
 * The values this browser holds come from sign-in, so they can go stale. This
 * re-reads them on mount and when the tab becomes visible again. The server stays
 * authoritative; this only decides what the sidebar offers.
 */
export function useParticipantSync(enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false

    const sync = async (force = false) => {
      const now = Date.now()
      if (!force && now - lastSyncAt < MIN_GAP_MS) return
      lastSyncAt = now
      try {
        const { data } = await authService.getMe()
        if (cancelled || !data?.user) return
        const current = useAuthStore.getState().user
        if (!current || data.user.id !== current.id) return
        if (sameParticipantContext(data.user, current)) return

        const lostOfficer = Boolean(current.officership) && !data.user.officership
        useAuthStore.getState().updateUser(data.user)
        if (lostOfficer) useToastStore.getState().info('Your officer access has ended.')
      } catch {
        // Transient failures are ignored; the next visit or focus retries.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }

    void sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}

/** Test helper: forget the last sync so a test can trigger one immediately. */
export function resetParticipantSyncThrottle() {
  lastSyncAt = 0
}
