import { create } from 'zustand'

/**
 * Lightweight "which event am I inside" context for the app shell. The module
 * stage layout already loads the event to compute stage locks, so it publishes
 * the title/status here and the shell's mobile drawer can show the event card
 * without issuing a second request.
 */
export const useEventContextStore = create((set) => ({
  eventId: null,
  title: null,
  status: null,
  setContext(next) {
    set({
      eventId: next?.eventId ?? null,
      title: next?.title ?? null,
      status: next?.status ?? null,
    })
  },
  clear() {
    set({ eventId: null, title: null, status: null })
  },
}))
