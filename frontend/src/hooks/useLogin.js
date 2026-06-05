import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import { useToast } from '@/hooks/useToast'

export function useLogin(loginFn) {
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const { success, error: toastError } = useToast()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values) => {
    setError(null)
    setLoading(true)

    try {
      // The `api` request interceptor fetches a CSRF token automatically
      // for any POST. Login endpoints are CSRF-exempt on the server, so we
      // don't need a pre-flight round-trip here.
      const { data } = await loginFn(values)
      setSession({
        accessToken: data.accessToken,
        user: data.user,
        csrfToken: data.csrfToken,
      })

      success('Signed in successfully')

      if (data.user.mustChangePassword) {
        navigate('/change-password', { replace: true })
      } else {
        navigate(getRoleDashboardPath(data.user.role), { replace: true })
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please try again.'
      setError(message)
      toastError(message)
    } finally {
      setLoading(false)
    }
  }

  return { handleSubmit, error, loading }
}
