import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'

export default function PollingRespondentsPage() {
  const { eventId } = useParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [importResult, setImportResult] = useState(null)

  const handleInvite = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      await pollingService.inviteRespondent(eventId, { email })
      setEmail('')
      setSuccess('Invitation sent')
    } catch (err) {
      setError(err.response?.data?.message || 'Invite failed')
    }
  }

  const handleCsv = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setImportResult(null)

    try {
      const { data } = await pollingService.importCsv(eventId, file)
      setImportResult(data)
    } catch (err) {
      const details = err.response?.data?.details?.errors
      setError(details?.join(', ') || err.response?.data?.message || 'Import failed')
    }
    e.target.value = ''
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-v-text">Respondents</h2>
      <p className="text-sm text-v-text-subtle">
        Invite people by email or CSV. They receive credentials to respond to this poll.
      </p>

      <div className="v-card p-6">
        <h3 className="text-sm font-medium text-v-text-muted">CSV upload</h3>
        <p className="mt-1 text-xs text-v-text-subtle">
          Columns: email, firstname, lastname
        </p>
        <input type="file" accept=".csv" className="mt-3 text-sm text-v-text-subtle" onChange={handleCsv} />
        {importResult && (
          <p className="mt-2 text-sm text-v-success">
            Imported {importResult.succeeded} of {importResult.total} â€” invitation emails sent.
          </p>
        )}
      </div>

      <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          placeholder="respondent@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-v-border-strong bg-v-surface-elevated px-3 py-2 text-white"
        />
        <button type="submit" className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white">
          Send invite
        </button>
      </form>

      {success && <p className="text-sm text-v-success">{success}</p>}
      {error && <p className="text-sm text-v-danger">{error}</p>}
    </div>
  )
}
