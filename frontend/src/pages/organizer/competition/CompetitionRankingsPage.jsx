import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import { competitionSessionService } from '@/services/competition-session.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

import { useSocketEvent } from '@/hooks/useSocketEvent'
import { subscribeRoom } from '@/services/socket.service'
import { INPUT_CLASS } from '@/utils/uiClasses'

export default function CompetitionRankingsPage() {
  const { eventId } = useParams()
  const [data, setData] = useState(null)
  const [foundation, setFoundation] = useState(null)
  const [results, setResults] = useState(null)
  const [awards, setAwards] = useState([])
  const [loading, setLoading] = useState(true)
  const [divisionId, setDivisionId] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      pageantService.getRankings(eventId, { divisionId: divisionId || undefined }).catch(() => ({ data: {} })),
      pageantService.getFoundation(eventId).catch(() => ({ data: {} })),
      pageantService.getResults(eventId).catch(() => ({ data: {} })),
      pageantService.getAwardWinners(eventId).catch(() => ({ data: { awards: [] } })),
    ]).then(([rankingsRes, foundationRes, resultsRes, awardsRes]) => {
      if (rankingsRes.data) setData(rankingsRes.data)
      if (foundationRes.data?.foundation) setFoundation(foundationRes.data.foundation)
      if (resultsRes.data?.results) setResults(resultsRes.data.results)
      setAwards(awardsRes.data?.awards ?? [])
    }).finally(() => setLoading(false))
  }, [eventId, divisionId])

  // On first open, silently re-sync the ranking store from the real live-session
  // scores judges submitted, THEN load — so the rankings reflect the corrected
  // scores automatically (the first scoring wrote stale values during the bug).
  // Idempotent; only runs once per mount. Division changes / refresh just reload.
  const didResync = useRef(false)
  useEffect(() => {
    subscribeRoom(`event:${eventId}:organizer`)
    if (didResync.current) {
      load()
      return
    }
    didResync.current = true
    competitionSessionService
      .resyncRankingStore(eventId)
      .catch(() => {}) // best-effort; still show whatever the store has
      .finally(() => load())
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
              {(() => {
                const breakdown = r.criteriaBreakdown ?? []
                const scored = breakdown.filter((c) => (c.judgeCount ?? (c.average > 0 ? 1 : 0)) > 0)
                const unscored = breakdown.length - scored.length
                if (!scored.length) {
                  return <p className="mt-2 text-xs text-v-text-subtle">No scores yet.</p>
                }
                return (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      {scored.map((c) => (
                        <div
                          key={c.criteriaId}
                          className="rounded-lg border border-v-border/60 bg-v-surface-elevated px-2.5 py-1.5"
                        >
                          <p
                            className="truncate text-[11px] leading-tight text-v-text-subtle"
                            title={c.criteriaName}
                          >
                            {c.criteriaName}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-v-text tabular-nums">
                            {c.average}
                            <span className="ml-1 text-[10px] font-normal text-v-text-subtle">
                              · {c.percentage}%
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                    {unscored > 0 && (
                      <p className="mt-1.5 text-[11px] text-v-text-subtle">
                        +{unscored} criteria not yet scored
                      </p>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        ))}
        {!data?.rankings?.length && (
          <p className="text-v-text-subtle">No contestants or scores yet.</p>
        )}
      </div>

      <ResultsAndAwards results={results} />
      <ConfiguredAwards awards={awards} />
    </div>
  )
}

function ConfiguredAwards({ awards }) {
  if (!awards?.length) return null
  return (
    <div className="rounded-2xl border border-v-border bg-v-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-v-text-muted uppercase tracking-wider">Awards</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {awards.map((a) => {
          const interactive = a.method === 'vote' || a.method === 'selection'
          return (
            <li key={a.id} className="rounded-xl border border-v-border px-4 py-3">
              <p className="text-sm font-medium text-v-text">{a.name}</p>
              {a.description && <p className="text-xs text-v-text-subtle">{a.description}</p>}
              <p className="mt-1 text-sm">
                {a.winner
                  ? <span className="font-medium text-v-success">#{a.winner.contestantNumber} {a.winner.contestantName}{interactive ? ` · ${a.votes} vote${a.votes !== 1 ? 's' : ''}` : ` · ${a.winner.value}`}{a.tie ? ' (tie)' : ''}</span>
                  : <span className="text-v-text-subtle">{interactive ? 'No selections yet' : 'No scores yet'}</span>}
              </p>
            </li>
          )
        })}
      </ul>
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
