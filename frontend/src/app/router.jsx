import { Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { routeConfig } from '@/routes'
import PageLoader from '@/components/ui/PageLoader'

function RouteFallback() {
  return <PageLoader />
}

function wrapWithSuspense(routes) {
  return routes.map((route) => {
    const next = { ...route }
    if (next.element) {
      next.element = <Suspense fallback={<RouteFallback />}>{next.element}</Suspense>
    }
    if (next.children) {
      next.children = wrapWithSuspense(next.children)
    }
    return next
  })
}

export const router = createBrowserRouter(wrapWithSuspense(routeConfig))
