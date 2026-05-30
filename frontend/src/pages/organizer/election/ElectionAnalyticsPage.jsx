import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import BarChart from '@/components/reports/BarChart'

export default function ElectionAnalyticsPage() {
  const { eventId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const load = () => {
      electionService
        .getAnalytics(eventId)
        .then(({ data }) => {
          if (alive) setData(data.analytics)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }

    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [eventId])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-v-text">Analytics</h2>
        <Link
          to={`/organizer/reports/election/${eventId}`}
          className="text-sm text-v-text-muted hover:text-v-text"
        >
          Full report â†’
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total voters" value={data?.totalVoters} />
        <Stat label="Voted" value={data?.votedCount} />
        <Stat label="Turnout" value={`${data?.turnoutPercentage ?? 0}%`} />
        <Stat label="Live votes" value={data?.liveTotalVotes} />
      </div>

      <div className="v-card p-6">
        <h3 className="font-medium text-v-text">Votes per candidate</h3>
        <div className="mt-4">
          <BarChart
            colorClass="bg-v-primary"
            items={(data?.candidateResults ?? []).map((c) => ({
              id: c.candidateId,
              label: c.candidateName,
              count: c.votes,
            }))}
            valueKey="count"
            labelKey="label"
          />
          {!data?.candidateResults?.length && (
            <p className="text-sm text-v-text-subtle">No events available. Create your first event to begin.</p>
          )}
        </div>
      </div>

      {(data?.positionSummaries ?? []).map((position) => (
        <div key={position.positionId} className="v-card p-6">
          <h3 className="font-medium text-v-text">{position.positionName}</h3>
          <div className="mt-4">
            <BarChart
              colorClass="bg-v-primary"
              items={position.candidates.map((c) => ({
                id: c.candidateId,
                label: c.candidateName,
                count: c.votes,
                percentage: c.votePercentage,
              }))}
              valueKey="count"
              labelKey="label"
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-v-border bg-v-surface p-5">
      <p className="text-xs text-v-text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value ?? 0}</p>
    </div>
  )
}
