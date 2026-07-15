import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

function InvitationStatusBadge({ sent }) {
  if (sent === null || sent === undefined) return null
  return sent
    ? <span className="v-badge v-badge-success">Sent</span>
    : <span className="v-badge v-badge-warning">Pending</span>
}

function JudgeRow({ judge, onSendInvitation, sendingId }) {
  const isSending = sendingId === judge.judgeId

  return (
    <tr>
      <td className="text-v-text-muted">{judge.email}</td>
      <td>
        <span className={judge.hasScored ? 'v-badge v-badge-success' : 'v-badge'}>
          {judge.hasScored ? 'Submitted' : 'Pending'}
        </span>
      </td>
      <td>
        <InvitationStatusBadge sent={judge.invitationSent} />
      </td>
      <td>
        {judge.invitationSent === false && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSendInvitation(judge.judgeId)}
            loading={isSending}
            disabled={isSending}
          >
            Send Invitation
          </Button>
        )}
      </td>
    </tr>
  )
}

function CsvPreviewModal({ data, onClose, onRegister, registering }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-v-surface rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        <h3 className="v-page-title mb-4">Preview CSV Import</h3>
        <p className="v-helper-text mb-4">
          Review the data below before registering judges. No emails will be sent until you click "Register Judges".
        </p>

        {data.errors?.length > 0 && (
          <div className="mb-4 p-3 bg-v-danger/10 border border-v-danger/30 rounded-lg">
            <p className="v-error-text font-semibold mb-2">Errors ({data.errors.length})</p>
            <ul className="v-error-text text-sm list-disc list-inside">
              {data.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
              {data.errors.length > 5 && <li>...and {data.errors.length - 5} more errors</li>}
            </ul>
          </div>
        )}

        <p className="v-label mb-4">Valid rows: {data.valid} of {data.total}</p>

        <div className="v-table-wrap max-h-64 overflow-auto mb-4">
          <table className="v-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Email</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, i) => (
                <tr key={i}>
                  <td>{row.rowNumber}</td>
                  <td>{row.email}</td>
                  <td>
                    <span className={row.type === 'new' ? 'v-badge v-badge-success' : 'v-badge'}>
                      {row.type === 'new' ? 'New Judge' : 'Existing'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={registering}>Cancel</Button>
          <Button onClick={onRegister} loading={registering}>
            Register Judges ({data.valid})
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CompetitionJudgesPage() {
  const { eventId } = useParams()
  const [judges, setJudges] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [registering, setRegistering] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  const { success, error: showError } = useToast()
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      const { data } = await pageantService.listJudges(eventId)
      setJudges(data.judges ?? [])
    } catch (err) {
      console.error('Failed to load judges:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  const pendingCount = judges.filter((j) => j.invitationSent === false).length

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)
    setRegistering(true)
    try {
      await pageantService.registerJudge(eventId, { email, temporaryPassword })
      setEmail('')
      setTemporaryPassword('')
      load()
      success('Judge registered successfully. Send invitation later from the judge list.')
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
    e.target.value = ''
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
      const { data } = await pageantService.sendJudgeInvitation(eventId, judgeId)
      if (data.invitationSent) {
        success('Invitation sent successfully')
      } else {
        showError('Failed to send invitation')
      }
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to send invitation')
    } finally {
      setSendingId(null)
    }
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

  const filteredJudges = judges.filter((j) =>
    j.email?.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading && !showLoader) return null

  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="v-table-wrap">
          <table className="v-table">
            <thead>
              <tr>
                {['Email', 'Score Status', 'Invitation', 'Actions'].map((h) => (
                  <th key={h}><div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <td key={j}><div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

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
            Columns: email (required), tempassword (optional).
            <br />
            If tempassword provided: Creates new judge with that password.
            <br />
            If tempassword empty: Enrolls existing judge only.
          </p>
          <input type="file" accept=".csv" className="v-caption" onChange={handleCsvPreview} />
          {importResult && (
            <p className="v-caption mt-2 text-v-success">
              Registered {importResult.succeeded} of {importResult.total} judges. Invitation emails not sent.
            </p>
          )}
        </div>

        <div className="v-card-sm">
          <h3 className="v-label mb-3">Register Manually</h3>
          <form onSubmit={handleRegister} className="flex flex-wrap gap-3">
            <input
              type="email"
              className="v-input flex-1 min-w-[200px]"
              placeholder="New judge (email)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="v-input flex-1 min-w-[200px]"
              placeholder="Temp Password (min 8 chars)"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              minLength={8}
              required
            />
            <Button type="submit" loading={registering} className="w-[160px]">
              Register Judge
            </Button>
          </form>
        </div>
      </div>

      {error && <p className="v-error-text">{error}</p>}

      <div className="v-table-wrap">
        <div className="p-4 border-b border-v-border flex flex-wrap gap-3 justify-between items-center">
          <SearchInput
            placeholder="Search judges by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {pendingCount > 0 && (
            <Button onClick={handleSendAll} loading={sendingAll} disabled={sendingAll}>
              Send All Invitations ({pendingCount})
            </Button>
          )}
        </div>
        <table className="v-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Score Status</th>
              <th>Invitation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredJudges.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center v-caption py-8">
                  {search ? 'No judges found matching your search' : 'No judges yet'}
                </td>
              </tr>
            ) : (
              filteredJudges.map((j) => (
                <JudgeRow
                  key={j.id}
                  judge={j}
                  onSendInvitation={handleSendInvitation}
                  sendingId={sendingId}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
