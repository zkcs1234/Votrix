import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { adminLoginSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useLogin } from '@/hooks/useLogin'
import LoginForm from '@/components/auth/LoginForm'

export default function AdminLoginPage() {
  const { handleSubmit, error, loading } = useLogin(authService.adminLogin)

  const {
    register,
    handleSubmit: onSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { username: '', password: '', remember: false },
  })

  return (
    <LoginForm
      title="Admin sign in"
      description="Use your admin username and password. Accounts are created manually in the database."
      error={error}
      loading={loading}
      onSubmit={onSubmit(handleSubmit)}
      register={register}
      errors={errors}
      usernameField
    />
  )
}
