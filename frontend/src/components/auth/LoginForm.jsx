import { Link } from 'react-router-dom'
import { Mail, LogIn } from 'lucide-react'
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
  showForgot = false,
}) {
  return (
    <div className="w-full max-w-md">
      <h2 className="v-page-title">{title}</h2>
      <p className="v-caption mt-2 leading-relaxed">{description}</p>

      <Card padding="md" className="mt-6">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <AuthFormField label="Email" id="email" error={errors.email?.message}>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
              <Input id="email" type="email" autoComplete="email" className="pl-9" {...register('email')} />
            </div>
          </AuthFormField>

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
            <LogIn className="h-4 w-4" strokeWidth={2} />
            Sign in
          </SubmitButton>
        </form>
      </Card>
    </div>
  )
}