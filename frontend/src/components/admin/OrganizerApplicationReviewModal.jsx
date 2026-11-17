import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import AccessScopeFields, { scopeIsIncomplete } from '@/components/shared/AccessScopeFields'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import Modal from '@/components/ui/Modal'
import { adminService } from '@/services/admin.service'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

const REASON_MAX = 1000
const TYPE_SUGGESTIONS = ['Co-curricular', 'Extra-curricular']
const STATUS_TONES = { pending: 'warning', approved: 'success', declined: 'danger' }

const sizeLabel = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

function errorText(err, fallback) {
  const details = err.response?.data?.details?.errors
  return details?.length ? details.join('; ') : getErrorMessage(err, fallback)
}

// Admin review of one organizer application. Every field can be corrected
// before approving; approval creates the account through the same path as
// "Add organizer", so the applicant receives the usual temporary-password email.
export default function OrganizerApplicationReviewModal({ applicationId, onClose, onDone }) {
  const [application, setApplication] = useState(null)
  const [programs, setPrograms] = useState([])
  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  const { success, warning } = useToast()

  useEffect(() => {
    if (!applicationId) return undefined
    let cancelled = false
    setApplication(null)
    setForm(null)
    setLoadError(null)
    setError(null)
    setDeclining(false)
    setReason('')

    Promise.all([
      adminService.getOrganizerApplication(applicationId),
      adminService.getPrograms().catch(() => ({ data: { programs: [] } })),
    ])
      .then(([{ data }, { data: tax }]) => {
        if (cancelled) return
        const app = data.application
        setApplication(app)
        setPrograms(tax.programs ?? [])
        setForm({
          organizerName: app.organizerName,
          position: app.position,
          organizationName: app.organizationName,
          organizationType: app.organizationType,
          scope: {
            scopeType: app.requestedScope?.scopeType ?? 'all',
            programs: app.requestedScope?.programs ?? [],
          },
        })
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Could not load the application'))
      })
    return () => { cancelled = true }
  }, [applicationId])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const pending = application?.status === 'pending'
  const incomplete = form ? scopeIsIncomplete(form.scope) : false

  const approve = async () => {
    setError(null)
    setBusy('approve')
    try {
      const { data } = await adminService.approveOrganizerApplication(application.id, {
        organizerName: form.organizerName,
        position: form.position,
        organizationName: form.organizationName,
        organizationType: form.organizationType,
        scopeType: form.scope.scopeType,
        programs: form.scope.programs,
      })
      success('Application approved. Organizer account created.')
      if (!data.email?.sent) warning('The credentials email was not sent. Use the organizer list to follow up.')
      onDone?.()
    } catch (err) {
      setError(errorText(err, 'Approval failed'))
    } finally {
      setBusy(null)
    }
  }

  const decline = async () => {
    setError(null)
    setBusy('decline')
    try {
      await adminService.declineOrganizerApplication(application.id, reason.trim())
      success('Application declined')
      onDone?.()
    } catch (err) {
      setError(errorText(err, 'Decline failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={Boolean(applicationId)} onClose={onClose} title="Review organizer application" size="lg" closeDisabled={Boolean(busy)}>
      {loadError && <FormAlert variant="error">{loadError}</FormAlert>}
      {!loadError && !form && <p className="p-6 text-center v-caption">Loading application…</p>}

      {form && application && (
        <div className="mt-1 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-v-text">{application.email}</p>
            <Badge tone={STATUS_TONES[application.status] ?? 'default'}>{application.status}</Badge>
          </div>

          {application.status === 'declined' && application.declineReason && (
            <FormAlert variant="error" title="Declined">{application.declineReason}</FormAlert>
          )}
          {application.status === 'approved' && (
            <FormAlert variant="success">This application was approved and the organizer account exists.</FormAlert>
          )}

          <fieldset disabled={!pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="review-name" className="v-label">Organizer name</label>
                <input id="review-name" value={form.organizerName} onChange={set('organizerName')} className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="review-position" className="v-label">Position</label>
                <input id="review-position" value={form.position} onChange={set('position')} className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="review-org" className="v-label">Organization name</label>
                <input id="review-org" value={form.organizationName} onChange={set('organizationName')} className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="review-type" className="v-label">Organization type</label>
                <input id="review-type" list="review-type-options" value={form.organizationType} onChange={set('organizationType')} className={INPUT_CLASS} />
                <datalist id="review-type-options">
                  {TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
            </div>

            <div className="border-t border-v-border pt-4">
              <AccessScopeFields
                value={form.scope}
                onChange={(scope) => setForm((f) => ({ ...f, scope }))}
                programs={programs}
                legend="Access scope (requested by the applicant)"
                help="Adjust what this organizer can access before approving."
              />
            </div>
          </fieldset>

          <div className="border-t border-v-border pt-4">
            <p className="v-label">Certificates ({application.certificates?.length ?? 0})</p>
            <ul className="mt-2 space-y-2">
              {(application.certificates ?? []).map((c, i) => (
                <li key={`${c.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-v-border px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-v-text">
                    <FileText className="h-4 w-4 shrink-0 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
                    <span className="truncate">{c.name}</span>
                    <span className="v-caption shrink-0">{sizeLabel(c.size)}</span>
                  </span>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-v-primary hover:underline">
                      Open <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                    </a>
                  ) : (
                    <span className="v-caption">Unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {declining && pending && (
            <div className="border-t border-v-border pt-4">
              <label htmlFor="decline-reason" className="v-label">Reason for declining</label>
              <textarea
                id="decline-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
                className={INPUT_CLASS}
                rows={3}
                placeholder="This is emailed to the applicant"
              />
              <p className="v-caption mt-1">{reason.length}/{REASON_MAX}</p>
            </div>
          )}

          {error && <FormAlert variant="error">{error}</FormAlert>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={Boolean(busy)}>Close</Button>
            {pending && !declining && (
              <>
                <Button type="button" variant="danger" onClick={() => setDeclining(true)}>Decline…</Button>
                <Button type="button" onClick={approve} loading={busy === 'approve'} disabled={incomplete}>
                  Approve &amp; create account
                </Button>
              </>
            )}
            {pending && declining && (
              <>
                <Button type="button" variant="secondary" onClick={() => { setDeclining(false); setReason('') }}>Back</Button>
                <Button type="button" variant="danger" onClick={decline} loading={busy === 'decline'} disabled={!reason.trim()}>
                  Decline application
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
