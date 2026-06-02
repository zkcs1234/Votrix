import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { SkeletonTable, ProgressBarWithStats } from '@/components/ui/Skeleton'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'

function VoterRow({ voter }) {
  return (
    <tr>
      <td className="text-v-text-muted">{voter.email}</td>
      <td className="v-caption">
        {[voter.firstName, v.lastName].filter(Boolean).join(' ') || '—'}
      </td>
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
              <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
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
                <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
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
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState(false)
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
      await electionService.inviteVoter(eventId, { email })
      setEmail('')
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
    return (
      v.email.toLowerCase().includes(searchLower) ||
      (v.firstName && v.firstName.toLowerCase().includes(searchLower)) ||
      (v.lastName && v.lastName.toLowerCase().includes(searchLower))
    )
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

      <div className="v-card-sm">
        <h3 className="v-label">CSV upload</h3>
        <p className="v-helper-text mb-3">
          Columns: email, firstname, lastname. Duplicates in file are rejected.
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

      <form onSubmit={handleInvite} className="flex flex-wrap gap-3">
        <input
          type="email"
          placeholder="voter@email.com"
          className="v-input flex-1 min-w-[200px]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" loading={inviting}>
          Invite
        </Button>
      </form>

      {error && <p className="v-error-text">{error}</p>}

      <div className="v-table-wrap">
        <div className="p-4 border-b border-v-border">
          <SearchInput
            placeholder="Search voters by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <table className="v-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredVoters.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center v-caption py-8">
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