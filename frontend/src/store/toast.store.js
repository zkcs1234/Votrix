import { create } from 'zustand'

let idCounter = 0

const DEFAULT_DURATIONS = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
}

/**
 * Normalize an `add` payload. Accepts either a plain string message or an
 * object `{ title, message }` so callers can show a bold headline plus a
 * supporting reason (e.g. "Sign-in failed" / "Invalid email or password").
 */
function normalize(input) {
  if (input && typeof input === 'object') {
    return { title: input.title ?? null, message: input.message ?? '' }
  }
  return { title: null, message: input ?? '' }
}

export const useToastStore = create((set, get) => ({
  toasts: [],

  add(input, type = 'info', duration) {
    const { title, message } = normalize(input)
    const resolvedDuration = duration ?? DEFAULT_DURATIONS[type] ?? 4000

    // De-duplicate: if an identical toast is already visible, refresh it
    // instead of stacking a second copy.
    const existing = get().toasts.find(
      (t) => t.type === type && t.message === message && t.title === title,
    )
    if (existing) {
      if (existing.timeoutId) clearTimeout(existing.timeoutId)
      const timeoutId =
        resolvedDuration > 0
          ? setTimeout(() => get().remove(existing.id), resolvedDuration)
          : null
      set({
        toasts: get().toasts.map((t) =>
          t.id === existing.id ? { ...t, timeoutId } : t,
        ),
      })
      return existing.id
    }

    const id = ++idCounter
    const timeoutId =
      resolvedDuration > 0
        ? setTimeout(() => get().remove(id), resolvedDuration)
        : null

    set({ toasts: [...get().toasts, { id, title, message, type, timeoutId }] })
    return id
  },

  remove(id) {
    const target = get().toasts.find((t) => t.id === id)
    if (target?.timeoutId) clearTimeout(target.timeoutId)
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  success(message, duration) {
    return get().add(message, 'success', duration)
  },

  error(message, duration) {
    return get().add(message, 'error', duration)
  },

  warning(message, duration) {
    return get().add(message, 'warning', duration)
  },

  info(message, duration) {
    return get().add(message, 'info', duration)
  },
}))
