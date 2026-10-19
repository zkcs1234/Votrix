import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import FormAlert from '@/components/ui/FormAlert'
import { resetPasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import PasswordInput from '@/components/ui/PasswordInput'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [error, setError] = useState(null)
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
      navigate('/login', {
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
      <h2 className="v-page-title">Set a new password</h2>
      <p className="mt-2 text-sm leading-relaxed text-v-text-subtle">
        Choose a password with at least 8 characters.
      </p>

      {!token && (
        <FormAlert variant="warning" title="Invalid or missing reset token" className="mt-6">
          Request a new link. Both password inputs and the reset action are disabled.
        </FormAlert>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField
          label="New password"
          id="newPassword"
          required
          hint="At least 8 characters."
          error={errors.newPassword?.message}
        >
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            disabled={!token}
            {...register('newPassword')}
          />
        </AuthFormField>

        <AuthFormField
          label="Confirm new password"
          id="confirmPassword"
          required
          hint="Passwords must match."
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            disabled={!token}
            {...register('confirmPassword')}
          />
        </AuthFormField>

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <SubmitButton loading={loading} disabled={!token}>Reset password</SubmitButton>
      </form>

      <p className="mt-5 flex items-center justify-center gap-4 text-center text-sm">
        <Link to="/login" className="font-semibold text-v-primary hover:underline">
          Back to sign in
        </Link>
        <Link to="/forgot-password" className="font-semibold text-v-primary hover:underline">
          Request new reset link
        </Link>
      </p>
    </div>
  )
}
