import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { forgotPasswordSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

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
      <h2 className="text-xl font-semibold text-v-text">Forgot password</h2>
      <p className="mt-2 text-sm text-v-text-subtle">
        Enter your email and we will send a reset link if an account exists.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <AuthFormField label="Email" id="email" error={errors.email?.message}>
          <input id="email" type="email" className={inputClass} {...register('email')} />
        </AuthFormField>

        {error && (
          <p className="rounded-lg border rounded-lg border px-3 py-2 text-sm text-v-danger bg-v-danger-bg">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {message}
          </p>
        )}

        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>

      <p className="mt-4 text-center text-sm text-v-text-subtle">
        <Link to="/login/organizer" className="text-v-text-muted hover:text-v-text">
          Back to organizer login
        </Link>
        {' Â· '}
        <Link to="/login/voter" className="text-v-text-muted hover:text-v-text">
          Voter login
        </Link>
      </p>
    </div>
  )
}
