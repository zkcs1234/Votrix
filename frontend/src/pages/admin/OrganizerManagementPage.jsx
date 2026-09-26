import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Users, UserCheck, ShieldOff, UserPlus, Upload, Download } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import CreateOrganizerModal from '@/components/admin/CreateOrganizerModal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import FormAlert from '@/components/ui/FormAlert'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [savingKey, setSavingKey] = useState(null)
  const showLoader = useDelayedLoading(loading, 300)
  const { success: toastSuccess, error: toastError } = useToast()
  const [exporting, setExporting] = useState(false)
  const [csvPreview, setCsvPreview] = useState(null)
  const [registeringCsv, setRegisteringCsv] = useState(false)
  const fileRef = useRef(null)

  const closeModal = () => { setIsModalOpen(false); setEditingOrg(null) }

  const downloadTemplate = () => {
    const csv = 'email,organizer name,position,organization name,organization type,scope type,programs,year & sections\n' +
      'organizer@example.com,Jane Cruz,SSG Adviser,Supreme Student Government,Student Organization,scoped,BSCS;BSIT,3-A;3-B\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'organizer-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { data } = await adminService.previewOrganizersCsv(file)
      setCsvPreview(data)
    } catch (err) {
      const details = err.response?.data?.details?.errors
      toastError(details?.length ? details.join('; ') : getErrorMessage(err, 'Preview failed'))
    }
    e.target.value = ''
  }

  const handleRegisterCsv = async () => {
    if (!csvPreview?.data?.length) return
    setRegisteringCsv(true)
    try {
      const { data } = await adminService.registerOrganizersCsv(csvPreview.data)
      toastSuccess(`Registered ${data.succeeded} of ${data.total}${data.failed ? ` (${data.failed} failed)` : ''}`)
      setCsvPreview(null)
      await fetchOrganizers()
    } catch (err) {
      toastError(getErrorMessage(err, 'Registration failed'))
    } finally {
      setRegisteringCsv(false)
    }
  }

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
            Review organizer accounts, track onboarding, and suspend or restore access when needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Template
          </Button>
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Export CSV
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCsvFile} />
          <Button onClick={() => { setEditingOrg(null); setIsModalOpen(true) }}>
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
                  const isBusy = savingKey?.startsWith(org.id)
                  const nextPrimaryAction =
                    status === 'active'
                      ? { label: 'Suspend', next: 'suspended', variant: 'danger' }
                      : status === 'suspended'
                        ? { label: 'Reinstate', next: 'active', variant: 'secondary' }
                        : { label: 'Restore', next: 'active', variant: 'secondary' }

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
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setEditingOrg(org); setIsModalOpen(true) }}
                          >
                            Edit
                          </Button>
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
        organizer={editingOrg}
        onClose={closeModal}
        onSuccess={fetchOrganizers}
      />

      {csvPreview && (
        <Modal open onClose={() => setCsvPreview(null)} title="Review & Register organizers" size="lg">
          {csvPreview.errors?.length > 0 && (
            <div className="mb-4 rounded-lg border border-v-danger/30 bg-v-danger/10 p-3">
              <p className="v-error-text mb-2 font-semibold">{csvPreview.errors.length} row error(s) — these will be skipped</p>
              <ul className="v-error-text list-inside list-disc text-sm">
                {csvPreview.errors.slice(0, 6).map((err, i) => <li key={i}>{err}</li>)}
                {csvPreview.errors.length > 6 && <li>…and {csvPreview.errors.length - 6} more</li>}
              </ul>
            </div>
          )}
          <p className="v-label mb-3">{csvPreview.valid} of {csvPreview.total} ready</p>
          <div className="v-table-wrap mb-4 max-h-80 overflow-auto">
            <table className="v-table">
              <thead>
                <tr><th>Email</th><th>Name</th><th>Organization</th><th>Scope</th></tr>
              </thead>
              <tbody>
                {(csvPreview.data ?? []).map((row, i) => (
                  <tr key={i}>
                    <td>{row.email}</td>
                    <td>{row.organizerName}</td>
                    <td>{row.organizationName}</td>
                    <td>{row.scope?.scopeType === 'scoped' ? (row.scope.programs || []).join(', ') || 'scoped' : 'All access'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={() => setCsvPreview(null)}>Cancel</Button>
            <Button type="button" onClick={handleRegisterCsv} loading={registeringCsv} disabled={!csvPreview.data?.length}>
              Register {csvPreview.data?.length ?? 0}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
