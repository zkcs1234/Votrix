export default function PageantScoringForm({ sheet, scores, onScoreChange, disabled }) {
  const { contestants, criteria } = sheet

  return (
    <div className="space-y-6">
      <div className="hidden overflow-x-auto rounded-2xl border border-v-border md:block">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-v-border bg-v-surface-elevated">
              <th className="p-3 text-left text-v-text-subtle">Contestant</th>
              {criteria.map((c) => (
                <th key={c.id} className="p-3 text-center text-v-text-muted">
                  {c.name}
                  <br />
                  <span className="text-xs text-v-text-subtle">
                    {c.minScore}â€“{c.maxScore} Â· {c.percentage}%
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
          <article key={cont.id} className="rounded-2xl border border-v-border bg-v-surface p-4">
            <div className="flex items-center gap-3">
              {cont.photo && (
                <img src={cont.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <h4 className="font-medium text-v-text">
                #{cont.contestantNumber} {cont.name}
              </h4>
            </div>
            <div className="mt-4 space-y-3">
              {criteria.map((crit) => (
                <div key={crit.id} className="flex items-center justify-between gap-2">
                  <label className="text-sm text-v-text-muted">
                    {crit.name}
                    <span className="block text-xs text-v-text-subtle">
                      {crit.minScore}â€“{crit.maxScore}
                    </span>
                  </label>
                  <ScoreInput
                    contestantId={cont.id}
                    criteria={crit}
                    scores={scores}
                    onScoreChange={onScoreChange}
                    disabled={disabled}
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

function ScoreInput({ contestantId, criteria, scores, onScoreChange, disabled }) {
  const key = `${contestantId}:${criteria.id}`
  return (
    <input
      type="number"
      min={criteria.minScore}
      max={criteria.maxScore}
      step="0.5"
      disabled={disabled}
      className="v-input w-20 px-2 py-1 text-center disabled:opacity-50"
      value={scores[key] ?? ''}
      onChange={(e) => onScoreChange(contestantId, criteria.id, e.target.value)}
    />
  )
}
