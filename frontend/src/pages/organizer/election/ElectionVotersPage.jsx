import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SearchInput from '@/components/ui/SearchInput'
import Button from '@/components/ui/Button'

export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const load = () => {
    electionService
      .listVoters(eventId)
      .then(({ data }) => setVoters(data.voters ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  const handleInvite = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await electionService.inviteVoter(eventId, { email })
      setEmail('')
      load()
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
      const { data } = await electionService.importCsv(eventId, file)
      setImportResult(data)
      load()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      setError(details?.join(', ') || err.response?.data?.message || 'Import failed')
    }
    e.target.value = ''
  }

  const filteredVoters = voters.filter((v) => {
    const searchLower = search.toLowerCase()
    return (
      v.email.toLowerCase().includes(searchLower) ||
      (v.firstName && v.firstName.toLowerCase().includes(searchLower)) ||
      (v.lastName && v.lastName.toLowerCase().includes(searchLower))
    )
  })

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
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
        />
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
        <Button type="submit">Invite</Button>
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
                <tr key={v.id}>
                  <td className="text-v-text-muted">{v.email}</td>
                  <td className="v-caption">
                    {[v.firstName, v.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td>
                    <span className={v.hasVoted ? 'v-badge v-badge-success' : 'v-badge'}>
                      {v.hasVoted ? 'Voted' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}