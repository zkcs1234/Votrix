import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

function InvitationStatusBadge({ sent }) {
  if (sent) return <span className="v-badge v-badge-success">Sent</span>
  return <span className="v-badge v-badge-warning">Pending</span>
}

function RespondentRow({ voter, onSendInvitation, sendingId }) {
  const isSending = sendingId === voter.voterId
  return (
    <tr>
      <td className="text-v-text-muted">{voter.email}</td>
      <td>
        <span className={voter.hasVoted ? 'v-badge v-badge-success' : 'v-badge'}>
          {voter.hasVoted ? 'Voted' : 'Pending'}
        </span>
      </td>
      <td>
        <InvitationStatusBadge sent={voter.invitationSent} />
      </td>
      <td>
        {!voter.invitationSent && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSendInvitation(voter.voterId)}
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
          Review the data below before registering respondents. No emails will be sent until you click "Register Respondents".
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
                      {row.type === 'new' ? 'New Respondent' : 'Existing'}
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
            Register Respondents ({data.valid})
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PollingRespondentsPage() {
  const { eventId } = useParams()
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [error, setError] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [registeringRegistered, setRegisteringRegistered] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)
  const [search, setSearch] = useState('')

  const { success, error: showError } = useToast()
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      const { data } = await pollingService.listVoters(eventId)
      setVoters(data.voters ?? [])
    } catch (err) {
      console.error('Failed to load respondents:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  const pendingCount = voters.filter((v) => !v.invitationSent).length

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)
    setRegistering(true)
    try {
      await pollingService.registerRespondent(eventId, { email, temporaryPassword })
      setEmail('')
      setTemporaryPassword('')
      load()
      success('Respondent registered successfully. Send invitation later from the list.')
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed'
      setError(msg)
      showError(msg)
    } finally {
      setRegistering(false)
    }
  }

  const handleRegisterExisting = async (e) => {
    e.preventDefault()
    setError(null)
    setRegisteringRegistered(true)
    try {
      await pollingService.registerExistingRespondent(eventId, registeredEmail)
      setRegisteredEmail('')
      load()
      success('Respondent registered successfully. Send invitation later from the list.')
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed'
      setError(msg)
      showError(msg)
    } finally {
      setRegisteringRegistered(false)
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
    e.target.value = ''
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

  const handleSendInvitation = async (voterId) => {
    setSendingId(voterId)
    try {
      const { data } = await pollingService.sendInvitation(eventId, voterId)
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
      const { data } = await pollingService.sendAllInvitations(eventId)
      success(`Sent ${data.sent} of ${data.total} invitations`)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to send invitations')
    } finally {
      setSendingAll(false)
    }
  }

  const filteredVoters = voters.filter((v) =>
    v.email.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading && !showLoader) return null

  if (loading || showLoader) {
    return (
      <div className="space-y-8">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="animate-pulse h-32 bg-v-surface-elevated rounded-lg" />
      </div>
    )
  }

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
            Columns: email (required), tempassword (optional).
            <br />
            If tempassword provided: Creates new respondent with that password.
            <br />
            If tempassword empty: Enrolls existing respondent only.
          </p>
          <input type="file" accept=".csv" className="v-caption" onChange={handleCsvPreview} />
          {importResult && (
            <p className="v-caption mt-2 text-v-success">
              Registered {importResult.succeeded} of {importResult.total} respondents. Invitation emails not sent.
            </p>
          )}
        </div>

        <div className="v-card-sm">
          <h3 className="v-label mb-3">Register Manually</h3>
          <form onSubmit={handleRegister} className="flex flex-wrap gap-3 mb-4">
            <input
              type="email"
              required
              placeholder="New respondent (email)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="v-input flex-1 min-w-[200px]"
            />
            <input
              type="password"
              required
              placeholder="Temp Password (min 8 chars)"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              minLength={8}
              className="v-input flex-1 min-w-[200px]"
            />
            <Button type="submit" loading={registering} className="w-[160px]">
              Register Respondent
            </Button>
          </form>

          <form onSubmit={handleRegisterExisting} className="flex flex-wrap gap-3 pt-4 border-t border-v-border">
            <input
              type="email"
              required
              placeholder="Registered respondent (email)"
              value={registeredEmail}
              onChange={(e) => setRegisteredEmail(e.target.value)}
              className="v-input flex-1 min-w-[200px]"
            />
            <Button type="submit" variant="secondary" loading={registeringRegistered} className="w-[160px]">
              Register to Event
            </Button>
          </form>
        </div>
      </div>

      {error && <p className="v-error-text">{error}</p>}

      <div className="v-table-wrap">
        <div className="p-4 border-b border-v-border flex flex-wrap gap-3 justify-between items-center">
          <SearchInput
            placeholder="Search by email"
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
              <th>Voted</th>
              <th>Invitation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVoters.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center v-caption py-8">
                  {search ? 'No respondents found matching your search' : 'No respondents yet'}
                </td>
              </tr>
            ) : (
              filteredVoters.map((v) => (
                <RespondentRow
                  key={v.id}
                  voter={v}
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
