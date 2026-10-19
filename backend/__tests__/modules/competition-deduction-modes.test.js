import { expect, test } from 'vitest'
import { calculateNativeSnapshot, nativeQualifierProposal } from '../../src/modules/competition-native-tabulation.js'
import { applicableDeductionRules, deductionConfigurationIssues, effectiveDeductionMode, submittedJudgeDeductions, validJudgeDeductionRecords } from '../../../shared/competition-deductions.js'

const fixture = (mode = 'judge', method = 'weighted_average') => ({
  eventId: 'event', roundId: null, complete: true,
  session: { id: 'session', round_id: null, entry_ids: ['entry'] },
  entries: [{ id: 'entry', name: 'Performer' }],
  rules: { id: 'rules', participation_snapshot: [{ id: 'entry', contestant_id: 'master', entry_number: 1 }], assignment_snapshot: [1, 2, 3].map(n => ({ judgeId: `judge${n}`, judgeRole: 'judge', round_id: null })), configuration_snapshot: {
    structure: 'single', rounds: [], criteria: [{ id: 'criterion', roundId: null, name: 'Performance', percentage: 100, minScore: 0, maxScore: 100, minorCriteria: [] }],
    scoringConfig: { deductionMode: mode, calculationMethod: method, decimalPlaces: 2, tiePolicy: 'shared', deductionRules: mode === 'none' ? [] : [{ id: 'late', description: 'Late start', amount: 2, units: 'points', appliedBy: mode, roundId: null, criteriaId: null, perViolation: false, maxOccurrences: 1 }] },
  } },
  submissions: [90, 85, 95].map((value, i) => ({ id: `submission${i}`, judge_id: `judge${i + 1}`, rules_version: 'rules', sources: [{ entry_id: 'entry', criterion_id: 'criterion', scores: { criterion: value }, locked: true, deductions: [] }] })), deductions: [],
})
const add = (state, index = 0, fields = {}) => state.submissions[index].sources[0].deductions.push({ id: `deduction-${index}`, ruleId: 'late', offenseKey: 'late-start', reason: 'Recorded late start', ...fields })

test.each([['weighted_average', 89.33], ['sum', 268], ['highest_score', 95], ['lowest_removal', 91.5]])('judge points apply before %s aggregation', (method, expected) => {
  const state = fixture('judge', method)
  state.rules.configuration_snapshot.scoringConfig.dropLowest = 1
  add(state)
  const { output } = calculateNativeSnapshot(state)
  expect(output.results[0].finalScore).toBe(expected)
  expect(output.worksheets[0]).toMatchObject({ originalTotal: 90, total: 88, judgeDeductionTotal: 2 })
  expect(state.submissions[0].sources[0].scores.criterion).toBe(90)
})
test('organizer points apply after averaging and remain distinct from judge deductions', () => {
  const state = fixture('organizer')
  state.deductions = [{ id: 'organizer-record', rule_key: 'late', entry_id: 'entry', status: 'approve', rule_snapshot: state.rules.configuration_snapshot.scoringConfig.deductionRules[0] }]
  expect(calculateNativeSnapshot(state).output.results[0].finalScore).toBe(88)
})

test('points-basis judge deductions preserve direct criterion points before panel aggregation',()=>{
 const state=fixture();state.rules.configuration_snapshot.scoringConfig.criterionBasis='points';add(state)
 const output=calculateNativeSnapshot(state).output
 expect(output.results[0].finalScore).toBe(89.33)
 expect(output.worksheets[0]).toMatchObject({originalTotal:90,total:88})
 expect(state.submissions[0].sources[0].scores.criterion).toBe(90)
})

test('a Deduct click creates an auditable judge record without asking the judge for reason or reference',()=>{
 const state=fixture()
 const rule=state.rules.configuration_snapshot.scoringConfig.deductionRules
 const clicked={id:'click-id',ruleId:'late'}
 expect(validJudgeDeductionRecords([clicked],rule)).toBe(true)
 expect(validJudgeDeductionRecords([{...clicked,offenseKey:'',reason:''}],rule)).toBe(true)
 expect(validJudgeDeductionRecords([{...clicked,amount:2}],rule)).toBe(false)
 const saved={...clicked,offenseKey:'judge-click:click-id',reason:'Judge applied the configured deduction using the Deduct button.'}
 state.submissions[0].sources[0].deductions=[saved]
 expect(submittedJudgeDeductions(state.rules.configuration_snapshot,[{session:state.session,submissions:state.submissions}])).toEqual([
  expect.objectContaining({id:'click-id',rule_id:'late',amount:2,reason:saved.reason,offense_key:saved.offenseKey}),
 ])
 expect(calculateNativeSnapshot(state).output.results[0].finalScore).toBe(89.33)
})

test('qualification uses deduction-adjusted finalized standings and refuses an unfinalized calculation',()=>{
 const state=fixture(),cfg=state.rules.configuration_snapshot
 state.roundId='pre';state.session.round_id='pre';state.session.entry_ids.push('other')
 cfg.structure='multiple';cfg.rounds=[{id:'pre',name:'Preliminary',displayOrder:0,progression:'back_to_zero',advancementType:'top_n',advancementValue:1},{id:'final',name:'Final',displayOrder:1,progression:'back_to_zero'}]
 cfg.criteria[0].roundId='pre';cfg.scoringConfig.deductionRules[0].roundId='pre'
 state.rules.participation_snapshot.push({id:'other',contestant_id:'other-master',entry_number:2})
 for(const [i,submission] of state.submissions.entries())submission.sources.push({entry_id:'other',criterion_id:'criterion',scores:{criterion:[89,85,95][i]},locked:true,deductions:[]})
 add(state)
 const output=calculateNativeSnapshot(state).output
 expect(output.results[0].contestantId).toBe('other')
 expect(()=>nativeQualifierProposal(state,{finalized:false,output_snapshot:output})).toThrow('Finalized')
 expect(nativeQualifierProposal(state,{finalized:true,output_snapshot:output}).automatic).toEqual(['other'])
})
test('a new criterion rule adjusts the configured weighted contribution, not the final average', () => {
  const state = fixture()
  state.rules.configuration_snapshot.criteria[0].percentage = 20
  state.rules.configuration_snapshot.criteria.push({ id: 'other', roundId: null, name: 'Artistry', percentage: 80, minScore: 0, maxScore: 100, minorCriteria: [] })
  state.rules.configuration_snapshot.scoringConfig.deductionRules[0].criteriaId = 'criterion'
  for (const submission of state.submissions) submission.sources.push({ entry_id: 'entry', criterion_id: 'other', scores: { other: 100 }, locked: true, deductions: [] })
  add(state)
  const output = calculateNativeSnapshot(state).output
  expect(output.worksheets[0].criteria[0]).toMatchObject({ originalContribution: 18, contribution: 16, average: 90 })
  expect(output.worksheets[0].total).toBe(96)
  expect(output.results[0].finalScore).toBe(97.33)
})
test('no deductions rejects submitted judge records instead of silently applying them', () => {
  const state = fixture('none'); add(state)
  expect(() => calculateNativeSnapshot(state)).toThrow('frozen scoring scope')
})
test('round overrides inherit defaults without enabling a rule for a different owner', () => {
  const cfg = fixture('organizer').rules.configuration_snapshot
  cfg.structure = 'multiple'; cfg.rounds = [{ id: 'pre', displayOrder: 0 }, { id: 'final', displayOrder: 1, deductionMode: 'judge' }]
  cfg.criteria[0].roundId = 'pre'
  cfg.scoringConfig.deductionRules[0].roundId = 'pre'
  cfg.scoringConfig.deductionRules.push({ id: 'final-rule', description: 'Final offense', appliedBy: 'judge', amount: 1, units: 'points', roundId: 'final' })
  expect(effectiveDeductionMode(cfg, 'pre')).toBe('organizer')
  expect(effectiveDeductionMode(cfg, 'final')).toBe('judge')
  expect(applicableDeductionRules(cfg, 'pre', 'judge')).toEqual([])
  expect(applicableDeductionRules(cfg, 'final', 'organizer')).toEqual([])
  expect(deductionConfigurationIssues(cfg)).toEqual([])
  cfg.scoringConfig.deductionRules[0].appliedBy = 'judge'
  expect(deductionConfigurationIssues(cfg).join(' ')).toContain('conflicts')
})
test.each([{ reason: '' }, { amount: 999 }, { units: 'placements' }, { ruleId: 'foreign' }])('untrusted judge record fields cannot change frozen deductions: %j', fields => {
  const state = fixture(); add(state, 0, fields)
  expect(() => calculateNativeSnapshot(state)).toThrow()
})
test('duplicate violations and occurrence limits are enforced while configured repeats remain valid', () => {
  const state = fixture(); add(state); add(state, 0, { id: 'second' })
  expect(() => calculateNativeSnapshot(state)).toThrow('Duplicate')
  state.submissions[0].sources[0].deductions[1].offenseKey = 'late-return'
  expect(() => calculateNativeSnapshot(state)).toThrow('occurrence limit')
  Object.assign(state.rules.configuration_snapshot.scoringConfig.deductionRules[0], { perViolation: true, maxOccurrences: 2 })
  expect(calculateNativeSnapshot(state).output.results[0].finalScore).toBe(88.67)
})
test('legacy rules retain their historical organizer ownership and no judge deduction records are invented', () => {
  const state = fixture('organizer'); delete state.rules.configuration_snapshot.scoringConfig.deductionMode
  delete state.rules.configuration_snapshot.scoringConfig.deductionRules[0].appliedBy
  expect(submittedJudgeDeductions(state.rules.configuration_snapshot, [{ session: state.session, submissions: state.submissions }])).toEqual([])
  expect(calculateNativeSnapshot(state).output.results[0].finalScore).toBe(90)
})

test.each([['judge', 'points', 5, 4], ['judge', 'placements', 6, 5], ['organizer', 'points', 6, 3], ['organizer', 'placements', 6, 5]])('%s %s change the correct stage of rank-based scoring', (owner, units, firstTotal, otherTotal) => {
  const state = fixture(owner, 'rank_based')
  state.session.entry_ids.push('other')
  state.rules.participation_snapshot.push({ id: 'other', contestant_id: 'other-master', entry_number: 2 })
  state.rules.configuration_snapshot.scoringConfig.deductionRules[0].units = units
  for (const [index, submission] of state.submissions.entries()) submission.sources.push({ entry_id: 'other', criterion_id: 'criterion', scores: { criterion: [89, 86, 94][index] }, locked: true, deductions: [] })
  if (owner === 'judge') add(state)
  else state.deductions = [{ id: 'organizer-penalty', rule_key: 'late', entry_id: 'entry', status: 'approve', rule_snapshot: state.rules.configuration_snapshot.scoringConfig.deductionRules[0] }]
  const results = calculateNativeSnapshot(state).output.results
  expect(results.find(row => row.contestantId === 'entry').finalScore).toBe(firstTotal)
  expect(results.find(row => row.contestantId === 'other').finalScore).toBe(otherTotal)
  expect(results[0].contestantId).toBe('other')
})

test('the same organizer decision cannot be applied twice', () => {
  const state = fixture('organizer')
  const record = { id: 'same-decision', rule_key: 'late', entry_id: 'entry', status: 'approve', rule_snapshot: state.rules.configuration_snapshot.scoringConfig.deductionRules[0] }
  state.deductions = [record, record]
  expect(() => calculateNativeSnapshot(state)).toThrow('Duplicate organizer deduction')
})

test('highest-criterion tie resolution uses the adjusted criterion contributions while retaining raw scores', () => {
  const state=fixture(),cfg=state.rules.configuration_snapshot
  cfg.scoringConfig.tiePolicy='highest_criterion';cfg.criteria[0].percentage=50
  cfg.criteria.push({id:'artistry',roundId:null,name:'Artistry',percentage:50,minScore:0,maxScore:100,minorCriteria:[]})
  Object.assign(cfg.scoringConfig.deductionRules[0],{criteriaId:'criterion',amount:15})
  state.session.entry_ids.push('other');state.rules.participation_snapshot.push({id:'other',contestant_id:'other-master',entry_number:2})
  for(const submission of state.submissions){submission.sources[0].scores.criterion=90;submission.sources.push({entry_id:'entry',criterion_id:'artistry',scores:{artistry:70},deductions:[]},{entry_id:'other',criterion_id:'criterion',scores:{criterion:70},deductions:[]},{entry_id:'other',criterion_id:'artistry',scores:{artistry:80},deductions:[]})}
  add(state)
  const output=calculateNativeSnapshot(state).output
  expect(output.results.map(row=>row.finalScore)).toEqual([75,75])
  expect(output.results.map(row=>row.rank)).toEqual([1,1])
  expect(output.worksheets[0].criteria[0]).toMatchObject({average:90,adjustedAverage:60,originalContribution:45,contribution:30})
})

test('weighted rank carry uses preliminary organizer points, final judge points, then final judge placement penalties exactly once', () => {
  const state = fixture('organizer', 'rank_based'), cfg = state.rules.configuration_snapshot
  cfg.structure = 'multiple'; cfg.scoringConfig.numericCarryBasis = 'weighted_judge_average'
  cfg.rounds = [{ id: 'pre', name: 'Preliminary', displayOrder: 0, progression: 'weighted', weight: 40 }, { id: 'final', name: 'Final', displayOrder: 1, progression: 'weighted', weight: 60, deductionMode: 'judge' }]
  cfg.criteria = cfg.rounds.map(round => ({ id: `criterion-${round.id}`, roundId: round.id, name: 'Performance', percentage: 100, minScore: 0, maxScore: 100, minorCriteria: [] }))
  cfg.scoringConfig.deductionRules = [
    { id: 'pre-points', description: 'Preliminary time', appliedBy: 'organizer', roundId: 'pre', amount: 2, units: 'points' },
    { id: 'final-points', description: 'Final time', appliedBy: 'judge', roundId: 'final', amount: 2, units: 'points' },
    { id: 'final-placement', description: 'Final placement', appliedBy: 'judge', roundId: 'final', amount: 2, units: 'placements' },
  ]
  state.rules.participation_snapshot.push({ id: 'other', contestant_id: 'other-master', entry_number: 2 })
  const scope = round => ({ session: { id: `session-${round}`, round_id: round, entry_ids: ['entry', 'other'] }, submissions: [1, 2, 3].map(index => ({ id: `${round}-submission${index}`, judge_id: `judge${index}`, rules_version: 'rules', sources: ['entry', 'other'].map(entry => ({ entry_id: entry, criterion_id: `criterion-${round}`, scores: { [`criterion-${round}`]: entry === 'entry' ? 90 : 89 }, deductions: round === 'final' && entry === 'entry' && index === 1 ? ['final-points', 'final-placement'].map(ruleId => ({ id: ruleId, ruleId, offenseKey: ruleId, reason: 'Documented judge violation' })) : [] })) })) })
  const pre = scope('pre'), final = scope('final')
  state.roundId = 'final'; state.session = final.session; state.submissions = final.submissions; state.scopes = [pre, final]
  state.allDeductions = [{ id: 'pre-decision', rule_key: 'pre-points', entry_id: 'entry', status: 'approve', rule_snapshot: cfg.scoringConfig.deductionRules[0] }]
  const output = calculateNativeSnapshot(state).output
  expect(output.results.find(row => row.contestantId === 'entry')).toMatchObject({ numericCarryScore: 88.8, finalScore: 6, judgeRanks: { judge1: 4, judge2: 1, judge3: 1 } })
  expect(output.results[0]).toMatchObject({ contestantId: 'other', rank: 1, finalScore: 5 })
  expect(output.worksheets.find(sheet => sheet.entryId === 'entry' && sheet.judgeId === 'judge1' && sheet.roundId === 'final')).toMatchObject({ originalTotal: 90, total: 88, carryNumericTotal: 88, judgeDeductionTotal: 2, judgePlacementPenalty: 2 })
  // A competition-final judge rule is applied after numeric carry, rather than
  // being discounted by the Final round's contribution.
  cfg.scoringConfig.deductionRules.find(rule => rule.id === 'final-points').roundId = null
  const global = calculateNativeSnapshot(state).output
  expect(global.results.find(row => row.contestantId === 'entry').numericCarryScore).toBe(88.53)
  expect(global.worksheets.find(sheet => sheet.entryId === 'entry' && sheet.judgeId === 'judge1' && sheet.roundId === 'final')).toMatchObject({ originalTotal: 90, total: 90, carryNumericTotal: 87.2, finalJudgePointDeductionTotal: 2 })
})
