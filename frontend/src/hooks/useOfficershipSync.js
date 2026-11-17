import { useEffect } from 'react'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'
import { useToastStore } from '@/store/toast.store'
import { sameOfficership } from '@/utils/workspace'

const SYNC_INTERVAL_MS = 60_000

/**
 * Keeps an officer's `officership` fresh while they use the organizer workspace.
 *
 * The officership is assigned and removed by someone else, so what this browser
 * holds can go stale. When the server says it has changed (deactivated, owner
 * suspended) the store is updated; ProtectedRoute then moves the user back to
 * their student view instead of leaving them on pages whose requests now fail.
 * The backend is always authoritative; this only improves the experience.
 */
export function useOfficershipSync(enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false

    const sync = async () => {
      try {
        const { data } = await authService.getMe()
        if (cancelled || !data?.user) return
        const current = useAuthStore.getState().user
        if (!current || data.user.id !== current.id) return
        if (sameOfficership(data.user.officership, current.officership)) return

        const lost = Boolean(current.officership) && !data.user.officership
        useAuthStore.getState().updateUser(data.user)
        if (lost) useToastStore.getState().info('Your officer access has ended.')
      } catch {
        // Transient failures are ignored; the next tick or focus retries.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }

    void sync()
    const timer = setInterval(() => void sync(), SYNC_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}
