import { Link } from 'react-router-dom'
import AuthFormField from '@/components/auth/AuthFormField'
import Input from '@/components/ui/Input'
import PasswordInput from '@/components/ui/PasswordInput'
import SubmitButton from '@/components/auth/SubmitButton'
import Card from '@/components/ui/Card'

export default function LoginForm({
  title,
  description,
  error,
  loading,
  onSubmit,
  register,
  errors,
  usernameField = false,
  showForgot = false,
}) {
  return (
    <div className="w-full max-w-md">
      <h2 className="v-page-title">{title}</h2>
      <p className="v-caption mt-2 leading-relaxed">{description}</p>

      <Card padding="md" className="mt-6">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {usernameField ? (
            <AuthFormField label="Username" id="username" error={errors.username?.message}>
              <Input id="username" type="text" autoComplete="username" {...register('username')} />
            </AuthFormField>
          ) : (
            <AuthFormField label="Email" id="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
            </AuthFormField>
          )}

          <AuthFormField label="Password" id="password" error={errors.password?.message}>
            <PasswordInput id="password" autoComplete="current-password" {...register('password')} />
          </AuthFormField>

          <div className="flex items-center justify-between gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 v-caption">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-v-border-strong"
                {...register('remember')}
              />
              Remember me
            </label>
            {showForgot && (
              <Link
                to="/forgot-password"
                className="v-btn-tertiary text-sm"
              >
                Forgot password?
              </Link>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-v-danger bg-v-danger-bg px-3 py-2.5 text-sm text-v-danger">
              {error}
            </p>
          )}

          <SubmitButton loading={loading} className="w-full">
            Sign in
          </SubmitButton>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm">
        <Link to="/" className="v-btn-tertiary">
          Back to home
        </Link>
      </p>
    </div>
  )
}