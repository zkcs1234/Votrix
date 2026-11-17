import { useEffect } from 'react'
import { platformService } from '@/services/platform.service'
import { usePlatformStore } from '@/store/platform.store'

const SYNC_INTERVAL_MS = 60_000

/**
 * Keeps the platform name and maintenance state current for everyone, signed in
 * or not: on load, whenever the tab becomes visible again, and every minute. Also
 * keeps the browser tab title equal to the platform name.
 */
export function usePlatformSync() {
  const platformName = usePlatformStore((s) => s.platformName)

  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      try {
        const { data } = await platformService.get()
        if (!cancelled) usePlatformStore.getState().apply(data)
      } catch {
        // Offline or the server is restarting: keep what we have; the next tick retries.
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
  }, [])

  useEffect(() => {
    document.title = platformName
  }, [platformName])
}
