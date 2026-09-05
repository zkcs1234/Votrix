import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { electionService } from '@/services/election.service'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import DynamicParticipantTable from '@/components/organizer/DynamicParticipantTable'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-v-surface rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        <h3 className="v-page-title mb-4">Review & Register</h3>

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
      </div>
    </div>
  )
}

export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [voters, setVoters] = useState([])
  const [formSchema, setFormSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [registering, setRegistering] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  // Publish readiness: an event still in `draft` (setup) is published from here.
  const [eventStatus, setEventStatus] = useState(null)
  const [positionsCount, setPositionsCount] = useState(0)
  const [candidatesCount, setCandidatesCount] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const { success, error: showError } = useToast()

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

  // Load publish-readiness context: the event's status plus how many positions
  // and candidates exist. Used to decide whether the "Finish & Publish" action
  // shows and whether it is enabled.
  const reloadSetup = async () => {
    try {
      const [{ data: ev }, { data: pos }, { data: cand }] = await Promise.all([
        electionService.getEvent(eventId),
        electionService.listPositions(eventId),
        electionService.listCandidates(eventId),
      ])
      setEventStatus(ev.event?.status ?? null)
      setPositionsCount(Array.isArray(pos.positions) ? pos.positions.length : 0)
      setCandidatesCount(Array.isArray(cand.candidates) ? cand.candidates.length : 0)
    } catch (err) {
      console.error('Failed to load publish readiness:', err)
    }
  }

  useEffect(() => {
    reloadSetup()
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
      const message = details?.join(', ') || err.response?.data?.message || 'Preview failed'
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
      const message = details?.join(', ') || err.response?.data?.message || 'Registration failed'
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

  // Publish the fully-built setup event. This does NOT open voting — it hands
  // the event to the schedule; voting opens/closes purely on the start/end
  // dates. Requires ≥1 position, ≥1 candidate, ≥1 voter (enforced again on the
  // backend).
  const isSetup = eventStatus === 'draft'
  const publishReady = positionsCount > 0 && candidatesCount > 0 && voters.length > 0

  const handlePublish = async () => {
    if (!publishReady) return
    setPublishing(true)
    try {
      await electionService.publishEvent(eventId)
      success('Event published. It will open for voting based on its schedule.')
      navigate('/organizer/election/events')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish event')
    } finally {
      setPublishing(false)
    }
  }

  // Render custom action buttons (send invitation)
  const renderActions = (participant, type) => {
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

      {csvPreview && (
        <CsvPreviewModal
          data={csvPreview}
          onClose={() => setCsvPreview(null)}
          onRegister={handleCsvRegister}
          registering={registering}
        />
      )}

      <div className="grid gap-6">
        <div className="v-card-sm">
          <h3 className="v-label">CSV Upload</h3>
          <p className="v-helper-text mb-3">
            Upload a CSV with email column. Passwords are auto-generated.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv"
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

      {error && <p className="v-error-text">{error}</p>}

      <DynamicParticipantTable
        participants={voters}
        formSchema={formSchema}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        statusKey="hasVoted"
        statusLabel={{ active: 'Pending', done: 'Voted' }}
        renderActions={renderActions}
        emptyMessage={search ? 'No voters found matching your search' : 'No voters yet'}
        searchPlaceholder="Search voters by email"
        onExportCsv
        exportLabel="Export CSV"
      />

      {isSetup && (
        <div className="v-card-sm">
          <h3 className="v-label mb-1">Ready to publish?</h3>
          <p className="v-helper-text mb-3">
            Publishing finishes setup and hands the event to its schedule. It does not open voting
            immediately — voting opens and closes based on the start and end dates you set.
          </p>
          <ul className="space-y-1.5">
            <ReadinessItem ok={positionsCount > 0} label="At least one position" />
            <ReadinessItem ok={candidatesCount > 0} label="At least one candidate" />
            <ReadinessItem ok={voters.length > 0} label="At least one registered voter" />
          </ul>
        </div>
      )}

      {isSetup && (
        <StageFooter
          module="election"
          currentKey="voters"
          eventId={eventId}
          saving={publishing}
          onNext={handlePublish}
          nextLabel="Finish & Publish"
          nextDisabled={!publishReady}
        />
      )}
    </div>
  )
}

function ReadinessItem({ ok, label }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          ok ? 'bg-emerald-500 text-white' : 'bg-v-danger/15 text-v-danger'
        }`}
        aria-hidden
      >
        {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={ok ? 'text-v-text' : 'text-v-text-subtle'}>{label}</span>
    </li>
  )
}

