import { QueryClient } from '@tanstack/react-query'

// Shared React Query client. Adopted page-by-page — pages not yet migrated keep
// their existing useEffect + useState fetching untouched. Conservative defaults:
// a short stale window (data is dashboardy, not static), no refetch-on-focus
// (this app drives freshness through websockets), and a single retry.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
