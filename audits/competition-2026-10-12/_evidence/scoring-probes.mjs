// Audit-only pure probes. Imports the existing engine; no DB/client/server.
import assert from 'node:assert/strict'
import { calculateOfficial } from '../../../shared/competition-calculation.js'
import { selectQualifiers } from '../../../backend/src/modules/advancement.js'

const rules = {
  id: 'rules', event: {id:'event'}, scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2,tiePolicy:'shared'},
  rounds:[], categories:[], divisions:[],
  contestants:[{id:'A',name:'A'},{id:'B',name:'B'},{id:'C',name:'C'}],
  criteria:[{id:'beauty',name:'Beauty',percentage:40,minorCriteria:[{id:'m1',minScore:0,maxScore:40}]},
    {id:'stage',name:'Stage',percentage:30,minorCriteria:[{id:'m2',minScore:0,maxScore:30}]},
    {id:'answer',name:'Answer',percentage:20,minorCriteria:[{id:'m3',minScore:0,maxScore:20}]},
    {id:'appeal',name:'Appeal',percentage:10,minorCriteria:[{id:'m4',minScore:0,maxScore:10}]}],
  judges:['J1','J2','J3'].map(judgeId=>({judgeId,role:'judge',isActive:true}))
}
const make = (judge_id,round_id,values) => ({id:`${judge_id}:${round_id}`,judge_id,round_id,status:'submitted',rules_version:'rules',version:1,
  sources:Object.entries(values).map(([contestantId,p])=>({contestantId,scores:{m1:p*0.4,m2:p*0.3,m3:p*0.2,m4:p*0.1}}))})
const submissions = [make('J1',null,{A:90,B:80,C:70}),make('J2',null,{A:86,B:90,C:70}),make('J3',null,{A:92,B:80,C:70})]
const numeric = {}
for (const calculationMethod of ['weighted_average','sum','highest_score','lowest_removal','rank_based']) {
  const state=calculateOfficial({...rules,scoringConfig:{...rules.scoringConfig,calculationMethod,dropLowest:1,dropHighest:1}},submissions)
  numeric[calculationMethod]={results:state.results.map(r=>({id:r.contestantId,score:r.finalScore,rank:r.rank})),A:state.worksheets.filter(w=>w.entryId==='A').map(w=>w.total)}
}
assert.deepEqual(numeric.weighted_average.A,[90,86,92])
assert.equal(numeric.weighted_average.results[0].score,89.33)
assert.equal(numeric.sum.results[0].score,268)
assert.equal(numeric.highest_score.results[0].score,92)
assert.equal(numeric.lowest_removal.results[0].score,90)

const ties=calculateOfficial(rules,[make('J1',null,{A:90,B:90,C:80}),make('J2',null,{A:90,B:90,C:80}),make('J3',null,{A:90,B:90,C:80})])
assert.deepEqual(ties.results.map(r=>r.rank),[1,1,3])
assert.deepEqual([...selectQualifiers(ties.results.map(r=>({contestantId:r.contestantId,rank:r.rank,score:r.finalScore})),'top_n',1)],['A','B'])

const weightedRules={...rules,judges:[rules.judges[0]],contestants:rules.contestants.slice(0,2),rounds:[
  {id:'Preliminary',name:'Preliminary',purpose:'qualification',displayOrder:0,progression:'weighted',weight:40,advancementType:'top_n',advancementValue:1,contestantIds:['A','B'],criteriaIds:rules.criteria.map(c=>c.id)},
  {id:'Final',name:'Final',purpose:'final',displayOrder:1,progression:'weighted',weight:60,contestantIds:['A'],criteriaIds:rules.criteria.map(c=>c.id)}
]}
const weightedField=calculateOfficial(weightedRules,[make('J1','Preliminary',{A:100,B:90}),make('J1','Final',{A:0})],{deductions:[{contestant_id:'A',round_id:'Final',decision_status:'approved',amount:10}]})
// A wins Preliminary Top 1 and is the sole approved Final qualifier; B is
// eliminated. The Final raw zero is valid. This probes the combined engine
// scope after approval; it does not bypass the advancement RPC.
assert.equal(weightedField.results[0].contestantId,'B')
assert.equal(weightedField.results[0].finalScore,36)
assert.equal(weightedField.ready,true)

const missing=calculateOfficial(rules,submissions.slice(0,2))
assert.equal(missing.ready,false)
assert.equal(missing.results[0].finalScore,null)
const divided=calculateOfficial({...rules,contestants:rules.contestants.map(e=>({...e,divisionId:e.id==='C'?'Women':'Men'})),scoringConfig:{...rules.scoringConfig,perDivision:true}},submissions)
assert.deepEqual(divided.results.map(r=>r.rank),[1,2,1])
// Supply exact decimal inputs, avoiding a JS multiplication in the fixture.
const precisionRules={...rules,judges:[rules.judges[0]],criteria:[{id:'quality',name:'Quality',percentage:100,minorCriteria:[{id:'m',minScore:0,maxScore:100}]}]}
const precision=calculateOfficial(precisionRules,[{...make('J1',null,{}),sources:[{contestantId:'A',scores:{m:'89.335'}},{contestantId:'B',scores:{m:'89.334'}},{contestantId:'C',scores:{m:'70'}}]}])
assert.deepEqual(precision.results.map(r=>r.finalScore),[89.34,89.33,70])
console.log(JSON.stringify({numeric,ties:ties.results.map(r=>({id:r.contestantId,score:r.finalScore,rank:r.rank})),top1IncludesTie:['A','B'],weightedNonFinalistIncluded:{ready:weightedField.ready,results:weightedField.results.map(r=>({id:r.contestantId,score:r.finalScore,rank:r.rank,rounds:Object.keys(r.perRound)}))},missingPanel:{ready:missing.ready,scores:missing.results.map(r=>r.finalScore)},divided:divided.results.map(r=>({id:r.contestantId,division:r.divisionId,rank:r.rank})),precision:precision.results.map(r=>({id:r.contestantId,score:r.finalScore}))},null,2))
