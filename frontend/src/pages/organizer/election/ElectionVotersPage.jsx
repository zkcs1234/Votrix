import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { electionService } from '@/services/election.service'
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
  const exampleRows = [['voter@example.com']]
  downloadCsv('voter.csv', headers, exampleRows)
}

function CsvPreviewModal({ data, onClose, onRegister, registering }) {
  return (
    <Modal open onClose={onClose} title="Review & Register" size="lg">
        {data.errors && data.errors.length > 0 && (
          <div className="mb-4 p-3 bg-v-danger/10 border border-v-danger/30 rounded-lg">
            <p className="v-error-text font-semibold mb-2">{data.errors.length} error(s)</p>
            <ul className="v-error-text text-sm list-disc list-inside">
              {data.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {data.errors.length > 5 && (
                <li>...and {data.errors.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        <div className="mb-4">
          <p className="v-label">{data.valid} of {data.total} valid</p>
        </div>

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
          <Button variant="secondary" onClick={onClose} disabled={registering}>
            Cancel
          </Button>
          <Button onClick={onRegister} loading={registering}>
            Register ({data.valid})
          </Button>
        </div>
    </Modal>
  )
}

export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const [voters, setVoters] = useState([])
  const [formSchema, setFormSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [error, setError] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  // Roster edit-lock: register/invite stay open while the event is a draft or
  // scheduled (the resend window), and lock once voting is active. Publishing
  // itself now happens on the Review & Publish step, not here.
  const [eventStatus, setEventStatus] = useState(null)
  const { success, error: showError } = useToast()

  const rosterLocked = isParticipantsLocked(eventStatus)

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await electionService.listVoters(eventId)
        if (!alive) return
        const voterList = data.voters
        setVoters(Array.isArray(voterList) ? voterList : [])
        setFormSchema(data.informationFormSchema ?? null)
      } catch (err) {
        console.error('Failed to load voters:', err)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [eventId])

  // Load the event's status so we know whether the roster is still editable.
  const reloadStatus = async () => {
    try {
      const { data: ev } = await electionService.getEvent(eventId)
      setEventStatus(ev.event?.status ?? null)
    } catch (err) {
      console.error('Failed to load event status:', err)
    }
  }

  useEffect(() => {
    reloadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  // Reload voters from server
  const reload = async () => {
    try {
      const { data } = await electionService.listVoters(eventId)
      const voterList = data.voters
      setVoters(Array.isArray(voterList) ? voterList : [])
      setFormSchema(data.informationFormSchema ?? null)
    } catch (err) {
      console.error('Failed to reload voters:', err)
    }
  }

  // Count pending invitations
  const pendingCount = voters.filter(v => !v.invitationSent).length

  // Register new voter (auto-generates password if new)
  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)
    setRegistering(true)

    try {
      await electionService.registerVoter(eventId, { email })
      setEmail('')
      await reload()
      success('Voter registered. Send invitation when ready.')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
      showError(err.response?.data?.message || 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  // CSV: Preview first
  const handleCsvPreview = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    try {
      const { data } = await electionService.previewCsv(eventId, file)
      setCsvPreview(data)
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join(', ') : getErrorMessage(err, 'Preview failed')
      setError(message)
      showError(message)
    }
    e.target.value = ''
  }

  // CSV: Register after preview
  const handleCsvRegister = async () => {
    if (!csvPreview?.data) return
    setError(null)
    setRegistering(true)

    try {
      const { data } = await electionService.registerCsv(eventId, csvPreview.data)
      setImportResult({
        succeeded: data.succeeded,
        total: data.total,
      })
      setCsvPreview(null)
      success(`Registered ${data.succeeded} of ${data.total} voters. Send invitations later.`)
      await reload()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join(', ') : getErrorMessage(err, 'Registration failed')
      setError(message)
      showError(message)
    } finally {
      setRegistering(false)
    }
  }

  // Send (or resend) invitation for single voter
  const handleSendInvitation = async (voterId, isResend = false) => {
    setSendingId(voterId)
    try {
      const { data } = await electionService.sendInvitation(eventId, voterId)
      if (data.invitationSent) {
        success(isResend ? 'Invitation resent successfully' : 'Invitation sent successfully')
      } else {
        showError(isResend ? 'Failed to resend invitation' : 'Failed to send invitation')
      }
      await reload()
    } catch (err) {
      showError(err.response?.data?.message || (isResend ? 'Failed to resend invitation' : 'Failed to send invitation'))
    } finally {
      setSendingId(null)
    }
  }

  // Send all pending invitations
  const handleSendAll = async () => {
    if (pendingCount === 0) return
    setSendingAll(true)
    try {
      const { data } = await electionService.sendAllInvitations(eventId)
      success(`Sent ${data.sent} of ${data.total} invitations`)
      await reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to send invitations')
    } finally {
      setSendingAll(false)
    }
  }

  // Render custom action buttons (send invitation)
  const renderActions = (participant, type) => {
    // Once voting is active the roster is locked — no more invites or resends.
    if (rosterLocked) return null
    if (type === 'toolbar') {
      return pendingCount > 0 ? (
        <Button
          onClick={handleSendAll}
          loading={sendingAll}
          disabled={sendingAll}
        >
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

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  return (
    <div className="space-y-6">
      <h2 className="v-page-title">Voters</h2>

      {rosterLocked && (
        <div className="flex items-center gap-3 rounded-2xl border border-v-border bg-v-surface-elevated p-4">
          <div className="rounded-full bg-v-text-subtle/10 p-1.5 text-v-text-muted">
            <Lock className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-v-text">Roster locked — voting is active</p>
            <p className="text-xs text-v-text-muted mt-0.5">
              You can no longer register or invite voters. The list below is read-only.
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
                Registered {importResult.succeeded} of {importResult.total} voters. Invitation emails not sent.
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
              placeholder="Voter email"
              className="v-input flex-1 min-w-[200px]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
        statusKey="hasVoted"
        statusLabel={{ active: 'Pending', done: 'Voted' }}
        renderActions={renderActions}
        emptyMessage="No voters yet"
        searchPlaceholder="Search voters by email or details"
        noun="voters"
        onExportCsv
        exportLabel="Export CSV"
      />
    </div>
  )
}

