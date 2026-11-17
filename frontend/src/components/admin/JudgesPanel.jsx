import { useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, UserPlus, Upload, Download, Archive, UserCheck, ChevronDown } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import FormAlert from '@/components/ui/FormAlert'
import FormField from '@/components/ui/FormField'
import { useLiveForm } from '@/hooks/useLiveForm'
import { buildJudgeSchema, JUDGE_SERVER_FIELDS } from '@/schemas/people.schemas'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { downloadBlob } from '@/utils/csvDownload'
import AccountStatusConfirmModal from '@/components/admin/AccountStatusConfirmModal'
import AccountActionsMenu from '@/components/admin/AccountActionsMenu'
import ViewJudgeDetailsModal from '@/components/admin/ViewJudgeDetailsModal'
import { getEmailOutcomeMessage } from '@/utils/emailOutcome'
import CsvImportPreview from '@/components/admin/CsvImportPreview'

const STATUS_TONE = { active: 'success', suspended: 'danger', archived: 'default' }

function fullName(v) {
  return [v.firstName, v.lastName].filter(Boolean).join(' ') || '—'
}

// ---- Add / Edit modal ------------------------------------------------------
function JudgeFormModal({ mode, initial, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const data = initial?.profileData ?? {}
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(
    isEdit && Boolean(data.title || data.affiliation),
  )
  const { success, warning, error: toastError } = useToast()

  const schema = useMemo(() => buildJudgeSchema({ isEdit }), [isEdit])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    formError,
    setFormError,
    handleServerError,
    blockedReason,
    canSubmit,
  } = useLiveForm({
    schema,
    defaultValues: {
      email: initial?.email ?? '',
      firstName: initial?.firstName ?? '',
      lastName: initial?.lastName ?? '',
      title: data.title ?? '',
      affiliation: data.affiliation ?? '',
      expertise: data.expertise ?? '',
    },
    serverFieldMap: JUDGE_SERVER_FIELDS,
  })

  const onSubmit = async (values) => {
    setFormError(null)
    try {
      const payload = { ...values }
      if (isEdit) {
        await adminService.updateJudge(initial.id, payload)
        success('Competition Judge updated')
      } else {
        const { data } = await adminService.createJudge(payload)
        success('Competition Judge added')
        if (!data.email?.sent) warning(getEmailOutcomeMessage(data.email))
      }
      onSaved()
    } catch (err) {
      const message = handleServerError(err, 'Save failed')
      if (message) toastError(message)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Judge' : 'Add Judge'} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {isEdit ? (
          <FormField label="Email" hint="Email can't be changed here.">
            {(field) => <input type="email" {...field} value={initial?.email ?? ''} disabled readOnly />}
          </FormField>
        ) : (
          <FormField label="Email" required error={errors.email?.message}>
            {(field) => <input type="email" placeholder="judge@example.com" autoComplete="off" {...field} {...register('email')} />}
          </FormField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name" required error={errors.firstName?.message}>
            {(field) => <input type="text" {...field} {...register('firstName')} />}
          </FormField>
          <FormField label="Last name" required error={errors.lastName?.message}>
            {(field) => <input type="text" {...field} {...register('lastName')} />}
          </FormField>
          <FormField
            className="sm:col-span-2"
            label={<>Expertise <span className="v-caption">(optional)</span></>}
            error={errors.expertise?.message}
          >
            {(field) => <input type="text" placeholder="Field of specialization" {...field} {...register('expertise')} />}
          </FormField>
        </div>

        <div className="border-t border-v-border pt-2">
          <button
            type="button"
            onClick={() => setShowAdditionalDetails((value) => !value)}
            aria-expanded={showAdditionalDetails}
            aria-controls="judge-additional-details"
            className="flex w-full items-center justify-between py-2 text-sm font-medium text-v-text hover:text-v-primary"
          >
            Additional details
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdditionalDetails ? 'rotate-180' : ''}`} />
          </button>
          {showAdditionalDetails && (
            <div id="judge-additional-details" className="grid gap-4 pb-2 sm:grid-cols-2">
              <FormField label={<>Title <span className="v-caption">(optional)</span></>} error={errors.title?.message}>
                {(field) => <input type="text" placeholder="Prof., Engr., Dr." {...field} {...register('title')} />}
              </FormField>
              <FormField label={<>Affiliation <span className="v-caption">(optional)</span></>} error={errors.affiliation?.message}>
                {(field) => <input type="text" placeholder="Organization / department" {...field} {...register('affiliation')} />}
              </FormField>
            </div>
          )}
        </div>

        <p className="v-caption">
          Judges are available to every organizer. Each organizer chooses which judges join their own competition event.
        </p>

        {formError && <FormAlert variant="error">{formError}</FormAlert>}

        <div className="flex items-center justify-end gap-3 border-t border-v-border pt-4">
          {blockedReason && <p className="v-caption mr-auto" role="status">{blockedReason}</p>}
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={!canSubmit}>{isEdit ? 'Save changes' : 'Add Judge'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ---- CSV preview modal -----------------------------------------------------
const JUDGE_PREVIEW_COLUMNS = [
  { header: 'Name', cell: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') },
  { header: 'Email', cell: (row) => row.email },
  { header: 'Title', cell: (row) => row.title },
  { header: 'Affiliation', cell: (row) => row.affiliation },
  { header: 'Expertise', cell: (row) => row.expertise },
]

function CsvPreviewModal({ preview, onClose, onRegister, registering }) {
  return (
    <CsvImportPreview
      preview={preview}
      columns={JUDGE_PREVIEW_COLUMNS}
      noun="accounts"
      resultsFilename="judge-import-results.csv"
      errorsFilename="judge-import-errors.csv"
      onClose={onClose}
      onRegister={onRegister}
      registering={registering}
    />
  )
}

// ---- Panel -----------------------------------------------------------------
export default function JudgesPanel() {
  const [judges, setJudges] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [modal, setModal] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [preview, setPreview] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const fileRef = useRef(null)
  const [resendingId, setResendingId] = useState(null)
  const { success, warning, error: toastError } = useToast()

  const fetchJudges = async () => {
    setLoading(true)
    try {
      const { data } = await adminService.getJudges({
        search: search || undefined,
        status: statusFilter || undefined,
        limit: 100,
      })
      setJudges(data.judges ?? [])
      setTotal(data.total ?? 0)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load judges'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchJudges, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter])

  const summary = useMemo(() => {
    const active = judges.filter((v) => v.accountStatus === 'active').length
    const archived = judges.filter((v) => v.accountStatus === 'archived').length
    return { active, archived }
  }, [judges])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const { data } = await adminService.previewJudgesCsv(file)
      setPreview(data)
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join('; ') : getErrorMessage(err, 'Preview failed')
      setError(message)
      toastError(message)
    }
    e.target.value = ''
  }

  const handleRegisterCsv = async () => {
    if (!preview?.data?.length) return
    setRegistering(true)
    try {
      const { data } = await adminService.registerJudgesCsv(preview.data)
      success(`Registered ${data.succeeded} of ${data.total}${data.failed ? ` (${data.failed} failed)` : ''}`)
      setPreview((current) => current ? { ...current, importResult: data } : current)
      await fetchJudges()
    } catch (err) {
      toastError(getErrorMessage(err, 'Registration failed'))
    } finally {
      setRegistering(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data } = await adminService.exportJudges()
      downloadBlob('judges.csv', data)
      success('Competition Judges exported')
    } catch (err) {
      toastError(getErrorMessage(err, 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  const handleStatus = async (judge, accountStatus) => {
    setSavingId(judge.id)
    try {
      await adminService.updateJudgeStatus(judge.id, accountStatus)
      success(`Judge account ${accountStatus}`)
      setStatusTarget(null)
      await fetchJudges()
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to update status'))
    } finally {
      setSavingId(null)
    }
  }

  const handleResend = async (judge) => {
    setResendingId(judge.id)
    try {
      const { data } = await adminService.resendJudgeCredentials(judge.id)
      if (data.email?.sent) success(`New credentials emailed to ${judge.email}`)
      else warning(getEmailOutcomeMessage(data.email))
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to resend credentials'))
    } finally {
      setResendingId(null)
    }
  }

  const downloadTemplate = async () => {
    try {
      const { data } = await adminService.getJudgeCsvTemplate()
      downloadBlob('judge-template.csv', data)
    } catch (err) {
      const message = getErrorMessage(err, 'Could not download the Competition Judge form')
      setError(message)
      toastError(message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competition Judges"
        description="Register competition judges. Organizers pick them from this pool when setting up a competition."
        actions={
          <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4" strokeWidth={1.5} /> Form
          </Button>
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" strokeWidth={1.5} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.5} /> Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          <Button onClick={() => setModal({ mode: 'add' })}>
            <UserPlus className="h-4 w-4" strokeWidth={2} /> Add Judge
          </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Competition Judges (this view)" value={total} icon={Trophy} />
        <StatCard label="Active" value={summary.active} icon={UserCheck} />
        <StatCard label="Archived" value={summary.archived} icon={Archive} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-center">
        <SearchInput
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-md"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_CLASS} lg:w-40`}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Card padding="sm">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-v-surface-elevated" />
            ))}
          </div>
        ) : judges.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {search || statusFilter ? 'No Competition Judges match the current filters.' : 'No Competition Judges yet. Add one or import a CSV.'}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Expertise</th><th>Status</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {judges.map((v) => (
                  <tr key={v.id}>
                    <td>{fullName(v)}</td>
                    <td>{v.email}</td>
                    <td>{v.profileData?.expertise || '—'}</td>
                    <td><Badge tone={STATUS_TONE[v.accountStatus] ?? 'default'}>{v.accountStatus}</Badge></td>
                    <td>
                      <AccountActionsMenu
                        status={v.accountStatus}
                        onEdit={() => setModal({ mode: 'edit', judge: v })}
                        onView={() => setViewTarget(v)}
                        onResend={v.mustChangePassword && v.accountStatus === 'active' ? () => handleResend(v) : undefined}
                        resending={resendingId === v.id}
                        busyStatus={savingId === v.id ? statusTarget?.accountStatus : null}
                        onStatusChange={(change) => setStatusTarget({ ...change, user: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <JudgeFormModal
          mode={modal.mode}
          initial={modal.judge}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchJudges() }}
        />
      )}

      {viewTarget && <ViewJudgeDetailsModal judge={viewTarget} onClose={() => setViewTarget(null)} />}

      <AccountStatusConfirmModal
        target={statusTarget ? {
          ...statusTarget,
          name: fullName(statusTarget.user),
          email: statusTarget.user.email,
        } : null}
        accountType="Judge"
        onClose={() => setStatusTarget(null)}
        onConfirm={() => handleStatus(statusTarget.user, statusTarget.accountStatus)}
        loading={Boolean(savingId)}
      />

      {preview && (
        <CsvPreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          onRegister={handleRegisterCsv}
          registering={registering}
        />
      )}
    </div>
  )
}
