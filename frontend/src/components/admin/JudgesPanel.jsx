import { useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, UserPlus, Upload, Download, Pencil, ShieldOff, UserCheck } from 'lucide-react'
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

const STATUS_TONE = { active: 'success', suspended: 'danger', archived: 'default' }

function fullName(v) {
  return [v.firstName, v.lastName].filter(Boolean).join(' ') || '—'
}

// ---- Add / Edit modal ------------------------------------------------------
function JudgeFormModal({ mode, initial, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const data = initial?.profileData ?? {}
  const [form, setForm] = useState({
    email: initial?.email ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    title: data.title ?? '',
    affiliation: data.affiliation ?? '',
    expertise: data.expertise ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { success, error: toastError } = useToast()

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await adminService.updateJudge(initial.id, form)
        success('Judge updated')
      } else {
        await adminService.createJudge(form)
        success('Judge registered — credentials emailed')
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
    <Modal open onClose={onClose} title={isEdit ? 'Edit judge' : 'Add judge'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="v-label">Email</label>
          <input type="email" value={form.email} onChange={set('email')} className={INPUT_CLASS} required disabled={isEdit} placeholder="judge@example.com" />
          {isEdit && <p className="v-caption mt-1">Email can&apos;t be changed here.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="v-label">First name</label>
            <input type="text" value={form.firstName} onChange={set('firstName')} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className="v-label">Last name</label>
            <input type="text" value={form.lastName} onChange={set('lastName')} className={INPUT_CLASS} required />
          </div>
          <div>
            <label className="v-label">Title <span className="v-caption">(optional)</span></label>
            <input type="text" value={form.title} onChange={set('title')} className={INPUT_CLASS} placeholder="Prof., Engr., Dr." />
          </div>
          <div>
            <label className="v-label">Affiliation <span className="v-caption">(optional)</span></label>
            <input type="text" value={form.affiliation} onChange={set('affiliation')} className={INPUT_CLASS} placeholder="Organization / department" />
          </div>
          <div className="sm:col-span-2">
            <label className="v-label">Expertise <span className="v-caption">(optional)</span></label>
            <input type="text" value={form.expertise} onChange={set('expertise')} className={INPUT_CLASS} placeholder="Field of specialization" />
          </div>
        </div>

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{isEdit ? 'Save changes' : 'Register judge'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ---- CSV preview modal -----------------------------------------------------
function CsvPreviewModal({ preview, onClose, onRegister, registering }) {
  return (
    <Modal open onClose={onClose} title="Review & Register" size="lg">
      {preview.errors?.length > 0 && (
        <div className="mb-4 rounded-lg border border-v-danger/30 bg-v-danger/10 p-3">
          <p className="v-error-text mb-2 font-semibold">{preview.errors.length} row error(s) — these will be skipped</p>
          <ul className="v-error-text list-inside list-disc text-sm">
            {preview.errors.slice(0, 6).map((err, i) => <li key={i}>{err}</li>)}
            {preview.errors.length > 6 && <li>…and {preview.errors.length - 6} more</li>}
          </ul>
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
            <tr><th>Name</th><th>Email</th><th>Title</th><th>Affiliation</th><th>Expertise</th><th>Action</th></tr>
          </thead>
          <tbody>
            {(preview.data ?? []).map((row, i) => (
              <tr key={i}>
                <td>{[row.first_name, row.last_name].filter(Boolean).join(' ')}</td>
                <td>{row.email}</td>
                <td>{row.title || '—'}</td>
                <td>{row.affiliation || '—'}</td>
                <td>{row.expertise || '—'}</td>
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
    </Modal>
  )
}

// ---- Panel -----------------------------------------------------------------
export default function JudgesPanel() {
  const [judges, setJudges] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [preview, setPreview] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const fileRef = useRef(null)
  const { success, error: toastError } = useToast()

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
    const suspended = judges.filter((v) => v.accountStatus === 'suspended').length
    return { active, suspended }
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
      setPreview(null)
      await fetchJudges()
    } catch (err) {
      toastError(getErrorMessage(err, 'Registration failed'))
    } finally {
      setRegistering(false)
    }
  }

  const handleStatus = async (judge, accountStatus) => {
    setSavingId(judge.id)
    try {
      await adminService.updateJudgeStatus(judge.id, accountStatus)
      success(`Judge ${accountStatus}`)
      await fetchJudges()
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to update status'))
    } finally {
      setSavingId(null)
    }
  }

  const downloadTemplate = () => {
    const csv = 'email,last name,first name,title,affiliation,expertise\njudge@example.com,Reyes,Maria,Prof.,College of Engineering,Robotics\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'judge-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="v-page-title">Judges</h1>
          <p className="v-caption">
            Register competition judges. Organizers pick them from this pool when setting up a competition.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4" strokeWidth={1.5} /> Template
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.5} /> Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          <Button onClick={() => setModal({ mode: 'add' })}>
            <UserPlus className="h-4 w-4" strokeWidth={2} /> Add judge
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Judges (this view)" value={total} icon={Trophy} />
        <StatCard label="Active" value={summary.active} icon={UserCheck} />
        <StatCard label="Suspended" value={summary.suspended} icon={ShieldOff} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:max-w-md"
        />
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
        ) : judges.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {search || statusFilter ? 'No judges match the current filters.' : 'No judges yet. Add one or import a CSV.'}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Title</th><th>Affiliation</th><th>Expertise</th><th>Status</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {judges.map((v) => (
                  <tr key={v.id}>
                    <td>{fullName(v)}</td>
                    <td>{v.email}</td>
                    <td>{v.profileData?.title || '—'}</td>
                    <td>{v.profileData?.affiliation || '—'}</td>
                    <td>{v.profileData?.expertise || '—'}</td>
                    <td><Badge tone={STATUS_TONE[v.accountStatus] ?? 'default'}>{v.accountStatus}</Badge></td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setModal({ mode: 'edit', judge: v })}>
                          <Pencil className="h-4 w-4" strokeWidth={1.5} /> Edit
                        </Button>
                        {v.accountStatus === 'active' ? (
                          <Button size="sm" variant="secondary" loading={savingId === v.id} onClick={() => handleStatus(v, 'suspended')}>
                            Suspend
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" loading={savingId === v.id} onClick={() => handleStatus(v, 'active')}>
                            Activate
                          </Button>
                        )}
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
        <JudgeFormModal
          mode={modal.mode}
          initial={modal.judge}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchJudges() }}
        />
      )}

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
