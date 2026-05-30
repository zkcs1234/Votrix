import { useEffect } from 'react'
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap'
import { useCsrfBootstrap } from '@/hooks/useCsrfBootstrap'
import { useThemeStore } from '@/store/theme.store'
import { applyTheme } from '@/utils/theme'
import ToastContainer from '@/components/ui/ToastContainer'

export default function Bootstrap({ children }) {
  useCsrfBootstrap()
  useAuthBootstrap()

  const theme = useThemeStore((s) => s.theme)

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
