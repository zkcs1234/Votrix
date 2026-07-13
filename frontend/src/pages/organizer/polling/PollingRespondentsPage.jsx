import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import Button from '@/components/ui/Button'

export default function PollingRespondentsPage() {
  const { eventId } = useParams()
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [invitingRegistered, setInvitingRegistered] = useState(false)

  const handleInvite = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      await pollingService.inviteRespondent(eventId, { email, temporaryPassword })
      setEmail('')
      setTemporaryPassword('')
      setSuccess('Invitation sent')
    } catch (err) {
      setError(err.response?.data?.message || 'Invite failed')
    }
  }

  const handleInviteRegistered = async (e) => {
    e.preventDefault()
    setError(null)
    setInvitingRegistered(true)
    try {
      await pollingService.inviteExistingRespondent(eventId, registeredEmail)
      setRegisteredEmail('')
      setSuccess('Registered respondent invited successfully')
    } catch (err) {
      setError(err.response?.data?.message || 'Invite failed')
    } finally {
      setInvitingRegistered(false)
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

      <div className="grid gap-6">
        <div className="v-card-sm">
          <h3 className="v-label">CSV upload</h3>
          <p className="v-helper-text mb-3">
            Columns: email (required), tempassword (optional).
            <br />
            If tempassword provided: Creates new respondent with that password.
            <br />
            If tempassword empty: Enrolls existing respondent only.
          </p>
          <input type="file" accept=".csv" className="v-caption" onChange={handleCsv} />
          {importResult && (
            <p className="v-caption mt-2 text-v-success">
              Imported {importResult.succeeded} of {importResult.total} — invitation emails sent.
            </p>
          )}
        </div>

        <div className="v-card-sm">
          <h3 className="v-label mb-3">Invite Manually</h3>
          <form onSubmit={handleInvite} className="flex flex-wrap gap-3 mb-4">
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
            <Button type="submit" className="w-[160px]">
              Invite New
            </Button>
          </form>

          <form onSubmit={handleInviteRegistered} className="flex flex-wrap gap-3 pt-4 border-t border-v-border">
            <input
              type="email"
              required
              placeholder="Registered respondent (email)"
              value={registeredEmail}
              onChange={(e) => setRegisteredEmail(e.target.value)}
              className="v-input flex-1 min-w-[200px]"
            />
            <Button type="submit" variant="secondary" loading={invitingRegistered} className="w-[160px]">
              Invite Registered
            </Button>
          </form>
        </div>
      </div>

      {success && <p className="text-sm text-v-success">{success}</p>}
      {error && <p className="text-sm text-v-danger">{error}</p>}
    </div>
  )
}
