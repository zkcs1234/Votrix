import { expect, test } from 'vitest'
import { SCORING_METHODS, eligibleReviewers, resultRoundPolicy, scoringRuleReadiness } from '../../../shared/competition-rule-configuration.js'
const config = values => ({ calculationMethod: 'weighted_average', confirmed: true, tiePolicy: 'shared', decimalPlaces: 2, independentApproval: true, verifierId: 'reviewer', dropHighest: 0, dropLowest: 0, deductionRules: [], ...values })
const f = () => ({ event: { id: 'e' }, rounds: [], contestants: [], criteria: [], assignments: [], judges: [{ id: 'p', judgeId: 'j', role: 'judge', isActive: true, accountStatus: 'active' }, { id: 'v', judgeId: 'reviewer', role: 'score_reviewer', isActive: true, accountStatus: 'active' }] })
test('six supported methods retain their official backend mappings', () => {
  expect(SCORING_METHODS.map(m => m.id)).toEqual(['weighted_average', 'sum', 'rank_based', 'highest_score', 'lowest_removal', 'manual'])
})
test('confirmation may defer reviewer assignment but publication cannot', () => {
  const readiness = scoringRuleReadiness(f(), config({ verifierId: null }), 'owner')
  expect(readiness.canConfirm).toBe(true); expect(readiness.readyForPublication).toBe(false)
  expect(readiness.pending.map(i => i.field)).toContain('verifierId')
  expect(scoringRuleReadiness(f(), config(), 'owner').readyForPublication).toBe(true)
})
test('only active enrolled reviewers distinct from the preparing organizer are eligible', () => {
  const foundation = f(); foundation.judges.push({ ...foundation.judges[1], judgeId: 'owner' }, { ...foundation.judges[1], judgeId: 'inactive', accountStatus: 'inactive' }, { ...foundation.judges[1], judgeId: 'disabled', isActive: false })
  expect(eligibleReviewers(foundation, 'owner').map(j => j.judgeId)).toEqual(['reviewer'])
})
test('rank placement permits shared ties only, and manual results require documentation and independent review', () => {
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'rank_based', tiePolicy: 'highest_criterion' })).canConfirm).toBe(false)
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'manual', manualBasis: '' })).canConfirm).toBe(false)
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'manual', manualBasis: 'Signed placements', independentApproval: false }))).toMatchObject({ canConfirm: true, reviewerRequired: true })
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'manual', manualBasis: 'Signed placements' })).readyForPublication).toBe(true)
})
test('undecided cannot confirm or become publication ready', () => {
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'undecided' }))).toMatchObject({ canConfirm: false, readyForPublication: false })
})
test('result descriptions preserve automatic, explicit, combined and independent award semantics', () => {
  const foundation = f(); foundation.rounds = [{ id: 'pre', name: 'Preliminary', purpose: 'qualification', progression: 'weighted', weight: 30, displayOrder: 0 }, { id: 'award', name: 'Talent Award', purpose: 'special', progression: 'back_to_zero', displayOrder: 1 }, { id: 'final', name: 'Final', purpose: 'final', progression: 'back_to_zero', weight: 70, displayOrder: 2 }]
  const original = structuredClone(foundation)
  expect(resultRoundPolicy(foundation, config({ finalRoundId: null }))).toMatchObject({ mode: 'independent', final: { id: 'final' } })
  expect(resultRoundPolicy(foundation, config({ finalRoundId: 'pre' })).mode).toBe('weighted')
  expect(resultRoundPolicy(foundation, config({ finalRoundId: 'missing' })).missing).toBe(true)
  foundation.rounds[2].progression = 'carry_forward'
  expect(resultRoundPolicy(foundation, config()).mode).toBe('carry_forward')
  expect(original.rounds[2].progression).toBe('back_to_zero')
})
test('extreme removal is checked against the smallest assigned scoring panel', () => {
  const foundation = f(); foundation.contestants = [{ id: 'a', divisionId: 'one' }, { id: 'b', divisionId: 'two' }]
  foundation.judges.push({ id: 'q', judgeId: 'k', role: 'judge', isActive: true })
  foundation.assignments = [{ judgeId: 'q', scope: 'division', scopeId: 'one' }]
  const readiness = scoringRuleReadiness(foundation, config({ calculationMethod: 'lowest_removal', dropLowest: 1 }))
  expect(readiness.panels.minimum).toBe(1)
  expect(readiness.canConfirm).toBe(false)
})
test('penalty units and references remain explicit and manual point deductions cannot confirm', () => {
  const rule = { id: 'r', description: 'Late entry', amount: 2, units: 'points' }
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'rank_based', deductionRules: [rule] })).canConfirm).toBe(false)
  expect(scoringRuleReadiness(f(), config({ calculationMethod: 'manual', manualBasis: 'Signed placements', deductionRules: [rule] })).canConfirm).toBe(false)
  expect(scoringRuleReadiness(f(), config({ deductionRules: [{ ...rule, roundId: 'foreign' }] })).canConfirm).toBe(false)
  expect(scoringRuleReadiness(f(), config({ independentApproval: false, verifierId: null, deductionRules: [rule] })).readyForPublication).toBe(false)
})
