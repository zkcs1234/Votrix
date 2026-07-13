import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emailLoginSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useLogin } from '@/hooks/useLogin'
import LoginForm from '@/components/auth/LoginForm'

export default function OrganizerLoginPage() {
  const { handleSubmit, error, loading } = useLogin(authService.organizerLogin)

  const {
    register,
    handleSubmit: onSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: { email: '', password: '', remember: false },
  })

  return (
    <LoginForm
      title="Organizer sign in"
      description="Sign in with the email and password provided by your administrator."
      error={error}
      loading={loading}
      onSubmit={onSubmit(handleSubmit)}
      register={register}
      errors={errors}
      showForgot
      showHomeLink={false}
    />
  )
}
