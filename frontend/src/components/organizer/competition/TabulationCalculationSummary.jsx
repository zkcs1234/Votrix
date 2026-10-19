import Button from '@/components/ui/Button'
import { tabulationNumber } from '@/utils/competitionTabulationPresentation'
import { applicableDeductionRules } from '../../../../../shared/competition-deductions.js'

export default function TabulationCalculationSummary({ calculation, method, configuration, roundId, entries, progress, deductionsEnabled, judgeDeductionsEnabled, onBreakdown }) {
  if (!calculation) return (
    <section className="v-card-sm space-y-2" aria-labelledby="calculation-summary-heading">
      <h2 id="calculation-summary-heading" className="v-section-title">Calculation summary</h2>
      <p className="v-caption">Calculate results to see each entry’s judge totals and calculation breakdown.</p>
    </section>
  )

  const output = calculation.output_snapshot
  const manual = method === 'manual'
  const ranked = method === 'rank_based'
  const judges = manual ? [] : progress.filter(judge => judge.submitted)
  const format = value => tabulationNumber(value, configuration?.scoringConfig.decimalPlaces)
  const organizerCriterionDeductions = applicableDeductionRules(configuration, roundId, 'organizer').some(rule => rule.appliedBy && rule.criteriaId)

  return (
    <section className="v-card-sm space-y-3" aria-labelledby="calculation-summary-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="calculation-summary-heading" className="v-section-title">Calculation summary</h2>
        <span className="v-tab-badge" data-tone={calculation.finalized ? 'success' : 'warning'}>
          Version {calculation.version} · {calculation.finalized ? 'Finalized' : 'Awaiting finalization'}
        </span>
      </div>
      <p className="v-caption">
        {manual
          ? 'Organizer-entered placements and their recorded decision reason.'
          : 'Judge totals and results from the saved calculation, including configured numeric carry where applicable. Open an entry’s breakdown to inspect criterion contributions and round carry.'}
      </p>
      {ranked && <p className="v-caption">Judge placements are added; lower placement totals rank higher. Configured placement deductions increase the total.</p>}
      <div className="v-table-wrap">
        <table className="v-table v-tab-calculation-table">
          <caption className="sr-only">Current calculation totals by entry</caption>
          <thead><tr>
            <th scope="col">Entry</th>
            {judges.map(judge => <th key={judge.judgeId} scope="col">{judge.judgeName ?? 'Judge'}<span>Judge total{ranked ? ' / placement' : ''}</span></th>)}
            {!manual && <th scope="col">{ranked ? 'Placement total' : 'Calculated aggregate'}</th>}
            {!manual && deductionsEnabled && <th scope="col">Approved deductions</th>}
            <th scope="col">{manual ? 'Recorded placement' : ranked ? 'Adjusted placement total' : 'Calculated score'}</th>
            {!manual && <th scope="col">Breakdown</th>}
          </tr></thead>
          <tbody>{(output.results ?? []).map(result => {
            const entry = entries.find(item => item.id === result.contestantId)
            const roundResult = output.roundResults?.find(item => item.contestantId === result.contestantId && item.roundId === roundId)
            return <tr key={result.contestantId}>
              <th scope="row">{entry?.contestantNumber != null ? `${String(entry.contestantNumber).padStart(3, '0')} · ` : ''}{entry?.name ?? 'Entry'}</th>
              {judges.map(judge => {
                const sheet = output.worksheets?.find(item => item.entryId === result.contestantId && item.judgeId === judge.judgeId && item.roundId === roundId)
                const placement = result.judgeRanks?.[judge.judgeId] ?? roundResult?.judgeRanks?.[judge.judgeId]
                return <td key={judge.judgeId} className="tabular-nums">
                  {format(sheet?.carryNumericTotal ?? sheet?.total)}
                  {judgeDeductionsEnabled && <span className="block text-xs text-v-text-muted">Original: {format(sheet?.originalTotal)} · Judge deductions: {format(sheet?.judgeDeductionTotal)} points{ranked ? ` / ${format(sheet?.judgePlacementPenalty)} placement points` : ''}</span>}
                  {organizerCriterionDeductions && <span className="block text-xs text-v-text-muted">Original: {format(sheet?.originalTotal)} · Organizer criterion deductions included before aggregation</span>}
                  {judgeDeductionsEnabled && sheet?.finalJudgePointDeductionTotal > 0 && <span className="block text-xs text-v-text-muted">Final-score judge deduction: {format(sheet.finalJudgePointDeductionTotal)} points after numeric carry</span>}
                  {ranked && <span className="block text-xs text-v-text-muted">Placement: {placement ?? '—'}</span>}
                </td>
              })}
              {!manual && <td className="tabular-nums">{format(result.baseScore)}</td>}
              {!manual && deductionsEnabled && <td className="tabular-nums">{format(result.deductionTotal)}</td>}
              <td className="font-semibold tabular-nums">{manual ? result.rank : format(result.finalScore)}</td>
              {!manual && <td><Button size="sm" variant="secondary" disabled={!entry} aria-label={`View calculation for ${entry?.name ?? 'entry'}`} onClick={() => onBreakdown(result.contestantId)}>View</Button></td>}
            </tr>
          })}</tbody>
        </table>
      </div>
      {manual && output.reason && <p className="v-caption">Decision reason: {output.reason}</p>}
    </section>
  )
}
