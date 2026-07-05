import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Users, UserCheck, Clock, ShieldOff, UserPlus } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import CreateOrganizerModal from '@/components/admin/CreateOrganizerModal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

const STATUS_CONFIG = {
  pending: { tone: 'warning', label: 'Pending review' },
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
  const [organizers, setOrganizers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [savingKey, setSavingKey] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)

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
    const pending = organizers.filter((org) => org.account_status === 'pending').length
    const active = organizers.filter((org) => org.account_status === 'active').length
    const suspended = organizers.filter((org) => org.account_status === 'suspended').length
    return { total, pending, active, suspended }
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
        <Button onClick={() => setIsModalOpen(true)}>
          <UserPlus className="h-4 w-4" strokeWidth={2} />
          Create organizer
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total organizers" value={summary.total} icon={Users} />
        <StatCard label="Pending review" value={summary.pending} icon={Clock} />
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
          {['all', 'pending', 'active', 'suspended', 'archived'].map((status) => (
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
                  <th>Email</th>
                  <th>Status</th>
                  <th>Organizations</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {filteredOrganizers.map((org) => {
                  const status = org.account_status || 'active'
                  const orgCount = org.organizationSummary?.total ?? org.organizations?.length ?? 0
                  const activeOrgs = org.organizationSummary?.active ?? 0
                  const isBusy = savingKey?.startsWith(org.id)
                  const nextPrimaryAction =
                    status === 'pending'
                      ? { label: 'Approve', next: 'active', variant: 'primary' }
                      : status === 'active'
                        ? { label: 'Suspend', next: 'suspended', variant: 'danger' }
                        : status === 'suspended'
                          ? { label: 'Reinstate', next: 'active', variant: 'secondary' }
                          : { label: 'Restore', next: 'active', variant: 'secondary' }

                  return (
                    <tr key={org.id} className="hover:bg-v-surface-elevated/50">
                      <td>
                        <div className="space-y-1">
                          <p className="font-medium text-v-text">{org.email}</p>
                          <p className="v-caption">{orgCount} organization(s)</p>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</Badge>
                          <p className="v-caption">{activeOrgs} active module(s)</p>
                        </div>
                      </td>
                      <td>
                        {org.organizations?.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {org.organizations.map((organization) => (
                              <span key={organization.id} className="v-badge">
                                {organization.organization_name} · {organization.status}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="v-caption">No organizations yet</span>
                        )}
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
                            onClick={() => handleStatusChange(org.id, nextPrimaryAction.next)}
                          >
                            {nextPrimaryAction.label}
                          </Button>

                          {status !== 'archived' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={isBusy && savingKey.endsWith('archived')}
                              onClick={() => handleStatusChange(org.id, 'archived')}
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
