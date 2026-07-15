import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

function InvitationStatusBadge({ sent }) {
  if (sent) {
    return <span className="v-badge v-badge-success">Sent</span>
  }
  return <span className="v-badge v-badge-warning">Pending</span>
}

function VoterRow({ voter, onSendInvitation, sendingId }) {
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

function TableSkeleton() {
  return (
    <div className="v-table-wrap">
      <div className="p-4 border-b border-v-border">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <table className="v-table">
        <thead>
          <tr>
            <th>
              <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td>
                <div className="h-4 w-40 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="h-6 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="h-6 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="h-6 w-28 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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

        <div className="v-table-wrap max-h-64 overflow-auto mb-4">
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
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [registering, setRegistering] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingId, setSendingId] = useState(null)

  const { success, error: showError } = useToast()

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      const { data } = await electionService.listVoters(eventId)
      setVoters(data.voters ?? [])
    } catch (err) {
      console.error('Failed to load voters:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    // Async fetch-on-mount pattern
    load()
  }, [load])

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
      load()
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
    setPreviewFile(file)

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
      setPreviewFile(null)
      success(`Registered ${data.succeeded} of ${data.total} voters. Send invitations later.`)
      load()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.join(', ') || err.response?.data?.message || 'Registration failed'
      setError(message)
      showError(message)
    } finally {
      setRegistering(false)
    }
  }

  // Send invitation for single voter
  const handleSendInvitation = async (voterId) => {
    setSendingId(voterId)
    try {
      const { data } = await electionService.sendInvitation(eventId, voterId)
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

  // Send all pending invitations
  const handleSendAll = async () => {
    if (pendingCount === 0) return
    setSendingAll(true)
    try {
      const { data } = await electionService.sendAllInvitations(eventId)
      success(`Sent ${data.sent} of ${data.total} invitations`)
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to send invitations')
    } finally {
      setSendingAll(false)
    }
  }

  const filteredVoters = voters.filter((v) => {
    const searchLower = search.toLowerCase()
    return v.email.toLowerCase().includes(searchLower)
  })

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        <TableSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="v-page-title">Voters</h2>

      {csvPreview && (
        <CsvPreviewModal
          data={csvPreview}
          onClose={() => {
            setCsvPreview(null)
            setPreviewFile(null)
          }}
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
          <input
            type="file"
            accept=".csv"
            className="v-caption"
            onChange={handleCsvPreview}
          />

          {importResult && (
            <p className="v-caption mt-2 text-v-success">
              Registered {importResult.succeeded} of {importResult.total} voters. Invitation emails not sent.
            </p>
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

      <div className="v-table-wrap">
        <div className="p-4 border-b border-v-border flex flex-wrap gap-3 justify-between items-center">
          <SearchInput
            placeholder="Search voters by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {pendingCount > 0 && (
            <Button
              onClick={handleSendAll}
              loading={sendingAll}
              disabled={sendingAll}
            >
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
                  {search ? 'No voters found matching your search' : 'No voters yet'}
                </td>
              </tr>
            ) : (
              filteredVoters.map((v) => (
                <VoterRow
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