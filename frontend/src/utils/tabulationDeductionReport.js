import { applicableDeductionRules } from '../../../shared/competition-deductions.js'

// Presentation of saved sources and engine traces, never a second calculation.
export function tabulationDeductionReport(records, source, roundId) {
  if (!source?.rules?.configuration_snapshot) return records
  const configuration = source.rules.configuration_snapshot
  const rules = applicableDeductionRules(configuration, roundId)
  if (!rules.length) return records.map(record => Object.fromEntries(Object.entries(record).filter(([key]) => !/deduct|penalt/i.test(key))))
  const judges = new Map((source.progress ?? []).map(judge => [judge.judgeName, judge.judgeId]))
  const sheets = source.calculation?.output_snapshot?.worksheets ?? []
  const output = []
  const printedDeductions = new Set(), printedSheets = new Set()
  const entryFor = record => record && source.entries?.find(item => record['Record type'] !== 'Report' && item.name === record.Entry && (record['Entry number'] == null || String(item.contestantNumber ?? '') === String(record['Entry number'])))
  const roundName = id => configuration.rounds?.find(round => round.id === id)?.name ?? 'Single round'
  const trace = (sheet, entry, judgeName, submissionId) => {
    printedSheets.add(sheet)
    for (const criterion of sheet.criteria ?? []) output.push({ 'Record type': 'Criterion calculation', 'Entry number': entry.contestantNumber, Entry: entry.name, Judge: judgeName, Round: roundName(sheet.roundId), 'Submission ID': submissionId, Criterion: criterion.name, 'Original contribution': criterion.originalContribution ?? criterion.contribution, 'Adjusted contribution': criterion.contribution, 'Normalized score': criterion.average ?? '', 'Criterion weight': criterion.percentage ?? '', 'Source digest': source.sourceDigest })
  }
  const deductionRow = (deduction, entry, judgeName) => {
    printedDeductions.add(deduction.id)
    output.push({ 'Record type': 'Judge deduction', 'Entry number': entry.contestantNumber, Entry: entry.name, Judge: judgeName, Round: roundName(deduction.round_id), 'Submission ID': deduction.submission_id, 'Deduction owner': 'Judge', 'Deduction rule': deduction.description, 'Deduction amount': deduction.amount, 'Deduction units': deduction.units, 'Violation reference': deduction.offense_key, 'Deduction reason': deduction.reason, 'Criterion scope': configuration.criteria.find(item => item.id === deduction.criteria_id)?.name ?? 'Judge total / placement', 'Source digest': source.sourceDigest })
  }
  for (const [index, record] of records.entries()) {
    const entry = entryFor(record)
    const judgeId = judges.get(record.Judge)
    const sheet = sheets.find(item => item.entryId === entry?.id && item.judgeId === judgeId && item.roundId === roundId)
    const judgeRules = rules.some(rule => rule.appliedBy === 'judge')
    output.push(record['Record type'] === 'Original scores' && (judgeRules || rules.some(rule => rule.appliedBy && rule.criteriaId)) ? { ...record, 'Original judge total': sheet?.originalTotal ?? '', ...(judgeRules ? { 'Judge point deductions': sheet?.judgeDeductionTotal ?? '', 'Judge placement penalties': sheet?.judgePlacementPenalty ?? '', 'Final judge point deductions': sheet?.finalJudgePointDeductionTotal ?? '', 'Combined numeric judge total': sheet?.carryNumericTotal ?? '' } : {}), 'Adjusted judge total': sheet?.total ?? '' } : record)
    if (!entry) continue
    if (record['Record type'] === 'Original scores' && judgeId) {
      if (sheet) trace(sheet, entry, record.Judge, record['Submission ID'])
      for (const deduction of (source.judgeDeductions ?? []).filter(item => item.contestant_id === entry.id && item.judge_id === judgeId && item.round_id === roundId)) deductionRow(deduction, entry, record.Judge)
    }
    if (entryFor(records[index+1])?.id !== entry.id) {
      // Keep contributing-round deductions and traces beside this entry, even
      // when the judging panels differ between rounds.
      for (const previous of sheets.filter(item => item.entryId === entry.id && !printedSheets.has(item))) {
        const submission=source.scopes?.flatMap(scope=>scope.submissions??[]).find(item=>item.id===previous.submissionId)
        trace(previous,entry,submission?.judgeName??source.judgeDeductions?.find(item=>item.judge_id===previous.judgeId)?.judgeName??'Assigned judge',previous.submissionId)
      }
      for (const deduction of (source.judgeDeductions ?? []).filter(item => item.contestant_id === entry.id && !printedDeductions.has(item.id))) deductionRow(deduction, entry, deduction.judgeName ?? 'Assigned judge')
    }
  }
  return rules.length ? output : output.map(record => Object.fromEntries(Object.entries(record).filter(([key]) => !/deduct|penalt/i.test(key))))
}
