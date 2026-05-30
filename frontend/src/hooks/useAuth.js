import { useAuthStore } from '@/store/auth.store'

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setSession = useAuthStore((s) => s.setSession)
  const updateUser = useAuthStore((s) => s.updateUser)
  const clearSession = useAuthStore((s) => s.clearSession)

  return {
    accessToken,
    user,
    isAuthenticated,
    setSession,
    updateUser,
    clearSession,
    role: user?.role ?? null,
    mustChangePassword: Boolean(user?.mustChangePassword),
  }
}
