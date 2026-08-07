import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Users, UserCheck, ShieldOff, UserPlus, Mail, Download } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import CreateOrganizerModal from '@/components/admin/CreateOrganizerModal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

const STATUS_CONFIG = {
  active: { tone: 'success', label: 'Active' },
  suspended: { tone: 'danger', label: 'Suspended' },
  archived: { tone: 'default', label: 'Archived' },
}

function OrganizerTableSkeleton() {
  return (
    <div className="v-table-wrap">
      <table className="v-table">
        <thead>
          <tr>
            <th>
              <div className="h-4 w-10 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th className="text-right">
              <div className="ml-auto h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-v-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}>
              <td>
                <div className="h-7 w-7 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="h-4 w-40 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="h-6 w-28 animate-pulse rounded-full bg-v-surface-elevated" />
              </td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <div className="h-6 w-20 animate-pulse rounded-full bg-v-surface-elevated" />
                  <div className="h-6 w-20 animate-pulse rounded-full bg-v-surface-elevated" />
                </div>
              </td>
              <td>
                <div className="h-4 w-28 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td className="text-right">
                <div className="ml-auto h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getStatusTone(status) {
  return STATUS_CONFIG[status]?.tone ?? 'default'
}

function getStatusLabel(status) {
  return STATUS_CONFIG[status]?.label ?? status
}

export default function OrganizerManagementPage() {
  const navigate = useNavigate()
  const [organizers, setOrganizers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [savingKey, setSavingKey] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)
  const { success: toastSuccess, error: toastError } = useToast()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data } = await adminService.exportOrganizers()
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'organizers.csv'
      a.click()
      URL.revokeObjectURL(url)
      toastSuccess('Organizers exported')
    } catch {
      toastError('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const fetchOrganizers = async () => {
    try {
      setLoading(true)
      const { data } = await adminService.getOrganizers()
      setOrganizers(data.organizers || [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load organizers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(fetchOrganizers)
  }, [])

  const summary = useMemo(() => {
    const total = organizers.length
    const active = organizers.filter((org) => org.account_status === 'active').length
    const suspended = organizers.filter((org) => org.account_status === 'suspended').length
    return { total, active, suspended }
  }, [organizers])

  const filteredOrganizers = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    return organizers.filter((org) => {
      const matchesSearch =
        !searchLower ||
        org.email?.toLowerCase().includes(searchLower) ||
        org.organizations?.some((o) => o.organization_name?.toLowerCase().includes(searchLower))

      const matchesStatus =
        statusFilter === 'all' || org.account_status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [organizers, search, statusFilter])

  const handleStatusChange = async (organizerId, accountStatus) => {
    setSavingKey(`${organizerId}:${accountStatus}`)
    setError(null)
    setSuccess(null)

    try {
      await adminService.updateOrganizerStatus(organizerId, accountStatus)
      setSuccess(`Organizer status updated to ${getStatusLabel(accountStatus).toLowerCase()}.`)
      await fetchOrganizers()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update organizer status')
    } finally {
      setSavingKey(null)
    }
  }

  const handleSendOnboarding = async (organizerId, email) => {
    setSavingKey(`${organizerId}:onboarding`)
    setError(null)
    setSuccess(null)

    try {
      await adminService.sendOnboardingNotification(organizerId)
      toastSuccess(`Onboarding email sent to ${email}`)
      await fetchOrganizers()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send onboarding notification')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-8 w-56 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-24 animate-pulse bg-v-surface-elevated" />
        </div>

        <div className="h-10 w-80 animate-pulse rounded-lg bg-v-surface-elevated" />

        <Card padding="sm">
          <OrganizerTableSkeleton />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="v-page-title">Organizer management</h1>
          <p className="v-caption">
            Review organizer accounts, approve new access, and suspend accounts when needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Export CSV
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <UserPlus className="h-4 w-4" strokeWidth={2} />
            Add organizer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total organizers" value={summary.total} icon={Users} />
        <StatCard label="Active" value={summary.active} icon={UserCheck} />
        <StatCard label="Suspended" value={summary.suspended} icon={ShieldOff} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          placeholder="Search by email or organization"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xl"
        />

        <div className="flex flex-wrap gap-2">
          {['all', 'active', 'suspended', 'archived'].map((status) => (
            <Button
              key={status}
              type="button"
              variant={statusFilter === status ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter(status)}
              aria-pressed={statusFilter === status}
            >
              {status === 'all' ? 'All' : getStatusLabel(status)}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-v-danger bg-v-danger-bg px-4 py-3 text-sm text-v-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-v-success bg-v-success-bg px-4 py-3 text-sm text-v-success">
          {success}
        </div>
      )}

      <Card padding="sm">
        {filteredOrganizers.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {search || statusFilter !== 'all'
              ? 'No organizers match the current filters.'
              : 'No organizers found.'}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Organization Name</th>
                  <th>Organizer Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {filteredOrganizers.map((org) => {
                  const status = org.account_status || 'active'
                  const isBusy = savingKey?.startsWith(org.id)
                  const profileComplete = org.profile_complete
                  const nextPrimaryAction =
                    status === 'active'
                      ? { label: 'Suspend', next: 'suspended', variant: 'danger' }
                      : status === 'suspended'
                        ? { label: 'Reinstate', next: 'active', variant: 'secondary' }
                        : { label: 'Restore', next: 'active', variant: 'secondary' }

                  return (
                    <tr key={org.id} className="hover:bg-v-surface-elevated/50 cursor-pointer" onClick={() => navigate(`/admin/organizers/${org.id}`)}>
                      <td>
                        <div className="space-y-1">
                          <p className="font-medium text-v-text">{org.organization_name || '—'}</p>
                          <p className="v-caption">{org.organization_type_display || ''}</p>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <p className="font-medium text-v-text">{org.organizer_name || '—'}</p>
                          <p className="v-caption">{org.position || ''}</p>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <p className="text-v-text">{org.email}</p>
                          {!profileComplete && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={isBusy && savingKey.endsWith('onboarding')}
                              onClick={(e) => { e.stopPropagation(); handleSendOnboarding(org.id, org.email) }}
                            >
                              <Mail className="h-3 w-3" strokeWidth={2} />
                              Send Onboarding
                            </Button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</Badge>
                          {profileComplete && (
                            <p className="v-caption text-xs">Onboarded</p>
                          )}
                        </div>
                      </td>
                      <td className="v-caption">
                        {format(new Date(org.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={nextPrimaryAction.variant}
                            loading={isBusy && savingKey.endsWith(nextPrimaryAction.next)}
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(org.id, nextPrimaryAction.next) }}
                          >
                            {nextPrimaryAction.label}
                          </Button>

                          {status !== 'archived' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={isBusy && savingKey.endsWith('archived')}
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(org.id, 'archived') }}
                            >
                              Archive
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateOrganizerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchOrganizers}
      />
    </div>
  )
}
