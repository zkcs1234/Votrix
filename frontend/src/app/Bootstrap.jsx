import { useEffect } from 'react'
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap'
import { useCsrfBootstrap } from '@/hooks/useCsrfBootstrap'
import { useThemeStore } from '@/store/theme.store'
import { useAuthStore } from '@/store/auth.store'
import { applyTheme } from '@/utils/theme'
import ToastContainer from '@/components/ui/ToastContainer'
import { connect, disconnect } from '@/services/socket.service'

export default function Bootstrap({ children }) {
  useCsrfBootstrap()
  useAuthBootstrap()

  const theme = useThemeStore((s) => s.theme)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) connect()
    else disconnect()
  }, [isAuthenticated])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <>
      {children}
      <ToastContainer />
    </>
  )
}
