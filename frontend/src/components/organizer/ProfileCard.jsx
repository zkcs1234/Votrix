import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, User, Briefcase, Edit3, LogOut, X, Check, AlertCircle, ClipboardList } from 'lucide-react'
import { organizerProfileService } from '@/services/organizer-profile.service'
import { authService } from '@/services/auth.service'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { profileSchema, ORGANIZATION_TYPE_OPTIONS } from '@/utils/organizerProfile'

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded bg-v-surface-elevated" />
        <div className="h-6 w-40 animate-pulse rounded bg-v-surface-elevated" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-16 animate-pulse rounded bg-v-surface-elevated" />
        <div className="h-6 w-32 animate-pulse rounded bg-v-surface-elevated" />
      </div>
    </div>
  )
}

function ProfileInfoRow({ icon: Icon, label, value }) {
  if (!value) return null

  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-v-text-subtle" strokeWidth={1.5} />
      )}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-v-text-subtle">{label}</p>
        <p className="text-sm font-medium text-v-text truncate">{value}</p>
      </div>
    </div>
  )
}

export default function ProfileCard({ onClose }) {
  const navigate = useNavigate()
  const { user, clearSession, updateUser } = useAuth()
  const { success, error: toastError } = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      organizationName: '',
      organizationType: '',
      organizerName: '',
      position: '',
    },
  })

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const { data } = await organizerProfileService.getProfile()
        const p = data.profile || null
        setProfile(p)
        if (p) {
          reset({
            organizationName: p.organizationName || '',
            organizationType: p.organizationType || '',
            organizerName: p.organizerName || '',
            position: p.position || '',
          })
        }
        setError(null)
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    void Promise.resolve().then(loadProfile)
  }, [reset])

  const handleEdit = () => {
    setIsEditing(true)
    if (profile) {
      reset({
        organizationName: profile.organizationName || '',
        organizationType: profile.organizationType || '',
        organizerName: profile.organizerName || '',
        position: profile.position || '',
      })
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    if (profile) {
      reset({
        organizationName: profile.organizationName || '',
        organizationType: profile.organizationType || '',
        organizerName: profile.organizerName || '',
        position: profile.position || '',
      })
    }
  }

  const onSubmit = async (values) => {
    setError(null)
    setSaving(true)

    try {
      const { data } = await organizerProfileService.updateProfile(values)

      if (data.profile) {
        setProfile(data.profile)
        updateUser({
          ...user,
          organizationName: data.profile.organizationName,
          organizationType: data.profile.organizationType,
          organizerName: data.profile.organizerName,
          position: data.profile.position,
        })
        reset({
          organizationName: data.profile.organizationName || '',
          organizationType: data.profile.organizationType || '',
          organizerName: data.profile.organizerName || '',
          position: data.profile.position || '',
        })
      }

      success('Profile saved successfully')
      setIsEditing(false)
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save profile'
      setError(message)
      toastError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
    } catch {
      /* clear local session even if API fails */
    }
    clearSession()
    navigate('/')
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:block sm:p-0">
        <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-v-border bg-v-surface shadow-v-shadow-xl sm:w-[340px]">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-v-border px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-v-text">Organizer Profile</h2>
              <p className="text-xs text-v-text-subtle mt-0.5">{user?.email}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={onClose} className="!p-1.5">
              <span className="sr-only">Close</span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          {/* Content */}
          <div className="p-4">
            {loading ? (
              <ProfileSkeleton />
            ) : error && !isEditing ? (
              <Card className="p-4 text-center">
                <p className="text-sm text-v-danger">{error}</p>
              </Card>
            ) : isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-v-danger bg-v-danger-bg px-3 py-2 text-sm text-v-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex-1"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                    <span>Cancel</span>
                  </Button>
                  <Button type="submit" disabled={saving} className="flex-1">
                    {saving ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" strokeWidth={1.5} />
                        <span>Save</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : !profile ||
              (!profile.organizationName &&
                !profile.organizationType &&
                !profile.organizerName &&
                !profile.position) ? (
              <div className="space-y-4">
                <p className="text-sm text-v-text-muted">
                  Your profile hasn't been set up yet.
                </p>
                <Button onClick={handleEdit} className="w-full">
                  <Edit3 className="h-4 w-4" strokeWidth={1.5} />
                  <span>Set up profile</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Organization Section */}
                <div className="space-y-3">
                  <ProfileInfoRow
                    icon={Building2}
                    label="Organization"
                    value={profile.organizationName}
                  />
                  <ProfileInfoRow
                    icon={Building2}
                    label="Type"
                    value={profile.organizationType}
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-v-border" />

                {/* Personal Section */}
                <div className="space-y-3">
                  <ProfileInfoRow
                    icon={User}
                    label="Name"
                    value={profile.organizerName}
                  />
                  <ProfileInfoRow
                    icon={Briefcase}
                    label="Position"
                    value={profile.position}
                  />
                </div>

                {/* Edit Button */}
                <Button
                  variant="secondary"
                  onClick={handleEdit}
                  className="w-full"
                >
                  <Edit3 className="h-4 w-4" strokeWidth={1.5} />
                  <span>Edit profile</span>
                </Button>

                {/* Sign Out Button */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-v-border px-4 py-2.5 text-sm font-medium text-v-danger transition hover:bg-v-danger-bg"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
