import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

import { useSocketEvent } from '@/hooks/useSocketEvent'
import { subscribeRoom } from '@/services/socket.service'
import { INPUT_CLASS } from '@/utils/uiClasses'

export default function CompetitionRankingsPage() {
  const { eventId } = useParams()
  const [data, setData] = useState(null)
  const [foundation, setFoundation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [divisionId, setDivisionId] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      pageantService.getRankings(eventId, { divisionId: divisionId || undefined }).catch(() => ({ data: {} })),
      pageantService.getFoundation(eventId).catch(() => ({ data: {} }))
    ]).then(([rankingsRes, foundationRes]) => {
      if (rankingsRes.data) setData(rankingsRes.data)
      if (foundationRes.data?.foundation) setFoundation(foundationRes.data.foundation)
    }).finally(() => setLoading(false))
  }, [eventId, divisionId])

  useEffect(() => {
    load()
    subscribeRoom(`event:${eventId}:organizer`)
  }, [eventId, load])

  useSocketEvent('rankings:updated', ({ rankings }) => {
    // Note: real-time updates might not have division filter applied, 
    // so we should probably re-fetch if we have a filter, or just use the data if no filter.
    // To be safe, we just reload the data if there's a specific division selected.
    if (divisionId) {
      load()
    } else if (rankings) {
      setData(rankings)
    }
  }, [eventId, divisionId, load])

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  const divisionsEnabled = foundation?.event?.divisions_enabled
  const divisions = foundation?.divisions ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-v-text">Live rankings</h2>
        <div className="flex items-center gap-3">
          {divisionsEnabled && divisions.length > 0 && (
            <select
              className={`${INPUT_CLASS} py-1.5 text-sm w-auto`}
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">— Event-wide —</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Link
            to={`/organizer/reports/competition/${eventId}`}
            className="text-sm text-v-text-muted hover:text-v-text"
          >
            Full competition scoring report →
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
