import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
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
  const exampleRows = [['respondent@example.com']]
  downloadCsv('respondent.csv', headers, exampleRows)
}

function CsvPreviewModal({ data, onClose, onRegister, registering }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-v-surface rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        <h3 className="v-page-title mb-4">Review & Register</h3>

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
      </div>
    </div>
  )
}

export default function PollingRespondentsPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
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
const [search, setSearch] = useState('')
  // Publish readiness: a poll still in `draft` (setup) is published from here.
  const [eventStatus, setEventStatus] = useState(null)
  const [questionsCount, setQuestionsCount] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const fileInputRef = useRef(null)

  const { success, error: showError } = useToast()
  const showLoader = useDelayedLoading(loading, 300)

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

  // Load publish-readiness context: the poll's status and how many questions
  // exist. Used to decide whether the "Finish & Publish" action shows and
  // whether it is enabled.
  const reloadSetup = useCallback(async () => {
    try {
      const [{ data: settings }, { data: q }] = await Promise.all([
        pollingService.getSettings(eventId),
        pollingService.listQuestions(eventId),
      ])
      setEventStatus(settings.settings?.status ?? null)
      setQuestionsCount(Array.isArray(q.questions) ? q.questions.length : 0)
    } catch (err) {
      console.error('Failed to load publish readiness:', err)
    }
  }, [eventId])

  useEffect(() => { reloadSetup() }, [reloadSetup])

  const pendingCount = voters.filter((v) => !v.invitationSent).length

  // Publish the fully-built setup poll. This does NOT open the poll — it hands
  // the event to the schedule; the poll opens/closes purely on the start/end
  // dates. Requires ≥1 question and ≥1 respondent (enforced again on backend).
  const isSetup = eventStatus === 'draft'
  const publishReady = questionsCount > 0 && voters.length > 0

  const handlePublish = async () => {
    if (!publishReady) return
    setPublishing(true)
    try {
      await pollingService.publishEvent(eventId)
      success('Poll published. It will open based on its schedule.')
      navigate('/organizer/polling/events')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish poll')
    } finally {
      setPublishing(false)
    }
  }

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
      const msg = details?.join(', ') || err.response?.data?.message || 'Preview failed'
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
      const msg = details?.join(', ') || err.response?.data?.message || 'Registration failed'
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
              ref={fileInputRef}
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

      {error && <p className="v-error-text">{error}</p>}

      <DynamicParticipantTable
        participants={voters}
        formSchema={formSchema}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        statusKey="hasVoted"
        statusLabel={{ active: 'Pending', done: 'Responded' }}
        renderActions={renderActions}
        emptyMessage={search ? 'No respondents found matching your search' : 'No respondents yet'}
        searchPlaceholder="Search by email"
        onExportCsv
        exportLabel="Export CSV"
      />

      {isSetup && (
        <div className="v-card-sm">
          <h3 className="v-label mb-1">Ready to publish?</h3>
          <p className="v-helper-text mb-3">
            Publishing finishes setup and hands the poll to its schedule. It does not open the poll
            immediately — it opens and closes based on the start and end dates you set.
          </p>
          <ul className="space-y-1.5">
            <ReadinessItem ok={questionsCount > 0} label="At least one question" />
            <ReadinessItem ok={voters.length > 0} label="At least one registered respondent" />
          </ul>
        </div>
      )}

      {isSetup && (
        <StageFooter
          module="polling"
          currentKey="respondents"
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

