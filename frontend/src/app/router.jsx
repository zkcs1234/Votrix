import { createBrowserRouter } from 'react-router-dom'
import { routeConfig } from '@/routes'
import { wrapWithSuspense } from './routerSuspense'
import MaintenanceGate from './MaintenanceGate'

// Every route sits under the maintenance gate (a pathless layout route).
export const router = createBrowserRouter([
  { element: <MaintenanceGate />, children: wrapWithSuspense(routeConfig) },
])
