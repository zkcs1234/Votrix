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
            <tr className="border-b border-v-border bg-v-surface-elevated">
              <th className="p-3 text-left v-caption">Contestant</th>
              {criteria.map((c) => (
                <th key={c.id} className="p-3 text-center">
                  <span className="text-v-text-muted">{c.name}</span>
                  <br />
                  <span className="v-caption">
                    {c.minScore}–{c.maxScore} · {c.percentage}%
                  </span>
                </th>
              ))}
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
                {criteria.map((crit) => (
                  <td key={crit.id} className="p-2">
                    <ScoreInputComponent
                      contestantId={cont.id}
                      criteria={crit}
                      scores={scores}
                      onScoreChange={onScoreChange}
                      disabled={disabled}
                    />
                  </td>
                ))}
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
            <div className="mt-4 space-y-3">
              {criteria.map((crit) => (
                <div key={crit.id} className="flex items-center justify-between gap-2">
                  <label className="v-caption">
                    {crit.name}
                    <span className="block text-xs text-v-text-subtle">
                      {crit.minScore}–{crit.maxScore}
                    </span>
                  </label>
                  <ScoreInputComponent
                    contestantId={cont.id}
                    criteria={crit}
                    scores={scores}
                    onScoreChange={onScoreChange}
                    disabled={disabled}
                    size="md"
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function ScoreInputComponent({ contestantId, criteria, scores, onScoreChange, disabled, size = 'sm' }) {
  const key = `${contestantId}:${criteria.id}`
  const currentValue = scores[key] ?? ''

  return (
    <ScoreInputBase
      min={criteria.minScore}
      max={criteria.maxScore}
      step="0.5"
      value={currentValue}
      onChange={(val) => onScoreChange(contestantId, criteria.id, val)}
      disabled={disabled}
      size={size}
    />
  )
}

// Re-export the inner component for backwards compatibility
export { ScoreInputComponent as ScoreInput }