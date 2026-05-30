import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [error, setError] = useState(!token ? 'Invalid or missing reset link.' : null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (values) => {
    if (!token) return

    setError(null)
    setLoading(true)

    try {
      await authService.resetPassword({
        token,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      })
      navigate('/login/organizer', {
        replace: true,
        state: { message: 'Password reset. You can sign in now.' },
      })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-v-text">Set a new password</h2>
      <p className="mt-2 text-sm text-v-text-subtle">Choose a strong password for your account.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthFormField label="New password" id="newPassword" error={errors.newPassword?.message}>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              disabled={!token}
              {...register('newPassword')}
            />
          </AuthFormField>

          <AuthFormField
            label="Confirm password"
            id="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              disabled={!token}
              {...register('confirmPassword')}
            />
          </AuthFormField>

          {error && (
            <p className="rounded-lg border rounded-lg border px-3 py-2 text-sm text-v-danger bg-v-danger-bg">
              {error}
            </p>
          )}

          <SubmitButton loading={loading}>Update password</SubmitButton>
        </form>

      <p className="mt-4 text-center text-sm text-v-text-subtle">
        <Link to="/forgot-password" className="text-v-text-muted hover:text-v-text">
          Request a new link
        </Link>
      </p>
    </div>
  )
}
