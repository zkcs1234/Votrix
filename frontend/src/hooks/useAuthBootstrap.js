import { useEffect } from 'react'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'

export function useAuthBootstrap() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const updateUser = useAuthStore((s) => s.updateUser)
  const clearSession = useAuthStore((s) => s.clearSession)

  useEffect(() => {
    if (!isAuthenticated) return

    authService
      .getMe()
      .then(({ data }) => {
        if (data.user) updateUser(data.user)
      })
      .catch(() => {
        clearSession()
      })
  }, [isAuthenticated, updateUser, clearSession])
}
