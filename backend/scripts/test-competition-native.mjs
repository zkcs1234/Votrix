// Isolated Phase 3 SQL verification. No .env, Supabase, mail or app startup.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const output=path.join(root,'audits/competition-phase3-2026-10-13')
const template='votrix_child_1791877042044',database=`votrix_native_${Date.now()}`
const executable=process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe':'psql'
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete environment.PGSERVICE;delete environment.PGSERVICEFILE
function sql(source,target=database){assert.ok(target===database||target==='postgres');const r=spawnSync(executable,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',env:environment,timeout:30000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()}
const literal=v=>`'${String(v).replaceAll("'","''")}'`, json=v=>`${literal(JSON.stringify(v))}::jsonb`, read=s=>JSON.parse(sql(s)), id=()=>crypto.randomUUID(), log=[]
const pass=name=>{log.push(name);console.log(`PASS ${name}`)}
const reject=(s,message)=>sql(`DO $$ BEGIN BEGIN ${s};RAISE EXCEPTION 'UNEXPECTED_SUCCESS';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ${literal('%'+message+'%')} THEN RAISE;END IF;END;END $$;`)
const concurrent=source=>new Promise((resolve,rejectPromise)=>{const p=spawn(executable,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',error='';const timer=setTimeout(()=>{p.kill();rejectPromise(new Error('Concurrent verification timed out'))},30000);p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>error+=x);p.on('error',rejectPromise);p.on('close',code=>{clearTimeout(timer);resolve({code,out:out.trim(),error})});p.stdin.end(source)})
assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const preflight=JSON.parse(readFileSync(path.join(output,'template-preflight-current.json'),'utf8'))
assert.equal(preflight.target.database,template);assert.equal(preflight.blockers,0);assert.equal(preflight.comparison.unchanged,true)
assert.ok(Date.now()-Date.parse(preflight.checkedAt)<60*60*1000)
sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres')
mkdirSync(output,{recursive:true});writeFileSync(path.join(output,'local-target.json'),JSON.stringify({database,template,host:'127.0.0.1',port:55439,disposable:true},null,2))
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8')
const meta=read(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`)
assert.deepEqual(meta,{tables:preflight.schema.tables,functions:preflight.schema.functions,metadata:preflight.metadata})
writeFileSync(path.join(output,'catalog-before.json'),JSON.stringify(meta,null,2))
pass('actual fresh-clone catalog, constraints, guards and ACL match the reviewed Phase 2 preflight')
const tracked=Object.keys(preflight.inventory),saved={}
for(const t of tracked){assert.match(t,/^[a-z_]+$/);saved[t]=read(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${t} t`)}
function history(){return Object.fromEntries(tracked.map(t=>{
 const identity=meta.tables[t].columns.includes('id')?['id']:meta.tables[t].columns.includes('round_id')?['round_id',meta.tables[t].columns.includes('criteria_id')?'criteria_id':'contestant_id']:meta.tables[t].columns.includes('competition_id')?['event_id']:['organizer_id','request_id']
 const predicate=saved[t].length?saved[t].map(row=>'('+identity.map(k=>`${k} IS NOT DISTINCT FROM ${row[k]?literal(row[k])+'::uuid':'NULL::uuid'}`).join(' AND ')+')').join(' OR '):'false'
 return[t,sql(`SELECT md5(coalesce(string_agg((to_jsonb(t)${t==='competitions'?"-ARRAY['setup_revision','input_revision','official_child_rules_id']":""})::text,E'\\n' ORDER BY (to_jsonb(t)${t==='competitions'?"-ARRAY['setup_revision','input_revision','official_child_rules_id']":""})::text),'')) FROM ${t} t WHERE ${predicate}`)]
}))}
const before=history(),migration=readFileSync(path.join(root,'backend/src/database/migrations/104_competition_scoped_rules.sql'),'utf8')
sql(migration);assert.deepEqual(history(),before);sql(migration);assert.deepEqual(history(),before)
pass('104 installation and rerun preserve all original history and Phase 2 identities/associations')
const owner=id(),judge=id(),judge2=id(),org=id(),event=id(),enrollment=id(),enrollment2=id()
sql(`INSERT INTO users(id,role) VALUES('${owner}','organizer'),('${judge}','participant'),('${judge2}','participant');INSERT INTO organizations(id,organizer_id) VALUES('${org}','${owner}');INSERT INTO events(id,organization_id,title) VALUES('${event}','${org}','Native rule fixture');INSERT INTO event_participants(id,event_id,user_id,judge_role) VALUES('${enrollment}','${event}','${judge}','judge'),('${enrollment2}','${event}','${judge2}','judge');`)
const children=Array.from({length:5},(_,i)=>{const c=id();read(`SELECT competition_create_child('${event}','${owner}','${c}','Dance ${i+1}','Dance')`);return c})
const rev=c=>read(`SELECT jsonb_build_object('setup',setup_revision,'input',input_revision,'rules',official_child_rules_id) FROM competitions WHERE id='${c}'`)
const parent=()=>sql(`SELECT competition_input_revision FROM events WHERE id='${event}'`)
const config=(method='weighted_average')=>({structure:'single',rounds:[],criteria:[{id:id(),name:'Technique',roundId:null,percentage:100,minScore:1,maxScore:10,minorCriteria:[{id:id(),name:'Execution',minScore:1,maxScore:10}]}],scoringConfig:{calculationMethod:method,tiePolicy:'shared',decimalPlaces:2}})
const saveSQL=(c,cfg,r=rev(c).setup)=>`SELECT competition_save_native_configuration('${event}','${c}','${owner}',${r},${json(cfg)})`
const assign=(c,ep=enrollment,r=null)=>read(`SELECT competition_assign_native_judge('${event}','${c}','${owner}','${ep}',${r?literal(r)+'::uuid':'NULL'},false)`)
const add=(c,existingMaster=null)=>{const master=existingMaster??id();if(!existingMaster)sql(`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${master}','${event}','Synthetic entry',${100+children.indexOf(c)})`);return read(`SELECT competition_add_entry('${event}','${owner}','${c}','${master}',NULL)`).id}
const ctxSQL=(c,j=judge,r=null)=>`SELECT competition_native_judge_context('${event}','${c}','${j}',${r?literal(r)+'::uuid':'NULL'})`
const freezeSQL=(c,s=rev(c))=>`SELECT competition_freeze_native_rules('${event}','${c}','${owner}',${s.setup},${s.input})`
const configs=children.map((c,i)=>{const cfg=config(['weighted_average','sum','rank_based','highest_score','lowest_removal'][i]);read(saveSQL(c,cfg));return cfg})
assert.equal(Number(sql(`SELECT count(*) FROM competition_child_configurations WHERE event_id='${event}'`)),5)
pass('five children save distinct methods, criterion IDs and equal-average minor configurations')
const sibling=rev(children[0]),parentBefore=parent(),hiphop=structuredClone(configs[1]);hiphop.criteria[0].name='Hip-Hop technique'
read(saveSQL(children[1],hiphop));assert.deepEqual(rev(children[0]),sibling);assert.equal(parent(),parentBefore)
const same=rev(children[1]);read(saveSQL(children[1],hiphop));assert.deepEqual(rev(children[1]),same)
reject(saveSQL(children[1],configs[1],same.setup-1),'CHILD_SETUP_REVISION_CONFLICT')
pass('Hip-Hop edit/no-op/stale save use child-only revisions; Contemporary and parent revisions stay unchanged')
reject(ctxSQL(children[0]),'JUDGE_CONTEXT_FORBIDDEN')
assign(children[0]);assign(children[1]);assert.equal(read(ctxSQL(children[0])).roundId,null);assert.equal(read(ctxSQL(children[1])).competitionId,children[1])
reject(ctxSQL(children[2]),'JUDGE_CONTEXT_FORBIDDEN');assert.equal(read(ctxSQL(children[0])).scoringAvailable,false)
pass('NULL single phase and explicit multi-child judge grants; empty/foreign assignment lists deny access, scoring unavailable')
const pre=id(),semi=id(),final=id(),multi={structure:'multiple',rounds:[{id:pre,name:'Preliminary',displayOrder:0,progression:'weighted',weight:20,advancementType:'top_n',advancementValue:5,nextRoundId:semi},{id:semi,name:'Semi-Final',displayOrder:1,progression:'weighted',weight:30,nextRoundId:final},{id:final,name:'Final',displayOrder:2,progression:'weighted',weight:50}],criteria:[pre,semi,final].map(roundId=>({id:id(),roundId,name:'Quality',percentage:100,minScore:0,maxScore:100})),scoringConfig:{calculationMethod:'weighted_average',tiePolicy:'shared',decimalPlaces:2}}
read(saveSQL(children[3],multi));assign(children[3],enrollment,pre);assign(children[3],enrollment2)
assert.equal(read(ctxSQL(children[3],judge,pre)).roundId,pre);reject(ctxSQL(children[3],judge,final),'JUDGE_CONTEXT_FORBIDDEN');reject(ctxSQL(children[3]),'SCORING_CONTEXT_FORBIDDEN')
assert.equal(read(ctxSQL(children[3],judge2,final)).roundId,final)
pass('Preliminary/Semi-Final/Final scopes and competition-wide versus specific-round authorization')
reject(`INSERT INTO competition_child_criteria(id,competition_id,event_id,round_id,definition) VALUES('${id()}','${children[0]}','${event}','${pre}','{}')`,'foreign key')
reject(`SELECT competition_assign_native_judge('${event}','${children[0]}','${owner}','${enrollment}','${pre}',false)`,'foreign key')
const cross=structuredClone(configs[0]);cross.criteria[0].id=multi.criteria[0].id;reject(saveSQL(children[0],cross),'CROSS_COMPETITION_CRITERION')
const badFinal=structuredClone(multi);badFinal.rounds[2].advancementType='top_n';reject(saveSQL(children[3],badFinal),'FINAL_HAS_NO_ADVANCEMENT')
pass('actual composite FKs and configuration validation reject cross-child criteria, rounds, assignments and Final advancement')
const badRank=structuredClone(multi);badRank.scoringConfig.calculationMethod='rank_based';reject(saveSQL(children[3],badRank),'ORDINAL_CARRY')
const changedMethods=structuredClone(multi);changedMethods.rounds[0].calculationMethod='sum';reject(saveSQL(children[3],changedMethods),'INCOMPATIBLE_ROUND_METHODS')
const badWeight=structuredClone(configs[0]);badWeight.criteria[0].percentage=101;reject(saveSQL(children[0],badWeight),'INVALID_MAJOR')
pass('incompatible ordinal carry, mixed round methods and invalid weights fail without introducing new formulas')
const preparedMaster=id();sql(`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${preparedMaster}','${event}','Prepared master',101)`)
const control=rev(children[0]),p=parent();const entryB=add(children[1],preparedMaster);assert.deepEqual(rev(children[0]),control);assert.equal(parent(),p)
const wrongEntries=structuredClone(multi);wrongEntries.rounds[0].entryIds=[entryB];reject(saveSQL(children[3],wrongEntries),'CROSS_COMPETITION_ROUND_ENTRY')
pass('native participation increments only its child; round rosters cannot reference unrelated participation IDs')
add(children[0]);const rules=read(freezeSQL(children[0]));assert.equal(rules.competition_id,children[0]);assert.equal(rules.assignment_snapshot[0].judgeId,judge);assert.equal(read(ctxSQL(children[0])).rulesCurrent,true)
reject(`UPDATE competition_child_rule_versions SET configuration_snapshot='{}' WHERE id='${rules.id}'`,'immutable')
reject(saveSQL(children[0],configs[0]),'CHILD_RULES_FROZEN')
const frozen=rev(children[0]);hiphop.criteria[0].name='Edited again';read(saveSQL(children[1],hiphop));assert.deepEqual(rev(children[0]),frozen);assert.equal(read(ctxSQL(children[0])).rulesCurrent,true)
pass('immutable Contemporary rules remain current when Hip-Hop configuration changes; frozen setup rejects writes')
reject(`UPDATE competitions SET official_child_rules_id=NULL WHERE id='${children[0]}'`,'CHILD_RULES_FROZEN')
const extra=id(),topologyBefore=rev(children[0]);read(`SELECT competition_create_child('${event}','${owner}','${extra}','New sibling','Dance')`);assert.deepEqual(rev(children[0]),topologyBefore);assert.equal(read(ctxSQL(children[0])).rulesCurrent,true)
const atomic=read(`SELECT competition_native_foundation('${event}','${children[0]}','${owner}')`);assert.equal(atomic.rulesCurrent,true);assert.equal(atomic.rules.id,rules.id)
pass('new parent topology does not stale a frozen native sibling; official pointer cannot be silently cleared; foundation snapshot is atomic')
assign(children[4],enrollment2);const oldA=rev(children[0]),oldB=rev(children[1]),oldE=rev(children[4]);sql(`UPDATE users SET account_status='inactive' WHERE id='${judge2}'`)
assert.deepEqual(rev(children[0]),oldA);assert.deepEqual(rev(children[1]),oldB);assert.ok(rev(children[4]).input>oldE.input);reject(ctxSQL(children[4],judge2),'JUDGE_CONTEXT_FORBIDDEN')
sql(`UPDATE users SET account_status='active' WHERE id='${judge2}'`)
const dependentA=rev(children[0]),dependentB=rev(children[1]);sql(`UPDATE event_participants SET is_active=false WHERE id='${enrollment}'`)
assert.ok(rev(children[0]).input>dependentA.input);assert.ok(rev(children[1]).input>dependentB.input)
sql(`UPDATE event_participants SET is_active=true WHERE id='${enrollment}'`);assert.equal(read(ctxSQL(children[0])).rulesCurrent,false)
pass('account/enrollment changes invalidate only assigned native children; shared actual dependencies invalidate both, never rewrite frozen snapshots')
const masterB=sql(`SELECT contestant_id FROM competition_entries WHERE id='${entryB}'`),aBefore=rev(children[0]),bBefore=rev(children[1]);sql(`UPDATE competition_contestants SET name='Changed master metadata' WHERE id='${masterB}'`);assert.deepEqual(rev(children[0]),aBefore);assert.ok(rev(children[1]).input>bBefore.input)
pass('shared master metadata changes are scoped to participating children, not every child in the parent event')
const reordered=structuredClone(multi);reordered.rounds=[{...multi.rounds[1],displayOrder:0,nextRoundId:pre},{...multi.rounds[0],displayOrder:1,nextRoundId:final},{...multi.rounds[2],displayOrder:2}];read(saveSQL(children[3],reordered))
pass('atomic reorder works with existing assigned round identities')
const raceRevision=rev(children[4]).setup,race1=structuredClone(configs[4]),race2=structuredClone(configs[4]);race1.criteria[0].name='Concurrent A';race2.criteria[0].name='Concurrent B'
const races=await Promise.all([concurrent(saveSQL(children[4],race1,raceRevision)),concurrent(saveSQL(children[4],race2,raceRevision))]);assert.equal(races.filter(r=>r.code===0).length,1);assert.ok(races.find(r=>r.code!==0).error.includes('CHILD_SETUP_REVISION_CONFLICT'))
pass('concurrent same-child saves with one revision yield one commit and one stale rejection')
const partial=structuredClone(configs[4]);partial.criteria[0].percentage=50;read(saveSQL(children[4],partial));reject(freezeSQL(children[4]),'SCOPE_WEIGHT_MUST_TOTAL_100');read(saveSQL(children[4],configs[4]))
const manual=config('manual');read(saveSQL(extra,manual));reject(freezeSQL(extra),'MANUAL_BASIS_REQUIRED');manual.scoringConfig.manualBasis='Approved recorded placement procedure';read(saveSQL(extra,manual));assign(extra,enrollment2)
const manualMaster=id();sql(`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${manualMaster}','${event}','Manual field',200)`);add(extra,manualMaster)
assert.equal(read(freezeSQL(extra)).configuration_snapshot.scoringConfig.calculationMethod,'manual')
pass('strict freeze rejects partial weights and missing manual basis; all six existing method selections are stored without score calculation')
const deduction=structuredClone(hiphop);deduction.scoringConfig.deductionRules=[{id:'offense',description:'Penalty',amount:5,units:'points',criteriaId:configs[0].criteria[0].id}];reject(saveSQL(children[1],deduction),'CROSS_COMPETITION_DEDUCTION_CRITERION')
deduction.scoringConfig.deductionRules[0].criteriaId=deduction.criteria[0].id;read(saveSQL(children[1],deduction))
const beforeFailed=rev(children[1]);deduction.scoringConfig.deductionRules.push(structuredClone(deduction.scoringConfig.deductionRules[0]));reject(saveSQL(children[1],deduction),'DUPLICATE_DEDUCTION_RULE_ID');assert.deepEqual(rev(children[1]),beforeFailed)
pass('deductions keep method units and criterion scope; invalid updates roll back revisions and configuration atomically')
sql(`UPDATE users SET role='organizer' WHERE id='${judge2}'`);reject(ctxSQL(children[4],judge2),'JUDGE_CONTEXT_FORBIDDEN');sql(`UPDATE users SET role='participant' WHERE id='${judge2}'`)
pass('account role changes revoke native authorization without reinterpreting legacy identities')
add(children[4]);sql(`UPDATE users SET account_status='inactive' WHERE id='${judge2}'`);reject(freezeSQL(children[4]),'INACTIVE_CHILD_JUDGE_REQUIRES_REVIEW');sql(`UPDATE users SET account_status='active' WHERE id='${judge2}'`)
assert.equal(read(freezeSQL(children[4])).configuration_snapshot.scoringConfig.calculationMethod,'lowest_removal')
pass('freeze cannot silently omit an inactive assigned judge; restored explicit panel freezes with unchanged removal semantics')
for(const tab of ['competition_child_configurations','competition_child_rounds','competition_child_criteria','competition_child_minors','competition_child_judge_assignments','competition_child_rule_versions'])for(const role of ['anon','authenticated'])reject(`SET LOCAL ROLE ${role};SELECT 1 FROM ${tab}`,'permission denied')
reject(`SET LOCAL ROLE anon;${ctxSQL(children[0])}`,'permission denied')
pass('private native configuration, assignments, snapshots and context RPC reject direct anonymous/authenticated access')
assert.deepEqual(history(),before)
writeFileSync(path.join(output,'postgres-integration.json'),JSON.stringify({database,template,scenariosPassed:log.length,scenarios:log,oldTableFingerprintsBefore:before,oldTableFingerprintsAfter:history(),historicalUnchanged:true,supabaseMutations:0},null,2))
console.log(`Completed ${log.length} PostgreSQL scenarios in isolated ${database}`)
