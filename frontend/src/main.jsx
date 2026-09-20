import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { router } from '@/app/router'
import { queryClient } from '@/app/queryClient'
import Bootstrap from '@/app/Bootstrap'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { initTheme } from '@/utils/theme'
import '@/index.css'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Bootstrap>
          <RouterProvider router={router} />
        </Bootstrap>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
