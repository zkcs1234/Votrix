import { Link } from 'react-router-dom'
import AuthFormField from '@/components/auth/AuthFormField'
import Input from '@/components/ui/Input'
import PasswordInput from '@/components/ui/PasswordInput'
import SubmitButton from '@/components/auth/SubmitButton'
import FormAlert from '@/components/ui/FormAlert'

export default function LoginForm({
  title,
  description,
  error,
  loading,
  onSubmit,
  register,
  errors,
  showForgot = false,
}) {
  return (
    <div className="w-full">
      <h2 className="v-page-title">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-v-text-subtle">{description}</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <AuthFormField label="Email address" id="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Enter email address"
            {...register('email')}
          />
        </AuthFormField>

        <AuthFormField label="Password" id="password" required error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Enter password"
            {...register('password')}
          />
        </AuthFormField>

        <div className="flex items-center justify-between gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-v-text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-v-border-strong accent-[var(--v-primary)]"
              {...register('remember')}
            />
            Remember me
          </label>
          {showForgot && (
            <Link to="/forgot-password" className="font-semibold text-v-primary hover:underline">
              Forgot password?
            </Link>
          )}
        </div>

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-v-text-subtle">
        Use the account provided by your administrator. Access is based on your assigned role.
      </p>
    </div>
  )
}
