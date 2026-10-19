import { create } from 'zustand'
import { STORAGE_KEYS } from '@/utils/constants'
import { removeItem, setJSON } from '@/utils/storage'

import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'

import { clearVotrixDrafts, clearCompetitionScoreDrafts } from '@/utils/draftStorage'

// Do NOT bootstrap user/role from localStorage because that can cause
// role bleed-through when switching accounts without logout.
const initialUser = null
removeItem(STORAGE_KEYS.ACCESS_TOKEN)

export const useAuthStore = create((set, get) => ({
  user: initialUser,
  isAuthenticated: false,
  isBootstrapping: true,


  setSession({ user, csrfToken }) {
    if (get().user?.id && get().user.id !== user?.id) clearCompetitionScoreDrafts()
    removeItem(STORAGE_KEYS.ACCESS_TOKEN)
    if (user) setJSON(STORAGE_KEYS.USER, user)
    if (csrfToken) setCsrfToken(csrfToken)
    set({
      user: user ?? null,
      isAuthenticated: Boolean(user),
      isBootstrapping: false,
    })
  },

  updateUser(user) {
    if (get().user?.id && get().user.id !== user?.id) clearCompetitionScoreDrafts()
    if (user) setJSON(STORAGE_KEYS.USER, user)
    set({ user: user ?? null })
  },

  clearSession() {
    removeItem(STORAGE_KEYS.ACCESS_TOKEN)
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
