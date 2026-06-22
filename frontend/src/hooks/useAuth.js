import { useAuthStore } from '@/store/auth.store'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)
  const setSession = useAuthStore((s) => s.setSession)
  const updateUser = useAuthStore((s) => s.updateUser)
  const clearSession = useAuthStore((s) => s.clearSession)

  return {
    user,
    isAuthenticated,
    isBootstrapping,
    setSession,
    updateUser,
    clearSession,
    role: user?.role ?? null,
    mustChangePassword: Boolean(user?.mustChangePassword),
  }
}
