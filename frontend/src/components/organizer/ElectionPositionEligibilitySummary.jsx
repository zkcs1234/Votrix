import { useEffect, useState } from 'react'
import { electionService } from '@/services/election.service'

export default function ElectionPositionEligibilitySummary({ eventId }) {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    electionService.getPositionEligibilitySummary(eventId)
      .then(({ data }) => {
        if (alive) setPositions(data.positions ?? [])
      })
      .catch((err) => {
        if (alive) setError(err.response?.data?.message || 'Failed to load position eligibility')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [eventId, refresh])

  return (
    <section className="v-card space-y-4 p-5" aria-labelledby="position-eligibility-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="position-eligibility-summary-title" className="v-section-title">Position Eligibility</h2>
          <p className="v-caption mt-1">Review who can vote for each position. Configure these rules in the Position Builder.</p>
        </div>
        <button type="button" className="v-btn-tertiary text-sm" onClick={() => setRefresh((value) => value + 1)}>
          Refresh
        </button>
      </div>
      {error && <p role="alert" className="v-error-text">{error}</p>}
      {loading ? <p className="v-caption">Loading position eligibility…</p> : (
        positions.length ? (
          <ul className="divide-y divide-v-border">
            {positions.map((position) => (
              <li key={position.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-v-text">{position.name}</p>
                  <p className="text-xs text-v-text-subtle">
                    {position.sectionName ? `${position.sectionName} · ` : ''}
                    {position.eligiblePrograms?.length ? position.eligiblePrograms.join(', ') : 'All voters eligible for the group'}
                  </p>
                </div>
                <span className="text-xs text-v-text-muted">
                  {position.eligibleVoterCount} eligible {position.eligibleVoterCount === 1 ? 'voter' : 'voters'}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="v-caption">Add positions to see their eligibility here.</p>
      )}
    </section>
  )
}
