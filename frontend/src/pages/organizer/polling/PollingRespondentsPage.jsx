import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import DynamicParticipantTable from '@/components/organizer/DynamicParticipantTable'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { isParticipantsLocked } from '@/utils/constants'

function downloadCsv(filename, headers, rows) {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadCsvTemplate() {
  const headers = ['email']
  const exampleRows = [['respondent@example.com']]
  downloadCsv('respondent.csv', headers, exampleRows)
}

function CsvPreviewModal({ data, onClose, onRegister, registering }) {
  return (
    <Modal open onClose={onClose} title="Review & Register" size="lg">
        {data.errors?.length > 0 && (
          <div className="mb-4 p-3 bg-v-danger/10 border border-v-danger/30 rounded-lg">
            <p className="v-error-text font-semibold mb-2">{data.errors.length} error(s)</p>
            <ul className="v-error-text text-sm list-disc list-inside">
              {data.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
              {data.errors.length > 5 && <li>...and {data.errors.length - 5} more</li>}
            </ul>
          </div>
        )}

        <p className="v-label mb-4">{data.valid} of {data.total} valid</p>

        <div className="v-table-wrap mb-4">
          <table className="v-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, i) => (
                <tr key={i}>
                  <td>{row.rowNumber}</td>
                  <td>{row.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={registering}>Cancel</Button>
          <Button onClick={onRegister} loading={registering}>
            Register ({data.valid})
          </Button>
        </div>
    </Modal>
  )
}

export default function PollingRespondentsPage() {
  const { eventId } = useParams()
  const [voters, setVoters] = useState([])
  const [formSchema, setFormSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  // Roster edit-lock: register/invite stay open while draft or scheduled, and
  // lock once the poll opens (active). Publishing itself now happens on the
  // Review & Publish step, not here.
  const [eventStatus, setEventStatus] = useState(null)
  const fileInputRef = useRef(null)

  const { success, error: showError } = useToast()
  const showLoader = useDelayedLoading(loading, 300)

  const rosterLocked = isParticipantsLocked(eventStatus)

  const load = useCallback(async () => {
    try {
      const { data } = await pollingService.listVoters(eventId)
      const voterList = data.voters
      setVoters(Array.isArray(voterList) ? voterList : [])
      setFormSchema(data.informationFormSchema ?? null)
    } catch (err) {
      console.error('Failed to load respondents:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  // Load the poll's status so we know whether the roster is still editable.
  const reloadStatus = useCallback(async () => {
    try {
      const { data: settings } = await pollingService.getSettings(eventId)
      setEventStatus(settings.settings?.status ?? null)
    } catch (err) {
      console.error('Failed to load poll status:', err)
    }
  }, [eventId])

  useEffect(() => { reloadStatus() }, [reloadStatus])

  const pendingCount = voters.filter((v) => !v.invitationSent).length

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)
    setRegistering(true)
    try {
      await pollingService.registerRespondent(eventId, { email })
      setEmail('')
      load()
      success('Respondent registered. Send invitation when ready.')
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed'
      setError(msg)
      showError(msg)
    } finally {
      setRegistering(false)
    }
  }

const handleCsvPreview = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const { data } = await pollingService.previewCsv(eventId, file)
      setCsvPreview(data)
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const msg = details?.length ? details.join(', ') : getErrorMessage(err, 'Preview failed')
      setError(msg)
      showError(msg)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCsvRegister = async () => {
    if (!csvPreview?.data) return
    setError(null)
    setRegistering(true)
    try {
      const { data } = await pollingService.registerCsv(eventId, csvPreview.data)
      setImportResult({ succeeded: data.succeeded, total: data.total })
      setCsvPreview(null)
      success(`Registered ${data.succeeded} of ${data.total} respondents. Send invitations later.`)
      load()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const msg = details?.length ? details.join(', ') : getErrorMessage(err, 'Registration failed')
      setError(msg)
      showError(msg)
    } finally {
      setRegistering(false)
    }
  }

  const handleSendInvitation = async (voterId, isResend = false) => {
    setSendingId(voterId)
    try {
      const { data } = await pollingService.sendInvitation(eventId, voterId)
      if (data.invitationSent) {
        success(isResend ? 'Invitation resent successfully' : 'Invitation sent successfully')
      } else {
        showError(isResend ? 'Failed to resend invitation' : 'Failed to send invitation')
      }
      load()
    } catch (err) {
      showError(err.response?.data?.message || (isResend ? 'Failed to resend invitation' : 'Failed to send invitation'))
    } finally {
      setSendingId(null)
    }
  }

  // Render custom action buttons (send invitation)
  const renderActions = (participant, type) => {
    // Once the poll is open the roster is locked — no more invites or resends.
    if (rosterLocked) return null
    if (type === 'toolbar') {
      return pendingCount > 0 ? (
        <Button onClick={handleSendAll} loading={sendingAll} disabled={sendingAll}>
          Send All Invitations ({pendingCount})
        </Button>
      ) : null
    }

    // Row-level action
    const isSending = sendingId === participant.voterId
    if (!participant.invitationSent) {
      return (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleSendInvitation(participant.voterId)}
          loading={isSending}
          disabled={isSending}
        >
          Send Invitation
        </Button>
      )
    }
    // Already invited — allow resending the invitation email
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handleSendInvitation(participant.voterId, true)}
        loading={isSending}
        disabled={isSending}
      >
        Resend
      </Button>
    )
  }

  const handleSendAll = async () => {
    if (pendingCount === 0) return
    setSendingAll(true)
    try {
      const { data } = await pollingService.sendAllInvitations(eventId)
      success(`Sent ${data.sent} of ${data.total} invitations`)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to send invitations')
    } finally {
      setSendingAll(false)
    }
  }

  if (loading && !showLoader) return null

  return (
    <div className="space-y-8">
      <h2 className="v-page-title">Respondents</h2>
      <p className="text-sm text-v-text-subtle">
        Register people to respond to this poll. Invitation emails can be sent later.
      </p>

      {rosterLocked && (
        <div className="flex items-center gap-3 rounded-2xl border border-v-border bg-v-surface-elevated p-4">
          <div className="rounded-full bg-v-text-subtle/10 p-1.5 text-v-text-muted">
            <Lock className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-v-text">Roster locked — the poll is open</p>
            <p className="text-xs text-v-text-muted mt-0.5">
              You can no longer register or invite respondents. The list below is read-only.
            </p>
          </div>
        </div>
      )}

      {csvPreview && (
        <CsvPreviewModal
          data={csvPreview}
          onClose={() => setCsvPreview(null)}
          onRegister={handleCsvRegister}
          registering={registering}
        />
      )}

{!rosterLocked && (
<div className="grid gap-6">
        <div className="v-card-sm">
          <h3 className="v-label">CSV Upload</h3>
          <p className="v-helper-text mb-3">
            Upload a CSV or Excel (.xlsx) file with an email column. Passwords are auto-generated.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls"
              className="v-caption"
              onChange={handleCsvPreview}
            />
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="text-sm text-v-primary hover:text-v-primary-hover underline"
            >
              Download CSV template
            </button>
          </div>
          {importResult && (
            <div className="mt-2 space-y-1">
              <p className="v-caption text-v-success">
                Registered {importResult.succeeded} of {importResult.total}.
              </p>
              {importResult.skipped > 0 && (
                <p className="v-caption text-v-warning">
                  {importResult.skipped} already enrolled, skipped.
                </p>
              )}
              {importResult.failed > 0 && (
                <p className="v-caption text-v-danger">{importResult.failed} failed.</p>
              )}
            </div>
          )}
        </div>

        <div className="v-card-sm">
          <h3 className="v-label mb-3">Register Manually</h3>
          <form onSubmit={handleRegister} className="flex flex-wrap gap-3">
            <input
              type="email"
              required
              placeholder="Respondent email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="v-input flex-1 min-w-[200px]"
            />
            <Button type="submit" loading={registering} className="w-[160px]">
              Register
            </Button>
          </form>
        </div>
      </div>
      )}

      {error && <p className="v-error-text">{error}</p>}

      <DynamicParticipantTable
        participants={voters}
        formSchema={formSchema}
        loading={loading}
        statusKey="hasResponded"
        statusLabel={{ active: 'Pending', done: 'Responded' }}
        renderActions={renderActions}
        emptyMessage="No respondents yet"
        searchPlaceholder="Search respondents by email or details"
        noun="respondents"
        onExportCsv
        exportLabel="Export CSV"
      />

    </div>
  )
}

