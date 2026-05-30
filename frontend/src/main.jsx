import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import Bootstrap from '@/app/Bootstrap'
import { initTheme } from '@/utils/theme'
import '@/index.css'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Bootstrap>
      <RouterProvider router={router} />
    </Bootstrap>
  </StrictMode>,
)
