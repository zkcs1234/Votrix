import { create } from 'zustand'

// The two platform settings every screen needs before anyone signs in:
// the platform name (logo, titles) and whether maintenance mode is on.
// They come from GET /api/public/platform and are kept fresh by usePlatformSync.
export const DEFAULT_PLATFORM_NAME = 'Votrix'

export const usePlatformStore = create((set) => ({
  platformName: DEFAULT_PLATFORM_NAME,
  maintenanceMode: false,
  loaded: false,

  /** Apply values from the server (or from the admin who just saved them). */
  apply({ platformName, maintenanceMode } = {}) {
    set((state) => ({
      platformName:
        typeof platformName === 'string' && platformName.trim() ? platformName.trim() : state.platformName,
      maintenanceMode: typeof maintenanceMode === 'boolean' ? maintenanceMode : state.maintenanceMode,
      loaded: true,
    }))
  },

  /** Set when an API call is answered with the MAINTENANCE_MODE 503. */
  setMaintenance(on) {
    set({ maintenanceMode: Boolean(on) })
  },
}))
