import { calculateOfficial } from '../../../shared/competition-calculation.js'
import { submittedJudgeDeductions } from '../../../shared/competition-deductions.js'

// Informational draft preview through the same engine as official tabulation.
// These client-side values are never accepted as an official calculation.
export function judgeDeductionPreview(sheet, scores, records, entry) {
  const cfg = sheet.deductionSettings?.configuration
  if (!cfg || !sheet.context || cfg.scoringConfig.calculationMethod === 'manual') return null
  const roundId = sheet.context.roundId ?? null
  const criteria = cfg.criteria.filter(criterion => (criterion.roundId ?? null) === roundId)
  const judge = sheet.viewerJudgeId, rulesId = sheet.context.rulesVersion
  const sources = criteria.map(criterion => ({ entry_id: entry.id, criterion_id: criterion.id, deductions: records[`${entry.id}:${criterion.id}`] ?? [], scores: Object.fromEntries((cfg.scoringConfig.criterionBasis === 'points' || !criterion.minorCriteria?.length ? [criterion] : criterion.minorCriteria).flatMap(target => {
    const value = scores[`${entry.id}:${target.id}`]
    return value == null || value === '' ? [] : [[target.id, Number(value)]]
  })) }))
  const submission = { id: 'draft-preview', judge_id: judge, rules_version: rulesId, round_id: roundId, status: 'submitted', sources }
  try {
    const deductions = submittedJudgeDeductions(cfg, [{ session: { round_id: roundId, entry_ids: [entry.id] }, submissions: [submission] }])
    const rules = { id: rulesId, event: { id: sheet.context.eventId }, contestants: [entry], judges: [{ judgeId: judge, role: 'judge', isActive: true, assignments: [{ scope: 'event', scopeId: sheet.context.eventId }] }], categories: [], criteria, rounds: roundId == null ? [] : [{ id: roundId, purpose: 'final', displayOrder: 0, criteriaIds: criteria.map(criterion => criterion.id), contestantIds: [entry.id], progression: 'back_to_zero' }], scoringConfig: { ...cfg.scoringConfig, calculationMethod: 'weighted_average', finalRoundId: roundId } }
    const output = calculateOfficial(rules, [{ ...submission, sources: [{ contestantId: entry.id, scores: Object.assign({}, ...sources.map(source => source.scores)) }] }], { roundId, judgeDeductions: deductions.filter(record => record.units === 'points') })
    return output.worksheets.find(worksheet => worksheet.complete) ?? null
  } catch { return null }
}
