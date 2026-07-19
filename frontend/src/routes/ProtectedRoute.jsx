import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ProtectedRoute({
  children,
  allowedRoles,
  allowPasswordChange = false,
}) {
  const { isAuthenticated, role, mustChangePassword, isBootstrapping } = useAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
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
