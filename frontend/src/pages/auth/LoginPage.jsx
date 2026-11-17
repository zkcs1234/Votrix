import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LIVE_FORM_MODE } from '@/hooks/useLiveForm'
import { loginSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useLogin } from '@/hooks/useLogin'
import LoginForm from '@/components/auth/LoginForm'
import { usePlatformStore } from '@/store/platform.store'

export default function LoginPage() {
  const { handleSubmit, error, loading } = useLogin(authService.login)
  const platformName = usePlatformStore((s) => s.platformName)

  const {
    register,
    handleSubmit: onSubmit,
    formState: { errors },
  } = useForm({
    ...LIVE_FORM_MODE,
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  })

  return (
    <LoginForm
      title={`Sign in to ${platformName}`}
      description="Enter your email and password to access your account."
      error={error}
      loading={loading}
      onSubmit={onSubmit(handleSubmit)}
      register={register}
      errors={errors}
      showForgot
    />
  )
}