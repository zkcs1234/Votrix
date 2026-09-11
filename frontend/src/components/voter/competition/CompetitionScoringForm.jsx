import { CheckCircle, Lock } from 'lucide-react'
import Button from '@/components/ui/Button'
import ScoreInputBase from '@/components/ui/ScoreInput'

// Round-driven scoresheet. The whole round's field is on stage, so the judge
// scores every contestant from one table and commits each with "Submit & lock".
//
// Judges score MINOR criteria. Each criterion contributes one or more minor
// columns; each minor carries its own score type/bounds. A criterion with no
// minors (not-yet-migrated) falls back to a single column scored directly against
// the criterion, using the sheet's event scale.
export default function CompetitionScoringForm({
  sheet,
  scores,
  onScoreChange,
  submittingId = null,
  onSubmitContestant,
  sessionState = null,
}) {
  const { contestants, criteria } = sheet
  const scaleBounds = sheet.scoreBounds ?? null

  const critColumns = (criteria ?? []).map((crit) => {
    const minors =
      crit.minors && crit.minors.length
        ? crit.minors
        : [{ id: crit.id, name: crit.name, minScore: crit.minScore, maxScore: crit.maxScore }]
    return { crit, minors }
  })
  const boundsFor = (minor) => ({
    min: minor.minScore ?? scaleBounds?.min ?? 1,
    max: minor.maxScore ?? scaleBounds?.max ?? 100,
  })

  // Every scorable target across all criteria (used for per-row completeness).
  const allTargets = critColumns.flatMap(({ minors }) => minors)
  const totalTargets = allTargets.length

  const doneCount = (cid) =>
    allTargets.filter((t) => {
      const s = scores[`${cid}:${t.id}`]
      return s !== undefined && s !== '' && s !== null
    }).length
  const isComplete = (cid) => totalTargets > 0 && doneCount(cid) === totalTargets

  // Order contestants by the session's contestant order when available, else by
  // number. No "active" emphasis — the whole field is equal (round-driven).
  const orderedContestants = (() => {
    if (sessionState?.contestantOrder) {
      const orderMap = new Map(sessionState.contestantOrder.map((id, index) => [id, index]))
      return [...contestants].sort(
        (a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity),
      )
    }
    return [...contestants].sort((a, b) => a.contestantNumber - b.contestantNumber)
  })()

  const NumberBadge = ({ number, locked }) => (
    <span
      className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-sm font-bold tabular-nums ${
        locked ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-v-surface-elevated text-v-text border border-v-border'
      }`}
    >
      #{number}
    </span>
  )

  // Shared per-row action: Locked pill, Saving state, or Submit & lock.
  const RowAction = ({ cont, block = false }) => {
    if (cont.hasSubmitted) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300">
          <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Locked
        </span>
      )
    }
    const busy = submittingId === cont.id
    const complete = isComplete(cont.id)
    return (
      <div className={block ? 'flex items-center justify-between gap-3' : 'inline-flex flex-col items-center gap-1'}>
        <span className="text-[11px] text-v-text-subtle tabular-nums">
          {doneCount(cont.id)}/{totalTargets}
        </span>
        <Button
          size="sm"
          onClick={() => onSubmitContestant?.(cont.id)}
          disabled={busy || !complete}
          loading={busy}
          title={complete ? 'Submit & lock this contestant' : 'Fill in every score first'}
        >
          Submit &amp; lock
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Desktop: full-width scoresheet with sticky header + sticky first column. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-v-border md:block">
        <table className="w-full text-sm">
          <thead>
            {/* Criterion group header — spans its minor columns. */}
            <tr className="border-b border-v-border bg-v-surface-elevated">
              <th className="sticky left-0 z-20 w-60 min-w-[15rem] border-r border-v-border bg-v-surface-elevated p-3 text-left v-caption" rowSpan={2}>
                Contestant
              </th>
              {critColumns.map(({ crit, minors }) => (
                <th
                  key={crit.id}
                  colSpan={minors.length}
                  className="border-l border-v-border p-2 text-center"
                >
                  <span className="text-v-text-muted">{crit.name}</span>
                  <span className="v-caption block">{crit.percentage}%</span>
                </th>
              ))}
              <th className="sticky right-0 z-20 w-32 min-w-32 border-l border-v-border bg-v-surface-elevated p-3 text-center v-caption" rowSpan={2}>
                Status
              </th>
            </tr>
            {/* Minor-criteria sub-header. */}
            <tr className="border-b border-v-border bg-v-surface-elevated/60">
              {critColumns.flatMap(({ minors }) =>
                minors.map((m, i) => {
                  const b = boundsFor(m)
                  return (
                    <th
                      key={m.id}
                      className={`p-2 text-center v-caption font-normal ${i === 0 ? 'border-l border-v-border' : ''}`}
                    >
                      {m.name}
                      <span className="block text-v-text-subtle">
                        {b.min}–{b.max}
                      </span>
                    </th>
                  )
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {orderedContestants.map((cont) => {
              const locked = Boolean(cont.hasSubmitted)
              return (
                <tr
                  key={cont.id}
                  className={`border-b border-v-border/50 ${locked ? 'bg-emerald-950/10' : ''}`}
                >
                  <td className="sticky left-0 z-10 w-60 min-w-[15rem] border-r border-v-border bg-v-surface p-3">
                    <div className="flex items-center gap-2.5">
                      <NumberBadge number={cont.contestantNumber} locked={locked} />
                      {cont.photo && (
                        <img src={cont.photo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                      )}
                      <span className="min-w-0 text-sm font-medium leading-tight text-v-text">
                        {cont.name}
                      </span>
                    </div>
                  </td>
                  {critColumns.flatMap(({ minors }) =>
                    minors.map((m, i) => (
                      <td key={m.id} className={`p-2 ${i === 0 ? 'border-l border-v-border' : ''}`}>
                        <ScoreInputComponent
                          contestantId={cont.id}
                          target={m}
                          bounds={boundsFor(m)}
                          scores={scores}
                          onScoreChange={onScoreChange}
                          disabled={locked || submittingId === cont.id}
                        />
                      </td>
                    )),
                  )}
                  <td className="sticky right-0 z-10 w-32 min-w-32 border-l border-v-border bg-v-surface p-3 text-center">
                    <RowAction cont={cont} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per contestant with a sticky Submit & lock footer. */}
      <div className="space-y-4 md:hidden">
        {orderedContestants.map((cont) => {
          const locked = Boolean(cont.hasSubmitted)
          return (
            <article
              key={cont.id}
              className={`v-card p-6 ${locked ? 'ring-1 ring-emerald-500/30 bg-emerald-950/10' : ''}`}
            >
              <div className="flex items-center gap-3">
                <NumberBadge number={cont.contestantNumber} locked={locked} />
                {cont.photo && (
                  <img src={cont.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                )}
                <h4 className="v-section-title">{cont.name}</h4>
                {locked && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                    <CheckCircle className="h-3.5 w-3.5" /> Locked
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-4">
                {critColumns.map(({ crit, minors }) => (
                  <div key={crit.id} className="rounded-lg border border-v-border/70 p-3">
                    <p className="mb-2 text-xs font-medium text-v-text-muted">
                      {crit.name} <span className="text-v-text-subtle">· {crit.percentage}%</span>
                    </p>
                    <div className="space-y-3">
                      {minors.map((m) => {
                        const b = boundsFor(m)
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-2">
                            <label className="v-caption">
                              {m.name}
                              <span className="block text-xs text-v-text-subtle">
                                {b.min}–{b.max}
                              </span>
                            </label>
                            <ScoreInputComponent
                              contestantId={cont.id}
                              target={m}
                              bounds={b}
                              scores={scores}
                              onScoreChange={onScoreChange}
                              disabled={locked || submittingId === cont.id}
                              size="md"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {!locked && (
                <div className="sticky bottom-2 mt-4">
                  <RowAction cont={cont} block />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

// `target` is the thing being scored — a minor criterion (normal path) or, for a
// not-yet-migrated criterion, the criterion itself. It carries id + bounds, and
// scores are keyed `${contestantId}:${target.id}`.
function ScoreInputComponent({ contestantId, target, bounds, scores, onScoreChange, disabled, size = 'sm' }) {
  const key = `${contestantId}:${target.id}`
  const currentValue = scores[key] ?? ''
  const min = bounds?.min ?? target.minScore ?? 1
  const max = bounds?.max ?? target.maxScore ?? 100

  return (
    <ScoreInputBase
      min={min}
      max={max}
      step="0.5"
      value={currentValue}
      onChange={(val) => onScoreChange(contestantId, target.id, val)}
      disabled={disabled}
      size={size}
    />
  )
}

// Re-export the inner component for backwards compatibility
export { ScoreInputComponent as ScoreInput }
