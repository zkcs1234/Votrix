import { expect, test } from 'vitest'
import { calculateOfficial, championshipField } from '../../../shared/competition-calculation.js'
const rules={id:'v',event:{id:'e'},scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2},rounds:[],categories:[],contestants:[{id:'a',name:'A'},{id:'b',name:'B'}],criteria:[{id:'c',name:'Quality',percentage:100,minorCriteria:[{id:'m',minScore:0,maxScore:10}]}],judges:[{judgeId:'j',role:'judge',isActive:true}]}
const submission=(values)=>({id:'s',version:1,rules_version:'v',round_id:null,judge_id:'j',status:'submitted',sources:Object.entries(values).map(([contestantId,score])=>({contestantId,scores:{m:score}}))})
test('true zero is complete; absent values are missing and never fabricated zeros',()=>{
 const complete=calculateOfficial(rules,[submission({a:0,b:8})]);expect(complete.ready).toBe(true);expect(complete.results.find(r=>r.contestantId==='a').finalScore).toBe(0)
 const incomplete=calculateOfficial(rules,[submission({a:0})]);expect(incomplete.ready).toBe(false);expect(incomplete.results.find(r=>r.contestantId==='b').finalScore).toBeNull()
})
test('sum aggregates complete judge totals and approved penalties once',()=>{
 const r={...rules,scoringConfig:{...rules.scoringConfig,calculationMethod:'sum'},judges:[...rules.judges,{judgeId:'k',role:'judge'}]}
 const result=calculateOfficial(r,[submission({a:9,b:8}),{...submission({a:8,b:7}),id:'t',judge_id:'k'}],{deductions:[{contestant_id:'a',decision_status:'approved',amount:5},{contestant_id:'a',decision_status:'pending',amount:100}]})
 expect(result.results[0].finalScore).toBe(165)
})
test('points basis scores one major criterion per judge and averages judge point totals',()=>{
 const pointRules={...rules,scoringConfig:{...rules.scoringConfig,criterionBasis:'points'},criteria:[
  {id:'c1',name:'Concept',maxScore:10,minScore:0,minorCriteria:[{id:'m1',name:'Guideline'}]},
  {id:'c2',name:'Technique',maxScore:10,minScore:0,minorCriteria:[{id:'m2',name:'Guideline'}]},
 ]}
 const pointSubmission=values=>({...submission({}),sources:Object.entries(values).map(([contestantId,scores])=>({contestantId,scores}))})
 const result=calculateOfficial({...pointRules,contestants:[{id:'a',name:'A'}]},[
  pointSubmission({a:{c1:8,c2:9}}),
 ])
 expect(result.results[0]).toMatchObject({contestantId:'a',finalScore:17,baseScore:17})
 expect(result.worksheets[0].criteria[0]).toMatchObject({maxScore:10,raw:8})
})
test('points basis supports rank-based placement using major point totals',()=>{
 const pointRules={...rules,scoringConfig:{...rules.scoringConfig,criterionBasis:'points',calculationMethod:'rank_based'},criteria:[
  {id:'c1',name:'Concept',maxScore:10,minScore:0,minorCriteria:[{id:'m1',name:'Guideline'}]},
 ]}
 const pointSubmission=values=>({...submission({}),sources:Object.entries(values).map(([contestantId,score])=>({contestantId,scores:{c1:score}}))})
 const result=calculateOfficial(pointRules,[pointSubmission({a:9,b:7})])
 expect(result.results[0]).toMatchObject({contestantId:'a',placementTotal:1})
})
test('rank aggregation keeps compatible objects and lower placements win',()=>{
 const result=calculateOfficial({...rules,scoringConfig:{...rules.scoringConfig,calculationMethod:'rank_based'}},[submission({a:9,b:8})]);expect(result.results[0].contestantId).toBe('a');expect(result.results[0].placementTotal).toBe(1);expect(result.results[0].perCriterion).toEqual({})
})
test('back-to-zero final excludes qualification points',()=>{
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',weight:100,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'back_to_zero',weight:100,contestantIds:['a','b'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:10,b:5}),round_id:'pre'},{...submission({a:6,b:9}),round_id:'final'}]);expect(result.results[0].contestantId).toBe('b');expect(result.results[0].finalScore).toBe(90)
})
test('carry-forward uses prior scores and an event-wide offense is deducted only once',()=>{
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',displayOrder:0,weight:50,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'carry_forward',displayOrder:1,weight:50,contestantIds:['a','b'],criteriaIds:['c']}]}
 const sources=[{...submission({a:8,b:6}),round_id:'pre'},{...submission({a:7,b:9}),round_id:'final'}]
 const round=calculateOfficial(r,sources,{roundId:'final'});expect(round.results[0].finalScore).toBe(150)
 const plain={...r,rounds:r.rounds.map(x=>({...x,progression:'weighted'}))}
 const overall=calculateOfficial(plain,sources,{deductions:[{contestant_id:'a',decision_status:'approved',amount:5,round_id:null}]});expect(overall.results.find(x=>x.contestantId==='a').finalScore).toBe(70)
})
test('one independent round does not require a contribution weight',()=>{
 const r={...rules,rounds:[{id:'single',purpose:'regular',progression:'back_to_zero',weight:0,contestantIds:['a','b'],criteriaIds:['c']}]}
 expect(calculateOfficial(r,[{...submission({a:8,b:9}),round_id:'single'}]).results[0].finalScore).toBe(90)
})

test('independent final readiness excludes preliminary and special-award inputs',()=>{
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',weight:100,contestantIds:['a','b'],criteriaIds:['c']},{id:'award',purpose:'special',progression:'back_to_zero',weight:0,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'back_to_zero',weight:0,contestantIds:['a','b'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:6,b:9}),round_id:'final'}]);expect(result.ready).toBe(true);expect(result.worksheets.every(w=>w.roundId==='final')).toBe(true)
})
test('non-competing entries are excluded instead of creating an incomplete official zero row',()=>{
 const r={...rules,rounds:[{id:'round',purpose:'regular',progression:'weighted',weight:100,contestantIds:['a','b'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:6}),round_id:'round'}],{eligibility:[{contestant_id:'b',status:'approved',round_id:null}]});expect(result.ready).toBe(true);expect(result.results.map(r=>r.contestantId)).toEqual(['a'])
})

test('highest-criterion tie breaking compares panel means, not the best individual judge',()=>{
 const r={...rules,scoringConfig:{...rules.scoringConfig,tiePolicy:'highest_criterion'},criteria:[{...rules.criteria[0],percentage:50},{id:'second',name:'Other',percentage:50,minorCriteria:[{id:'n',minScore:0,maxScore:10}]}],judges:[...rules.judges,{judgeId:'k',role:'judge'}]}
 const source=(judge,a,b)=>({...submission({}),judge_id:judge,sources:[{contestantId:'a',scores:{m:a,n:a}},{contestantId:'b',scores:{m:b,n:4}}]})
 const result=calculateOfficial(r,[source('j',10,6),source('k',0,6)])
 expect(result.results[0]).toMatchObject({contestantId:'b',finalScore:50,tieKey:60,rank:1});expect(result.results[1].rank).toBe(2)
})

test('carry-forward breakdown keeps the summed base and deductions traceable',()=>{
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',displayOrder:0,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'carry_forward',displayOrder:1,contestantIds:['a','b'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:8,b:6}),round_id:'pre'},{...submission({a:7,b:9}),round_id:'final'}],{roundId:'final',deductions:[{contestant_id:'a',decision_status:'approved',round_id:'pre',amount:2}]})
 expect(result.results.find(r=>r.contestantId==='a')).toMatchObject({baseScore:150,deductionTotal:2,finalScore:148})
})
test('a non-competing finalist is not converted into a zero carry-forward result',()=>{
 const r={...rules,rounds:[{id:'final',purpose:'final',progression:'carry_forward',displayOrder:0,contestantIds:['a','b'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:8}),round_id:'final'}],{roundId:'final',eligibility:[{contestant_id:'b',status:'approved',round_id:'final'}]})
 expect(result.ready).toBe(true);expect(result.results.map(r=>r.contestantId)).toEqual(['a'])
})

test('weighted championship contains approved finalists only and retains eliminated Preliminary history', () => {
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',displayOrder:0,weight:40,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'weighted',displayOrder:1,weight:60,contestantIds:['a'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:10,b:9}),round_id:'pre'},{...submission({a:0}),round_id:'final'}],{deductions:[{contestant_id:'a',round_id:'final',decision_status:'approved',amount:10}]})
 expect(result.ready).toBe(true)
 expect(result.results).toEqual([expect.objectContaining({contestantId:'a',finalScore:34,rank:1})])
 expect(result.roundResults.find(row=>row.roundId==='pre'&&row.contestantId==='b').finalScore).toBe(90)
})

test('weighted finalist requires every applicable submitted round rather than just the cells it already has', () => {
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',weight:40,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'weighted',weight:60,contestantIds:['a'],criteriaIds:['c']}]}
 for(const sources of [[{...submission({a:10,b:9}),round_id:'pre'}],[{...submission({b:9}),round_id:'pre'},{...submission({a:8}),round_id:'final'}]]) {
  const result=calculateOfficial(r,sources)
  expect(result.ready).toBe(false)
  expect(result.results).toEqual([expect.objectContaining({contestantId:'a',finalScore:null,rank:null,status:'Incomplete'})])
 }
})

test('unconfirmed empty Final field cannot crown an earlier-round contestant', () => {
 const r={...rules,rounds:[{id:'pre',purpose:'qualification',progression:'weighted',weight:40,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'weighted',weight:60,contestantIds:[],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:10,b:9}),round_id:'pre'}])
 expect(result.results).toEqual([]);expect(result.ready).toBe(false)
})

test('weighted no-elimination division/category arithmetic and special-award exclusions remain intact', () => {
 const r={...rules,scoringConfig:{...rules.scoringConfig,perDivision:true},contestants:rules.contestants.map((entry,index)=>({...entry,divisionId:`division-${index}`})),categories:[{id:'category',weight:50}],rounds:[{id:'pre',purpose:'qualification',progression:'weighted',weight:40,categoryId:'category',contestantIds:['a','b'],criteriaIds:['c']},{id:'award',purpose:'special',progression:'back_to_zero',weight:0,contestantIds:['a','b'],criteriaIds:['c']},{id:'final',purpose:'final',progression:'weighted',weight:60,categoryId:'category',contestantIds:['a','b'],criteriaIds:['c']}]}
 const result=calculateOfficial(r,[{...submission({a:10,b:9}),round_id:'pre'},{...submission({a:8,b:7}),round_id:'final'}])
 expect(result.ready).toBe(true)
 expect(result.results.map(row=>[row.contestantId,row.finalScore,row.rank])).toEqual([['a',44,1],['b',39,1]])
 expect(result.worksheets.some(row=>row.roundId==='award')).toBe(false)
})

test('championship manual field follows explicit Final and approved exclusions', () => {
 const r={...rules,scoringConfig:{...rules.scoringConfig,finalRoundId:'chosen'},rounds:[{id:'chosen',purpose:'regular',contestantIds:['a','b']},{id:'other',purpose:'final',contestantIds:['b']}]}
 expect(championshipField(r,{eligibility:[{contestant_id:'b',round_id:'chosen',status:'approved'}]}).entries.map(entry=>entry.id)).toEqual(['a'])
 expect(championshipField(rules).entries.map(entry=>entry.id)).toEqual(['a','b'])
})
