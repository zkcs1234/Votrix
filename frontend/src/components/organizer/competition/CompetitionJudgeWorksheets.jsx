import { scopeAllows } from '../../../../../shared/competition-calculation.js'

export default function CompetitionJudgeWorksheets({ state, roundId }) {
  const rounds = roundId ? state.rules.rounds.filter(r => r.id === roundId) : state.rules.rounds.length ? state.rules.rounds : [{id:null,name:'Overall'}]
  return <div className="space-y-4">{rounds.flatMap(round => {
    const criteria = state.rules.criteria.filter(c => !round.id || round.criteriaIds.includes(c.id))
    const entries = state.rules.contestants.filter(e => !round.id || round.contestantIds.includes(e.id))
    return state.rules.judges.filter(j => j.role !== 'score_reviewer').map(judge => <section key={`${round.id}:${judge.judgeId}`} className="v-card p-4">
      <h3 className="v-section-title">{judge.displayName ?? judge.email} · {round.name}</h3>
      <div className="overflow-x-auto"><table className="v-table"><thead><tr><th rowSpan="2">Entry</th>{criteria.map(c => <th key={c.id} colSpan={(c.minorCriteria.length || 1) + 1}>{c.name} ({c.percentage}%)</th>)}<th rowSpan="2">Round status</th></tr>
        <tr>{criteria.flatMap(c => [...(c.minorCriteria.length ? c.minorCriteria : [c]).map(m => <th key={`${c.id}:${m.id}`}>{m.name}</th>),<th key={`${c.id}:lock`}>Lock</th>])}</tr></thead>
        <tbody>{entries.filter(e => scopeAllows(judge,e,round,state.rules.event.id)).map(entry => {
          const row = state.lockedSources.find(s => s.judge_id === judge.judgeId && s.contestant_id === entry.id && s.round_id === round.id)
          const submission = state.submissions.find(s => s.judge_id === judge.judgeId && s.round_id === round.id)
          const division = state.rules.divisions.find(d => d.id === entry.divisionId)
          return <tr key={entry.id} style={{backgroundColor:division?.rowColor ?? division?.row_color ?? '#FFFFFF',color:'#17202A'}}><td>#{entry.contestantNumber} {entry.name}</td>{criteria.flatMap(c => [...(c.minorCriteria.length ? c.minorCriteria : [c]).map(m => <td key={`${c.id}:${m.id}`}>{row?.scores[m.id] ?? 'Missing'}</td>),<td key={`${c.id}:lock`}>{row?.locked_criteria.includes(c.id) ? `Locked v${row.lock_versions?.[c.id]?.version ?? row.revision}` : 'Incomplete'}</td>])}<td>{submission ? `Submitted v${submission.version}` : 'Not submitted'}</td></tr>
        })}</tbody></table></div>
    </section>)
  })}</div>
}
