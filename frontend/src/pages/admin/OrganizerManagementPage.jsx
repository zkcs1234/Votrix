import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Users, UserCheck, Archive, Download } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import CreateOrganizerModal from '@/components/admin/CreateOrganizerModal'
import AccountStatusConfirmModal from '@/components/admin/AccountStatusConfirmModal'
import AccountActionsMenu from '@/components/admin/AccountActionsMenu'
import ViewOrganizerDetailsModal from '@/components/admin/ViewOrganizerDetailsModal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { downloadBlob } from '@/utils/csvDownload'

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

function getInitials(name) {
  if (!name) return 'OR'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'OR'
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

function OrgLogo({ logo, name }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-v-border bg-v-surface-elevated text-xs font-semibold text-v-text-muted">
      {logo ? (
        <img src={logo} alt="" className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
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
  const [editingOrg, setEditingOrg] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [viewOrg, setViewOrg] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [savingKey, setSavingKey] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)
  const { success: toastSuccess, error: toastError } = useToast()
  const [exporting, setExporting] = useState(false)

  const closeModal = () => { setIsModalOpen(false); setEditingOrg(null) }

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data } = await adminService.exportOrganizers()
      downloadBlob('organizers.csv', data)
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
    const archived = organizers.filter((org) => org.account_status === 'archived').length
    return { total, active, archived }
  }, [organizers])

  const filteredOrganizers = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    return organizers.filter((org) => {
      const matchesSearch =
        !searchLower ||
        org.email?.toLowerCase().includes(searchLower) ||
        org.organization_name?.toLowerCase().includes(searchLower) ||
        org.organizer_name?.toLowerCase().includes(searchLower)

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
      setStatusTarget(null)
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
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          <div className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
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
      <PageHeader
        title="Organizer management"
        description="Review organizer accounts, and archive or restore access when needed."
        actions={
          <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Export CSV
          </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total organizers" value={summary.total} icon={Users} />
        <StatCard label="Active" value={summary.active} icon={UserCheck} />
        <StatCard label="Archived" value={summary.archived} icon={Archive} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          placeholder="Search by email or organization"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-xl"
        />

        <div className="flex flex-wrap gap-2">
          {['all', 'active', 'archived'].map((status) => (
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

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {success && <FormAlert variant="success">{success}</FormAlert>}

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
                  // savingKey is "<id>:<status being saved>"; pass the status for this row only.
                  const busyStatus = savingKey?.startsWith(org.id) ? savingKey.split(':')[1] : null

                  return (
                    <tr key={org.id} className="hover:bg-v-surface-elevated/50 cursor-pointer" onClick={() => navigate(`/admin/organizers/${org.id}`)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <OrgLogo logo={org.organization_logo} name={org.organization_name} />
                          <div className="space-y-1">
                            <p className="font-medium text-v-text">{org.organization_name || '—'}</p>
                            <p className="v-caption">{org.organization_type_display || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <p className="font-medium text-v-text">{org.organizer_name || '—'}</p>
                          <p className="v-caption">{org.position || ''}</p>
                        </div>
                      </td>
                      <td>
                        <p className="text-v-text">{org.email}</p>
                      </td>
                      <td>
                        <Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</Badge>
                      </td>
                      <td className="v-caption">
                        {format(new Date(org.created_at), 'MMM d, yyyy')}
                      </td>
                      <td>
                        <AccountActionsMenu
                          status={status}
                          busyStatus={busyStatus}
                          onEdit={() => { setEditingOrg(org); setIsModalOpen(true) }}
                          onView={() => setViewOrg(org)}
                          onStatusChange={(change) =>
                            setStatusTarget({
                              ...change,
                              id: org.id,
                              name: org.organizer_name || org.organization_name,
                              email: org.email,
                            })
                          }
                        />
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
        organizer={editingOrg}
        onClose={closeModal}
        onSuccess={fetchOrganizers}
      />

      {viewOrg && <ViewOrganizerDetailsModal organizer={viewOrg} onClose={() => setViewOrg(null)} />}

      <AccountStatusConfirmModal
        target={statusTarget}
        accountType="Organizer"
        onClose={() => setStatusTarget(null)}
        onConfirm={() => handleStatusChange(statusTarget.id, statusTarget.accountStatus)}
        loading={Boolean(savingKey)}
      />
    </div>
  )
}
