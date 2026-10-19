import {writeFileSync} from 'node:fs'
import {calculateNativeSnapshot} from '../../backend/src/modules/competition-native-tabulation.js'
const names=['Red Bison','Liam Reyes','Noah Torres','Lucas Valdez','Maya Santos','Chloe Garcia','Althea Mendoza','Sofia Dimac']
const ids=names.map((_,i)=>`entry-${i}`)
const groups=[{id:'men',name:'MEN'},{id:'women',name:'WOMEN'}]
const criteria=[{id:'choreo',name:'Production Number & Casual Wear',roundId:null,percentage:40,minScore:0,maxScore:10,minorCriteria:[]},{id:'attire',name:'Creative / Themed Attire',roundId:null,percentage:40,minScore:0,maxScore:10,minorCriteria:[]},{id:'wit',name:'Introduction & Wit Segment',roundId:null,percentage:20,minScore:0,maxScore:10,minorCriteria:[]}]
const metadata=ids.map((entryId,i)=>({entryId,divisionId:i<4?'men':'women',divisionName:i<4?'MEN':'WOMEN',contestantNumber:i%4+1}))
const entries=metadata.map((e,i)=>({...e,id:e.entryId,name:names[i]}))
const progress=['judge-1','judge-2'].map((judgeId,i)=>({judgeId,judgeName:`Judge ${i+1}`,submitted:true,submissionId:`submission-${i}`,submittedAt:'2026-10-19T01:20:00Z'}))
const snapshot={eventId:'event',competitionId:'pageant',roundId:null,viewerId:'owner',complete:true,session:{id:'session',round_id:null,status:'closed',entry_ids:ids},progress,entries,sourceDigest:'fixture',deductionsResolved:true,deductions:[],reviewPolicy:null,divisionRanking:{mode:'division',version:1,divisions:groups,entries:metadata},rules:{id:'rules',version:1,configuration_snapshot:{structure:'single',rounds:[],criteria,scoringConfig:{calculationMethod:'rank_based',decimalPlaces:2,tiePolicy:'shared',deductionMode:'none',deductionRules:[]}},participation_snapshot:ids.map((id,i)=>({id,contestant_id:`master-${i}`,entry_number:i+1})),assignment_snapshot:progress.map(j=>({judgeId:j.judgeId,judgeRole:'judge',round_id:null}))},submissions:progress.map((judge,j)=>({id:judge.submissionId,session_id:'session',round_id:null,judge_id:judge.judgeId,rules_version:'rules',submitted_at:judge.submittedAt,sources:entries.flatMap((entry,i)=>criteria.map((c,k)=>({entry_id:entry.id,criterion_id:c.id,session_id:'session',judge_id:judge.judgeId,locked:true,revision:1,scores:{[c.id]:(i<4?8:10)-(i%4)*.5-(j+k)*.1}})))}))}
const {input,output}=calculateNativeSnapshot(snapshot)
snapshot.calculation={id:'calculation',version:2,verified:false,finalized:false,source_digest:'fixture',input_snapshot:input,output_snapshot:output}
writeFileSync(new URL('./pageant-tabulation-snapshot.json',import.meta.url),JSON.stringify(snapshot))
