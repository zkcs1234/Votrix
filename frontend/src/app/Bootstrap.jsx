import { useEffect } from 'react'
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap'
import { useCsrfBootstrap } from '@/hooks/useCsrfBootstrap'
import { useAuthStore } from '@/store/auth.store'
import ToastContainer from '@/components/ui/ToastContainer'
import { connect, disconnect } from '@/services/socket.service'

export default function Bootstrap({ children }) {
  useCsrfBootstrap()
  useAuthBootstrap()

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) connect()
    else disconnect()
  }, [isAuthenticated])

  return (
    <>
      {children}
      <ToastContainer />
    </>
  )
}
