import { useEffect } from 'react'
import { refreshSession } from '@/services/api'
import { useAuthStore } from '@/store/auth.store'

export function useAuthBootstrap() {
  const finishBootstrap = useAuthStore((s) => s.finishBootstrap)

  useEffect(() => {
    let active = true
    // Share the identity-bound refresh already used by API recovery. StrictMode
    // can mount this effect twice; two independent refresh responses otherwise
    // race the response interceptor and can clear a successfully restored login.
    refreshSession().finally(() => {
      if (active) finishBootstrap()
    }).catch(() => {}) // refreshSession owns authorization failure handling.
    return () => { active = false }
  }, [finishBootstrap])
}
