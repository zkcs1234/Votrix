import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router-dom'

import FormAlert from '@/components/ui/FormAlert'
import { changePasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useAuth } from '@/hooks/useAuth'
import { getRoleDashboardPath, getSafeVoterDestination } from '@/utils/auth'
import { voterService } from '@/services/voter.service'
import { isParticipantRole, USER_ROLES } from '@/utils/constants'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import PasswordInput from '@/components/ui/PasswordInput'
import Button from '@/components/ui/Button'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
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

  const continueAfterPasswordChange = async (userRole) => {
    if (!isParticipantRole(userRole)) {
      navigate(getRoleDashboardPath(userRole), { replace: true })
      return
    }

    const destination = getSafeVoterDestination(location.state?.from)
    if (destination) {
      navigate(destination, { replace: true })
      return
    }

    try {
      const { data } = await voterService.getLoginRedirect()
      navigate(data.redirect?.path || '/participant', { replace: true })
    } catch {
      navigate('/participant', { replace: true })
    }
  }

  const onSubmit = async (values) => {
    setError(null)
    setLoading(true)

    try {
      const { data } = await authService.changePassword(values)
      setSession({
        user: data.user,
        csrfToken: data.csrfToken,
      })
      await continueAfterPasswordChange(data.user.role)
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
      await continueAfterPasswordChange(data.user.role)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to skip password change')
    } finally {
      setSkipLoading(false)
    }
  }

  // Show optional skip button for voters and organizers (not admins)
  const canSkip = isParticipantRole(role) || role === USER_ROLES.ORGANIZER

  return (
    <div>
      <h2 className="v-page-title">Secure your account</h2>
      <p className="mt-2 text-sm leading-relaxed text-v-text-subtle">
        {canSkip
          ? 'Replace your temporary password before continuing.'
          : `You must set a new password before accessing your ${role} dashboard.`}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField
          label="Current password"
          id="currentPassword"
          required
          error={errors.currentPassword?.message}
        >
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            {...register('currentPassword')}
          />
        </AuthFormField>

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
            {...register('confirmPassword')}
          />
        </AuthFormField>

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <SubmitButton loading={loading}>Update password</SubmitButton>
      </form>

      {/* Skip option for voters and organizers */}
      {canSkip && (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onSkip}
            loading={skipLoading}
          >
            {skipLoading ? 'Continuing...' : 'Continue with temporary password'}
          </Button>
          <p className="mt-2 text-center text-xs text-v-text-subtle">
            You can change your password anytime from your account settings.
          </p>
        </div>
      )}
    </div>
  )
}
