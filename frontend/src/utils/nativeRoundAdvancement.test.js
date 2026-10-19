import { expect, test } from 'vitest'
import { nativeRoundAdvancement, nextRoundScorePolicy } from './nativeRoundAdvancement'

const next={id:'final',name:'Final',progression:'weighted',weight:70}
const view=()=>({roundId:'pre',complete:true,session:{status:'closed'},calculation:{verified:true,finalized:true},advancement:{fromRoundId:'pre',toRoundId:'final',qualificationCurrent:true,qualifiedEntryIds:['one']}})
test('only finalized current source and its matching confirmed roster enable handoff',()=>{
 expect(nativeRoundAdvancement(view(),next)).toMatchObject({canProceed:true,confirmed:true,count:1})
 for(const change of [{complete:false},{calculationStale:true},{calculation:{verified:true,finalized:false}},{advancement:{fromRoundId:'other',toRoundId:'final',qualificationCurrent:true,qualifiedEntryIds:['one']}},{advancement:{fromRoundId:'pre',toRoundId:'final',qualificationCurrent:false,qualifiedEntryIds:['one']}},{advancement:{fromRoundId:'pre',toRoundId:'final',qualificationCurrent:true,qualifiedEntryIds:[]}}])expect(nativeRoundAdvancement({...view(),...change},next).canProceed).toBe(false)
})
test('score contribution is described independently from the percentage of contestants advancing',()=>{
 expect(nextRoundScorePolicy({rounds:[{name:'Preliminary',weight:30},{name:'Final',weight:70}]},null,next)).toBe('Final score contributions: Preliminary 30% + Final 70%.')
 expect(nextRoundScorePolicy(null,{scoreContributions:[{name:'Preliminary',weight:30},{name:'Final',weight:70}]},next)).toContain('Preliminary 30% + Final 70%')
 expect(nextRoundScorePolicy(null,null,{progression:'back_to_zero'})).toContain('starts with new scores')
})

test('readiness includes organizer deduction resolution only when rules apply to this round',()=>{
 const state={...view(),deductionsResolved:false,rules:{configuration_snapshot:{structure:'multiple',rounds:[{id:'pre'},{id:'final'}],scoringConfig:{deductionRules:[{id:'late',roundId:'pre',amount:2,units:'points'}]}}}}
 expect(nativeRoundAdvancement(state,next).checks).toContainEqual(['Configured organizer deductions resolved',false])
 state.rules.configuration_snapshot.scoringConfig.deductionRules[0].roundId='final'
 expect(nativeRoundAdvancement(state,next).checks.some(([label])=>label==='Configured organizer deductions resolved')).toBe(false)
})

test('blocked advancement gives the next authorized action instead of leaving disabled buttons unexplained',()=>{
 const state={...view(),calculation:{verified:false,finalized:false},reviewPolicy:{active:true,reviewerName:'Assigned Reviewer'}}
 expect(nativeRoundAdvancement(state,next).blocker).toMatchObject({stage:'results',label:'Open Finalization',message:expect.stringContaining('Assigned Reviewer must verify')})
 expect(nativeRoundAdvancement({...state,reviewPolicy:null},next).blocker.message).toContain('Assign an active independent reviewer')
 expect(nativeRoundAdvancement({...state,calculation:{verified:true}},next).blocker).toMatchObject({stage:'results',label:'Finalize this round'})
 expect(nativeRoundAdvancement({...state,calculation:null},next).blocker.stage).toBe('calculate')
 expect(nativeRoundAdvancement({...state,session:{status:'active'}},next).blocker.live).toBe(true)
 expect(nativeRoundAdvancement({...state,complete:false},next).blocker.stage).toBe('submissions')
 expect(nativeRoundAdvancement(view(),next).blocker).toBeNull()
})
