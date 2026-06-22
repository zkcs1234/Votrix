import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'

import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function GuestRoute({ children }) {
  const { isAuthenticated, role, mustChangePassword, isBootstrapping } = useAuth()

  if (isBootstrapping) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (isAuthenticated && role) {
    if (mustChangePassword) {
      return <Navigate to="/change-password" replace />
    }
    return <Navigate to={getRoleDashboardPath(role)} replace />
  }

  return children
}
