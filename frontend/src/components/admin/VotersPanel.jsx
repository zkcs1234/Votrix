import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, UserPlus, Upload, Download, Pencil, ShieldOff, UserCheck, UserMinus } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import FormAlert from '@/components/ui/FormAlert'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { downloadBlob, downloadCsv } from '@/utils/csvDownload'
import AccountStatusConfirmModal from '@/components/admin/AccountStatusConfirmModal'
import { getEmailOutcomeMessage } from '@/utils/emailOutcome'
import CsvImportResults from '@/components/admin/CsvImportResults'

const STATUS_TONE = { active: 'success', suspended: 'danger', archived: 'default' }

function fullName(v) {
  return [v.firstName, v.lastName].filter(Boolean).join(' ') || '—'
}

// ---- Add / Edit modal ------------------------------------------------------
function VoterFormModal({ mode, initial, programs, sections, participantLabel, api, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({
    email: initial?.email ?? '',
    schoolId: initial?.schoolId ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    program: initial?.program ?? '',
    yearSection: initial?.yearSection ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { success, warning, error: toastError } = useToast()

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.update(initial.id, form)
        success(`${participantLabel} updated`)
      } else {
        const { data } = await api.create(form)
        success(`${participantLabel} added to the pool`)
        if (!data.email?.sent) warning(getEmailOutcomeMessage(data.email))
      }
      onSaved()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join('; ') : getErrorMessage(err, 'Save failed')
      setError(message)
      toastError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${participantLabel}` : `Add ${participantLabel}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="v-label">Identity</legend>
          <p className="v-caption">Login email and school identification.</p>
          <div>
            <label htmlFor="voter-email" className="v-label">Email</label>
            <input id="voter-email" type="email" value={form.email} onChange={set('email')} className={INPUT_CLASS} required disabled={isEdit} placeholder="participant@example.com" />
            {isEdit && <p className="v-caption mt-1">Email can&apos;t be changed here.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="voter-school-id" className="v-label">School ID</label>
              <input id="voter-school-id" type="text" value={form.schoolId} onChange={set('schoolId')} className={INPUT_CLASS} required />
            </div>
            <div>
              <label htmlFor="voter-first-name" className="v-label">First name</label>
              <input id="voter-first-name" type="text" value={form.firstName} onChange={set('firstName')} className={INPUT_CLASS} required />
            </div>
            <div>
              <label htmlFor="voter-last-name" className="v-label">Last name</label>
              <input id="voter-last-name" type="text" value={form.lastName} onChange={set('lastName')} className={INPUT_CLASS} required />
            </div>
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t border-v-border pt-4">
          <legend className="v-label">Academic placement</legend>
          <p className="v-caption">Choose the program and year/section for this participant.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="voter-program" className="v-label">Program</label>
              <select id="voter-program" value={form.program} onChange={set('program')} className={INPUT_CLASS} required>
                <option value="">Select program</option>
                {programs.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="voter-year-section" className="v-label">Year &amp; Section</label>
              <select id="voter-year-section" value={form.yearSection} onChange={set('yearSection')} className={INPUT_CLASS} required>
                <option value="">Select year &amp; section</option>
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        {(programs.length === 0 || sections.length === 0) && (
          <FormAlert variant="warning">
            Define Programs and Year &amp; Sections in System Settings before adding participants.{' '}
            <Link to="/admin/settings" onClick={onClose} className="font-medium text-v-primary hover:underline">Open System Settings</Link>
          </FormAlert>
        )}
        {error && <FormAlert variant="error">{error}</FormAlert>}

        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!programs.length || !sections.length}>{isEdit ? 'Save changes' : `Add ${participantLabel}`}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ---- CSV preview modal -----------------------------------------------------
function CsvPreviewModal({ preview, onClose, onRegister, registering, importName }) {
  return (
    <Modal open onClose={onClose} title={preview.importResult ? 'Import results' : 'Review & Register'} size="lg">
      {preview.importResult ? (
        <CsvImportResults
          result={preview.importResult}
          filename={`${importName}-import-results.csv`}
          onDone={onClose}
        />
      ) : (
        <>
      {preview.errors?.length > 0 && (
        <div className="mb-4 rounded-lg border border-v-danger/30 bg-v-danger/10 p-3">
          <p className="v-error-text mb-2 font-semibold">{preview.errors.length} row error(s) — these will be skipped</p>
          <ul className="v-error-text list-inside list-disc text-sm">
            {preview.errors.slice(0, 6).map((err, i) => <li key={i}>{err}</li>)}
            {preview.errors.length > 6 && <li>…and {preview.errors.length - 6} more</li>}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => downloadCsv(`${importName}-import-errors.csv`, ['Issue'], preview.errors.map((issue) => [issue]))}
          >
            <Download className="h-4 w-4" strokeWidth={1.5} /> Download errors
          </Button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-4">
        <span className="v-label">{preview.valid} of {preview.total} ready</span>
        <span className="v-caption">New accounts: {preview.summary?.newAccounts ?? 0}</span>
        <span className="v-caption">Profile updates: {preview.summary?.existingAccounts ?? 0}</span>
      </div>

      <div className="v-table-wrap mb-4 max-h-80 overflow-auto">
        <table className="v-table">
          <thead>
            <tr>
              <th>School ID</th><th>Name</th><th>Email</th><th>Program</th><th>Year &amp; Section</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(preview.data ?? []).map((row, i) => (
              <tr key={i}>
                <td>{row.school_id}</td>
                <td>{[row.first_name, row.last_name].filter(Boolean).join(' ')}</td>
                <td>{row.email}</td>
                <td>{row.program}</td>
                <td>{row.year_section}</td>
                <td><Badge tone={row.type === 'new' ? 'success' : 'default'}>{row.type === 'new' ? 'New' : 'Update'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 border-t border-v-border pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={onRegister} loading={registering} disabled={!preview.data?.length}>
          Register {preview.data?.length ?? 0}
        </Button>
      </div>
        </>
      )}
    </Modal>
  )
}

// ---- Panel -----------------------------------------------------------------
export default function VotersPanel({ pool = 'election' }) {
  const isRespondentPool = pool === 'polling'
  const participantLabel = isRespondentPool ? 'Polling Respondent' : 'Election Voter'
  const pluralLabel = isRespondentPool ? 'Polling Respondents' : 'Election Voters'
  const api = isRespondentPool
    ? {
        list: adminService.getRespondents,
        create: adminService.createRespondent,
        update: adminService.updateRespondent,
        updateStatus: adminService.updateRespondentStatus,
        remove: adminService.removeRespondentMembership,
        preview: adminService.previewRespondentsCsv,
        register: adminService.registerRespondentsCsv,
        export: adminService.exportRespondents,
        template: adminService.getRespondentCsvTemplate,
      }
    : {
        list: adminService.getVoters,
        create: adminService.createVoter,
        update: adminService.updateVoter,
        updateStatus: adminService.updateVoterStatus,
        remove: adminService.removeVoterMembership,
        preview: adminService.previewVotersCsv,
        register: adminService.registerVotersCsv,
        export: adminService.exportVoters,
        template: adminService.getVoterCsvTemplate,
      }
  const [voters, setVoters] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [taxonomy, setTaxonomy] = useState({ programs: [], sections: [] })
  const [modal, setModal] = useState(null) // { mode: 'add'|'edit', voter }
  const [statusTarget, setStatusTarget] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const fileRef = useRef(null)
  const { success, error: toastError } = useToast()

  useEffect(() => {
    adminService
      .getParticipantTaxonomy()
      .then(({ data }) => setTaxonomy(data.taxonomy ?? { programs: [], sections: [] }))
      .catch(() => {})
  }, [])

  const fetchVoters = async () => {
    setLoading(true)
    try {
      const { data } = await api.list({
        search: search || undefined,
        program: programFilter || undefined,
        yearSection: sectionFilter || undefined,
        status: statusFilter || undefined,
        limit: 100,
      })
      setVoters(data.voters ?? data.respondents ?? [])
      setTotal(data.total ?? 0)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, `Failed to load ${pluralLabel.toLowerCase()}`))
    } finally {
      setLoading(false)
    }
  }

  // Refetch when filters/search change (search debounced).
  useEffect(() => {
    const t = setTimeout(fetchVoters, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, programFilter, sectionFilter, statusFilter])

  const summary = useMemo(() => {
    const active = voters.filter((v) => v.accountStatus === 'active').length
    const suspended = voters.filter((v) => v.accountStatus === 'suspended').length
    return { active, suspended }
  }, [voters])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const { data } = await api.preview(file)
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
      const { data } = await api.register(preview.data)
      success(`Registered ${data.succeeded} of ${data.total}${data.failed ? ` (${data.failed} failed)` : ''}`)
      setPreview((current) => current ? { ...current, importResult: data } : current)
      await fetchVoters()
    } catch (err) {
      toastError(getErrorMessage(err, 'Registration failed'))
    } finally {
      setRegistering(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const { data } = await api.export()
      downloadBlob(`${isRespondentPool ? 'polling-respondents' : 'election-voters'}.csv`, data)
      success(`${pluralLabel} exported`)
    } catch (err) {
      toastError(getErrorMessage(err, 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  const handleStatus = async (voter, accountStatus) => {
    setSavingId(voter.id)
    try {
      await api.updateStatus(voter.id, accountStatus)
      success(`${participantLabel} account ${accountStatus}`)
      setStatusTarget(null)
      await fetchVoters()
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to update status'))
    } finally {
      setSavingId(null)
    }
  }

  const handleRemoveFromPool = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await api.remove(removeTarget.id)
      success(`${participantLabel} removed from this pool`)
      setRemoveTarget(null)
      await fetchVoters()
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to remove participant type'))
    } finally {
      setRemoving(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const { data } = await api.template()
      downloadBlob(`${isRespondentPool ? 'polling-respondent' : 'election-voter'}-template.csv`, data)
    } catch (err) {
      const message = getErrorMessage(err, 'Could not download the voter template')
      setError(message)
      toastError(message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="v-page-title">{pluralLabel}</h1>
          <p className="v-caption">
            Manage this participant type. Organizers enroll eligible accounts into specific events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4" strokeWidth={1.5} /> Template
          </Button>
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <Download className="h-4 w-4" strokeWidth={1.5} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.5} /> Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          <Button onClick={() => setModal({ mode: 'add' })}>
            <UserPlus className="h-4 w-4" strokeWidth={2} /> Add participant
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={`${pluralLabel} (this view)`} value={total} icon={Users} />
        <StatCard label="Active" value={summary.active} icon={UserCheck} />
        <StatCard label="Suspended" value={summary.suspended} icon={ShieldOff} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          placeholder="Search name, email, or school ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-md"
        />
        <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className={`${INPUT_CLASS} lg:w-48`}>
          <option value="">All programs</option>
          {taxonomy.programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={`${INPUT_CLASS} lg:w-48`}>
          <option value="">All sections</option>
          {taxonomy.sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT_CLASS} lg:w-40`}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
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
        ) : voters.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {search || programFilter || sectionFilter || statusFilter
              ? `No ${pluralLabel.toLowerCase()} match the current filters.`
              : `No ${pluralLabel.toLowerCase()} yet. Add one or import a CSV.`}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>School ID</th><th>Name</th><th>Email</th><th>Program</th><th>Year &amp; Section</th><th>Status</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {voters.map((v) => (
                  <tr key={v.id}>
                    <td>{v.schoolId || '—'}</td>
                    <td>{fullName(v)}</td>
                    <td>{v.email}</td>
                    <td>{v.program || '—'}</td>
                    <td>{v.yearSection || '—'}</td>
                    <td><Badge tone={STATUS_TONE[v.accountStatus] ?? 'default'}>{v.accountStatus}</Badge></td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setModal({ mode: 'edit', voter: v })}>
                          <Pencil className="h-4 w-4" strokeWidth={1.5} /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={savingId === v.id}
                          onClick={() => setStatusTarget({
                            user: v,
                            accountStatus: v.accountStatus === 'active' ? 'suspended' : 'active',
                            label: v.accountStatus === 'active' ? 'Suspend' : v.accountStatus === 'archived' ? 'Restore' : 'Reinstate',
                          })}
                        >
                          {v.accountStatus === 'active' ? 'Suspend' : v.accountStatus === 'archived' ? 'Restore' : 'Reinstate'}
                        </Button>
                        {v.accountStatus !== 'archived' && (
                          <Button size="sm" variant="secondary" onClick={() => setStatusTarget({ user: v, accountStatus: 'archived', label: 'Archive' })}>
                            Archive
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(v)} title={`Remove ${participantLabel} pool membership`}>
                          <UserMinus className="h-4 w-4" strokeWidth={1.5} /> Remove from pool
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <VoterFormModal
          mode={modal.mode}
          initial={modal.voter}
          programs={taxonomy.programs}
          sections={taxonomy.sections}
          participantLabel={participantLabel}
          api={api}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchVoters() }}
        />
      )}

      <AccountStatusConfirmModal
        target={statusTarget ? {
          ...statusTarget,
          name: fullName(statusTarget.user),
          email: statusTarget.user.email,
        } : null}
        accountType={participantLabel}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => handleStatus(statusTarget.user, statusTarget.accountStatus)}
        loading={Boolean(savingId)}
      />

      <Modal open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)} title={`Remove ${participantLabel} membership?`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-v-text">
            {removeTarget ? `${fullName(removeTarget)} (${removeTarget.email}) will no longer be available for future event selection from this pool.` : ''}
          </p>
          <p className="v-caption">The account, its other participant types, and existing event history remain unchanged. Existing event enrollment is not removed.</p>
          <div className="flex justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button type="button" variant="danger" onClick={handleRemoveFromPool} loading={removing}>Remove from pool</Button>
          </div>
        </div>
      </Modal>

      {preview && (
        <CsvPreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          onRegister={handleRegisterCsv}
          registering={registering}
          importName={isRespondentPool ? 'polling-respondent' : 'election-voter'}
        />
      )}
    </div>
  )
}
