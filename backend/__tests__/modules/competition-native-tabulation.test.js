import {expect,test} from 'vitest'
import {calculateNativeSnapshot,nativeDeductionsEnabled,nativeQualifierProposal} from '../../src/modules/competition-native-tabulation.js'
const snapshot=(method='weighted_average')=>({eventId:'event',competitionId:'child',roundId:null,complete:true,session:{id:'session',round_id:null,entry_ids:['one','two']},rules:{id:'rules',configuration_snapshot:{structure:'single',rounds:[],criteria:[{id:'criterion',roundId:null,name:'Technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[{id:'minor',name:'Skill',minScore:0,maxScore:10}]}],scoringConfig:{calculationMethod:method,decimalPlaces:2,dropLowest:1,dropHighest:0,tiePolicy:'shared',manualBasis:'Approved placements'}},participation_snapshot:[{id:'one',contestant_id:'master',entry_number:1},{id:'two',contestant_id:'master2',entry_number:2}],assignment_snapshot:['judge1','judge2','judge3'].map(judgeId=>({judgeId,judgeRole:'judge',round_id:null}))},submissions:['judge1','judge2','judge3'].map((judge_id,i)=>({id:`submission${i}`,judge_id,rules_version:'rules',sources:[{entry_id:'one',criterion_id:'criterion',scores:{minor:[8,7,6][i]},locked:true},{entry_id:'two',criterion_id:'criterion',scores:{minor:5},locked:true}]})),deductions:[]})

test.each(['weighted_average','rank_based'])('Preliminary inherits %s independently of a different Final method',method=>{
 const s=snapshot(method),cfg=s.rules.configuration_snapshot
 s.roundId='pre';s.session.round_id='pre';cfg.structure='multiple'
 cfg.criteria[0].roundId='pre'
 cfg.rounds=[
  {id:'pre',displayOrder:0,progression:'back_to_zero',advancementType:'top_n',advancementValue:1},
  {id:'final',displayOrder:1,progression:'back_to_zero',calculationMethod:method==='rank_based'?'weighted_average':'rank_based'},
 ]
 const before=calculateNativeSnapshot(s).output
 expect(before.results.map(row=>row.contestantId)).toEqual(['one','two'])
 expect(before.results.map(row=>row.rank)).toEqual([1,2])
 expect(nativeQualifierProposal(s,{finalized:true,output_snapshot:before}).automatic).toEqual(['one'])
 cfg.rounds[1].calculationMethod=method
 expect(calculateNativeSnapshot(s).output.results).toEqual(before.results)
})
function pageant(method='rank_based'){
 const s=snapshot(method)
 s.rules.participation_snapshot.push({id:'woman1',entry_number:3},{id:'woman2',entry_number:4})
 s.session.entry_ids.push('woman1','woman2')
 s.submissions.forEach(sub=>sub.sources.push({entry_id:'woman1',criterion_id:'criterion',scores:{minor:10}},{entry_id:'woman2',criterion_id:'criterion',scores:{minor:9}}))
 s.divisionRanking={mode:'division',version:1,divisions:[{id:'men',name:'MEN'},{id:'women',name:'WOMEN'}],entries:['one','two','woman1','woman2'].map((entryId,i)=>({entryId,divisionId:i<2?'men':'women',divisionName:i<2?'MEN':'WOMEN',contestantNumber:i%2+1}))}
 return s
}
test.each(['rank_based','weighted_average','sum'])('Pageant %s has separate division winners and changing Women cannot change Men',method=>{
 const s=pageant(method),before=calculateNativeSnapshot(s).output
 expect(before.results.find(r=>r.contestantId==='one')).toMatchObject({rank:1,divisionId:'men',contestantNumber:1})
 expect(before.results.find(r=>r.contestantId==='woman1')).toMatchObject({rank:1,divisionId:'women',contestantNumber:1})
 if(method==='rank_based'){
  expect(before.results.find(r=>r.contestantId==='one')).toMatchObject({baseScore:3,judgeRanks:{judge1:1,judge2:1,judge3:1}})
  expect(before.results.find(r=>r.contestantId==='woman1')).toMatchObject({baseScore:3,judgeRanks:{judge1:1,judge2:1,judge3:1}})
 }
 s.submissions.forEach(sub=>sub.sources.filter(row=>row.entry_id.startsWith('woman')).forEach(row=>{row.scores.minor=1}))
 const after=calculateNativeSnapshot(s).output
 expect(after.results.filter(r=>r.divisionId==='men')).toEqual(before.results.filter(r=>r.divisionId==='men'))
 expect(after.divisionRanking).toEqual(s.divisionRanking)
})
test('Pageant refuses an entry missing its division instead of falling back to event-wide ranks',()=>{
 const s=pageant();s.divisionRanking.entries.pop()
 expect(()=>calculateNativeSnapshot(s)).toThrow('authorized division')
})
test('Pageant top-N and percent advancement select independently inside each division, including ties',()=>{
 const s=pageant(),output=calculateNativeSnapshot(s).output
 s.roundId='pre';s.rules.configuration_snapshot.rounds=[{id:'pre',displayOrder:0,advancementType:'top_n',advancementValue:1},{id:'final',displayOrder:1}]
 expect(nativeQualifierProposal(s,{finalized:true,output_snapshot:output}).automatic.sort()).toEqual(['one','woman1'])
 s.rules.configuration_snapshot.rounds[0].advancementType='top_percent';s.rules.configuration_snapshot.rounds[0].advancementValue=50
 output.results.find(r=>r.contestantId==='woman2').rank=1
 expect(nativeQualifierProposal(s,{finalized:true,output_snapshot:output}).automatic.sort()).toEqual(['one','woman1','woman2'])
})
test('Pageant organizer placement penalties change only the affected division standings',()=>{
 const s=pageant()
 s.rules.configuration_snapshot.scoringConfig.deductionRules=[{id:'late',units:'placements'}]
 s.deductions=[{id:'penalty',rule_key:'late',entry_id:'woman1',status:'approve',rule_snapshot:{amount:5,units:'placements'}}]
 const output=calculateNativeSnapshot(s).output
 expect(output.results.find(r=>r.contestantId==='one')).toMatchObject({rank:1,finalScore:3})
 expect(output.results.find(r=>r.contestantId==='woman1')).toMatchObject({rank:2,baseScore:3,finalScore:8})
 expect(output.results.find(r=>r.contestantId==='woman2')).toMatchObject({rank:1,finalScore:6})
})
test.each([['weighted_average',70],['sum',210],['highest_score',80],['lowest_removal',75],['rank_based',3]])('%s reuses the official engine with explicit native identities', (method,total)=>{
 const s=snapshot(method),result=calculateNativeSnapshot(s);expect(result.output.results[0].finalScore).toBe(total);expect(result.output.worksheets[0].submissionId).toBe('submission0');expect(result.input.rules.judges.every(j=>j.assignments.length)).toBe(true)
 if(method==='rank_based'){
  expect(result.output.results[0].judgeRanks).toEqual({judge1:1,judge2:1,judge3:1})
  expect(result.output.results[1].judgeRanks).toEqual({judge1:2,judge2:2,judge3:2})
 }
})
test('entry criterion averages come from backend worksheet traces',()=>{
 const result=calculateNativeSnapshot(snapshot()).output
 expect(result.entryCriteriaAverages['single:one'].criteria.criterion).toBe(70)
 expect(result.entryCriteriaAverages['single:two'].criteria.criterion).toBe(50)
})
test('cleared current pointer cannot be replaced by historical snapshots or locked drafts',()=>{const s=snapshot();s.complete=false;expect(()=>calculateNativeSnapshot(s)).toThrow('current judge sheets')})
test('official calculation rejects precision inconsistent with frozen input rules',()=>{
 const s=snapshot();s.rules.configuration_snapshot.scoringConfig.inputDecimalPlaces=1;s.submissions[0].sources[0].scores.minor=8.55
 expect(()=>calculateNativeSnapshot(s)).toThrow('input precision')
 s.rules.configuration_snapshot.criteria[0].minorCriteria[0].decimalPlaces=2
 expect(calculateNativeSnapshot(s).output.ready).toBe(true)
})
test('approved numeric and rank-placement decisions apply once with existing signs',()=>{
 for(const [method,expected,units] of [['weighted_average',68,'points'],['rank_based',5,'placements']]){const s=snapshot(method);s.rules.configuration_snapshot.scoringConfig.deductionRules=[{id:'configured-rule',description:'Configured penalty',amount:2,units}];s.deductions=[{id:'penalty',rule_key:'configured-rule',entry_id:'one',status:'approve',rule_snapshot:{amount:2,units}},{id:'pending',rule_key:'configured-rule',entry_id:'one',status:'pending',rule_snapshot:{amount:99,units}}];expect(calculateNativeSnapshot(s).output.results.find(r=>r.contestantId==='one').finalScore).toBe(expected)}
})
test('deduction rows are ignored when organizer-managed deductions are not configured',()=>{
 const s=snapshot();s.deductions=[{id:'stale',rule_key:'removed-rule',entry_id:'one',status:'approve',rule_snapshot:{amount:50,units:'points'}}]
 expect(calculateNativeSnapshot(s).output.results.find(r=>r.contestantId==='one').finalScore).toBe(70)
})
test('deduction availability follows the selected round and configured carry policy',()=>{
 const s=snapshot();const cfg=s.rules.configuration_snapshot
 cfg.structure='multiple'
 cfg.rounds=[{id:'pre',displayOrder:0,progression:'back_to_zero'},{id:'final',displayOrder:1,progression:'carry_forward'}]
 cfg.scoringConfig.deductionRules=[{id:'pre-rule',roundId:'pre'},{id:'final-rule',roundId:'final'}]
 s.roundId='pre';expect(nativeDeductionsEnabled(s)).toBe(true)
 cfg.scoringConfig.deductionRules=[{id:'final-rule',roundId:'final'}]
 expect(nativeDeductionsEnabled(s)).toBe(false)
 s.roundId='final';expect(nativeDeductionsEnabled(s)).toBe(true)
 cfg.rounds[1].progression='back_to_zero';expect(nativeDeductionsEnabled(s)).toBe(true)
})
test('manual placements require explicit complete identities and reason; no fabricated numeric total',()=>{const s=snapshot('manual');expect(()=>calculateNativeSnapshot(s)).toThrow('manual placements');const {output}=calculateNativeSnapshot(s,{manualResults:[{contestantId:'one',rank:1},{contestantId:'two',rank:2}],reason:'Independent documented review'});expect(output.results.every(r=>r.manual&&r.finalScore===null&&r.baseScore===null)).toBe(true)})
test('qualification includes cutoff ties and requires finalized current output',()=>{
 const s=snapshot();s.roundId='pre';s.rules.configuration_snapshot.rounds=[{id:'pre',displayOrder:0,advancementType:'top_n',advancementValue:1,nextRoundId:'final'},{id:'final',displayOrder:1}]
 const c={finalized:true,output_snapshot:{results:[{contestantId:'one',rank:1,finalScore:80},{contestantId:'two',rank:1,finalScore:80}]}}
 expect(nativeQualifierProposal(s,c).automatic).toEqual(['one','two']);expect(()=>nativeQualifierProposal(s,{...c,finalized:false})).toThrow('Finalized')
})
test('qualification follows configured later rounds and skips intervening special rounds',()=>{
 const s=snapshot();s.roundId='pre';s.rules.configuration_snapshot.rounds=[{id:'pre',displayOrder:0,advancementType:'top_n',advancementValue:1},{id:'special',displayOrder:1,purpose:'special'},{id:'final',displayOrder:2}]
 const c={finalized:true,output_snapshot:{results:[{contestantId:'one',rank:1,finalScore:80}]}}
 expect(nativeQualifierProposal(s,c)).toMatchObject({fromRound:'pre',toRound:'final'})
})

test('rank percentage carry keeps numeric averages and ranks the combined judge totals, never ordinal ranks',()=>{
 const s=snapshot('rank_based'),cfg=s.rules.configuration_snapshot
 cfg.structure='multiple';cfg.scoringConfig.numericCarryBasis='weighted_judge_average'
 cfg.rounds=[{id:'pre',name:'Preliminary',displayOrder:0,progression:'weighted',weight:20},{id:'final',name:'Final',displayOrder:1,progression:'weighted',weight:80}]
 cfg.criteria=cfg.rounds.map(r=>({id:`criterion-${r.id}`,roundId:r.id,name:'Performance',percentage:100,minScore:0,maxScore:100,minorCriteria:[]}))
 const scope=(round,one,two)=>({session:{id:`session-${round}`,round_id:round,entry_ids:['one','two']},submissions:['judge1','judge2','judge3'].map(judge_id=>({id:`${round}-${judge_id}`,judge_id,rules_version:'rules',sources:[{entry_id:'one',scores:{[`criterion-${round}`]:one}},{entry_id:'two',scores:{[`criterion-${round}`]:two}}]}))})
 const pre=scope('pre',86.5,90),final=scope('final',92,80)
 s.roundId='final';s.session=final.session;s.submissions=final.submissions;s.scopes=[pre,final]
 const {output}=calculateNativeSnapshot(s)
 expect(output.results[0]).toMatchObject({contestantId:'one',rank:1,finalScore:3,numericCarryScore:90.9})
 expect(output.results[0].judgeRanks).toEqual({judge1:1,judge2:1,judge3:1})
 expect(output.results[1]).toMatchObject({contestantId:'two',rank:2,finalScore:6,numericCarryScore:82})
 expect(output.worksheets.find(w=>w.roundId==='final'&&w.entryId==='one').carryNumericTotal).toBe(90.9)
 s.divisionRanking={mode:'division',divisions:[{id:'men',name:'MEN'},{id:'women',name:'WOMEN'}],entries:[{entryId:'one',divisionId:'men',divisionName:'MEN',contestantNumber:1},{entryId:'two',divisionId:'women',divisionName:'WOMEN',contestantNumber:1}]}
 const divided=calculateNativeSnapshot(s).output
 expect(divided.results.every(row=>row.rank===1&&row.finalScore===3)).toBe(true)
 expect(divided.results.find(r=>r.contestantId==='two').judgeRanks).toEqual({judge1:1,judge2:1,judge3:1})
 delete s.divisionRanking
 cfg.scoringConfig.deductionRules=[{id:'pre-points',units:'points',roundId:'pre'},{id:'final-points',units:'points',roundId:'final'},{id:'overall-points',units:'points'},{id:'final-placement',units:'placements',roundId:'final'}]
 s.allDeductions=[{id:'pre-points',rule_key:'pre-points',entry_id:'one',status:'approve',rule_snapshot:{amount:5,units:'points',roundId:'pre'}},{id:'final-points',rule_key:'final-points',entry_id:'one',status:'approve',rule_snapshot:{amount:5,units:'points',roundId:'final'}},{id:'overall-points',rule_key:'overall-points',entry_id:'one',status:'approve',rule_snapshot:{amount:2,units:'points',roundId:null}},{id:'final-placement',rule_key:'final-placement',entry_id:'one',status:'approve',rule_snapshot:{amount:2,units:'placements',roundId:'final'}}]
 const penalized=calculateNativeSnapshot(s).output
 expect(penalized.results.find(r=>r.contestantId==='one')).toMatchObject({numericCarryScore:83.9,pointDeductionTotal:7,baseScore:3,finalScore:5,deductionTotal:2})
 expect(penalized.worksheets.find(w=>w.roundId==='final'&&w.entryId==='one').carryNumericTotal).toBeCloseTo(83.9,6)
 delete s.allDeductions
 s.roundId='pre';s.session=pre.session;s.submissions=pre.submissions;s.scopes=[pre]
 expect(calculateNativeSnapshot(s).output.results.find(r=>r.contestantId==='one')).toMatchObject({finalScore:6,numericScore:86.5})
})
