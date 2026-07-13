import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { ProgressBarWithStats } from '@/components/ui/Skeleton'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

function VoterRow({ voter }) {
  return (
    <tr>
      <td className="text-v-text-muted">{voter.email}</td>
      <td>
        <span className={voter.hasVoted ? 'v-badge v-badge-success' : 'v-badge'}>
          {voter.hasVoted ? 'Voted' : 'Pending'}
        </span>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState(false)
  const [invitingRegistered, setInvitingRegistered] = useState(false)
  const [importProgress, setImportProgress] = useState(null)

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
    // Async fetch-on-mount pattern — see ElectionEventsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Optimistic UI - invite voter immediately
  const handleInvite = async (e) => {
    e.preventDefault()
    setError(null)
    setInviting(true)

    // Optimistically add to list
    const tempId = `temp-${Date.now()}`
    const newVoter = { id: tempId, email, firstName: '', lastName: '', hasVoted: false }
    setVoters((prev) => [...prev, newVoter])

    try {
      const res = await electionService.inviteVoter(eventId, { email, temporaryPassword })
      const emailResult = res?.data?.email ?? null

      if (!emailResult?.sent) {
        const reason = emailResult?.reason || emailResult?.error || 'Email was not sent'
        setVoters((prev) => prev.filter((v) => v.id !== tempId))
        setError(reason)
        showError(reason)
        return
      }

      setEmail('')
      setTemporaryPassword('')
      load()
      success('Voter invited successfully')
    } catch (err) {
      // Rollback
      setVoters((prev) => prev.filter((v) => v.id !== tempId))
      setError(err.response?.data?.message || 'Invite failed')
      showError(err.response?.data?.message || 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  // Handler for inviting already registered voters
  const handleInviteRegistered = async (e) => {
    e.preventDefault()
    setError(null)
    setInvitingRegistered(true)

    try {
      await electionService.inviteExistingVoter(eventId, registeredEmail)
      setRegisteredEmail('')
      load()
      success('Registered voter invited successfully')
    } catch (err) {
      setError(err.response?.data?.message || 'Invite failed')
      showError(err.response?.data?.message || 'Invite failed')
    } finally {
      setInvitingRegistered(false)
    }
  }

  // CSV Import with progress tracking
  const handleCsv = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setImportResult(null)
    setImportProgress({ processed: 0, total: 0, succeeded: 0, failed: 0 })

    try {
      // Use XMLHttpRequest for progress tracking
      const response = await electionService.importCsvWithProgress(
        eventId,
        file,
        (progress) => {
          setImportProgress(progress)
        }
      )

      setImportResult({
        succeeded: response.data.succeeded,
        total: response.data.total,
      })
      success(`Imported ${response.data.succeeded} of ${response.data.total} voters`)
      load()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.join(', ') || err.response?.data?.message || 'Import failed'
      setError(message)
      showError(message)
    } finally {
      setImportProgress(null)
      e.target.value = ''
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

      <div className="grid gap-6">
        <div className="v-card-sm">
          <h3 className="v-label">CSV upload</h3>
          <p className="v-helper-text mb-3">
            Columns: email (required), tempassword (optional).
            <br />
            If tempassword provided: Creates new voter with that password.
            <br />
            If tempassword empty: Enrolls existing voter only.
          </p>
          <input
            type="file"
            accept=".csv"
            className="v-caption"
            onChange={handleCsv}
            disabled={importProgress !== null}
          />

          {/* Progress bar during import */}
          {importProgress && (
            <div className="mt-3">
              <ProgressBarWithStats
                value={importProgress.processed}
                max={importProgress.total}
                succeeded={importProgress.succeeded}
                failed={importProgress.failed}
              />
            </div>
          )}

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
              placeholder="New voter (email)"
              className="v-input flex-1 min-w-[200px]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Temp Password (min 8 chars)"
              className="v-input flex-1 min-w-[200px]"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              minLength={8}
              required
            />
            <Button type="submit" loading={inviting} className="w-[160px]">
              Invite New
            </Button>
          </form>

          <form onSubmit={handleInviteRegistered} className="flex flex-wrap gap-3 pt-4 border-t border-v-border">
            <input
              type="email"
              placeholder="Registered voter (email)"
              className="v-input flex-1 min-w-[200px]"
              value={registeredEmail}
              onChange={(e) => setRegisteredEmail(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary" loading={invitingRegistered} className="w-[160px]">
              Invite Registered
            </Button>
          </form>
        </div>
      </div>

      {error && <p className="v-error-text">{error}</p>}

      <div className="v-table-wrap">
        <div className="p-4 border-b border-v-border">
          <SearchInput
            placeholder="Search voters by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <table className="v-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredVoters.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center v-caption py-8">
                  {search ? 'No voters found matching your search' : 'No voters yet'}
                </td>
              </tr>
            ) : (
              filteredVoters.map((v) => (
                <VoterRow key={v.id} voter={v} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}