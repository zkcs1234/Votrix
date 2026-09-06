import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import { competitionSessionService } from '@/services/competition-session.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

import { useSocketEvent } from '@/hooks/useSocketEvent'
import { subscribeRoom } from '@/services/socket.service'
import { INPUT_CLASS } from '@/utils/uiClasses'

// Option B — human labels for the active scoring method / tie-break, shown so the
// ranking is self-explanatory.
const METHOD_LABELS = {
  average: 'Average',
  weighted_average: 'Weighted average',
  sum: 'Sum',
  trimmed_average: 'Trimmed average',
  rank_based: 'Rank-based',
  percentile: 'Percentile-normalized',
  highest_score: 'Highest score',
  lowest_removal: 'Lowest-score removal',
}
const TIEBREAK_LABELS = {
  highest_criterion: 'Higher best criterion',
  highest_round: 'Higher chosen round',
  countback: 'Countback (criteria head-to-head)',
  judges_majority: 'Judges’ majority',
  manual: 'Organizer decides',
}

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

      {(() => {
        const cfg = data?.scoringConfig ?? foundation?.scoringConfig ?? {}
        const method = METHOD_LABELS[cfg.calculationMethod] ?? cfg.calculationMethod ?? 'Weighted average'
        const tie = cfg.tieBreaker ? TIEBREAK_LABELS[cfg.tieBreaker] ?? cfg.tieBreaker : 'Shared rank'
        return (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-v-border bg-v-surface px-2.5 py-1 text-v-text-muted">
              Method: <span className="text-v-text">{method}</span>
            </span>
            <span className="rounded-full border border-v-border bg-v-surface px-2.5 py-1 text-v-text-muted">
              Tie-break: <span className="text-v-text">{tie}</span>
            </span>
            {cfg.judgeWeightingEnabled && (
              <span className="rounded-full border border-v-border bg-v-surface px-2.5 py-1 text-v-text-muted">
                Judges weighted
              </span>
            )}
          </div>
        )
      })()}

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
              <ContestantBreakdown row={r} foundation={foundation} />
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


// Option B — per-contestant score breakdown. When the event has stages, show a
// stage → round → criteria hierarchy; otherwise fall back to the flat criteria
// grid (single-stage / simple events).
function ContestantBreakdown({ row, foundation }) {
  const critAvg = new Map((row.criteriaBreakdown ?? []).map((c) => [c.criteriaId, c]))
  const roundVal = new Map((row.perRound ?? []).map((r) => [r.roundId, r]))
  const catVal = new Map((row.perCategory ?? []).map((c) => [c.categoryId, c]))

  const stages = (foundation?.categories ?? [])
    .filter((c) => c.isStage)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  const rounds = foundation?.rounds ?? []
  const criteriaById = new Map((foundation?.criteria ?? []).map((c) => [c.id, c]))

  const critChip = (critId) => {
    const c = critAvg.get(critId) ?? {}
    const name = c.criteriaName ?? criteriaById.get(critId)?.name ?? 'Criterion'
    const scored = (c.judgeCount ?? (c.average > 0 ? 1 : 0)) > 0
    return (
      <div
        key={critId}
        className="rounded-lg border border-v-border/60 bg-v-surface-elevated px-2.5 py-1.5"
      >
        <p className="truncate text-[11px] leading-tight text-v-text-subtle" title={name}>
          {name}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-v-text tabular-nums">
          {scored ? c.average : '—'}
          {c.percentage != null && (
            <span className="ml-1 text-[10px] font-normal text-v-text-subtle">· {c.percentage}%</span>
          )}
        </p>
      </div>
    )
  }

  // Flat fallback (no stages).
  if (!stages.length) {
    const breakdown = row.criteriaBreakdown ?? []
    const scored = breakdown.filter((c) => (c.judgeCount ?? (c.average > 0 ? 1 : 0)) > 0)
    const unscored = breakdown.length - scored.length
    if (!scored.length) return <p className="mt-2 text-xs text-v-text-subtle">No scores yet.</p>
    return (
      <>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {scored.map((c) => critChip(c.criteriaId))}
        </div>
        {unscored > 0 && (
          <p className="mt-1.5 text-[11px] text-v-text-subtle">+{unscored} criteria not yet scored</p>
        )}
      </>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {stages.map((stage) => {
        const stageRounds = rounds
          .filter((r) => (r.categoryId ?? r.category_id) === stage.id)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        const sv = catVal.get(stage.id)
        return (
          <div key={stage.id} className="rounded-xl border border-v-border/70 bg-v-surface-elevated/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-v-text-muted">
                {stage.name}
                <span className="ml-1.5 text-[10px] font-normal normal-case text-v-text-subtle">
                  {stage.weight}% of final
                </span>
              </p>
              {sv && (
                <span className="text-sm font-semibold tabular-nums text-v-text">
                  {Number(sv.value).toFixed(2)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {stageRounds.map((rnd) => {
                const rv = roundVal.get(rnd.id)
                const ids = rnd.criteriaIds ?? []
                return (
                  <div key={rnd.id}>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-v-text-subtle">
                        {rnd.name}
                        <span className="ml-1 text-[10px] text-v-text-subtle">· {rnd.weight}%</span>
                      </p>
                      {rv && (
                        <span className="text-xs tabular-nums text-v-text-muted">
                          {Number(rv.value).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {ids.length > 0 && (
                      <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                        {ids.map((cid) => critChip(cid))}
                      </div>
                    )}
                  </div>
                )
              })}
              {!stageRounds.length && (
                <p className="text-[11px] text-v-text-subtle">No rounds in this stage.</p>
              )}
            </div>
          </div>
        )
      })}
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
