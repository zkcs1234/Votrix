import { useEffect } from 'react'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'

export function useAuthBootstrap() {
  const setSession = useAuthStore((s) => s.setSession)
  const clearSession = useAuthStore((s) => s.clearSession)
  const finishBootstrap = useAuthStore((s) => s.finishBootstrap)

  useEffect(() => {
    authService
      .refresh()
      .then(({ data }) => {
        if (data?.user) {
          setSession({ user: data.user, csrfToken: data.csrfToken })
        } else {
          finishBootstrap()
        }
      })
      .catch(() => {
        clearSession()
      })
  }, [setSession, clearSession, finishBootstrap])
}
