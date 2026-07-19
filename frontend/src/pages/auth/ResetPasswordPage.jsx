import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, ShieldCheck, AlertCircle, RefreshCcw } from 'lucide-react'
import { resetPasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import PasswordInput from '@/components/ui/PasswordInput'

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
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
        <h2 className="text-xl font-semibold text-v-text">Set a new password</h2>
      </div>
      <p className="mt-2 text-sm text-v-text-subtle">Choose a strong password for your account.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField label="New password" id="newPassword" error={errors.newPassword?.message}>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            disabled={!token}
            {...register('newPassword')}
          />
        </AuthFormField>

        <AuthFormField
          label="Confirm password"
          id="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            disabled={!token}
            {...register('confirmPassword')}
          />
        </AuthFormField>

        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-v-danger bg-v-danger-bg px-3 py-2 text-sm text-v-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {error}
          </p>
        )}

        <SubmitButton loading={loading}>
          <ShieldCheck className="h-4 w-4" strokeWidth={2} />
          Update password
        </SubmitButton>
      </form>

      <p className="mt-4 text-center text-sm text-v-text-subtle">
        <Link to="/forgot-password" className="inline-flex items-center gap-1 text-v-text-muted hover:text-v-text">
          <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2} />
          Request a new link
        </Link>
      </p>
    </div>
  )
}
