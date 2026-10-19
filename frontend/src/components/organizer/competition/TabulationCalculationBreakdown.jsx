import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { tabulationMethodName, tabulationNumber } from '@/utils/competitionTabulationPresentation'
import { applicableDeductionRules, hasDeductionModes } from '../../../../../shared/competition-deductions.js'

export default function TabulationCalculationBreakdown({ entry, roundId, roundName, configuration, calculation, progress, onClose }) {
  const [tab, setTab] = useState(null)
  const config = configuration.scoringConfig
  const round = configuration.rounds.find(item => item.id === roundId)
  const method = round?.calculationMethod ?? config.calculationMethod
  const points = config.criterionBasis === 'points'
  const output = calculation.output_snapshot
  const sheets = (output.worksheets ?? []).filter(sheet => sheet.entryId === entry.id && sheet.roundId === roundId)
  const currentTab = tab ?? sheets[0]?.judgeId ?? 'average'
  const sheet = sheets.find(item => item.judgeId === currentTab)
  const criteria = configuration.criteria.filter(item => configuration.structure === 'multiple' ? item.roundId === roundId : item.roundId == null)
  const result = output.results?.find(item => item.contestantId === entry.id)
  const modernDeductions = hasDeductionModes(configuration)
  const deductionsEnabled = applicableDeductionRules(configuration, roundId).length > 0 || !modernDeductions && result?.deductionTotal != null
  const criterionDeductionsEnabled = applicableDeductionRules(configuration, roundId).some(rule => rule.appliedBy && rule.criteriaId)
  const roundResult = output.roundResults?.find(item => item.contestantId === entry.id && item.roundId === roundId)
  const aggregationResult = roundResult ?? result
  const averages = output.entryCriteriaAverages?.[`${roundId ?? 'single'}:${entry.id}`]?.criteria ?? {}
  const format = value => tabulationNumber(value, config.decimalPlaces)
  const displayTotal = value => `${format(value)}${points ? ' points' : ' percentage points'}`
  const judgeName = id => progress.find(judge => judge.judgeId === id)?.judgeName ?? 'Assigned judge'
  const judgeTotals = aggregationResult?.judgeTotals ?? []
  const aggregateDeductions = aggregationResult?.deductionTotal ?? 0
  const aggregateFormula = (() => {
    if (method === 'manual') return `Authorized placement: ${aggregationResult?.rank ?? result?.rank ?? '—'}. ${config.manualBasis ?? 'Manual decision basis recorded with the result.'}`
    if (method === 'rank_based') {
      const ranks = aggregationResult?.judgeRanks ?? result?.judgeRanks ?? {}
      const values = Object.entries(ranks).map(([id, value]) => `${judgeName(id)}: ${format(value)}`)
      const total = aggregationResult?.placementTotal ?? aggregationResult?.baseScore
      return `Add each judge’s placement${values.length ? ` (${values.join(' + ')})` : ''} = ${format(total)}. Lower placement totals rank higher.${aggregateDeductions ? ` Add ${format(aggregateDeductions)} placement adjustment = ${format(aggregationResult?.finalScore)} final placements.` : ''}`
    }
    const totalExpression = judgeTotals.map(format).join(method === 'sum' ? ' + ' : ', ')
    let methodExpression
    if (method === 'sum') methodExpression = `Add judge totals (${totalExpression || 'no judge totals'}) = ${displayTotal(aggregationResult?.baseScore)}`
    else if (method === 'highest_score') methodExpression = `Choose the highest judge total from ${totalExpression || 'the submitted totals'} = ${displayTotal(aggregationResult?.baseScore)}`
    else if (method === 'lowest_removal') {
      const sorted = [...judgeTotals].sort((a, b) => a - b)
      const low = Number(config.dropLowest ?? 0)
      const high = Number(config.dropHighest ?? 0)
      const retained = sorted.slice(low, sorted.length - high)
      methodExpression = `Remove the ${low} lowest and ${high} highest judge total(s); average the remaining ${retained.map(format).join(' + ') || 'totals'} = ${displayTotal(aggregationResult?.baseScore)}`
    } else methodExpression = `Average judge totals (${totalExpression || 'no judge totals'}) = ${displayTotal(aggregationResult?.baseScore)}`
    return `${methodExpression}${aggregateDeductions ? `; subtract ${format(aggregateDeductions)} approved deduction(s) = ${displayTotal(aggregationResult?.finalScore)}` : ''}`
  })()
  const tabs = [...sheets.map(item => ({ id: item.judgeId, label: judgeName(item.judgeId) })), { id: 'average', label: 'Panel Summary' }]
  const keys = event => {
    const index = tabs.findIndex(item => item.id === currentTab)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault(); setTab(tabs[next].id)
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus()
  }
  return <Modal open onClose={onClose} id="tabulation-breakdown" title={`Calculation Breakdown — ${entry.name}`} size="lg" footer={<div className="v-tab-dialog-actions"><Button variant="secondary" onClick={onClose}>Close Breakdown</Button></div>}>
    <div className="v-tab-breakdown-intro"><p>{roundName} · {tabulationMethodName(method, config)}</p><span className="v-tab-badge" data-tone={calculation.finalized ? 'success' : 'warning'}>{calculation.finalized ? 'Finalized calculation' : 'Calculated · Awaiting finalization'}</span></div>
    <p className="v-helper-text">Read-only breakdown of the current calculation. Original judge scores remain unchanged.</p>
    <div className="v-tab-breakdown-tabs" role="tablist" aria-label="Calculation judges">
      {tabs.map((item, index) => <button type="button" key={item.id} role="tab" id={`breakdown-tab-${index}`} aria-controls="breakdown-panel" aria-selected={currentTab === item.id} tabIndex={currentTab === item.id ? 0 : -1} onKeyDown={keys} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>
    <section id="breakdown-panel" role="tabpanel" aria-labelledby={`breakdown-tab-${tabs.findIndex(item => item.id === currentTab)}`} className="v-tab-breakdown-panel">
      {sheet ? <>
        <h4>How the total is calculated</h4>
        <p className="v-helper-text">{points ? 'The configured raw criterion points are added. Criterion percentages are not applied.' : `Each score is divided by its configured maximum and normalized to 100. Minor scores are combined using their configured weights or equal averaging, then multiplied by the major criterion weight. Contributions are percentage points before ${method === 'rank_based' ? 'each judge’s scores are ranked and placements combined' : 'the selected scoring method combines judge totals'}.`}</p>
        <div className="v-tab-table-scroll"><table className="v-table"><caption className="sr-only">{judgeName(sheet.judgeId)} criterion breakdown for {entry.name}</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Original score</th>{!points && <><th scope="col">Normalized score</th><th scope="col">Weight</th></>}{criterionDeductionsEnabled && <th scope="col">{points ? 'Original contribution' : 'Original contribution (%)'}</th>}<th scope="col">{criterionDeductionsEnabled ? points ? 'Adjusted contribution' : 'Adjusted contribution (%)' : points ? 'Points' : 'Weighted contribution (%)'}</th></tr></thead><tbody>
          {sheet.criteria.map(item => {
            const criterion = criteria.find(c => c.id === item.criteriaId)
            return <tr key={item.criteriaId}><th scope="row">{item.name ?? criterion?.name}</th><td>{points ? String(item.raw ?? '—') : (item.minors ?? []).map(minor => `${minor.name ?? criterion?.minorCriteria?.find(m => m.id === minor.id)?.name ?? criterion?.name ?? 'Score'}: ${minor.raw ?? '—'}`).join(' · ') || '—'}</td>{!points && <><td>{format(item.average)}%</td><td>{item.percentage ?? criterion?.percentage ?? '—'}%</td></>}{criterionDeductionsEnabled && <td>{format(item.originalContribution ?? item.contribution)}{points ? '' : '%'}</td>}<td className="v-tab-number">{format(item.contribution)}{points ? '' : '%'}</td></tr>
          })}
          <tr className="v-tab-summary-row"><th scope="row" colSpan={(points ? 2 : 4)+(criterionDeductionsEnabled?1:0)}>{points ? 'Judge point total' : 'Judge weighted total (%)'}</th><td className="v-tab-number">{format(sheet.total)}{points ? '' : '%'}</td></tr>
        </tbody></table></div>
        <p className="v-tab-formula">{sheet.criteria.map(item => `${format(item.contribution)}${points ? '' : '%'}`).join(' + ')}{deductionsEnabled && sheet.deductions?.some(item=>!item.criteria_id&&item.units==='points'&&!item.competition_scope) ? ` − ${sheet.deductions.filter(item=>!item.criteria_id&&item.units==='points'&&!item.competition_scope).map(item=>format(item.amount)).join(' − ')}` : ''} ≈ <strong>{format(sheet.total)}{points ? '' : '%'}</strong></p>
        {deductionsEnabled && <div className="space-y-2" aria-label="Applied deductions in this judge calculation">
          <p className="v-helper-text">Original total: {format(sheet.originalTotal ?? sheet.total)}. Adjusted total: {format(sheet.total)}.</p>
          {(sheet.deductions ?? []).map(item=><p className="v-helper-text" key={item.id}>{item.appliedBy==='judge'?'Judge':'Organizer'} · {item.description ?? configuration.scoringConfig.deductionRules?.find(rule=>rule.id===(item.rule_id??item.rule_key))?.description ?? 'Configured rule'}: {item.amount} {item.units} · {item.reason ?? 'Configured approved decision'}{item.criteria_id?` · ${criteria.find(criterion=>criterion.id===item.criteria_id)?.name ?? 'Criterion'}`:''}</p>)}
        </div>}
        <section aria-label="Step-by-step criterion calculation" className="v-tab-formula space-y-2">
          <h5>Step-by-step calculation</h5>
          {sheet.criteria.map(item => {
            const criterion = criteria.find(c => c.id === item.criteriaId)
            const weight = item.percentage ?? criterion?.percentage ?? 100
            const original = item.originalContribution ?? item.contribution
            const deduction = Number(original) - Number(item.contribution)
            return <p key={item.criteriaId}>
              <strong>{item.name ?? criterion?.name}:</strong>{' '}
              {points
                ? deduction > 0
                  ? `${format(item.raw)} raw points − ${format(deduction)} criterion deduction = ${format(item.contribution)} points.`
                  : `Raw criterion score = ${format(item.contribution)} points.`
                : item.minors?.length
                  ? `${item.minors.map(minor => `${minor.name ?? criterion?.minorCriteria?.find(m => m.id === minor.id)?.name ?? 'Score'}: ${format(minor.raw)} ÷ ${format(minor.maxScore ?? criterion?.minorCriteria?.find(m => m.id === minor.id)?.maxScore)} × 100 = ${format(minor.normalized)}%`).join('; ')}. Combined criterion score = ${format(item.average)}%.`
                  : `Normalized criterion score = ${format(item.average)}%.`}{' '}
              {!points && <>× {format(weight)}% criterion weight = {format(original)} percentage points{deduction > 0 ? ` − ${format(deduction)} point deduction = ${format(item.contribution)} percentage points` : ''}.</>}
            </p>
          })}
          <p><strong>Then {tabulationMethodName(method, config)}:</strong> {aggregateFormula}</p>
        </section>
        <p className="v-helper-text">Contributions are rounded for display. The stored total uses the calculation engine’s full-precision arithmetic.</p>
        {!points && sheet.criteria.some(item => item.minors?.length > 1) && <details className="v-tab-minor-trace"><summary>Minor criteria and configured ranges</summary><div className="v-tab-table-scroll"><table className="v-table"><thead><tr><th scope="col">Major criterion</th><th scope="col">Minor criterion</th><th scope="col">Range</th><th scope="col">Raw score</th><th scope="col">Normalized</th><th scope="col">Minor weight</th></tr></thead><tbody>{sheet.criteria.flatMap(item => (item.minors ?? []).map(minor => {
          const target = criteria.find(c => c.id === item.criteriaId)?.minorCriteria?.find(m => m.id === minor.id) ?? minor
          return <tr key={`${item.criteriaId}:${minor.id}`}><td>{item.name}</td><td>{minor.name ?? target.name}</td><td>{target.minScore ?? '—'}–{target.maxScore ?? '—'}</td><td>{String(minor.raw ?? '—')}</td><td>{format(minor.normalized)}%</td><td>{minor.percentage == null ? 'Equal share' : `${minor.percentage}%`}</td></tr>
        }))}</tbody></table></div></details>}
        {sheet.carryNumericTotal != null && <p className="v-tab-formula">Judge total after configured numeric carry and point deductions: <strong>{format(sheet.carryNumericTotal)}</strong></p>}
      </> : <>
        <h4>Panel calculation summary</h4>
        <section aria-label="How this scoring method calculated the result" className="v-tab-formula">
          <h5>How this result was calculated</h5>
          <p>{method === 'rank_based'
            ? aggregateFormula
            : `${tabulationMethodName(method, config)}: ${aggregateFormula}`}</p>
          {method !== 'rank_based' && result?.finalScore != null && <p>Saved final result: <strong>{displayTotal(result.finalScore)}</strong>. The ranking shown below is based on this saved result.</p>}
        </section>
        <div className="v-tab-table-scroll"><table className="v-table"><thead><tr><th scope="col">Criterion</th><th scope="col">{points ? 'Average points' : 'Average normalized score'}</th></tr></thead><tbody>{criteria.map(criterion => <tr key={criterion.id}><th scope="row">{criterion.name}</th><td>{format(averages[criterion.id])}{!points && averages[criterion.id] != null ? '%' : ''}</td></tr>)}</tbody></table></div>
        <p className="v-helper-text">These criterion averages describe the submitted sheets. They are not a replacement for the configured panel aggregation or round carry.</p>
        {method === 'rank_based' && <p className="v-tab-formula">Judge placements: {progress.map(judge => `${judge.judgeName ?? 'Judge'}: ${roundResult?.judgeRanks?.[judge.judgeId] ?? result?.judgeRanks?.[judge.judgeId] ?? '—'}`).join(' · ')}. Lower placement totals rank first.</p>}
        <dl className="v-tab-breakdown-totals"><div><dt>{method === 'rank_based' ? 'Aggregate placement' : 'Calculated aggregate'}</dt><dd>{format(result?.baseScore)}</dd></div>{result?.numericCarryScore != null && <div><dt>Combined numeric score</dt><dd>{format(result.numericCarryScore)}</dd></div>}{deductionsEnabled && result?.deductionTotal != null && <div><dt>{method === 'rank_based' ? modernDeductions ? 'Organizer placement adjustment' : 'Placement adjustment' : modernDeductions ? 'Organizer aggregate deductions' : 'Approved deductions'}</dt><dd>{format(result.deductionTotal)}</dd></div>}<div><dt>{method === 'rank_based' ? 'Adjusted placement total' : 'Calculated result'}</dt><dd>{format(result?.finalScore)}</dd></div><div><dt>Placement</dt><dd>{result?.rank ?? '—'}</dd></div></dl>
        {result?.perRound && Object.keys(result.perRound).length > 0 && <div className="v-tab-table-scroll"><table className="v-table"><caption>Round contribution trace</caption><thead><tr><th scope="col">Round</th><th scope="col">Calculated round result</th><th scope="col">Configured contribution</th></tr></thead><tbody>{Object.entries(result.perRound).map(([id, value]) => {
          const source = configuration.rounds.find(r => r.id === id)
          return <tr key={id}><th scope="row">{source?.name ?? 'Round'}</th><td>{format(value.value)}</td><td>{source?.progression === 'weighted' ? `${source.weight}%` : source?.progression === 'carry_forward' ? 'Carry forward' : 'Independent'}</td></tr>
        })}</tbody></table></div>}
      </>}
    </section>
  </Modal>
}
