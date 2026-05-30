import { create } from 'zustand'

let idCounter = 0

export const useToastStore = create((set, get) => ({
  toasts: [],

  add(message, type = 'info', duration = 4000) {
    const id = ++idCounter
    set({ toasts: [...get().toasts, { id, message, type }] })

    if (duration > 0) {
      setTimeout(() => get().remove(id), duration)
    }

    return id
  },

  remove(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  success(message, duration) {
    return get().add(message, 'success', duration)
  },

  error(message, duration) {
    return get().add(message, 'error', duration ?? 5000)
  },

  info(message, duration) {
    return get().add(message, 'info', duration)
  },
}))
