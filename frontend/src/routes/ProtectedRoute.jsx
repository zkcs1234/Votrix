import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath, getRoleLoginPath } from '@/utils/auth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ProtectedRoute({
  children,
  allowedRoles,
  allowPasswordChange = false,
}) {
  const { isAuthenticated, role, mustChangePassword } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    const loginPath = allowedRoles?.length === 1 ? getRoleLoginPath(allowedRoles[0]) : '/'
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  if (!role) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    return <Navigate to={getRoleDashboardPath(role)} replace />
  }

  if (mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/change-password" replace />
  }

  if (!mustChangePassword && allowPasswordChange) {
    return <Navigate to={getRoleDashboardPath(role)} replace />
  }

  return children
}
