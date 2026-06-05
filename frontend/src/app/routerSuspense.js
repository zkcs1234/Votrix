// Helper used by `app/router.jsx`. Exported from a non-component module so
// the react-refresh HMR boundary in `router.jsx` only sees components.
import { Suspense, createElement } from 'react'
import PageLoader from '@/components/ui/PageLoader'

 
export function wrapWithSuspense(routes) {
  return routes.map((route) => {
    const next = { ...route }
    if (next.element) {
      next.element = createElement(
        Suspense,
        { fallback: createElement(PageLoader) },
        next.element,
      )
    }
    if (next.children) {
      next.children = wrapWithSuspense(next.children)
    }
    return next
  })
}
