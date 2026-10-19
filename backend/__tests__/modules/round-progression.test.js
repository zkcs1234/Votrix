import {expect,test} from 'vitest'
import {effectiveRoundRules,participationFor,resolveRoundEntryIds,nextRound} from '../../../shared/competition-participation.js'
import {buildParticipationState} from '../../../shared/competition-participation-state.js'
const base={event:{id:'e',official_rules_id:'v'},scoringConfig:{calculationMethod:'weighted_average'},contestants:['a','b','c','registered'].map(id=>({id,name:id})),criteria:[{id:'crit'}],judges:[{judgeId:'j',role:'judge',isActive:true,accountStatus:'active'}],rounds:[
 {id:'pre',name:'Preliminary',displayOrder:0,purpose:'qualification',advancementType:'none',criteriaIds:['crit'],contestantIds:['a','b','c'],progression:'weighted',weight:30},
 {id:'special',name:'Award',displayOrder:1,purpose:'special',criteriaIds:['crit'],contestantIds:['registered']},
 {id:'final',name:'Final',displayOrder:2,purpose:'final',criteriaIds:['crit'],contestantIds:['registered'],progression:'back_to_zero',weight:70}],advancementDecisions:[],eligibilityDecisions:[]}
test.each(['back_to_zero','weighted'])('all continue derives the source field with %s independently of score use',progression=>{
 const f=structuredClone(base);f.rounds[2].progression=progression
 const p=participationFor(f,'final');expect(p.mode).toBe('all_continue');expect(p.protected).toBe(false);expect(p.assignedIds).toEqual(['a','b','c'])
 expect(nextRound(f.rounds,f.rounds[0]).id).toBe('final');expect(resolveRoundEntryIds(f,'special')).toEqual(['registered'])
 const state=buildParticipationState(f,{known:true});expect(state.rounds.final.phase).toBe('all_continue');expect(state.rounds.final.scoringStatus).toBe('not_open')
})
test.each(['top_n','top_percent','threshold','manual'])('%s waits for an approved decision and ignores independently planned Final memberships',type=>{
 const f=structuredClone(base);f.rounds[0].advancementType=type;f.rounds[0].advancementValue=2
 expect(resolveRoundEntryIds(f,'final')).toEqual([])
 f.advancementDecisions=[{id:'d',round_id:'pre',next_round_id:'final',rules_version:'old',qualifiers:['registered']},{id:'current',round_id:'pre',next_round_id:'final',rules_version:'v',qualifiers:['a','b']}]
 expect(resolveRoundEntryIds(f,'final')).toEqual(['a','b'])
 expect(buildParticipationState(f).rounds.final.phase).toBe('qualification_confirmed')
})
test('No Elimination respects source withdrawals, destination exclusions and custom division scope',()=>{
 const f=structuredClone(base);f.contestants[0].divisionId='junior';f.contestants[1].divisionId='open';f.contestants[2].divisionId='junior';f.rounds[2].divisionId='junior'
 f.eligibilityDecisions=[{rules_version:'v',contestant_id:'a',round_id:'pre',status:'approved'}]
 expect(resolveRoundEntryIds(f,'final')).toEqual(['c'])
 f.eligibilityDecisions.push({rules_version:'v',contestant_id:'c',round_id:'final',status:'approved'})
 expect(resolveRoundEntryIds(f,'final')).toEqual([])
})
test('elimination phases distinguish submission, calculation, verification and approval',()=>{
 const f=structuredClone(base);f.rounds[0].advancementType='top_n';f.rounds[0].advancementValue=2
 const context={known:true,rules:{id:'v',snapshot:f},session:{id:'s',rules_version:'v',status:'active',current_round_id:'pre'},submissions:[],calculations:[]}
 expect(buildParticipationState(f,context).rounds.final.phase).toBe('awaiting_results')
 context.submissions=[{id:'sub',version:1,status:'submitted',rules_version:'v',session_id:'s',round_id:'pre',judge_id:'j'}]
 expect(buildParticipationState(f,context).rounds.final.phase).toBe('awaiting_tabulation')
 context.calculations=[{id:'calc',rules_version:'v',round_id:'pre',session_id:'s',source_versions:[{id:'sub',version:1}],status:'ready_for_verification'}]
 expect(buildParticipationState(f,context).rounds.final.phase).toBe('awaiting_verification')
 context.calculations[0].status='under_verification';context.calculations[0].verified_at='saved'
 expect(buildParticipationState(f,context).rounds.final.phase).toBe('awaiting_approval')
 context.calculations[0].source_versions=[]
 expect(buildParticipationState(f,context).rounds.final.phase).toBe('awaiting_tabulation')
})
test('scoring is authorized only in the active round with open contestant and criterion gates',()=>{
 const f=structuredClone(base),context={known:true,session:{id:'s',rules_version:'v',status:'active',current_round_id:'final',access_config:{entries:{mode:'none',ids:[]}}}}
 expect(buildParticipationState(f,context).rounds.final.scoringStatus).toBe('closed')
 context.session.access_config.entries={mode:'selected',ids:['a']}
 expect(buildParticipationState(f,context).rounds.final.scoringStatus).toBe('partly_open')
 context.session.status='paused';expect(buildParticipationState(f,context).rounds.final.scoringStatus).toBe('paused')
 expect(effectiveRoundRules({...f,id:'v'},[],[]).rounds[2].contestantIds).toEqual(['a','b','c'])
})
test('confirmed empty qualifiers are distinct from missing participation data',()=>{
 const f=structuredClone(base);f.rounds[0].advancementType='manual'
 expect(buildParticipationState(f,{known:false}).rounds.final.phase).toBe('unavailable')
 f.advancementDecisions=[{id:'d',round_id:'pre',next_round_id:'final',rules_version:'v',qualifiers:[]}]
 expect(buildParticipationState(f).rounds.final.phase).toBe('no_qualifying_entries')
})
