import { createBrowserRouter } from 'react-router-dom'
import { routeConfig } from '@/routes'
import { wrapWithSuspense } from './routerSuspense'

export const router = createBrowserRouter(wrapWithSuspense(routeConfig))
