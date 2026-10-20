import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'

import FormAlert from '@/components/ui/FormAlert'
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
      <h2 className="v-page-title">Forgot your password?</h2>
      <p className="mt-2 text-sm leading-relaxed text-v-text-subtle">
        Enter your account email to request a reset link.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField label="Email address" id="email" required error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </AuthFormField>

        {error && <FormAlert variant="error">{error}</FormAlert>}
        {message && <FormAlert variant="success" title="Check your inbox">{message}</FormAlert>}

        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link to="/login" className="font-semibold text-v-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
