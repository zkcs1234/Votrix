import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Mail, Send, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import { forgotPasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import Input from '@/components/ui/Input'

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (values) => {
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      const { data } = await authService.forgotPassword(values)
      setMessage(data.message)
    } catch (err) {
      setError(err.response?.data?.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
        <h2 className="text-xl font-semibold text-v-text">Forgot password</h2>
      </div>
      <p className="mt-2 text-sm text-v-text-subtle">
        Enter your email and we will send a reset link if an account exists.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField label="Email" id="email" error={errors.email?.message}>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
            <Input id="email" type="email" autoComplete="email" className="pl-9" {...register('email')} />
          </div>
        </AuthFormField>

        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-v-danger bg-v-danger-bg px-3 py-2 text-sm text-v-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {error}
          </p>
        )}
        {message && (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {message}
          </p>
        )}

        <SubmitButton loading={loading}>
          <Send className="h-4 w-4" strokeWidth={2} />
          Send reset link
        </SubmitButton>
      </form>

      <p className="mt-4 flex items-center justify-center gap-3 text-center text-sm text-v-text-subtle">
        <Link to="/login" className="inline-flex items-center gap-1 text-v-text-muted hover:text-v-text">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to login
        </Link>
      </p>
    </div>
  )
}
