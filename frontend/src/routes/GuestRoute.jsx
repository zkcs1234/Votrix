import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'

export default function GuestRoute({ children }) {
  const { isAuthenticated, role, mustChangePassword } = useAuth()

  if (isAuthenticated && role) {
    if (mustChangePassword) {
      return <Navigate to="/change-password" replace />
    }
    return <Navigate to={getRoleDashboardPath(role)} replace />
  }

  return children
}
