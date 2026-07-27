import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, User, Briefcase, ClipboardList, AlertCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { organizerProfileService } from '@/services/organizer-profile.service'

const profileSchema = z.object({
  organizationName: z.string().trim().min(1, 'Organization name is required'),
  organizationType: z.string().trim().min(1, 'Organization type is required'),
  organizerName: z.string().trim().min(1, 'Your name is required'),
  position: z.string().trim().min(1, 'Position is required'),
})

const ORGANIZATION_TYPE_OPTIONS = [
  'Student Organization',
  'Academic Department',
  'College Office',
  'University Office',
  'Student Council',
  'Committee',
  'Others',
]

export default function OrganizerOnboardingPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const { success, error: toastError } = useToast()
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      organizationName: user?.organizationName || '',
      organizationType: user?.organizationType || '',
      organizerName: user?.organizerName || '',
      position: user?.position || '',
    },
  })

  const onSubmit = async (values) => {
    setApiError(null)
    setLoading(true)

    try {
      const { data } = await organizerProfileService.updateProfile(values)

      // Update local user state to reflect completed profile
      if (data.profile) {
        updateUser({
          ...user,
          organizationName: data.profile.organizationName,
          organizationType: data.profile.organizationType,
          organizerName: data.profile.organizerName,
          position: data.profile.position,
        })
      }

      success('Organization profile saved successfully')
      navigate('/organizer', { replace: true })
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save profile'
      setApiError(message)
      toastError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4">
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10">
            <Building2 className="h-8 w-8 text-indigo-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-semibold text-v-text">Welcome to VOTRIX</h1>
          <p className="mt-2 text-sm text-v-text-subtle">
            Complete your organization profile to get started.
            <br />
            You only need to do this once.
          </p>
        </div>

        {/* Profile form */}
        <form onSubmit={handleSubmit(onSubmit)} className="v-card-md space-y-5">
          {/* Organization Name */}
          <div>
            <label
              htmlFor="organizationName"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-v-text"
            >
              <Building2 className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
              Organization name
            </label>
            <input
              id="organizationName"
              type="text"
              placeholder="e.g. College of Engineering"
              className="v-input w-full"
              {...register('organizationName')}
            />
            {errors.organizationName && (
              <p className="mt-1 text-xs text-v-danger">{errors.organizationName.message}</p>
            )}
          </div>

          {/* Organization Type */}
          <div>
            <label
              htmlFor="organizationType"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-v-text"
            >
              <ClipboardList className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
              Organization type
            </label>
            <select
              id="organizationType"
              className="v-input w-full"
              {...register('organizationType')}
            >
              <option value="">Select organization type</option>
              {ORGANIZATION_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errors.organizationType && (
              <p className="mt-1 text-xs text-v-danger">{errors.organizationType.message}</p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-v-border" />

          {/* Organizer Name */}
          <div>
            <label
              htmlFor="organizerName"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-v-text"
            >
              <User className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
              Your name
            </label>
            <input
              id="organizerName"
              type="text"
              placeholder="e.g. Juan Dela Cruz"
              className="v-input w-full"
              {...register('organizerName')}
            />
            {errors.organizerName && (
              <p className="mt-1 text-xs text-v-danger">{errors.organizerName.message}</p>
            )}
          </div>

          {/* Position */}
          <div>
            <label
              htmlFor="position"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-v-text"
            >
              <Briefcase className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
              Position
            </label>
            <input
              id="position"
              type="text"
              placeholder="e.g. Student Council President"
              className="v-input w-full"
              {...register('position')}
            />
            {errors.position && (
              <p className="mt-1 text-xs text-v-danger">{errors.position.message}</p>
            )}
            <p className="mt-1 text-xs text-v-text-subtle">
              Your role in the organization (e.g., President, Adviser, Coordinator)
            </p>
          </div>

          {/* Error */}
          {apiError && (
            <div className="flex items-center gap-2 rounded-lg border border-v-danger bg-v-danger-bg px-3 py-2 text-sm text-v-danger">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
              {apiError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="v-btn-primary flex w-full items-center justify-center gap-2 py-2.5"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Save and continue</span>
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-v-text-subtle">
          Signed in as <span className="text-v-text-muted">{user?.email}</span>
        </p>
      </div>
    </div>
  )
}

