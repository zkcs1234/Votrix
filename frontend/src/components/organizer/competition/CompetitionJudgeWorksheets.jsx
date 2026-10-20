import { scopeAllows } from '../../../../../shared/competition-calculation.js'

export default function CompetitionJudgeWorksheets({ state, roundId }) {
  const rounds = roundId
    ? state.rules.rounds.filter(round => round.id === roundId)
    : state.rules.rounds.length
      ? state.rules.rounds
      : [{ id: null, name: 'Overall' }]
  const judges = state.rules.judges.filter(judge => judge.role !== 'score_reviewer')

  if (!judges.length) {
    return <p className="v-legacy-empty-state">No scoring judges are assigned to this event.</p>
  }

  return <div className="v-legacy-worksheets space-y-4">{rounds.flatMap(round => {
    const criteria = state.rules.criteria.filter(c => !round.id || round.criteriaIds.includes(c.id))
    const entries = state.rules.contestants.filter(entry => !round.id || round.contestantIds.includes(entry.id))
    const columnsPerEntry = 1 + criteria.reduce((total, criterion) => total + (criterion.minorCriteria.length || 1) + 1, 0) + 1

    return judges.map(judge => {
      const eligibleEntries = entries.filter(entry => scopeAllows(judge, entry, round, state.rules.event.id))
      const worksheetName = `${judge.displayName ?? judge.email} — ${round.name} judge worksheet`
      const submission = state.submissions.find(s => s.judge_id === judge.judgeId && s.round_id === round.id)

      return <section key={`${round.id}:${judge.judgeId}`} className="v-card v-legacy-worksheet-card p-4">
        <div className="v-legacy-worksheet-title">
          <span aria-hidden="true">JS</span>
          <div><p>Judge worksheet</p><h3 className="v-section-title">{judge.displayName ?? judge.email}</h3></div>
          <span className="v-legacy-round-badge">{round.name}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="v-table" aria-label={worksheetName}>
            <thead>
              <tr>
                <th scope="col" rowSpan="2">Entry</th>
                {criteria.map(c => <th key={c.id} scope="colgroup" colSpan={(c.minorCriteria.length || 1) + 1}>{c.name} ({c.percentage}%)</th>)}
                <th scope="col" rowSpan="2">Round status</th>
              </tr>
              <tr>{criteria.flatMap(c => [
                ...(c.minorCriteria.length ? c.minorCriteria : [c]).map(m => <th key={`${c.id}:${m.id}`} scope="col">{m.name}</th>),
                <th key={`${c.id}:lock`} scope="col">Lock</th>,
              ])}</tr>
            </thead>
            <tbody>
              {eligibleEntries.length
                ? eligibleEntries.map(entry => {
                  const row = state.lockedSources.find(s => s.judge_id === judge.judgeId && s.contestant_id === entry.id && s.round_id === round.id)
                  const division = state.rules.divisions.find(d => d.id === entry.divisionId)

                  return <tr key={entry.id} style={{ backgroundColor: division?.rowColor ?? division?.row_color ?? '#FFFFFF', color: '#17202A' }}>
                    <th scope="row">#{entry.contestantNumber} {entry.name}</th>
                    {criteria.flatMap(c => [
                      ...(c.minorCriteria.length ? c.minorCriteria : [c]).map(m => <td key={`${c.id}:${m.id}`}>{row?.scores[m.id] ?? 'Missing'}</td>),
                      <td key={`${c.id}:lock`}>{row?.locked_criteria.includes(c.id) ? `Locked v${row.lock_versions?.[c.id]?.version ?? row.revision}` : 'Incomplete'}</td>,
                    ])}
                    <td>{submission ? `Submitted v${submission.version}` : 'Not submitted'}</td>
                  </tr>
                })
                : <tr><td colSpan={columnsPerEntry} className="v-legacy-worksheet-empty">No eligible entries are assigned to this judge for this round.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    })
  })}</div>
}
