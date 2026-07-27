import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import Button from '@/components/ui/Button'
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
  downloadCsv('voter-import-template.csv', headers, exampleRows)
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
  const { success, error: showError } = useToast()

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await electionService.listVoters(eventId)
        if (!alive) return
        setVoters(data.voters ?? [])
        setFormSchema(data.informationFormSchema ?? null)
      } catch (err) {
        console.error('Failed to load voters:', err)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [eventId])

  // Reload voters from server
  const reload = async () => {
    try {
      const { data } = await electionService.listVoters(eventId)
      setVoters(data.voters ?? [])
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
      await reload()
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
      await reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to send invitations')
    } finally {
      setSendingAll(false)
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
    if (!participant.invitationSent) {
      const isSending = sendingId === participant.voterId
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
    return null
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
    </div>
  )
}

