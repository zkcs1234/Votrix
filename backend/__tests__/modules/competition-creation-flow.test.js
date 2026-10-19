import { describe, it, expect } from 'vitest'
import { competitionSetupIssues } from '../../../shared/competition-creation-flow.js'
import { validateNativeConfiguration } from '../../src/modules/competition-native-configuration.js'
import { calculateOfficial } from '../../../shared/competition-calculation.js'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const configuration = () => ({structure:'single',rounds:[],criteria:[{id:id(1),roundId:null,name:'Presentation',percentage:100,minScore:1,maxScore:10,minorCriteria:[{id:id(2),name:'Technique',minScore:1,maxScore:10,percentage:20},{id:id(3),name:'Impact',minScore:1,maxScore:10,percentage:80}]}],scoringConfig:{calculationMethod:'weighted_average',tiePolicy:'shared'}})
describe('competition creation integrity',()=>{
 it('rejects incomplete or mixed minor weights',()=>{
  const cfg=configuration();expect(validateNativeConfiguration(cfg)).toEqual(cfg)
  cfg.criteria[0].minorCriteria[1].percentage=60;expect(()=>validateNativeConfiguration(cfg)).toThrow('total 100%')
  delete cfg.criteria[0].minorCriteria[1].percentage;expect(()=>validateNativeConfiguration(cfg)).toThrow('every weighted minor')
 })
 it('calculates weighted minors differently from unweighted averaging using submitted scores',()=>{
  const cfg=configuration(),rules={id:'rules',event:{id:'event'},rounds:[],contestants:[{id:'entry',name:'Entry',contestantNumber:1}],judges:[{judgeId:'judge',role:'judge',isActive:true}],criteria:cfg.criteria,scoringConfig:cfg.scoringConfig}
  const submitted=[{judge_id:'judge',round_id:null,status:'submitted',rules_version:'rules',sources:[{contestantId:'entry',scores:{[id(2)]:10,[id(3)]:5}}]}]
  expect(calculateOfficial(rules,submitted).results[0].finalScore).toBe(60)
  rules.criteria[0].minorCriteria.forEach(m=>delete m.percentage)
  expect(calculateOfficial(rules,submitted).results[0].finalScore).toBe(75)
 })
 it('review catches a missing final-round judge instead of accepting a preliminary-only panel',()=>{
  const branch={competition:{},configuration:{...configuration(),structure:'multiple',rounds:[{id:'pre',name:'Preliminary'},{id:'final',name:'Final'}]},criteriaReadiness:{allReady:true},entries:[{id:'entry'}],assignments:[{participant_id:'enrollment',round_id:'pre'}],judges:[{id:'enrollment',isActive:true,accountStatus:'active',role:'judge'}]}
  expect(competitionSetupIssues(branch)).toEqual([{step:'judges',message:'Assign an active judge to Final.'}])
 })
 it('supports independent round methods while blocking incompatible carry',()=>{
  const cfg=configuration();cfg.structure='multiple';cfg.rounds=[{id:id(4),name:'Preliminary',displayOrder:0,calculationMethod:'sum',progression:'back_to_zero'},{id:id(5),name:'Final',displayOrder:1,calculationMethod:'weighted_average',progression:'back_to_zero'}];cfg.criteria=[]
  expect(validateNativeConfiguration(cfg)).toEqual(cfg)
  cfg.rounds[1].progression='carry_forward';expect(()=>validateNativeConfiguration(cfg)).toThrow('normalization policy')
 })
 it('checks advancement against the selected round method and accepts numeric rank deductions',()=>{
  const cfg=configuration();cfg.structure='multiple';cfg.rounds=[{id:id(4),name:'Preliminary',displayOrder:0,calculationMethod:'rank_based',advancementType:'threshold',advancementValue:50,nextRoundId:id(5)},{id:id(5),name:'Final',displayOrder:1}];cfg.criteria=[]
  expect(()=>validateNativeConfiguration(cfg)).toThrow('Minimum-score qualification requires numeric')
  cfg.rounds[0].advancementType='top_n';cfg.rounds[0].advancementValue=1;expect(validateNativeConfiguration(cfg)).toEqual(cfg)
  const single=configuration();single.scoringConfig.calculationMethod='rank_based';single.scoringConfig.deductionRules=[{id:'time-limit',description:'Time limit',amount:5,units:'points',roundId:null}]
  expect(validateNativeConfiguration(single)).toEqual(single)
 })
})
