import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)

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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-v-text">Voters</h2>

      <div className="v-card p-6">
        <h3 className="text-sm font-medium text-v-text-muted">CSV upload</h3>
        <p className="mt-1 text-xs text-v-text-subtle">
          Columns: email, firstname, lastname. Duplicates in file are rejected.
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
          placeholder="voter@email.com"
          className="v-input flex-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="rounded-xl bg-v-primary px-4 py-2 text-sm text-white">
          Invite
        </button>
      </form>

      {error && <p className="text-sm text-v-danger">{error}</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-v-border text-v-text-subtle">
            <th className="py-2">Email</th>
            <th>Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {voters.map((v) => (
            <tr key={v.id} className="border-b border-v-border/50">
              <td className="py-3 text-v-text-muted">{v.email}</td>
              <td className="text-v-text-subtle">
                {[v.firstName, v.lastName].filter(Boolean).join(' ') || 'â€”'}
              </td>
              <td className={v.hasVoted ? 'text-v-success' : 'text-v-text-subtle'}>
                {v.hasVoted ? 'Voted' : 'Pending'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
