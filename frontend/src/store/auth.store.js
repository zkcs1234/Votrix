import { create } from 'zustand'
import { STORAGE_KEYS } from '@/utils/constants'
import { getJSON, removeItem, setJSON } from '@/utils/storage'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'

// Token is now stored in HTTP-only cookie - cannot access via JavaScript
const initialUser = getJSON(STORAGE_KEYS.USER)

export const useAuthStore = create((set, get) => ({
  // accessToken removed - now only in HTTP-only cookie
  user: initialUser,
  isAuthenticated: Boolean(initialUser), // User presence indicates authenticated

  setSession({ user, csrfToken }) {
    // accessToken stored in HTTP-only cookie - no localStorage access
    if (user) setJSON(STORAGE_KEYS.USER, user)
    if (csrfToken) setCsrfToken(csrfToken)
    set({
      user: user ?? null,
      isAuthenticated: Boolean(user),
    })
  },

  updateUser(user) {
    if (user) setJSON(STORAGE_KEYS.USER, user)
    set({ user: user ?? null })
  },

  clearSession() {
    // Token cleared via cookie - only clear local user data
    removeItem(STORAGE_KEYS.USER)
    clearCsrfToken()
    set({ user: null, isAuthenticated: false })
  },

  mustChangePassword() {
    return Boolean(get().user?.mustChangePassword)
  },
}))
