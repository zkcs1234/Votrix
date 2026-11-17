import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, User, Briefcase, LogOut, ClipboardList, BadgeCheck } from 'lucide-react'
import { organizerProfileService } from '@/services/organizer-profile.service'
import { authService } from '@/services/auth.service'
import { useAuth } from '@/hooks/useAuth'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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

// Read-only. The organization, type, name and position come from the application (or
// from the admin who created the account) and only an administrator changes them.
// The organization logo is uploaded separately, from the dashboard.
export default function ProfileCard({ onClose }) {
  const navigate = useNavigate()
  const { user, clearSession } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const { data } = await organizerProfileService.getProfile()
        setProfile(data.profile || null)
        setError(null)
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    void Promise.resolve().then(loadProfile)
  }, [])

  const handleLogout = async () => {
    try {
      await authService.logout()
    } catch {
      /* clear local session even if API fails */
    }
    clearSession()
    navigate('/')
  }

  const hasDetails = Boolean(
    profile && (profile.organizationName || profile.organizationType || profile.organizerName || profile.position),
  )

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
            ) : error ? (
              <Card className="p-4 text-center">
                <p className="text-sm text-v-danger">{error}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                <ProfileInfoRow icon={BadgeCheck} label="Account type" value="Organizer" />

                <div className="border-t border-v-border" />

                {!hasDetails ? (
                  <p className="text-sm text-v-text-muted">
                    Your profile details haven&apos;t been filled in yet. Ask an administrator to complete them.
                  </p>
                ) : (
                  <>
                    {/* Organization Section */}
                    <div className="space-y-3">
                      <ProfileInfoRow icon={Building2} label="Organization" value={profile.organizationName} />
                      <ProfileInfoRow icon={Building2} label="Type" value={profile.organizationType} />
                    </div>

                    <div className="border-t border-v-border" />

                    {/* Personal Section */}
                    <div className="space-y-3">
                      <ProfileInfoRow icon={User} label="Name" value={profile.organizerName} />
                      <ProfileInfoRow icon={Briefcase} label="Position" value={profile.position} />
                    </div>
                  </>
                )}

                <div className="border-t border-v-border" />

                {/* Voter scope: admin-managed, read-only (organizer plan O9) */}
                <ProfileInfoRow
                  icon={ClipboardList}
                  label="Voter scope"
                  value={
                    !user?.scope || user.scope.scopeType === 'all'
                      ? 'All programs'
                      : (user.scope.programs ?? []).join(', ') || '—'
                  }
                />

                <p className="text-[11px] leading-snug text-v-text-subtle">
                  Profile details are managed by an administrator. To change them, contact an administrator.
                </p>

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
