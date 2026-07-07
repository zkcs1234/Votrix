import ScoreInput from '@/components/ui/ScoreInput'

export default function CompetitionScoringForm({ sheet, scores, onScoreChange, disabled }) {
  const { contestants, criteria } = sheet

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
            {contestants.map((cont) => (
              <tr key={cont.id} className="border-b border-v-border/50">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {cont.photo && (
                      <img src={cont.photo} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    )}
                    <span className="font-medium text-v-text">
                      #{cont.contestantNumber} {cont.name}
                    </span>
                  </div>
                </td>
                {criteria.map((crit) => (
                  <td key={crit.id} className="p-2">
                    <ScoreInput
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
        {contestants.map((cont) => (
          <article key={cont.id} className="v-card-md">
            <div className="flex items-center gap-3">
              {cont.photo && (
                <img src={cont.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <h4 className="v-section-title">
                #{cont.contestantNumber} {cont.name}
              </h4>
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
                  <ScoreInput
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

function ScoreInputComponent({ contestantId, criteria, scores, onScoreChange, disabled }) {
  const key = `${contestantId}:${criteria.id}`
  const currentValue = scores[key] ?? ''

  return (
    <ScoreInput
      min={criteria.minScore}
      max={criteria.maxScore}
      step="0.5"
      value={currentValue}
      onChange={(val) => onScoreChange(contestantId, criteria.id, val)}
      disabled={disabled}
      size="sm"
    />
  )
}

// Re-export the inner component for backwards compatibility
export { ScoreInputComponent as ScoreInput }