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
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [divisionId, setDivisionId] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      pageantService.getRankings(eventId, { divisionId: divisionId || undefined }).catch(() => ({ data: {} })),
      pageantService.getFoundation(eventId).catch(() => ({ data: {} })),
      pageantService.getResults(eventId).catch(() => ({ data: {} })),
    ]).then(([rankingsRes, foundationRes, resultsRes]) => {
      if (rankingsRes.data) setData(rankingsRes.data)
      if (foundationRes.data?.foundation) setFoundation(foundationRes.data.foundation)
      if (resultsRes.data?.results) setResults(resultsRes.data.results)
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

      <ResultsAndAwards results={results} />
    </div>
  )
}

function ResultsAndAwards({ results }) {
  if (!results) return null
  const hasContent =
    results.champion ||
    (results.categoryAwards?.length ?? 0) > 0 ||
    (results.divisions?.length ?? 0) > 0 ||
    (results.rounds?.length ?? 0) > 0
  if (!hasContent) return null

  return (
    <div className="space-y-5 rounded-2xl border border-v-border bg-v-surface p-5">
      <h3 className="text-lg font-semibold text-v-text">Results &amp; Awards</h3>

      {results.champion && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-300">Overall champion</p>
          <p className="mt-1 text-lg font-bold text-v-text">
            #{results.champion.contestantNumber} {results.champion.contestantName}
            <span className="ml-2 text-sm font-normal text-v-text-subtle">
              {Number(results.champion.finalScore ?? results.champion.weightedScore ?? 0).toFixed(2)}
            </span>
          </p>
        </div>
      )}

      {results.categoryAwards?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-v-text-muted">
            Best in category
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.categoryAwards.map((a) => (
              <div key={a.categoryId} className="rounded-lg border border-v-border px-3 py-2 text-sm">
                <span className="text-v-text-subtle">{a.categoryName}: </span>
                <span className="font-medium text-v-text">
                  #{a.contestantNumber} {a.contestantName}
                </span>
                <span className="ml-1 text-xs text-v-text-subtle">({Number(a.value).toFixed(2)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.divisionsEnabled && results.divisions?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-v-text-muted">
            Division winners
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.divisions.map((d) => (
              <div key={d.divisionId} className="rounded-lg border border-v-border px-3 py-2 text-sm">
                <span className="text-v-text-subtle">{d.name}: </span>
                {d.winner ? (
                  <span className="font-medium text-v-text">
                    #{d.winner.contestantNumber} {d.winner.contestantName}
                  </span>
                ) : (
                  <span className="text-v-text-subtle">—</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results.rounds?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-v-text-muted">
            Finalized round standings
          </p>
          <div className="space-y-3">
            {results.rounds.map((r) => (
              <div key={r.roundId} className="rounded-lg border border-v-border p-3">
                <p className="mb-2 text-sm font-medium text-v-text">{r.roundName}</p>
                <ul className="space-y-1">
                  {r.standings.map((s) => (
                    <li
                      key={s.contestantId}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-v-text">
                        #{s.rank} · {s.contestantName}
                        {s.qualified && (
                          <span className="ml-2 rounded bg-v-success/10 px-1.5 py-0.5 text-[10px] font-medium text-v-success">
                            Advanced
                          </span>
                        )}
                      </span>
                      <span className="text-v-text-subtle">{s.score.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
