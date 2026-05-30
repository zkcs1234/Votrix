import { Link } from 'react-router-dom'
import AuthFormField from '@/components/auth/AuthFormField'
import Input from '@/components/ui/Input'
import PasswordInput from '@/components/ui/PasswordInput'
import SubmitButton from '@/components/auth/SubmitButton'

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
    <div>
      <h2 className="text-xl font-semibold text-v-text">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-v-text-subtle">{description}</p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
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
          <label className="flex cursor-pointer items-center gap-2 text-v-text-subtle">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-v-border-strong text-v-primary focus:ring-v-text-muted"
              {...register('remember')}
            />
            Remember me
          </label>
          {showForgot && (
            <Link
              to="/forgot-password"
              className="font-medium text-v-text-muted hover:text-v-text"
            >
              Forgot password?
            </Link>
          )}
        </div>

        {error && (
          <p className="rounded-lg border px-3 py-2.5 text-sm text-v-danger bg-v-danger-bg">
            {error}
          </p>
        )}

        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-v-text-subtle">
        <Link to="/" className="font-medium text-v-text-muted hover:text-v-text">
          Back to home
        </Link>
      </p>
    </div>
  )
}
