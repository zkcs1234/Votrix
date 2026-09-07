import { useRef, useEffect } from 'react'
import ScoreInputBase from '@/components/ui/ScoreInput'

export default function CompetitionScoringForm({
  sheet,
  scores,
  onScoreChange,
  disabled,
  liveMode = false,
  activeContestantId = null,
  activeContestantIds = null,
  sessionState = null
}) {
  const { contestants, criteria } = sheet
  const contestantRefs = useRef({})

  // Judges score MINOR criteria. Each criterion contributes one or more minor
  // columns; each minor carries its own score type/bounds. A criterion with no
  // minors (not-yet-migrated) falls back to a single column scored directly
  // against the criterion, using the sheet's event scale.
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

  // A contestant is "active" if it is the single active one OR (in a stage
  // group) any of the contestants currently on stage.
  const isActive = (id) =>
    liveMode &&
    (activeContestantIds?.length ? activeContestantIds.includes(id) : activeContestantId === id)

  // Auto-scroll to active contestant in live mode
  useEffect(() => {
    if (liveMode && activeContestantId && contestantRefs.current[activeContestantId]) {
      const timer = setTimeout(() => {
        contestantRefs.current[activeContestantId]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        })
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [liveMode, activeContestantId])

  // Compute ordered contestants for live sessions
  const orderedContestants = (() => {
    if (liveMode && sessionState?.contestantOrder) {
      const orderMap = new Map(sessionState.contestantOrder.map((id, index) => [id, index]))
      return [...contestants].sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? Infinity
        const orderB = orderMap.get(b.id) ?? Infinity
        return orderA - orderB
      })
    }
    return [...contestants].sort((a, b) => a.contestantNumber - b.contestantNumber)
  })()

  // Get contestant card class based on live mode status
  const getContestantCardClass = (contestantId) => {
    const baseClass = "v-card p-6 transition-all duration-300"

    if (isActive(contestantId)) {
      return `${baseClass} ring-2 ring-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/20`
    }

    return baseClass
  }

  // Prominent contestant-number badge so the organizer/judge can spot who is
  // being scored at a glance.
  const NumberBadge = ({ number, active }) => (
    <span
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-base font-bold tabular-nums ${
        active ? 'bg-emerald-500 text-white' : 'bg-v-surface-elevated text-v-text border border-v-border'
      }`}
    >
      #{number}
    </span>
  )

  return (
    <div className="space-y-6">
      <div className="hidden overflow-x-auto rounded-2xl border border-v-border md:block">
        <table className="w-full min-w-150 text-sm">
          <thead>
            {/* Criterion group header — spans its minor columns. */}
            <tr className="border-b border-v-border bg-v-surface-elevated">
              <th className="p-3 text-left v-caption" rowSpan={2}>
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
            {orderedContestants.map((cont) => (
              <tr
                key={cont.id}
                ref={(el) => (contestantRefs.current[cont.id] = el)}
                className={`border-b border-v-border/50 ${
                  isActive(cont.id)
                    ? 'bg-emerald-950/20 ring-1 ring-emerald-500/50'
                    : ''
                }`}
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <NumberBadge number={cont.contestantNumber} active={isActive(cont.id)} />
                    {cont.photo && (
                      <img src={cont.photo} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    )}
                    <span className="font-medium text-v-text">{cont.name}</span>
                    {isActive(cont.id) && (
                      <span className="ml-2 rounded-full bg-emerald-500 px-2 py-1 text-xs font-medium text-white">
                        Active
                      </span>
                    )}
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
                        disabled={disabled}
                      />
                    </td>
                  )),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {orderedContestants.map((cont) => (
          <article 
            key={cont.id} 
            ref={(el) => (contestantRefs.current[cont.id] = el)}
            className={getContestantCardClass(cont.id)}
          >
            <div className="flex items-center gap-3">
              <NumberBadge number={cont.contestantNumber} active={isActive(cont.id)} />
              {cont.photo && (
                <img src={cont.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <h4 className="v-section-title">{cont.name}</h4>
              {isActive(cont.id) && (
                <span className="ml-auto rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white">
                  Active
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
                            disabled={disabled}
                            size="md"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
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