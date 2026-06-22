import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { changePasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import { API_BASE_URL } from '@/utils/constants'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

async function ensureCsrfToken() {
  clearCsrfToken()

  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
    withCredentials: true,
    params: { t: Date.now() },
  })

  if (data.csrfToken) setCsrfToken(data.csrfToken)
}

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { setSession, role } = useAuth()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
  })

  const onSubmit = async (values) => {
    setError(null)
    setLoading(true)

    try {
      await ensureCsrfToken()
      const { data } = await authService.changePassword(values)
      setSession({
        user: data.user,
        csrfToken: data.csrfToken,
      })
      navigate(getRoleDashboardPath(data.user.role), { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-v-text">Change your password</h2>
      <p className="mt-2 text-sm text-v-text-subtle">
        You must set a new password before accessing your {role} dashboard.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthFormField
            label="Current password"
            id="currentPassword"
            error={errors.currentPassword?.message}
          >
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              {...register('currentPassword')}
            />
          </AuthFormField>

          <AuthFormField label="New password" id="newPassword" error={errors.newPassword?.message}>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              {...register('newPassword')}
            />
          </AuthFormField>

          <AuthFormField
            label="Confirm new password"
            id="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              {...register('confirmPassword')}
            />
          </AuthFormField>

          {error && (
            <p className="rounded-lg border px-3 py-2 text-sm text-v-danger bg-v-danger-bg">
              {error}
            </p>
          )}

        <SubmitButton loading={loading}>Update password</SubmitButton>
      </form>
    </div>
  )
}
