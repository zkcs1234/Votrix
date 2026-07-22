import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Lock, ShieldCheck, AlertCircle, ArrowRight, SkipForward } from 'lucide-react'
import { changePasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath } from '@/utils/auth'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import PasswordInput from '@/components/ui/PasswordInput'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { setSession, role } = useAuth()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [skipLoading, setSkipLoading] = useState(false)

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

  const onSkip = async () => {
    setError(null)
    setSkipLoading(true)

    try {
      const { data } = await authService.skipPasswordChange()
      setSession({
        user: data.user,
        csrfToken: data.csrfToken,
      })
      navigate(getRoleDashboardPath(data.user.role), { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to skip password change')
    } finally {
      setSkipLoading(false)
    }
  }

  // Show optional skip button only for voters (not organizers/admins)
  const isVoter = role === 'voter'

  return (
    <div>
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
        <h2 className="text-xl font-semibold text-v-text">Change your password</h2>
      </div>
      <p className="mt-2 text-sm text-v-text-subtle">
        {isVoter
          ? 'Set a personal password to secure your account, or continue with your temporary password.'
          : `You must set a new password before accessing your ${role} dashboard.`}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField
          label="Current password"
          id="currentPassword"
          error={errors.currentPassword?.message}
        >
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            {...register('currentPassword')}
          />
        </AuthFormField>

        <AuthFormField label="New password" id="newPassword" error={errors.newPassword?.message}>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            {...register('newPassword')}
          />
        </AuthFormField>

        <AuthFormField
          label="Confirm new password"
          id="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
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
          Set new password
        </SubmitButton>
      </form>

      {/* Skip option for voters */}
      {isVoter && (
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-v-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-v-bg px-2 text-v-text-subtle">Or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onSkip}
            disabled={skipLoading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-v-border bg-transparent px-4 py-2.5 text-sm font-medium text-v-text-subtle transition-colors hover:bg-v-surface hover:text-v-text disabled:opacity-50"
          >
            {skipLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-v-text-subtle border-t-transparent" />
                <span>Continuing...</span>
              </>
            ) : (
              <>
                <SkipForward className="h-4 w-4" strokeWidth={2} />
                <span>Continue with temporary password</span>
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </>
            )}
          </button>
          <p className="mt-2 text-center text-xs text-v-text-subtle">
            You can change your password anytime from your account settings.
          </p>
        </div>
      )}
    </div>
  )
}
