import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function PageantRankingsPage() {
  const { eventId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    pageantService
      .getRankings(eventId)
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [eventId])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-v-text">Live rankings</h2>
        <div className="flex gap-3">
          <Link
            to={`/organizer/reports/pageant/${eventId}`}
            className="text-sm text-v-text-muted hover:text-v-text"
          >
            Full competition scoring report â†’
          </Link>
          <button type="button" onClick={load} className="text-sm text-v-text-subtle hover:text-v-text-muted">
            Refresh
          </button>
        </div>
      </div>

      <p className="text-sm text-v-text-subtle">
        Judges submitted: {data?.judges?.submitted ?? 0} / {data?.judges?.total ?? 0}
      </p>

      <div className="space-y-4">
        {(data?.rankings ?? []).map((r) => (
          <div
            key={r.contestantId}
            className="flex gap-4 rounded-2xl border border-v-border bg-v-surface p-5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-v-surface-elevated text-lg font-bold text-v-text-muted">
              {r.rank}
            </div>
            {r.photo && (
              <img src={r.photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
            )}
            <div className="flex-1">
              <p className="font-semibold text-v-text">
                #{r.contestantNumber} {r.contestantName}
              </p>
              <p className="mt-1 text-2xl font-bold text-v-text-muted">
                {r.weightedScore.toFixed(2)}
                <span className="ml-1 text-sm font-normal text-v-text-subtle">weighted</span>
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-v-text-subtle">
                {r.criteriaBreakdown.map((c) => (
                  <li key={c.criteriaId} className="rounded bg-v-surface-elevated px-2 py-1">
                    {c.criteriaName}: avg {c.average} ({c.percentage}%)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
        {!data?.rankings?.length && (
          <p className="text-v-text-subtle">No contestants or scores yet.</p>
        )}
      </div>
    </div>
  )
}
