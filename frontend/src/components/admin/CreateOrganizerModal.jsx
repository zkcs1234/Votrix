import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { createOrganizerSchema } from '@/schemas/auth.schemas'
import { adminService } from '@/services/admin.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import { API_BASE_URL } from '@/utils/constants'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'
import { INPUT_CLASS } from '@/utils/uiClasses'

const inputClass = INPUT_CLASS

async function ensureCsrfToken() {
  clearCsrfToken()
  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
    withCredentials: true,
    params: { t: Date.now() },
  })
  if (data.csrfToken) setCsrfToken(data.csrfToken)
}

export default function CreateOrganizerModal({ isOpen, onClose, onSuccess }) {
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [emailStatus, setEmailStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createOrganizerSchema),
  })

  const onSubmit = async (values) => {
    setError(null)
    setSuccess(null)
    setEmailStatus(null)
    setLoading(true)

    try {
      await ensureCsrfToken()
      const { data } = await adminService.createOrganizer({ ...values, sendEmail: true })
      setSuccess(`Organizer created: ${data.user.email}`)
      if (data.email?.sent) {
        setEmailStatus('Invitation email sent successfully.')
      } else if (data.email?.skipped) {
        setEmailStatus('Account created. Email not sent — configure RESEND_API_KEY.')
      } else {
        setEmailStatus('Account created, but the invitation email could not be sent.')
      }
      reset()
      if (onSuccess) onSuccess()
      setTimeout(onClose, 2000)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create organizer')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-v-surface p-6 shadow-xl border border-v-border relative">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-v-text-muted hover:text-v-text"
        >
          ✕
        </button>
        
        <h2 className="text-lg font-semibold text-v-text">Create Organizer</h2>
        <p className="mt-1 text-sm text-v-text-subtle">
          The organizer must change this password on first login.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthFormField label="Email" id="email" error={errors.email?.message}>
            <input id="email" type="email" className={inputClass} {...register('email')} />
          </AuthFormField>

          <AuthFormField
            label="Temporary password"
            id="password"
            error={errors.password?.message}
          >
            <input id="password" type="password" className={inputClass} {...register('password')} />
          </AuthFormField>

          {error && (
            <p className="rounded-lg border px-3 py-2 text-sm text-v-danger bg-v-danger-bg">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              {success}
            </p>
          )}
          {emailStatus && (
            <p className="rounded-lg border border-v-border-strong bg-v-surface-elevated/50 px-3 py-2 text-sm text-v-text-muted">
              {emailStatus}
            </p>
          )}

          <SubmitButton loading={loading}>Create account</SubmitButton>
        </form>
      </div>
    </div>
  )
}
