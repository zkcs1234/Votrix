import { Outlet, useLocation } from 'react-router-dom'
import MaintenanceScreen from '@/components/ui/MaintenanceScreen'
import { useAuthStore } from '@/store/auth.store'
import { usePlatformStore } from '@/store/platform.store'

// The only pages still reachable during maintenance: sign in, so an administrator
// can get back in. Everything else shows the maintenance screen.
const SIGN_IN_PATHS = new Set(['/', '/login'])

/**
 * Root route wrapper. While maintenance mode is on, anyone who is not an
 * administrator sees the maintenance screen instead of the app. The server
 * enforces the same rule on every request; this is the matching screen.
 */
export default function MaintenanceGate() {
  const maintenanceMode = usePlatformStore((s) => s.maintenanceMode)
  const role = useAuthStore((s) => s.user?.role)
  const { pathname } = useLocation()

  if (maintenanceMode && role !== 'admin' && !SIGN_IN_PATHS.has(pathname)) {
    return <MaintenanceScreen />
  }
  return <Outlet />
}
