import {expect,test} from 'vitest'
import {setupReadiness} from '../../../shared/competition-setup-readiness.js'
import {validScore} from '../../../shared/competition-score-input.js'
const cfg=()=>({structure:'single',rounds:[],criteria:[{id:'c',roundId:null,name:'Technique',percentage:100,minScore:1,maxScore:10,minorCriteria:[]}],scoringConfig:{calculationMethod:'weighted_average',tiePolicy:'shared'}})
test('single flat scope is ready without fake rounds',()=>expect(setupReadiness(cfg()).allReady).toBe(true))
test('incomplete weights do not mark criteria complete',()=>{const c=cfg();c.criteria[0].percentage=70;expect(setupReadiness(c).ready.criteria).toBe(false)})
test('independent qualification rounds need no contribution weights; weighted rounds do',()=>{
 const c=cfg();c.structure='multiple';c.rounds=[{id:'pre',name:'Preliminary',displayOrder:0,nextRoundId:'final',advancementType:'top_n',advancementValue:2},{id:'final',name:'Final',displayOrder:1}];c.criteria=['pre','final'].map(id=>({...c.criteria[0],id:id+'c',roundId:id}))
 expect(setupReadiness(c).allReady).toBe(true);c.rounds.forEach(r=>{r.progression='weighted';r.weight=20});expect(setupReadiness(c).ready.structure).toBe(false);c.rounds[1].weight=80;expect(setupReadiness(c).allReady).toBe(true)
})
test('missing deduction scopes are explicit errors after removing a criterion',()=>{const c=cfg();c.scoringConfig.deductionRules=[{id:'r',description:'Late',amount:2,units:'points',criteriaId:'removed'}];expect(setupReadiness(c).ready.deductions).toBe(false)})
test('input precision is optional for old records and supports per-input overrides',()=>{
 const target={minScore:1,maxScore:10};expect(validScore(8.12345,target)).toBe(true);expect(validScore(8.12,target,{inputDecimalPlaces:1})).toBe(false);expect(validScore(8.12,{...target,decimalPlaces:2},{inputDecimalPlaces:0})).toBe(true);expect(validScore(11,target)).toBe(false);expect(validScore('',target)).toBe(false)
 expect(validScore(8.000000001,target,{inputDecimalPlaces:0})).toBe(false)
})
