import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import { organizerProfileService } from '@/services/organizer-profile.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ProtectedRoute({
  children,
  allowedRoles,
  allowPasswordChange = false,
  allowOnboarding = false,
}) {
  const { isAuthenticated, role, mustChangePassword, isBootstrapping } = useAuth()
  const location = useLocation()
  const [profileStatus, setProfileStatus] = useState({ loading: false, complete: true })

  useEffect(() => {
    // Only check profile completion for organizers who have changed their password
    if (isAuthenticated && role === 'organizer' && !mustChangePassword && !allowOnboarding) {
      setProfileStatus({ loading: true, complete: true })
      organizerProfileService
        .getProfileStatus()
        .then(({ data }) => {
          setProfileStatus({ loading: false, complete: data.complete })
        })
        .catch(() => {
          // If check fails, allow access (fail open)
          setProfileStatus({ loading: false, complete: true })
        })
    }
  }, [isAuthenticated, role, mustChangePassword, allowOnboarding])

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

  // Password change check
  if (mustChangePassword && !allowPasswordChange && !allowOnboarding) {
    return <Navigate to="/change-password" state={{ from: location }} replace />
  }

  if (!mustChangePassword && allowPasswordChange && !allowOnboarding) {
    return <Navigate to={getRoleDashboardPath(role)} replace />
  }

  // Profile completion check — redirect organizers to onboarding
  if (role === 'organizer' && !mustChangePassword && !allowOnboarding) {
    if (profileStatus.loading) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      )
    }

    if (!profileStatus.complete) {
      return <Navigate to="/organizer/onboarding" replace />
    }
  }

  // Allow onboarding page even if profile check says incomplete
  if (allowOnboarding) {
    return children
  }

  return children
}
