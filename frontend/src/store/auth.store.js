import { create } from 'zustand'
import { STORAGE_KEYS } from '@/utils/constants'
import { getItem, getJSON, removeItem, setItem, setJSON } from '@/utils/storage'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'

const initialToken = getItem(STORAGE_KEYS.ACCESS_TOKEN)
const initialUser = getJSON(STORAGE_KEYS.USER)

export const useAuthStore = create((set, get) => ({
  accessToken: initialToken,
  user: initialUser,
  isAuthenticated: Boolean(initialToken),

  setSession({ accessToken, user, csrfToken }) {
    if (accessToken) setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken)
    if (user) setJSON(STORAGE_KEYS.USER, user)
    if (csrfToken) setCsrfToken(csrfToken)
    set({
      accessToken: accessToken ?? null,
      user: user ?? null,
      isAuthenticated: Boolean(accessToken),
    })
  },

  updateUser(user) {
    if (user) setJSON(STORAGE_KEYS.USER, user)
    set({ user: user ?? null })
  },

  clearSession() {
    removeItem(STORAGE_KEYS.ACCESS_TOKEN)
    removeItem(STORAGE_KEYS.USER)
    clearCsrfToken()
    set({ accessToken: null, user: null, isAuthenticated: false })
  },

  mustChangePassword() {
    return Boolean(get().user?.mustChangePassword)
  },
}))
