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
    // #4 show-but-lock: a criterion the organizer hasn't opened renders disabled.
    return { crit, minors, open: crit.open !== false }
  })
  const boundsFor = (minor) => ({
    min: minor.minScore ?? scaleBounds?.min ?? 1,
    max: minor.maxScore ?? scaleBounds?.max ?? 100,
  })

  // #6 per-criterion locking. Each criterion is committed on its own; a cell is
  // one of: LOCKED (already submitted), OPEN (scorable now), or WAITING (organizer
  // hasn't opened it / contestant not open). "Submit open criteria" commits only
  // the open, not-yet-locked criteria; the row is fully "Locked" once every
  // criterion is in.
  const allCritIds = critColumns.map(({ crit }) => crit.id)
  const lockedSetOf = (cont) => new Set(cont.lockedCriteria ?? [])
  const isCritLocked = (cont, critId) => lockedSetOf(cont).has(critId)
  const fullyLocked = (cont) =>
    Boolean(cont.hasSubmitted) ||
    (allCritIds.length > 0 && allCritIds.every((id) => lockedSetOf(cont).has(id)))

  // Criteria the judge can submit for this contestant right now.
  const scorableCrits = (cont) =>
    cont.open === false ? [] : critColumns.filter((c) => c.open && !isCritLocked(cont, c.crit.id))
  const scorableTargets = (cont) => scorableCrits(cont).flatMap(({ minors }) => minors)
  const doneCount = (cont) =>
    scorableTargets(cont).filter((t) => {
      const s = scores[`${cont.id}:${t.id}`]
      return s !== undefined && s !== '' && s !== null
    }).length
  const isComplete = (cont) => {
    const tt = scorableTargets(cont)
    return tt.length > 0 && doneCount(cont) === tt.length
  }

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

  // Shared per-row action: Locked pill, waiting, or "Submit open criteria".
  const RowAction = ({ cont, block = false }) => {
    const total = allCritIds.length
    const lockedCount = lockedSetOf(cont).size
    const counter = (
      <span className="text-[11px] text-v-text-subtle tabular-nums">
        {lockedCount}/{total} locked
      </span>
    )
    if (fullyLocked(cont)) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300">
          <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Locked
        </span>
      )
    }
    if (cont.open === false) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-v-surface-elevated px-3 py-1.5 text-xs font-medium text-v-text-subtle">
          <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Waiting
        </span>
      )
    }
    // Contestant is open but nothing is scorable right now (remaining criteria not
    // opened yet) — the judge waits for the organizer to open the next criterion.
    if (scorableCrits(cont).length === 0) {
      return (
        <div className={block ? 'flex items-center justify-between gap-3' : 'inline-flex flex-col items-center gap-1'}>
          {counter}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-v-surface-elevated px-3 py-1.5 text-xs font-medium text-v-text-subtle">
            <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Waiting
          </span>
        </div>
      )
    }
    const busy = submittingId === cont.id
    const complete = isComplete(cont)
    return (
      <div className={block ? 'flex items-center justify-between gap-3' : 'inline-flex flex-col items-center gap-1'}>
        {counter}
        <Button
          size="sm"
          onClick={() => onSubmitContestant?.(cont.id)}
          disabled={busy || !complete}
          loading={busy}
          title={complete ? 'Submit & lock the open criteria' : 'Fill in every open score first'}
        >
          Submit open criteria
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
              {critColumns.map(({ crit, minors, open }) => (
                <th
                  key={crit.id}
                  colSpan={minors.length}
                  className={`border-l border-v-border p-2 text-center ${open ? '' : 'opacity-50'}`}
                >
                  <span className="text-v-text-muted">{crit.name}</span>
                  <span className="v-caption block">
                    {open ? `${crit.percentage}%` : 'Not open yet'}
                  </span>
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
              const rowFully = fullyLocked(cont)
              const closed = cont.open === false
              return (
                <tr
                  key={cont.id}
                  className={`border-b border-v-border/50 ${rowFully ? 'bg-emerald-950/10' : closed ? 'opacity-60' : ''}`}
                >
                  <td className="sticky left-0 z-10 w-60 min-w-[15rem] border-r border-v-border bg-v-surface p-3">
                    <div className="flex items-center gap-2.5">
                      <NumberBadge number={cont.contestantNumber} locked={rowFully} />
                      {cont.photo && (
                        <img src={cont.photo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                      )}
                      <span className="min-w-0 text-sm font-medium leading-tight text-v-text">
                        {cont.name}
                      </span>
                    </div>
                  </td>
                  {critColumns.flatMap(({ crit, minors, open: critOpen }) => {
                    const critLocked = isCritLocked(cont, crit.id)
                    return minors.map((m, i) => (
                      <td
                        key={m.id}
                        className={`p-2 ${i === 0 ? 'border-l border-v-border' : ''} ${critLocked ? 'bg-emerald-950/10' : ''}`}
                        title={critLocked ? 'Locked — committed' : !critOpen ? 'Not open yet' : undefined}
                      >
                        <ScoreInputComponent
                          contestantId={cont.id}
                          target={m}
                          bounds={boundsFor(m)}
                          scores={scores}
                          onScoreChange={onScoreChange}
                          disabled={critLocked || closed || !critOpen || submittingId === cont.id}
                        />
                      </td>
                    ))
                  })}
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
          const rowFully = fullyLocked(cont)
          const closed = cont.open === false
          return (
            <article
              key={cont.id}
              className={`v-card p-6 ${rowFully ? 'ring-1 ring-emerald-500/30 bg-emerald-950/10' : closed ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center gap-3">
                <NumberBadge number={cont.contestantNumber} locked={rowFully} />
                {cont.photo && (
                  <img src={cont.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                )}
                <h4 className="v-section-title">{cont.name}</h4>
                {rowFully ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                    <CheckCircle className="h-3.5 w-3.5" /> Locked
                  </span>
                ) : closed ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-v-surface-elevated px-3 py-1 text-xs font-medium text-v-text-subtle">
                    <Lock className="h-3.5 w-3.5" /> Waiting
                  </span>
                ) : null}
              </div>
              <div className="mt-4 space-y-4">
                {critColumns.map(({ crit, minors, open: critOpen }) => {
                  const critLocked = isCritLocked(cont, crit.id)
                  return (
                    <div key={crit.id} className={`rounded-lg border border-v-border/70 p-3 ${critOpen && !critLocked ? '' : 'opacity-60'}`}>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-v-text-muted">
                        {crit.name}{' '}
                        <span className="text-v-text-subtle">
                          · {critOpen ? `${crit.percentage}%` : 'Not open yet'}
                        </span>
                        {critLocked && (
                          <span className="ml-auto inline-flex items-center gap-1 text-emerald-300">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        )}
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
                                disabled={critLocked || closed || !critOpen || submittingId === cont.id}
                                size="md"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              {!rowFully && (
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
