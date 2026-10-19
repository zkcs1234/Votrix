// Receives a localhost-only SQL runner from test-competition-participation.mjs.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {calculateOfficial} from '../../shared/competition-calculation.js'
import {effectiveRoundRules} from '../../shared/competition-participation.js'
import {selectQualifiers} from '../src/modules/advancement.js'
export function checkRoundProgression(sql){
 const owner='10000000-0000-0000-0000-000000000001',judge='10000000-0000-0000-0000-000000000002',reviewer='10000000-0000-0000-0000-000000000003'
 const literal=value=>`'${String(value).replaceAll("'","''")}'`,json=value=>`${literal(JSON.stringify(value))}::jsonb`
 const run=source=>sql(['-At','-c',source]).stdout.trim(),read=source=>JSON.parse(run(source))
 const blocked=(statement,message)=>run(`DO $$ BEGIN BEGIN ${statement};RAISE EXCEPTION 'UNEXPECTED_SUCCESS';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE ${literal(message+'%')} THEN RAISE;END IF;END;END;$$;`)
 const publish=(event,rules)=>{
  rules.registrationSource=read(`SELECT competition_registration_source('${event}')`);rules.criteriaSource=read(`SELECT competition_criteria_source('${event}')`);rules.participationModel=2
  run(`SELECT competition_publish_rules('${event}','${owner}','${rules.id}',${json(rules)})`)
  return read(`SELECT competition_operational_action('${event}','${owner}',NULL,'start','{}')`)
 }
 const write=(event,session,round,rules,entry,criterion,score)=>run(`SELECT competition_scoring_write('${event}','${judge}',${json({sessionId:session.id,judgeId:judge,rulesVersion:rules.id,roundId:round})},'lock',${json({contestantId:entry,criteriaId:criterion,scores:{[criterion]:score}})})`)
 const submit=(event,session,round,rules)=>run(`SELECT competition_scoring_write('${event}','${judge}',${json({sessionId:session.id,judgeId:judge,rulesVersion:rules.id,roundId:round})},'submit','{}')`)
 const sources=event=>read(`SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM competition_round_submissions s WHERE event_id='${event}' AND status='submitted'`)
 const activate=(event,session,round)=>read(`SELECT competition_operational_action('${event}','${owner}','${session.id}','round',${json({roundId:round})})`)
 const arraySql=ids=>`ARRAY[${ids.map(id=>`${literal(id)}::uuid`).join(',')}]::uuid[]`
 const scoreSources=(event,session,rules,round,ids,criterion,values)=>{for(let i=0;i<ids.length;i++)write(event,session,round,rules,ids[i],criterion,values[i]);submit(event,session,round,rules)}
 const event='31000000-0000-0000-0000-000000000001',pre='51000000-0000-0000-0000-000000000001',final='51000000-0000-0000-0000-000000000002',special='51000000-0000-0000-0000-000000000003',criterion='61000000-0000-0000-0000-000000000001'
 const entries=read(`SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'contestantNumber',contestant_number,'divisionId',division_id) ORDER BY contestant_number) FROM competition_contestants WHERE event_id='${event}'`)
 assert.equal(Number(run(`SELECT count(*) FROM competition_round_contestants WHERE round_id='${final}'`)),1,'097 must preserve legacy memberships on installation')
 const ids=entries.slice(0,2).map(e=>e.id),rules={id:crypto.randomUUID(),event:{id:event},scoringConfig:{confirmed:true,calculationMethod:'weighted_average',decimalPlaces:2,tiePolicy:'shared',independentApproval:false},contestants:entries,judges:[{judgeId:judge,role:'judge'}],categories:[],divisions:[],criteria:[{id:criterion,name:'Quality',percentage:100,minScore:0,maxScore:100,minorCriteria:[]}],rounds:[{id:pre,name:'Preliminary',purpose:'qualification',displayOrder:0,advancementType:'none',criteriaIds:[criterion],contestantIds:ids,progression:'weighted',weight:30},{id:final,name:'Final',purpose:'final',displayOrder:1,criteriaIds:[criterion],contestantIds:[entries[2].id],progression:'weighted',weight:70},{id:special,name:'Special Award',purpose:'special',displayOrder:2,criteriaIds:[criterion],contestantIds:[],progression:'back_to_zero',weight:0}]}
 let session=publish(event,rules)
 assert.deepEqual(read(`SELECT competition_round_roster('${event}','${rules.id}','${final}')`),ids)
 assert.deepEqual(read(`SELECT competition_round_roster('${event}','${rules.id}','${special}')`),[])
 blocked(`SELECT competition_set_round_membership('${event}','${owner}','${final}','${entries[2].id}',true)`,'OFFICIAL_SETUP_FROZEN')
 blocked(`SELECT competition_scoring_write('${event}','${judge}',${json({sessionId:session.id,judgeId:judge,rulesVersion:rules.id,roundId:final})},'lock',${json({contestantId:ids[0],criteriaId:criterion,scores:{[criterion]:90}})})`,'STALE_CONTEXT')
 session=activate(event,session,final)
 assert.deepEqual(session.contestant_order.sort(),ids)
 assert.equal(Number(run(`SELECT count(*) FROM competition_advancement_decisions WHERE event_id='${event}'`)),0)
 assert.equal(Number(run(`SELECT count(*) FROM competition_round_contestants WHERE round_id='${final}'`)),2)
 blocked(`INSERT INTO competition_round_contestants(round_id,contestant_id) VALUES('${pre}','${entries[2].id}')`,'OFFICIAL_SETUP_FROZEN')
 run(`SELECT competition_operational_action('${event}','${owner}','${session.id}','access',${json({kind:'entries',gate:{mode:'none',ids:[]}})})`)
 blocked(`SELECT competition_scoring_write('${event}','${judge}',${json({sessionId:session.id,judgeId:judge,rulesVersion:rules.id,roundId:final})},'lock',${json({contestantId:ids[0],criteriaId:criterion,scores:{[criterion]:90}})})`,'SCORING_ACCESS_CLOSED')
 run(`SELECT competition_operational_action('${event}','${owner}','${session.id}','access',${json({kind:'entries',gate:{mode:'all',ids:[]}})})`)
 scoreSources(event,session,rules,final,ids,criterion,[90,88]);session=activate(event,session,pre);scoreSources(event,session,rules,pre,ids,criterion,[85,80])
 const submitted=sources(event),effective=effectiveRoundRules(rules)
 assert.equal(calculateOfficial(effective,submitted).results.find(r=>r.contestantId===ids[0]).finalScore,88.5)
 const independent=structuredClone(effective);independent.rounds.find(r=>r.id===final).progression='back_to_zero'
 assert.equal(calculateOfficial(independent,submitted).results.find(r=>r.contestantId===ids[0]).finalScore,90)
 assert.equal(read(`SELECT competition_participation_context('${event}','${owner}')`).known,true)
 blocked(`SELECT competition_participation_context('${event}','${judge}')`,'ORGANIZER_FORBIDDEN')
 console.log('PASS: existing No Elimination roster preserved until activation; source eligibility, closed/open judging, no qualification decision, special-award isolation, and unchanged Back to Zero/weighted formulas')
 for(const [type,value] of [['top_n',2],['top_percent',50],['threshold',90],['manual',null]]){
  const e=crypto.randomUUID(),p=crypto.randomUUID(),f=crypto.randomUUID(),c=crypto.randomUUID(),v=crypto.randomUUID(),all=Array.from({length:5},()=>crypto.randomUUID()),initial=all.slice(0,4)
  run(`INSERT INTO events(id,organization_id) VALUES('${e}','20000000-0000-0000-0000-000000000001');INSERT INTO competition_rounds(id,event_id,name,display_order,weight,workflow,advancement_type,advancement_value) VALUES('${p}','${e}','Preliminary',0,30,'{"purpose":"qualification","progression":"weighted"}','${type}',${value??'NULL'}),('${f}','${e}','Final',1,70,'{"purpose":"final","progression":"weighted"}','none',NULL);INSERT INTO competition_criteria(id,event_id,name,percentage,min_score,max_score) VALUES('${c}','${e}','Quality',100,0,100);INSERT INTO competition_round_criteria(round_id,criteria_id) VALUES('${p}','${c}'),('${f}','${c}');INSERT INTO event_participants(event_id,user_id,judge_role) VALUES('${e}','${judge}','judge'),('${e}','${reviewer}','score_reviewer');${all.map((id,i)=>`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${id}','${e}','Entry ${i+1}',${i+1});`).join('')}${initial.map(id=>`SELECT competition_set_round_membership('${e}','${owner}','${p}','${id}',true);`).join('')}`)
  const model={...structuredClone(rules),id:v,event:{id:e},contestants:all.map((id,i)=>({id,name:`Entry ${i+1}`,contestantNumber:i+1})),criteria:[{id:c,name:'Quality',percentage:100,minScore:0,maxScore:100,minorCriteria:[]}],rounds:[{id:p,name:'Preliminary',purpose:'qualification',displayOrder:0,advancementType:type,advancementValue:value,contestantIds:initial,criteriaIds:[c],progression:'weighted',weight:30},{id:f,name:'Final',purpose:'final',displayOrder:1,contestantIds:[],criteriaIds:[c],progression:'weighted',weight:70}],scoringConfig:{...rules.scoringConfig,independentApproval:true,verifierId:reviewer}}
  let current=publish(e,model)
  blocked(`SELECT competition_operational_action('${e}','${owner}','${current.id}','round',${json({roundId:f})})`,'QUALIFICATION_NOT_CONFIRMED')
  scoreSources(e,current,model,p,initial,c,[95,90,90,80]);const before=sources(e)
  const standing=calculateOfficial(effectiveRoundRules(model),before,{roundId:p});assert.equal(standing.ready,true)
  const qualifiers=type==='manual'?[initial[1]]:[...selectQualifiers(standing.results.map(row=>({contestantId:row.contestantId,rank:row.rank,score:row.finalScore})),type,value)]
  if(type!=='manual')assert.equal(qualifiers.length,3)
  const calc=crypto.randomUUID(),sourceVersions=before.map(s=>({id:s.id,version:s.version}))
  run(`INSERT INTO competition_result_calculations(id,event_id,session_id,round_id,rules_version,status,created_by,result_snapshot,source_versions,source_digest) VALUES('${calc}','${e}','${current.id}','${p}','${v}','ready_for_verification','${owner}',${json(standing.results)},${json(sourceVersions)},'local-fixture')`)
  const approve=`SELECT competition_confirm_advancement('${e}','${owner}','${p}','${f}','${calc}',${arraySql(qualifiers)},'Published ${type} rule')`
  blocked(approve,'VERIFIED_ROUND_REQUIRED');run(`SELECT competition_result_transition('${e}','${reviewer}','${calc}','verify','local-fixture','Independent verification')`);run(approve)
  const decision=read(`SELECT to_jsonb(d) FROM competition_advancement_decisions d WHERE event_id='${e}'`)
  current=activate(e,current,f);assert.deepEqual([...current.contestant_order].sort(),[...qualifiers].sort());assert.deepEqual(sources(e),before,'Advancement rewrote submitted sources')
  blocked(`SELECT competition_scoring_write('${e}','${judge}',${json({sessionId:current.id,judgeId:judge,rulesVersion:v,roundId:f})},'lock',${json({contestantId:all[4],criteriaId:c,scores:{[c]:99}})})`,'ENTRY_NOT_QUALIFIED_FOR_ROUND')
  scoreSources(e,current,model,f,qualifiers,c,qualifiers.map(()=>85))
  const updated=effectiveRoundRules(model,[decision]),data=sources(e),combined=calculateOfficial(updated,data)
  assert.equal(combined.ready,true)
  const back=structuredClone(updated);back.rounds[1].progression='back_to_zero';assert.ok(calculateOfficial(back,data).results.every(r=>r.finalScore===85))
  const winner=combined.results[0],preScore=standing.results.find(r=>r.contestantId===winner.contestantId).finalScore
  assert.equal(winner.finalScore,preScore*.3+85*.7)
  console.log(`PASS: ${type} source scores → submitted snapshot → independent verification → approved ${qualifiers.length} qualifiers → Final locks/Submit Round; weighted and Back to Zero remain separate`)
 }
 const invalidEvent=crypto.randomUUID(),source=crypto.randomUUID(),destination=crypto.randomUUID()
 run(`INSERT INTO events(id,organization_id) VALUES('${invalidEvent}','20000000-0000-0000-0000-000000000001');INSERT INTO competition_rounds(id,event_id,name,display_order,workflow,advancement_type,advancement_value) VALUES('${source}','${invalidEvent}','Source',0,'{"purpose":"qualification"}','top_n',0),('${destination}','${invalidEvent}','Award',1,'{"purpose":"special"}','none',NULL)`)
 const validate=()=>`SELECT competition_validate_participation('${invalidEvent}','${owner}',competition_registration_source('${invalidEvent}'))`
 blocked(validate(),'INVALID_TOP_N_RULE')
 run(`UPDATE competition_rounds SET advancement_value=1,workflow=workflow||${json({nextRoundId:destination})} WHERE id='${source}'`)
 blocked(validate(),'INVALID_MAIN_ROUND_DESTINATION')
 run(`UPDATE competition_rounds SET workflow=workflow-'nextRoundId',advancement_type='top_percent',advancement_value=101 WHERE id='${source}'`)
 blocked(validate(),'INVALID_TOP_PERCENT_RULE')
 console.log('PASS: SQL publication validation rejects invalid Top N/percentage and independent special-award destinations')
}
