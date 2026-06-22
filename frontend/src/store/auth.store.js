import { create } from 'zustand'
import { STORAGE_KEYS } from '@/utils/constants'
import { removeItem, setJSON } from '@/utils/storage'

import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'

import { clearVotrixDrafts } from '@/utils/draftStorage'

// Token is now stored in HTTP-only cookie.
// Do NOT bootstrap user/role from localStorage because that can cause
// role bleed-through when switching accounts without logout.
const initialUser = null

export const useAuthStore = create((set, get) => ({
  user: initialUser,
  isAuthenticated: false,
  isBootstrapping: true,


  setSession({ user, csrfToken }) {
    // accessToken stored in HTTP-only cookie - no localStorage access
    if (user) setJSON(STORAGE_KEYS.USER, user)
    if (csrfToken) setCsrfToken(csrfToken)
    set({
      user: user ?? null,
      isAuthenticated: Boolean(user),
      isBootstrapping: false,
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
    clearVotrixDrafts()
    set({ user: null, isAuthenticated: false, isBootstrapping: false })
  },

  finishBootstrap() {
    set({ isBootstrapping: false })
  },

  mustChangePassword() {
    return Boolean(get().user?.mustChangePassword)
  },
}))
