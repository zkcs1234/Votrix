import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import { API_BASE_URL } from '@/utils/constants'
import { getCsrfToken, setCsrfToken } from '@/utils/csrf'
import { useToast } from '@/hooks/useToast'

async function ensureCsrfToken() {
  if (getCsrfToken()) return
  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, { withCredentials: true })
  if (data.csrfToken) setCsrfToken(data.csrfToken)
}

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
      await ensureCsrfToken()
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
