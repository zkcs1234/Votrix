import { useState } from 'react'
import { officialMean } from '../../../../../shared/competition-calculation.js'
import { tabulationNumber } from '@/utils/competitionTabulationPresentation'
import { applicableDeductionRules } from '../../../../../shared/competition-deductions.js'

export function criterionCode(index) {
  let code = ''
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) code = String.fromCharCode(65 + (n - 1) % 26) + code
  return code
}

export function entryReviewStatus(view, entryId) {
  if (!view.complete) return 'Incomplete'
  if ((view.deductions ?? []).some(record => record.entry_id === entryId && record.status === 'pending')) return 'Needs review'
  if (view.calculation?.finalized) return 'Finalized'
  if (view.calculation?.verified) return 'Verified'
  return view.calculation ? 'Calculated' : 'Awaiting calculation'
}

// Only saved official traces are displayed. Missing values stay blank and no
// local preview is substituted for a current backend calculation.
export default function TabulationScoreMatrix({ view, roundId, criteria, method, search, onSearch, selectedEntryId, onSelectEntry, onOriginals, onBreakdown, onExportEntry, onExport, reviewer, busy }) {
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('rank')
  const [compact, setCompact] = useState(true)
  const [menu, setMenu] = useState('')
  const calculation = view.calculation
  const output = calculation?.output_snapshot
  const judges = view.progress ?? []
  const manual = method === 'manual', ranked = method === 'rank_based'
  const configuration = view.rules?.configuration_snapshot
  const points = configuration?.scoringConfig.criterionBasis === 'points'
  const precision = configuration?.scoringConfig.decimalPlaces ?? 2
  const format = value => tabulationNumber(value, precision)
  const results = new Map((output?.results ?? []).map(result => [result.contestantId, result]))
  const sheets = (output?.worksheets ?? []).filter(sheet => sheet.roundId === roundId)
  const sheetByJudge = new Map(sheets.map(sheet => [`${sheet.entryId}:${sheet.judgeId}`, sheet]))
  const allowed = new Set(view.session?.entry_ids ?? [])
  const query = search.trim().toLocaleLowerCase()
  const entries = (view.entries ?? []).filter(entry => allowed.has(entry.id) && (!query || `${entry.name} ${entry.contestantNumber ?? ''}`.toLocaleLowerCase().includes(query)) && (status === 'all' || entryReviewStatus(view, entry.id) === status)).sort((a, b) => {
    const left = results.get(a.id), right = results.get(b.id)
    if (sort === 'number') return Number(a.contestantNumber ?? 0) - Number(b.contestantNumber ?? 0)
    if (sort === 'name') return a.name.localeCompare(b.name)
    const key = sort === 'score' ? 'finalScore' : 'rank'
    if (left?.[key] == null || right?.[key] == null) return left?.[key] == null ? right?.[key] == null ? 0 : 1 : -1
    return (left[key] - right[key]) * (sort === 'score' && !ranked ? -1 : 1) || Number(a.contestantNumber ?? 0) - Number(b.contestantNumber ?? 0)
  })
  const organizerPenalties = applicableDeductionRules(configuration, roundId, 'organizer').length > 0
  const aggregateLabel = manual ? 'Placement' : ranked ? 'Rank sum' : method === 'sum' ? 'Panel sum' : method === 'highest_score' ? 'Highest total' : 'Aggregate'
  const columns = 3 + (manual ? 0 : judges.length + criteria.length + 1 + (organizerPenalties ? 1 : 0)) + 3

  return <section className="v-tab-matrix" aria-labelledby="score-matrix-heading">
    <div className="v-tab-panel-title"><h2 id="score-matrix-heading">Contestant scores</h2><div className="v-tab-inline-actions">
      <button type="button" className="v-tab-small-button" aria-pressed={compact} onClick={() => setCompact(!compact)}>Compact rows</button>
      {!reviewer && <button type="button" className="v-tab-small-button" disabled={!view.complete || busy} onClick={onExport}>Export All</button>}
    </div></div>
    <div className="v-tab-matrix-toolbar">
      <label className="v-tab-search"><span className="sr-only">Search entries</span><input type="search" className="v-input" aria-label="Search entries" placeholder="Search contestant name or number…" value={search} onChange={event => onSearch(event.target.value)} /></label>
      <label>Status<select className="v-input" aria-label="Filter contestant status" value={status} onChange={event => setStatus(event.target.value)}>{['all', 'Awaiting calculation', 'Calculated', 'Needs review', 'Verified', 'Finalized'].map(value => <option key={value} value={value}>{value === 'all' ? 'All statuses' : value}</option>)}</select></label>
      <label>Sort by<select className="v-input" aria-label="Sort contestants" value={sort} onChange={event => setSort(event.target.value)}><option value="rank">Rank</option><option value="number">Contestant number</option><option value="name">Name</option><option value="score">{ranked ? 'Placement total (low to high)' : 'Score (high to low)'}</option></select></label>
    </div>
    {menu && <div className="v-tab-selected-actions" aria-label={`Selected actions for ${entries.find(entry => entry.id === menu)?.name ?? 'contestant'}`}><strong>{entries.find(entry => entry.id === menu)?.name}</strong><button type="button" className="v-tab-small-button" onClick={() => { onOriginals(menu); setMenu('') }}>View original sheets</button><button type="button" className="v-tab-small-button" disabled={!calculation || manual} onClick={() => { onBreakdown(menu); setMenu('') }}>View calculation</button>{!reviewer && <button type="button" className="v-tab-small-button" onClick={() => { onExportEntry(menu); setMenu('') }}>Export this entry</button>}<button type="button" className="v-tab-text-button" onClick={() => setMenu('')}>Close actions</button></div>}
    {!view.complete ? <p className="v-tab-empty">Scores are withheld until every required current judge sheet is complete. Missing scores are never treated as zero.</p> : <>
      <div className="v-tab-grid-scroll" tabIndex={0} role="region" aria-label="Contestant score matrix, scroll for additional columns">
        <table className="v-tab-grid" data-compact={compact} style={{ '--tab-matrix-width': `${Math.max(720, 500 + (judges.length + criteria.length) * 40)}px` }}>
          <caption className="sr-only">Contestant tabulation matrix</caption>
          <thead><tr>
            <th scope="col" rowSpan={2} className="v-tab-rank">Rank</th><th scope="col" rowSpan={2} className="v-tab-no">No.</th><th scope="col" rowSpan={2} className="v-tab-name">Contestant name</th>
            {!manual && judges.length > 0 && <th scope="colgroup" colSpan={judges.length}>Judge totals{ranked ? ' / placements' : ''}</th>}
            {!manual && criteria.length > 0 && <th scope="colgroup" colSpan={criteria.length}>Criterion averages{points ? ' (points)' : ' (weighted)'}</th>}
            {!manual && <th scope="col" rowSpan={2}>{aggregateLabel}</th>}
            {!manual && organizerPenalties && <th scope="col" rowSpan={2}>Organizer<br/>penalty</th>}
            <th scope="col" rowSpan={2} className="v-tab-final">{manual ? 'Official placement' : ranked ? 'Adjusted rank sum' : 'Final score'}</th><th scope="col" rowSpan={2}>Status</th><th scope="col" rowSpan={2} className="v-tab-actions">Actions</th>
          </tr><tr>
            {!manual && judges.map((judge, index) => <th key={judge.judgeId} scope="col" title={judge.judgeName} aria-label={`Judge ${index + 1}: ${judge.judgeName ?? 'Assigned judge'}`}>J{index + 1}</th>)}
            {!manual && criteria.map((criterion, index) => <th key={criterion.id} scope="col" title={criterion.name} aria-label={`${criterion.name}${points ? ', points' : `, ${criterion.percentage}% weight`}`}>{criterionCode(index)}{!points && <small>{criterion.percentage}%</small>}</th>)}
          </tr></thead>
          <tbody>{entries.map(entry => {
            const result = results.get(entry.id), reviewStatus = entryReviewStatus(view, entry.id)
            const own = sheets.filter(sheet => sheet.entryId === entry.id)
            return <tr key={entry.id} data-selected={selectedEntryId === entry.id}>
              <td className="v-tab-rank">{result?.rank ?? '—'}</td><td className="v-tab-no">{String(entry.contestantNumber ?? '—').padStart(2, '0')}</td>
              <th scope="row" className="v-tab-name"><button type="button" title={entry.name} onClick={() => onSelectEntry(entry.id)} aria-pressed={selectedEntryId === entry.id}>{entry.name}</button></th>
              {!manual && judges.map(judge => { const sheet = sheetByJudge.get(`${entry.id}:${judge.judgeId}`); const placement = result?.judgeRanks?.[judge.judgeId] ?? output?.roundResults?.find(row => row.roundId === roundId && row.contestantId === entry.id)?.judgeRanks?.[judge.judgeId]; return <td key={judge.judgeId}>{format(sheet?.carryNumericTotal ?? sheet?.total)}{ranked && placement != null && <small title="Judge placement">#{placement}</small>}</td> })}
              {!manual && criteria.map(criterion => { const values = own.map(sheet => sheet.criteria?.find(row => row.criteriaId === criterion.id)?.contribution); const complete = judges.length > 0 && values.length === judges.length && values.every(value => typeof value === 'number' && Number.isFinite(value)); return <td key={criterion.id}>{format(complete ? officialMean(values, precision) : undefined)}</td> })}
              {!manual && <td>{format(result?.baseScore)}</td>}
              {!manual && organizerPenalties && <td>{format(result?.deductionTotal)}{result?.pointDeductionTotal > 0 && <small>{format(result.pointDeductionTotal)} points</small>}</td>}
              <td className="v-tab-final">{manual ? result?.rank ?? '—' : format(result?.finalScore)}</td><td><span className="v-tab-status" data-status={reviewStatus}>{reviewStatus}</span></td>
              <td className="v-tab-actions"><button type="button" className="v-tab-menu-trigger" aria-label={`Actions for ${entry.name}`} aria-expanded={menu === entry.id} onClick={() => setMenu(menu === entry.id ? '' : entry.id)}>⋯</button></td>
            </tr>
          })}{!entries.length && <tr><td colSpan={columns} className="v-tab-empty">{allowed.size ? 'No contestants match your filters.' : 'No contestants in this round.'}</td></tr>}</tbody>
        </table>
      </div>
      <div className="v-tab-grid-footer"><span>{entries.length} of {allowed.size} contestants · Use row actions to open original sheets or calculation details.</span><span>{!calculation ? 'Awaiting backend calculation' : calculation.finalized ? `Finalized · version ${calculation.version}` : calculation.verified ? 'Independently verified' : 'Pending independent verification'}</span></div>
      {!manual && <ul className="v-tab-criterion-key" aria-label="Criterion key">{criteria.map((criterion, index) => <li key={criterion.id}><strong>{criterionCode(index)}</strong> {criterion.name}</li>)}</ul>}
    </>}
  </section>
}
