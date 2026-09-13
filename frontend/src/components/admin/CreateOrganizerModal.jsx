import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { X, UserPlus, Mail } from 'lucide-react'
import FormAlert from '@/components/ui/FormAlert'
import { createOrganizerSchema } from '@/schemas/auth.schemas'
import { adminService } from '@/services/admin.service'
import AuthFormField from '@/components/auth/AuthFormField'
import SubmitButton from '@/components/auth/SubmitButton'
import { API_BASE_URL } from '@/utils/constants'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'
import { INPUT_CLASS } from '@/utils/uiClasses'

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
      setSuccess(`Organizer account created: ${data.user.email}`)
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
          className="absolute top-4 right-4 p-1 text-v-text-muted hover:text-v-text"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>

        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-v-text-muted" strokeWidth={1.5} />
          <h2 className="v-page-title">Add Organizer</h2>
        </div>
        <p className="v-caption mt-1">
          The account is active immediately. A temporary password is generated automatically and emailed to the organizer, and on first login they&apos;ll be guided to complete their organization profile.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthFormField label="Email" id="email" error={errors.email?.message}>
            <input id="email" type="email" className={INPUT_CLASS} {...register('email')} />
          </AuthFormField>

          {error && <FormAlert variant="error">{error}</FormAlert>}
          {success && <FormAlert variant="success">{success}</FormAlert>}
          {emailStatus && (
            <p className="flex items-center gap-2 rounded-lg border border-v-border-strong bg-v-surface-elevated/50 px-3 py-2 text-sm text-v-text-muted">
              <Mail className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {emailStatus}
            </p>
          )}

          <SubmitButton loading={loading}>Create account</SubmitButton>
        </form>
      </div>
    </div>
  )
}
