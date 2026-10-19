// Actual PostgreSQL boundary tests. No .env, Supabase client, mail or app server.
// The database host/port and workspace data directory are intentionally fixed.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { calculateOfficial } from '../../shared/competition-calculation.js'

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const psql=process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe':'psql'
const expectedDirectory=path.join(workspace,'.tmp','competition-postgres-tests')
const database=`votrix_repairs_${Date.now()}`
const evidence=path.join(workspace,'audits','competition-2026-10-12','implementation','evidence')
mkdirSync(evidence,{recursive:true})
const log=[]
const note=value=>{log.push(value);console.log(value);writeFileSync(path.join(evidence,'sql-repairs.log'),log.join('\n')+'\n')}
const cleanEnvironment={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGUSER:'postgres',PGOPTIONS:''}
delete cleanEnvironment.PGSERVICE;delete cleanEnvironment.PGSERVICEFILE
const argumentsFor=(db,args)=>['-X','-q','-h','127.0.0.1','-p','55439','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1',...args]
function sql(source,db=database){
 assert.ok(db==='postgres'||/^votrix_(participation|repairs)_\d+$/.test(db),'Only named disposable competition databases are allowed')
 const result=spawnSync(psql,argumentsFor(db,['-At','-c',source]),{cwd:workspace,encoding:'utf8',env:cleanEnvironment,timeout:30000})
 assert.equal(result.status,0,result.stderr||result.error?.message)
 return result.stdout.trim()
}
const literal=value=>`'${String(value).replaceAll("'","''")}'`
const json=value=>`${literal(JSON.stringify(value))}::jsonb`
const read=source=>JSON.parse(sql(source))
const reject=(statement,message)=>sql(`DO $$ BEGIN BEGIN ${statement};RAISE EXCEPTION 'TEST_UNEXPECTED_SUCCESS';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ${literal(message+'%')} THEN RAISE;END IF;END;END $$`)
const one=()=>crypto.randomUUID()
const actualDirectory=sql('SHOW data_directory','postgres')
assert.equal(path.resolve(actualDirectory).toLowerCase(),path.resolve(expectedDirectory).toLowerCase(),'Refusing to write outside the workspace PostgreSQL test cluster')
const template=process.argv[2]??sql("SELECT datname FROM pg_database WHERE datname ~ '^votrix_participation_[0-9]+$' ORDER BY datname DESC LIMIT 1",'postgres')
assert.match(template,/^votrix_participation_\d+$/,'First run test-competition-participation.mjs to prepare an isolated through099 fixture')
sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres')
note(`Verified local cluster: ${actualDirectory}; cloned disposable ${template} -> ${database}`)
sql(`ALTER TABLE events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE events ADD COLUMN IF NOT EXISTS title text,ADD COLUMN IF NOT EXISTS description text,ADD COLUMN IF NOT EXISTS banner text,ADD COLUMN IF NOT EXISTS image_asset_id uuid,ADD COLUMN IF NOT EXISTS start_date timestamptz,ADD COLUMN IF NOT EXISTS end_date timestamptz,ADD COLUMN IF NOT EXISTS competition_type text,ADD COLUMN IF NOT EXISTS scoring_config jsonb DEFAULT '{}';
ALTER TABLE competition_divisions ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE competition_categories ADD COLUMN IF NOT EXISTS division_id uuid,ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 0;
ALTER TABLE competition_rounds ADD COLUMN IF NOT EXISTS category_id uuid;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')THEN CREATE ROLE authenticated;END IF;END$$;
ALTER ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;`)
const historyExpression=`jsonb_build_object('rules',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competition_rule_versions t),'locked',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competition_session_judge_scores t),'submissions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competition_round_submissions t),'decisions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competition_advancement_decisions t),'calculations',(SELECT jsonb_agg(to_jsonb(t)-'source_input_revision' ORDER BY id) FROM competition_result_calculations t))`
const before=sql(`SELECT ${historyExpression}`)
const apply=file=>{
 const result=spawnSync(psql,argumentsFor(database,['-f',file]),{cwd:workspace,encoding:'utf8',env:cleanEnvironment,timeout:30000})
 assert.equal(result.status,0,result.stderr||result.error?.message);note(`PASS install ${file}`)
}
apply('backend/src/database/migrations/100_competition_atomic_integrity.sql')
const privateTables=['competition_scores','competition_session_judge_scores','competition_result_calculations','competition_deductions','competition_rule_versions','competition_judge_drafts','competition_round_submissions','competition_eligibility_decisions','competition_advancement_decisions','competition_criterion_lock_history','competition_lineups','competition_rule_amendments']
// Reproduce direct API grants only in this explicitly verified local clone.
sql(`GRANT SELECT,INSERT,UPDATE,DELETE ON competition_scores,competition_session_judge_scores,competition_result_calculations,competition_deductions TO anon,authenticated`)
const inventory=()=>read(`SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'anonSelect',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedSelect',has_table_privilege('authenticated',c.oid,'SELECT'),'serviceSelect',has_table_privilege('service_role',c.oid,'SELECT')) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN(${privateTables.map(literal).join(',')})`)
const preACL=inventory();writeFileSync(path.join(evidence,'local-acl-before.json'),JSON.stringify(preACL,null,2))
assert.ok(preACL.filter(row=>privateTables.slice(0,4).includes(row.table)).every(row=>row.anonSelect),'Local pre-ACL exposure fixture was not established')
apply('backend/src/database/migrations/101_competition_private_access.sql')
const postACL=inventory();writeFileSync(path.join(evidence,'local-acl-after.json'),JSON.stringify(postACL,null,2))
assert.ok(postACL.every(row=>row.rls&&!row.anonSelect&&!row.authenticatedSelect&&row.serviceSelect))
for(const table of privateTables){
 reject(`SET LOCAL ROLE anon;SELECT 1 FROM ${table} LIMIT 1`,'permission denied')
 reject(`SET LOCAL ROLE authenticated;SELECT 1 FROM ${table} LIMIT 1`,'permission denied')
 sql(`BEGIN;SET LOCAL ROLE service_role;SELECT count(*) FROM ${table};ROLLBACK`)
}
note('PASS actual local ACL inventory -> migration101: all twelve private tables have RLS/direct API-role denial and service-role reads')
apply('backend/src/database/migrations/102_competition_creation_idempotency.sql')
reject('SET LOCAL ROLE anon;SELECT 1 FROM competition_create_requests LIMIT 1','permission denied')
reject('SET LOCAL ROLE authenticated;SELECT 1 FROM competition_create_requests LIMIT 1','permission denied')
note('PASS create-request payloads are not readable through anonymous/authenticated direct table access')
assert.equal(sql(`SELECT ${historyExpression}`),before,'100–102 changed historical rules/scores/submissions/advancement/result payloads')
note('PASS additive migrations preserve every cloned historical rule, locked source, submission, advancement and calculation payload')

const owner=one(),ownerB=one(),judge=one(),judge2=one(),reviewer=one(),organization=one(),organizationB=one()
sql(`INSERT INTO users(id,role) VALUES('${owner}','organizer'),('${ownerB}','organizer'),('${judge}','participant'),('${judge2}','participant'),('${reviewer}','participant');INSERT INTO organizations(id,organizer_id) VALUES('${organization}','${owner}'),('${organizationB}','${ownerB}')`)
const createRequest=one(),createPayload={title:'Disposable repair competition',description:'Local fixture',start_date:'2026-10-12T00:00:00Z',end_date:'2026-10-13T00:00:00Z',competition_type:'Test'}
const created=read(`SELECT competition_create_event('${owner}','${organization}','${createRequest}',${json(createPayload)})`)
assert.equal(read(`SELECT competition_create_event('${owner}','${organization}','${createRequest}',${json({...createPayload,banner:'different-retry-asset'})})`).id,created.id)
reject(`SELECT competition_create_event('${owner}','${organization}','${createRequest}',${json({...createPayload,title:'Different'})})`,'CREATE_REQUEST_CONFLICT')
reject(`SELECT competition_create_event('${ownerB}','${organization}','${one()}',${json(createPayload)})`,'ORGANIZER_FORBIDDEN')
assert.equal(Number(sql(`SELECT count(*) FROM events WHERE title='Disposable repair competition'`)),1)
note('PASS actual idempotent event creation: identical retry returns original; changed payload/foreign organization reject without duplicate')

function fixture({elimination=false,entries=2,judges=1}={}){
 const event=one(),pre=one(),final=elimination?one():null,criterion=one(),rule=one(),ids=Array.from({length:entries},one),divisions=[one(),one()],category=one()
 sql(`INSERT INTO events(id,organization_id,title) VALUES('${event}','${organization}','SQL repair fixture');INSERT INTO competition_divisions(id,event_id,display_order) VALUES('${divisions[0]}','${event}',0),('${divisions[1]}','${event}',1);INSERT INTO competition_categories(id,event_id,division_id,weight) VALUES('${category}','${event}','${divisions[0]}',100);INSERT INTO competition_rounds(id,event_id,name,display_order,weight,workflow,advancement_type,advancement_value) VALUES('${pre}','${event}','Round',0,${elimination?40:100},${json({purpose:elimination?'qualification':'regular',progression:'weighted'})},'${elimination?'top_n':'none'}',${elimination?1:'NULL'})${final?`,('${final}','${event}','Final',1,60,${json({purpose:'final',progression:'weighted'})},'none',NULL)`:''};INSERT INTO competition_criteria(id,event_id,name,percentage,min_score,max_score) VALUES('${criterion}','${event}','Quality',100,0,100);INSERT INTO competition_round_criteria(round_id,criteria_id) VALUES('${pre}','${criterion}')${final?`,('${final}','${criterion}')`:''};INSERT INTO event_participants(event_id,user_id,judge_role) VALUES('${event}','${judge}','judge'),('${event}','${reviewer}','score_reviewer')${judges===2?`,('${event}','${judge2}','judge')`:''};${ids.map((id,index)=>`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${id}','${event}','Entry${index+1}',${index+1});SELECT competition_set_round_membership('${event}','${owner}','${pre}','${id}',true);`).join('')}`)
 const rules={id:rule,event:{id:event},participationModel:2,scoringConfig:{confirmed:true,calculationMethod:'weighted_average',decimalPlaces:2,tiePolicy:'shared',independentApproval:true,verifierId:reviewer},judges:[{judgeId:judge,role:'judge',isActive:true},...(judges===2?[{judgeId:judge2,role:'judge',isActive:true}]:[])],contestants:ids.map((id,index)=>({id,name:`Entry${index+1}`,contestantNumber:index+1})),criteria:[{id:criterion,name:'Quality',percentage:100,minScore:0,maxScore:100,minorCriteria:[]}],divisions:[],categories:[],rounds:[{id:pre,name:'Round',displayOrder:0,weight:elimination?40:100,purpose:elimination?'qualification':'regular',progression:'weighted',advancementType:elimination?'top_n':'none',advancementValue:elimination?1:null,contestantIds:ids,criteriaIds:[criterion]},...(final?[{id:final,name:'Final',displayOrder:1,weight:60,purpose:'final',progression:'weighted',advancementType:'none',contestantIds:[],criteriaIds:[criterion]}]:[])]}
 const revision=()=>read(`SELECT jsonb_build_object('setup',(SELECT competition_setup_revision FROM events WHERE id='${event}'),'input',(SELECT competition_input_revision FROM events WHERE id='${event}'))`)
 const snapshot=()=>({...rules,setupRevision:revision().setup,registrationSource:read(`SELECT competition_registration_source('${event}')`),criteriaSource:read(`SELECT competition_criteria_source('${event}')`)})
 const publish=()=>read(`SELECT competition_publish_rules('${event}','${owner}','${rule}',${json(snapshot())})`)
 const start=()=>read(`SELECT competition_operational_action('${event}','${owner}',NULL,'start','{}')`)
 return{event,pre,final,criterion,rule,ids,divisions,category,rules,revision,snapshot,publish,start}
}
const own=fixture(),foreign=fixture()
reject(`INSERT INTO competition_round_criteria(round_id,criteria_id) VALUES('${own.pre}','${foreign.criterion}')`,'CROSS_EVENT_RELATION_FORBIDDEN')
reject(`INSERT INTO competition_round_contestants(round_id,contestant_id) VALUES('${own.pre}','${foreign.ids[0]}')`,'ENTRY_FORBIDDEN')
reject(`UPDATE competition_rounds SET category_id='${foreign.category}' WHERE id='${own.pre}'`,'CROSS_EVENT_RELATION_FORBIDDEN')
reject(`UPDATE competition_categories SET division_id='${foreign.divisions[0]}' WHERE id='${own.category}'`,'CROSS_EVENT_RELATION_FORBIDDEN')
reject(`UPDATE competition_rounds SET workflow=workflow||${json({nextRoundId:foreign.pre})} WHERE id='${own.pre}'`,'NEXT_ROUND_FORBIDDEN')
note('PASS direct PostgreSQL same-event protection rejects foreign round criterion/contestant/category/division/next-round links')
for(const mutation of [`UPDATE competition_rounds SET weight=99 WHERE id='${own.pre}'`,`UPDATE competition_rounds SET workflow=workflow||'{"progression":"carry_forward"}' WHERE id='${own.pre}'`,`UPDATE competition_categories SET weight=99 WHERE id='${own.category}'`,`UPDATE events SET scoring_config='{"decimalPlaces":3}' WHERE id='${own.event}'`,`UPDATE event_participants SET judge_role='head_judge' WHERE event_id='${own.event}' AND user_id='${judge}'`]){
 const beforeRevision=own.revision(),stale=own.snapshot();sql(mutation)
 assert.ok(own.revision().setup>beforeRevision.setup)
 reject(`SELECT competition_publish_rules('${own.event}','${owner}','${own.rule}',${json(stale)})`,'FULL_SETUP_CHANGED_REFRESH')
}
sql(`UPDATE competition_rounds SET weight=100,workflow='{"purpose":"regular","progression":"weighted"}' WHERE id='${own.pre}';UPDATE event_participants SET judge_role='judge' WHERE event_id='${own.event}' AND user_id='${judge}'`)
const staleAccount=own.snapshot();sql(`UPDATE users SET account_status='inactive' WHERE id='${judge}'`)
reject(`SELECT competition_publish_rules('${own.event}','${owner}','${own.rule}',${json(staleAccount)})`,'FULL_SETUP_CHANGED_REFRESH')
sql(`UPDATE users SET account_status='active' WHERE id='${judge}'`)
note('PASS full setup revision catches interleaved round weight/progression, category weight, scoring config, judge role and account changes before freezing')
const ordered=[...foreign.divisions].reverse()
sql(`SELECT competition_reorder_divisions('${foreign.event}','${owner}',ARRAY[${ordered.map(id=>`${literal(id)}::uuid`).join(',')}])`)
assert.deepEqual(read(`SELECT jsonb_agg(id ORDER BY display_order) FROM competition_divisions WHERE event_id='${foreign.event}'`),ordered)
reject(`SELECT competition_reorder_divisions('${foreign.event}','${owner}',ARRAY['${foreign.divisions[0]}'::uuid])`,'INVALID_DIVISION_ORDER')
note('PASS actual atomic division reorder and invalid incomplete permutation rollback')

const context=(f,s,round=f.pre,j=judge)=>({sessionId:s.id,judgeId:j,rulesVersion:f.rule,roundId:round})
const payload=(f,entry,score)=>({contestantId:entry,criteriaId:f.criterion,scores:{[f.criterion]:score}})
const write=(f,s,entry,score,action='lock',round=f.pre,j=judge,extra={})=>read(`SELECT competition_scoring_write('${f.event}','${j}',${json(context(f,s,round,j))},'${action}',${json({...payload(f,entry,score),...extra})})`)
const submit=(f,s,round=f.pre,j=judge)=>read(`SELECT competition_scoring_write('${f.event}','${j}',${json(context(f,s,round,j))},'submit','{}')`)
const sources=f=>read(`SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM competition_round_submissions s WHERE event_id='${f.event}' AND status='submitted'`)
const session=f=>read(`SELECT to_jsonb(s) FROM competition_sessions s WHERE event_id='${f.event}' ORDER BY started_at DESC LIMIT 1`)
own.publish();const active=own.start()
reject(`UPDATE competition_categories SET weight=90 WHERE id='${own.category}'`,'OFFICIAL_SETUP_FROZEN')
reject(`UPDATE competition_divisions SET display_order=5 WHERE id='${own.divisions[0]}'`,'OFFICIAL_SETUP_FROZEN')
reject(`SELECT competition_scoring_write('${own.event}','${judge}',${json({...context(own,active),roundId:foreign.pre})},'lock',${json(payload(own,own.ids[0],90))})`,'STALE_CONTEXT')
const draft=write(own,active,own.ids[0],0,'draft');assert.equal(draft.draft.revision,1)
reject(`SELECT competition_scoring_write('${own.event}','${judge}',${json(context(own,active))},'draft',${json({...payload(own,own.ids[0],1),draftRevision:0})})`,'DRAFT_VERSION_CONFLICT')
sql(`CREATE FUNCTION repair_fixture_reject_projection() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.contestant_id='${own.ids[0]}' THEN RAISE EXCEPTION 'TEST_PROJECTION_FAILURE';END IF;RETURN NEW;END$$;CREATE TRIGGER zz_repair_projection_failure BEFORE INSERT ON competition_scores FOR EACH ROW EXECUTE FUNCTION repair_fixture_reject_projection()`)
reject(`SELECT competition_scoring_write('${own.event}','${judge}',${json(context(own,active))},'lock',${json(payload(own,own.ids[0],0))})`,'TEST_PROJECTION_FAILURE')
assert.equal(Number(sql(`SELECT count(*) FROM competition_session_judge_scores WHERE event_id='${own.event}'`)),0)
assert.equal(Number(sql(`SELECT count(*) FROM competition_judge_drafts WHERE event_id='${own.event}'`)),1)
sql('DROP TRIGGER zz_repair_projection_failure ON competition_scores;DROP FUNCTION repair_fixture_reject_projection()')
write(own,active,own.ids[0],0);assert.equal(write(own,active,own.ids[0],0).duplicate,true)
write(own,active,own.ids[1],90)
assert.equal(Number(sql(`SELECT count(*) FROM competition_scores s JOIN competition_contestants c ON c.id=s.contestant_id WHERE c.event_id='${own.event}'`)),2)
sql(`SELECT competition_operational_action('${own.event}','${owner}','${active.id}','access','{"kind":"entries","gate":{"mode":"none","ids":[]}}')`)
reject(`SELECT competition_scoring_write('${own.event}','${judge}',${json(context(own,active))},'draft',${json(payload(own,own.ids[0],10))})`,'SCORING_ACCESS_CLOSED')
// Closing input gates is independent of the explicit round submission window.
const firstSubmission=submit(own,active);assert.equal(submit(own,active).submission.id,firstSubmission.submission.id)
note('PASS actual Draft revision, valid zero, Lock/Submit retries, closed-gate stale rejection, and atomic rollback of source/projection/history with draft retained')
const historicalSources=sql(`SELECT sources FROM competition_round_submissions WHERE id='${firstSubmission.submission.id}'`)
const priorLocks=Number(sql(`SELECT count(*) FROM competition_criterion_lock_history h JOIN competition_session_judge_scores s ON s.id=h.score_row_id WHERE s.event_id='${own.event}'`))
reject(`SELECT competition_operational_action('${own.event}','${owner}','${active.id}','correction',${json({contestantId:own.ids[0],criteriaId:own.criterion,judgeId:judge})})`,'CORRECTION_REASON_REQUIRED')
sql(`SELECT competition_operational_action('${own.event}','${owner}','${active.id}','correction',${json({contestantId:own.ids[0],criteriaId:own.criterion,judgeId:judge,reason:'Correct a disposable test value',confirmed:true})})`)
assert.equal(sql(`SELECT status FROM competition_round_submissions WHERE id='${firstSubmission.submission.id}'`),'invalidated')
assert.equal(sql(`SELECT sources FROM competition_round_submissions WHERE id='${firstSubmission.submission.id}'`),historicalSources)
assert.equal(Number(sql(`SELECT count(*) FROM competition_criterion_lock_history h JOIN competition_session_judge_scores s ON s.id=h.score_row_id WHERE s.event_id='${own.event}'`)),priorLocks)
sql(`SELECT competition_operational_action('${own.event}','${owner}','${active.id}','access','{"kind":"entries","gate":{"mode":"all","ids":[]}}')`)
write(own,active,own.ids[0],5)
const correctedSubmission=submit(own,active)
assert.equal(correctedSubmission.submission.version,firstSubmission.submission.version+1)
assert.notEqual(correctedSubmission.submission.id,firstSubmission.submission.id)
note('PASS confirmed reasoned correction invalidates prior submission without rewriting sources/lock history; relock creates new history and versioned resubmission')

function calculation(f,s,{roundId=null,status='ready_for_verification',inputRevision=f.revision().input,digest='local-source'}={}){
 const currentSources=sources(f),result=calculateOfficial(f.rules,currentSources,{roundId}),id=one()
 sql(`INSERT INTO competition_result_calculations(id,event_id,session_id,round_id,rules_version,status,created_by,result_snapshot,configuration_snapshot,source_versions,source_digest,source_input_revision) VALUES('${id}','${f.event}','${s.id}',${roundId?literal(roundId):'NULL'},'${f.rule}','${status}','${owner}',${json(result.results)},'{}',${json(currentSources.map(row=>({id:row.id,version:row.version})))},'${digest}',${inputRevision})`)
 return{id,result,digest}
}
const transition=(f,c,action,actor=owner)=>read(`SELECT competition_result_transition('${f.event}','${actor}','${c.id}','${action}','${c.digest}','Independent local verification')`)
const oldInput=own.revision().input;sql(`UPDATE users SET account_status='inactive' WHERE id='${judge}'`)
reject(`INSERT INTO competition_result_calculations(event_id,session_id,rules_version,status,result_snapshot,source_input_revision) VALUES('${own.event}','${active.id}','${own.rule}','ready_for_verification','[]',${oldInput})`,'SOURCE_REVISION_CONFLICT')
sql(`UPDATE users SET account_status='active' WHERE id='${judge}'`)
const calc=calculation(own,active)
reject(`SELECT competition_result_transition('${own.event}','${owner}','${calc.id}','verify','${calc.digest}','Self approval')`,'INDEPENDENT_APPROVAL_REQUIRED')
transition(own,calc,'verify',reviewer);transition(own,calc,'finalize')
reject(`UPDATE competition_result_calculations SET source_input_revision=source_input_revision+1 WHERE id='${calc.id}'`,'CALCULATION_SOURCE_IDENTITY_IMMUTABLE')
reject(`UPDATE competition_result_calculations SET result_snapshot='[]' WHERE id='${calc.id}'`,'CALCULATION_SNAPSHOT_IMMUTABLE')
const deduction=one();sql(`INSERT INTO competition_deductions(id,event_id,contestant_id,round_id,amount,status,reason,applied_by_user_id,authority_type,rules_version,decision_status,offense_key) VALUES('${deduction}','${own.event}','${own.ids[1]}',NULL,5,'active','Local penalty','${owner}','organizer','${own.rule}','pending','fixture-1')`)
sql(`SELECT competition_approve_decision('${own.event}','${reviewer}','deduction','${deduction}','Independent evidence approval')`)
reject(`SELECT competition_result_transition('${own.event}','${owner}','${calc.id}','publish','${calc.digest}','Old finalized result')`,'SOURCE_REVISION_CONFLICT')
assert.equal(sql(`SELECT status FROM competition_result_calculations WHERE id='${calc.id}'`),'finalized')
note('PASS stale calculation INSERT and stale finalized Publish after approved decision reject; independent reviewer enforced; frozen payload/source identity immutable')
// Recalculation uses the same actual submitted snapshots plus approved penalty.
const updated=calculation(own,active),approved=read(`SELECT jsonb_agg(to_jsonb(d)) FROM competition_deductions d WHERE event_id='${own.event}'`)
const adjusted=calculateOfficial(own.rules,sources(own),{deductions:approved})
// New snapshot is immutable, so create the adjusted fixture at INSERT, not UPDATE.
const officialId=one(),inputRevision=own.revision().input
sql(`INSERT INTO competition_result_calculations(id,event_id,session_id,rules_version,status,created_by,result_snapshot,configuration_snapshot,source_versions,source_digest,source_input_revision) VALUES('${officialId}','${own.event}','${active.id}','${own.rule}','ready_for_verification','${owner}',${json(adjusted.results)},'{}',${json(sources(own).map(row=>({id:row.id,version:row.version})))},'adjusted',${inputRevision})`)
const official={id:officialId,digest:'adjusted'};transition(own,official,'verify',reviewer);transition(own,official,'finalize');transition(own,official,'publish')
assert.equal(sql(`SELECT status FROM events WHERE id='${own.event}'`),'completed');assert.equal(session(own).submission_window,false)
assert.equal(read(`SELECT result_snapshot FROM competition_result_calculations WHERE id='${officialId}'`).find(row=>row.contestantId===own.ids[1]).finalScore,85)
note('PASS actual submitted sources -> adjusted exact calculation -> appointed reviewer Verify -> organizer Finalize/Publish -> completed event/closed submission window')

const elimination=fixture({elimination:true});elimination.publish();const preSession=elimination.start()
write(elimination,preSession,elimination.ids[0],100);write(elimination,preSession,elimination.ids[1],90);submit(elimination,preSession)
const preCalc=calculation(elimination,preSession,{roundId:elimination.pre});transition(elimination,preCalc,'verify',reviewer);transition(elimination,preCalc,'finalize')
sql(`UPDATE users SET account_status='inactive' WHERE id='${judge}'`)
reject(`SELECT competition_confirm_advancement('${elimination.event}','${owner}','${elimination.pre}','${elimination.final}','${preCalc.id}',ARRAY['${elimination.ids[0]}'::uuid],'Old finalized advancement')`,'SOURCE_REVISION_CONFLICT')
sql(`UPDATE users SET account_status='active' WHERE id='${judge}'`)
const refreshedPre=calculation(elimination,preSession,{roundId:elimination.pre});transition(elimination,refreshedPre,'verify',reviewer)
sql(`SELECT competition_confirm_advancement('${elimination.event}','${owner}','${elimination.pre}','${elimination.final}','${refreshedPre.id}',ARRAY['${elimination.ids[0]}'::uuid],'Approved Top1')`)
const finalSession=read(`SELECT competition_operational_action('${elimination.event}','${owner}','${preSession.id}','round',${json({roundId:elimination.final})})`)
assert.deepEqual(finalSession.contestant_order,elimination.ids.slice(0,1))
reject(`SELECT competition_scoring_write('${elimination.event}','${judge}',${json(context(elimination,finalSession,elimination.final))},'lock',${json(payload(elimination,elimination.ids[1],90))})`,'ENTRY_NOT_QUALIFIED_FOR_ROUND')
write(elimination,finalSession,elimination.ids[0],0,'lock',elimination.final);submit(elimination,finalSession,elimination.final)
const effective=structuredClone(elimination.rules);effective.rounds[1].contestantIds=elimination.ids.slice(0,1)
const championship=calculateOfficial(effective,sources(elimination),{deductions:[{contestant_id:elimination.ids[0],round_id:elimination.final,amount:10,decision_status:'approved'}]})
assert.equal(championship.ready,true);assert.deepEqual(championship.results.map(row=>[row.contestantId,row.finalScore,row.rank]),[[elimination.ids[0],34,1]])
note('PASS actual verified advancement/source versions -> approved Top1 Final roster -> eliminated lock denied -> zero Final submission; shared engine championship34 excludes eliminated90')

async function sessionSql(source,onOutput=()=>{}){
 return new Promise((resolve,rejectPromise)=>{
  const child=spawn(psql,argumentsFor(database,['-At','-c',source]),{cwd:workspace,encoding:'utf8',env:cleanEnvironment});let output='',error=''
  child.stdout.on('data',data=>{output+=data;onOutput(output)});child.stderr.on('data',data=>error+=data)
  child.on('error',rejectPromise);child.on('close',code=>code===0?resolve(output.trim()):rejectPromise(new Error(error)))
 })
}
const concurrent=fixture({entries:1});concurrent.publish();const concurrentSession=concurrent.start()
// The first transaction obtains the real event/session operational lock before
// sleeping. The second connection must wait and then see its committed closure.
let confirmLock
const lockHeld=new Promise(resolve=>{confirmLock=resolve})
const closer=sessionSql(`BEGIN;SELECT competition_operational_action('${concurrent.event}','${owner}','${concurrentSession.id}','access','{"kind":"entries","gate":{"mode":"none","ids":[]}}');SELECT 'REPAIR_LOCK_HELD';SELECT pg_sleep(0.6);COMMIT`,output=>{if(output.includes('REPAIR_LOCK_HELD'))confirmLock()})
await Promise.race([lockHeld,closer.then(()=>{throw new Error('Gate transaction finished without the lock barrier')})])
await assert.rejects(sessionSql(`SELECT competition_scoring_write('${concurrent.event}','${judge}',${json(context(concurrent,concurrentSession))},'lock',${json(payload(concurrent,concurrent.ids[0],90))})`),/SCORING_ACCESS_CLOSED/)
await closer
assert.equal(Number(sql(`SELECT count(*) FROM competition_session_judge_scores WHERE event_id='${concurrent.event}'`)),0)
sql(`SELECT competition_operational_action('${concurrent.event}','${owner}','${concurrentSession.id}','access','{"kind":"entries","gate":{"mode":"all","ids":[]}}')`)
const locks=await Promise.all([sessionSql(`SELECT competition_scoring_write('${concurrent.event}','${judge}',${json(context(concurrent,concurrentSession))},'lock',${json(payload(concurrent,concurrent.ids[0],90))})`),sessionSql(`SELECT competition_scoring_write('${concurrent.event}','${judge}',${json(context(concurrent,concurrentSession))},'lock',${json(payload(concurrent,concurrent.ids[0],90))})`)])
assert.equal(locks.map(JSON.parse).filter(result=>result.duplicate).length,1)
const submissions=await Promise.all([sessionSql(`SELECT competition_scoring_write('${concurrent.event}','${judge}',${json(context(concurrent,concurrentSession))},'submit','{}')`),sessionSql(`SELECT competition_scoring_write('${concurrent.event}','${judge}',${json(context(concurrent,concurrentSession))},'submit','{}')`)])
assert.equal(new Set(submissions.map(value=>JSON.parse(value).submission.id)).size,1)
note('PASS two actual PostgreSQL connections: gate closure serializes stale lock; concurrent duplicate Lock/Submit yields one numeric source/current submission')
note(`SQL REPAIR ACCEPTANCE PASSED. Only verified localhost/${database} was modified. Real HTTP cookies/browser authentication, multi-browser UI, deployed Supabase ACL and topology remain unverified.`)
writeFileSync(path.join(evidence,'sql-repairs-summary.json'),JSON.stringify({database,template,dataDirectory:actualDirectory,checks:log,productionOperations:0,authenticatedBrowserTest:false},null,2))
