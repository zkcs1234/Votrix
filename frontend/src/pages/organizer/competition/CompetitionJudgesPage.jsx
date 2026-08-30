import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import DynamicParticipantTable from '@/components/organizer/DynamicParticipantTable'
import JudgeAssignmentPanel from '@/components/organizer/competition/JudgeAssignmentPanel'
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
  const exampleRows = [['judge@example.com']]
  downloadCsv('judge.csv', headers, exampleRows)
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

export default function CompetitionJudgesPage() {
  const { eventId } = useParams()
  const [judges, setJudges] = useState([])
  const [formSchema, setFormSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [registering, setRegistering] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [foundation, setFoundation] = useState(null)
  const fileInputRef = useRef(null)

  const { success, error: showError } = useToast()
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      const { data } = await pageantService.listJudges(eventId)
      const normalized = Array.isArray(data?.judges)
        ? data.judges.map((judge) => ({
            ...judge,
            id: judge.id ?? judge.email,
            participantId: judge.id ?? null,
            judgeId: judge.judgeId ?? judge.userId ?? null,
            email: judge.email ?? null,
            firstName: judge.firstName ?? null,
            lastName: judge.lastName ?? null,
            hasScored: Boolean(judge.hasScored ?? false),
            invitationSent: Boolean(judge.invitationSent ?? false),
            metadata: judge.metadata ?? {},
          }))
        : []

      setJudges(normalized)
      setFormSchema(data?.informationFormSchema ?? null)
    } catch (err) {
      console.error('Failed to load judges:', err)
      setJudges([])
      setFormSchema(null)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  const loadFoundation = useCallback(async () => {
    try {
      const { data } = await pageantService.getFoundation(eventId)
      setFoundation(data.foundation)
    } catch {
      setFoundation(null)
    }
  }, [eventId])

  useEffect(() => {
    load()
    loadFoundation()
  }, [load, loadFoundation])

  const pendingCount = judges.filter((j) => !j.invitationSent && j.judgeId).length

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)
    setRegistering(true)
    try {
      await pageantService.registerJudge(eventId, { email })
      setEmail('')
      load()
      success('Judge registered. Send invitation when ready.')
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
      const { data } = await pageantService.previewJudgesCsv(eventId, file)
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
    setRegistering(true)
    try {
      const { data } = await pageantService.registerJudgesCsv(eventId, csvPreview.data)
      setImportResult({ succeeded: data.succeeded, total: data.total })
      setCsvPreview(null)
      success(`Registered ${data.succeeded} of ${data.total} judges. Send invitations later.`)
      load()
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed'
      setError(msg)
      showError(msg)
    } finally {
      setRegistering(false)
    }
  }

  const handleSendInvitation = async (judgeId) => {
    setSendingId(judgeId)
    try {
      const response = await pageantService.sendJudgeInvitation(eventId, judgeId)
      const { data } = response
      
      if (data.invitationSent) {
        success('Invitation sent successfully')
        setJudges((current) =>
          current.map((judge) =>
            judge.judgeId === judgeId ? { ...judge, invitationSent: true } : judge,
          ),
        )
        load()
      } else {
        // Show specific error message from backend
        const errorMsg = data.message || data.email?.error || 'Failed to send invitation'
        if (data.email?.retryable) {
          showError(`${errorMsg}. Please check your internet connection and try again.`)
        } else {
          showError(errorMsg)
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to send invitation'
      showError(`Network error: ${errorMsg}`)
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
    if (!participant.invitationSent && participant.judgeId) {
      const isSending = sendingId === participant.judgeId
      return (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleSendInvitation(participant.judgeId)}
          loading={isSending}
          disabled={isSending}
        >
          Send Invitation
        </Button>
      )
    }
    return null
  }

  const handleSendAll = async () => {
    if (pendingCount === 0) return
    setSendingAll(true)
    try {
      const { data } = await pageantService.sendAllJudgeInvitations(eventId)
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
    <div className="space-y-6">
      <h2 className="v-page-title">Judges</h2>
      <p className="text-sm text-v-text-subtle">
        Judges are voter accounts with scoring access for this competition event.
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
              className="v-input flex-1 min-w-[200px]"
              placeholder="Judge email"
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
        participants={judges}
        formSchema={formSchema}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        statusKey="hasScored"
        statusLabel={{ active: 'Pending', done: 'Submitted' }}
        renderActions={renderActions}
        emptyMessage={search ? 'No judges found matching your search' : 'No judges yet'}
        searchPlaceholder="Search judges by email"
        onExportCsv
        exportLabel="Export CSV"
      />

      {/* Judge assignment — moved here so you add judges then scope them, after
          the rounds/divisions/categories exist. */}
      <div className="border-t border-v-border pt-6">
        <JudgeAssignmentPanel foundation={foundation} reload={loadFoundation} />
      </div>
    </div>
  )
}
