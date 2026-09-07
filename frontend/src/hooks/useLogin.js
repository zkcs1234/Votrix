import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath, getSafeVoterDestination } from '@/utils/auth'
import { useToast } from '@/hooks/useToast'
import { voterService } from '@/services/voter.service'
import { USER_ROLES } from '@/utils/constants'
import { getErrorMessage } from '@/utils/getErrorMessage'


export function useLogin(loginFn) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSession, clearSession } = useAuth()


  const { success } = useToast()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)




  const handleSubmit = async (values) => {
    setError(null)
    setLoading(true)

    try {
      // The `api` request interceptor fetches a CSRF token automatically
      // for any POST. Login endpoints are CSRF-exempt on the server, so we
      // don't need a pre-flight round-trip here.
      const { data } = await loginFn({
        ...values,
        remember: Boolean(values.remember),
      })

      // Hard reset local auth state first to avoid role/dashboard bleed-through
      // when switching accounts without logout.
      clearSession()


      // Now set the session from the login response
      setSession({
        user: data.user,
        csrfToken: data.csrfToken,
      })

      success('Signed in successfully')


      const voterDestination = getSafeVoterDestination(location.state?.from)

      if (data.user.mustChangePassword) {
        navigate('/change-password', {
          replace: true,
          state: voterDestination ? { from: voterDestination } : null,
        })
      } else if (data.user.role === USER_ROLES.VOTER) {
        if (voterDestination) {
          navigate(voterDestination, { replace: true })
        } else {
          try {
            const { data: res } = await voterService.getLoginRedirect()
            navigate(res.redirect?.path || '/voter', { replace: true })
          } catch {
            navigate('/voter', { replace: true })
          }
        }
      } else {
        navigate(getRoleDashboardPath(data.user.role), { replace: true })
      }
    } catch (err) {
      // Show the reason inline in the form (where the user is looking).
      // The backend returns specific reasons (e.g. "Invalid email or
      // password", "Your account has been suspended") which we surface as-is.
      setError(getErrorMessage(err, "We couldn't sign you in. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return { handleSubmit, error, loading }
}
