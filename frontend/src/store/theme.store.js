import { create } from 'zustand'
import { getItem, setItem } from '@/utils/storage'

const STORAGE_KEY = 'votrix_theme'

export const useThemeStore = create((set, get) => ({
  theme: getItem(STORAGE_KEY) || 'light',

  setTheme(theme) {
    setItem(STORAGE_KEY, theme)
    set({ theme })
  },

  toggleTheme() {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
}))
