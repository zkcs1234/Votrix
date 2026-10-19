// Local disposable-clone verification only. No dotenv or Supabase imports.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync,spawn } from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'audits/competition-phase4-2026-10-13')
const template='votrix_native_1791883232718',database=`votrix_scoring_${Date.now()}`,exe='C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete environment.PGSERVICE;delete environment.PGSERVICEFILE
function sql(source,target=database){assert.ok([database,'postgres',template].includes(target));if(target===template)assert.match(source,/^BEGIN TRANSACTION READ ONLY;/);const r=spawnSync(exe,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',env:environment,windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()}
const literal=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`,read=s=>JSON.parse(sql(s)),id=()=>crypto.randomUUID(),log=[]
const pass=s=>{log.push(s);console.log('PASS '+s)}
const reject=(s,m)=>sql(`DO $$ BEGIN BEGIN ${s};RAISE EXCEPTION 'UNEXPECTED_SUCCESS';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ${literal('%'+m+'%')} THEN RAISE;END IF;END;END $$;`)
const concurrent=source=>new Promise((resolve,rejectPromise)=>{const p=spawn(exe,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',error='';const timer=setTimeout(()=>{p.kill();rejectPromise(new Error('Timeout'))},30000);p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>error+=x);p.on('error',rejectPromise);p.on('close',code=>{clearTimeout(timer);resolve({code,out:out.trim(),error})});p.stdin.end(source)})
assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8')
const source=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template))
const reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase3-2026-10-13/native-preflight-final.json'),'utf8'))
assert.equal(reviewed.target.database,template);assert.equal(reviewed.blockers,0);assert.deepEqual(source,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata})
sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres');mkdirSync(output,{recursive:true});writeFileSync(path.join(output,'local-target.json'),JSON.stringify({database,template,host:'127.0.0.1',port:55439,disposable:true},null,2));writeFileSync(path.join(output,'catalog-before.json'),JSON.stringify(source,null,2))
const original=Object.fromEntries(Object.keys(reviewed.inventory).map(t=>[t,read(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${t} t`)]))
const history=()=>Object.fromEntries(Object.entries(original).map(([t,rows])=>[t,sql(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM ${t} t WHERE to_jsonb(t) IN(SELECT value FROM jsonb_array_elements(${json(rows)}))`)]))
const before=history(),migration=readFileSync(path.join(root,'backend/src/database/migrations/105_competition_scoped_scoring.sql'),'utf8');sql(migration);assert.deepEqual(history(),before);sql(migration);assert.deepEqual(history(),before)
pass('catalog-reviewed disposable clone; installation/rerun preserve all 34 existing table inventories')
const owner=id(),judge=id(),other=id(),outsider=id(),org=id(),event=id(),ep=id(),ep2=id()
sql(`INSERT INTO users(id,role) VALUES('${owner}','organizer'),('${judge}','participant'),('${other}','participant'),('${outsider}','participant');INSERT INTO organizations(id,organizer_id) VALUES('${org}','${owner}');INSERT INTO events(id,organization_id,title) VALUES('${event}','${org}','Phase 4 isolated fixture');INSERT INTO event_participants(id,event_id,user_id,judge_role) VALUES('${ep}','${event}','${judge}','judge'),('${ep2}','${event}','${other}','judge');`)
const rev=c=>read(`SELECT jsonb_build_object('setupRevision',setup_revision,'inputRevision',input_revision,'rulesVersion',official_child_rules_id) FROM competitions WHERE id='${c}'`)
let masterNumber=3000
const make=(name,multiple=false)=>{
 const c=id(),entryMaster=id(),entry2Master=id(),first=multiple?id():null,last=multiple?id():null,criterion=id(),minor=id(),secondMinor=id()
 read(`SELECT competition_create_child('${event}','${owner}','${c}',${literal(name)},'Dance')`)
 sql(`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${entryMaster}','${event}','Entry one',${masterNumber++}),('${entry2Master}','${event}','Entry two',${masterNumber++})`)
 const entry=read(`SELECT competition_add_entry('${event}','${owner}','${c}','${entryMaster}',NULL)`).id,entry2=read(`SELECT competition_add_entry('${event}','${owner}','${c}','${entry2Master}',NULL)`).id
 const cfg={structure:multiple?'multiple':'single',rounds:multiple?[{id:first,name:'Preliminary',displayOrder:0,entryIds:[entry],advancementType:'top_n',advancementValue:1,nextRoundId:last},{id:last,name:'Final',displayOrder:1}]:[],criteria:[{id:criterion,roundId:first,name:'Technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[{id:minor,name:'Execution',minScore:0,maxScore:10},{id:secondMinor,name:'Precision',minScore:1,maxScore:5}]},...(multiple?[{id:id(),roundId:last,name:'Final technique',percentage:100,minScore:0,maxScore:10}]:[])],scoringConfig:{calculationMethod:'weighted_average',tiePolicy:'shared'}}
 read(`SELECT competition_save_native_configuration('${event}','${c}','${owner}',${rev(c).setupRevision},${json(cfg)})`)
 for(const enrollment of [ep,ep2])read(`SELECT competition_assign_native_judge('${event}','${c}','${owner}','${enrollment}',${multiple&&enrollment===ep?literal(first)+'::uuid':'NULL'},false)`)
 const r=rev(c);read(`SELECT competition_freeze_native_rules('${event}','${c}','${owner}',${r.setupRevision},${r.inputRevision})`)
 return {c,entry,entry2,first,last,criterion,minor,secondMinor,cfg}
}
const a=make('Hip-Hop')
assert.equal(read(`SELECT competition_child_scoring_choices('${event}','${judge}',false)`).length,1)
assert.equal(read(`SELECT competition_child_live_view('${event}','${a.c}','${judge}',NULL,false)`).context.competitionId,a.c)
pass('one-competition event exposes the explicit frozen single-phase context without legacy fallback')
const b=make('Contemporary'),multi=make('Multi',true),street=make('Street'),folk=make('Folk')
const view=(x,j=judge,ownerView=false,r=x.first)=>read(`SELECT competition_child_live_view('${event}','${x.c}','${j}',${r?literal(r)+'::uuid':'NULL'},${ownerView})`)
const body=x=>({...view(x).context,requestId:id()})
const controlSQL=(x,action,data={...body(x)},r=x.first)=>`SELECT competition_child_live_control('${event}','${x.c}','${owner}',${r?literal(r)+'::uuid':'NULL'},${literal(action)},${json(data)})`
const control=(x,action,extra={})=>read(controlSQL(x,action,{...body(x),...extra}))
const scoreSQL=(x,action,data,j=judge)=>`SELECT competition_child_score_write('${event}','${x.c}','${j}',${x.first?literal(x.first)+'::uuid':'NULL'},${literal(action)},${json(data)})`
const score=(x,action,data)=>read(scoreSQL(x,action,data))
const scores=x=>({[x.minor]:7.5,[x.secondMinor]:4})
const rowBody=(x,entry=x.entry,j=judge)=>({...view(x,j).context,requestId:id(),entryId:entry,criterionId:x.criterion,rowRevision:view(x,j).drafts.find(d=>d.entry_id===entry)?.revision??0,scores:scores(x)})
assert.equal(view(a).context.roundId,null);reject(`SELECT competition_child_live_view('${event}','${a.c}','${outsider}',NULL,false)`,'FORBIDDEN')
const choices=read(`SELECT competition_child_scoring_choices('${event}','${judge}',false)`);assert.equal(choices.length,5);assert.equal(read(`SELECT competition_child_scoring_choices('${event}','${outsider}',false)`).length,0)
reject(`SELECT competition_child_live_view('${event}','${multi.c}','${judge}','${multi.last}',false)`,'FORBIDDEN');reject(`SELECT competition_child_live_view('${event}','${a.c}','${outsider}',NULL,true)`,'ORGANIZER_FORBIDDEN')
pass('authorized context choices and NULL single phase; unassigned judge has no contexts or score access')
const aRev=rev(a.c),bRev=rev(b.c);control(a,'start');control(b,'start');assert.notEqual(view(a).session.id,view(b).session.id);assert.deepEqual(rev(a.c),aRev);assert.deepEqual(rev(b.c),bRev)
control(street,'start');control(folk,'start');control(multi,'start');assert.equal(new Set([a,b,multi,street,folk].map(x=>view(x).session.id)).size,5)
reject(scoreSQL(a,'draft',rowBody(a)),'ACCESS_FORBIDDEN')
for(const x of [a,b]){for(const entry of [x.entry,x.entry2])control(x,'access',{kind:'entry',targetId:entry,open:true});control(x,'access',{kind:'criterion',targetId:x.criterion,open:true})}
pass('independent sessions/revisions and closed-by-default entry/criterion gates')
const originalB=view(b);control(a,'pause');assert.deepEqual(view(b),originalB);reject(scoreSQL(a,'draft',rowBody(a)),'SESSION_CLOSED');control(a,'resume')
pass('Hip-Hop pause/resume leaves Contemporary session, access, rules and source revisions unchanged')
const bad=rowBody(a);bad.entryId=b.entry;reject(scoreSQL(a,'lock',bad),'ACCESS_FORBIDDEN');bad.entryId=a.entry;bad.criterionId=b.criterion;reject(scoreSQL(a,'lock',bad),'ACCESS_FORBIDDEN')
const out=rowBody(a);out.scores[a.minor]=11;reject(scoreSQL(a,'lock',out),'OUT_OF_BOUNDS');const empty=rowBody(a);delete empty.scores[a.secondMinor];reject(scoreSQL(a,'lock',empty),'INCOMPLETE_OR_FOREIGN');const foreign=rowBody(a);foreign.scores[b.minor]=1;reject(scoreSQL(a,'lock',foreign),'INCOMPLETE_OR_FOREIGN')
for(const field of ['setupRevision','inputRevision'])reject(scoreSQL(a,'draft',{...rowBody(a),[field]:1}),'CHILD_REVISION_CONFLICT');reject(scoreSQL(a,'draft',{...rowBody(a),rulesVersion:rev(b.c).rulesVersion}),'CHILD_REVISION_CONFLICT')
pass('cross-competition entries/criteria, missing minors, foreign targets and invalid raw bounds reject atomically')
const draft=rowBody(a),saved=score(a,'draft',draft);assert.equal(saved.rowRevision,1);assert.deepEqual(score(a,'draft',draft),saved);assert.equal(view(a).drafts.length,1);assert.equal(view(a,other).drafts.length,0)
reject(scoreSQL(a,'draft',{...draft,requestId:id()}),'ROW_REVISION_CONFLICT');reject(scoreSQL(a,'draft',{...draft,scores:{[a.minor]:5}}),'REQUEST_CONFLICT')
pass('draft CAS, immutable request receipts, idempotent response-loss retries, judge score confidentiality')
const stale=rowBody(a);control(a,'access',{kind:'entry',targetId:a.entry,open:false});reject(scoreSQL(a,'lock',stale),'SESSION_CLOSED_OR_REVISION_CONFLICT');control(a,'access',{kind:'entry',targetId:a.entry,open:true})
const locked=score(a,'lock',rowBody(a));assert.equal(locked.locked,true);reject(scoreSQL(a,'draft',rowBody(a)),'LOCKED_OR_ROW');reject(scoreSQL(a,'submit',body(a)),'ALL_CRITERIA_LOCKS_REQUIRED')
score(a,'lock',rowBody(a,a.entry2));const submitBody=body(a),submitted=score(a,'submit',submitBody);assert.deepEqual(score(a,'submit',submitBody),submitted);assert.equal(view(a).submission.id,submitted.submissionId)
const immutable=read(`SELECT sources FROM competition_child_submissions WHERE id='${submitted.submissionId}'`);assert.equal(immutable.length,2);reject(`UPDATE competition_child_submissions SET sources='[]' WHERE id='${submitted.submissionId}'`,'immutable')
pass('access-revision race, locks, complete-round gate and immutable/idempotent submitted sources')
const ownerView=view(a,owner,true);assert.equal(ownerView.drafts.length,0);assert.equal(ownerView.progress.find(j=>j.judgeId===judge).submitted,true)
control(a,'close');reject(scoreSQL(a,'draft',rowBody(a)),'SESSION_CLOSED');assert.equal(view(b).session.status,'active');assert.equal(view(b).drafts.length,0)
pass('organizer completion without scores; closure blocks writes and leaves sibling scoring active')
reject(controlSQL(a,'reopen',{...body(a),reason:'Correction',judgeId:judge}),'ACKNOWLEDGED_REASON_REQUIRED');control(a,'reopen',{acknowledged:true,reason:'Authorized scoring correction',judgeId:judge});assert.equal(view(a).submission,null);assert.equal(view(a).session.status,'paused');assert.deepEqual(read(`SELECT sources FROM competition_child_submissions WHERE id='${submitted.submissionId}'`),immutable)
control(a,'resume');assert.equal(view(a).drafts[0].locked,false);score(a,'lock',rowBody(a));score(a,'lock',rowBody(a,a.entry2));const resubmitted=score(a,'submit',body(a));assert.notEqual(resubmitted.submissionId,submitted.submissionId)
pass('acknowledged owner correction preserves old snapshot/audit, pauses, unlocks only selected judge and permits a new submission')
assert.deepEqual(view(multi).session.entry_ids,[multi.entry]);control(multi,'close');reject(controlSQL(multi,'start',{...view(multi,owner,true,multi.last).context,requestId:id()},multi.last),'FINALIZED_QUALIFICATION_REQUIRED');assert.equal(view(multi,owner,true,multi.last).session,null)
pass('frozen round roster and qualification boundary: Preliminary closure never opens Final')
const race=rowBody(b),races=await Promise.all([concurrent(scoreSQL(b,'draft',race)),concurrent(scoreSQL(b,'draft',{...race,requestId:id(),scores:{[b.minor]:9,[b.secondMinor]:5}}))]);assert.equal(races.filter(r=>r.code===0).length,1);assert.match(races.find(r=>r.code!==0).error,/ROW_REVISION_CONFLICT/)
const judgeBodies=[rowBody(b),rowBody(b,b.entry,other)],judgesRace=await Promise.all([concurrent(scoreSQL(b,'draft',judgeBodies[0])),concurrent(scoreSQL(b,'draft',judgeBodies[1],other))]);assert.ok(judgesRace.every(r=>r.code===0));assert.equal(view(b,other).drafts.length,1)
const next={...body(b)},controls=await Promise.all([concurrent(controlSQL(b,'pause',next)),concurrent(controlSQL(b,'close',{...next,requestId:id()}))]);assert.equal(controls.filter(r=>r.code===0).length,1);assert.match(controls.find(r=>r.code!==0).error,/REVISION_CONFLICT/)
pass('real concurrent same-row and organizer-control requests yield one commit and one stale rejection')
pass('two judges save independently in one session without invalidating setup rules or each other’s context')
for(const entry of [street.entry,street.entry2])control(street,'access',{kind:'entry',targetId:entry,open:true});control(street,'access',{kind:'criterion',targetId:street.criterion,open:true});score(street,'lock',rowBody(street));score(street,'lock',rowBody(street,street.entry2))
const duplicateBody=body(street),duplicates=await Promise.all([concurrent(scoreSQL(street,'submit',duplicateBody)),concurrent(scoreSQL(street,'submit',duplicateBody))]);assert.ok(duplicates.every(r=>r.code===0));assert.equal(JSON.parse(duplicates[0].out).submissionId,JSON.parse(duplicates[1].out).submissionId);assert.equal(Number(sql(`SELECT count(*) FROM competition_child_submissions WHERE session_id='${duplicateBody.sessionId}' AND judge_id='${judge}'`)),1)
pass('concurrent duplicate submissions return one immutable snapshot with the same identity')
control(folk,'access',{kind:'entry',targetId:folk.entry,open:true});control(folk,'access',{kind:'criterion',targetId:folk.criterion,open:true});const terminalBody=rowBody(folk);assert.equal(view(folk).contestants[0].open,true);sql(`UPDATE events SET status='completed' WHERE id='${event}'`);assert.equal(view(folk).scoringAvailable,false);assert.equal(view(folk).contestants[0].open,false);reject(scoreSQL(folk,'draft',terminalBody),'EVENT_SCORING_CLOSED');reject(controlSQL(folk,'close',{...terminalBody,requestId:id()}),'EVENT_SCORING_CLOSED');sql(`UPDATE events SET status='draft' WHERE id='${event}'`)
pass('terminal parent lifecycle disables authoritative sheet access and rejects judge/control mutations')
const revokedBody=rowBody(a),frozen=read(`SELECT count(*) FROM competition_child_submissions`);sql(`UPDATE event_participants SET is_active=false WHERE id='${ep}'`);reject(scoreSQL(a,'draft',revokedBody,judge),'FORBIDDEN');reject(`SELECT competition_child_live_view('${event}','${a.c}','${other}',NULL,false)`,'CURRENT_FROZEN_RULES_REQUIRED');assert.equal(read(`SELECT count(*) FROM competition_child_submissions`),frozen)
pass('current assignment revocation and child input invalidation fail closed without rewriting submissions')
for(const table of ['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads','competition_child_scoring_audit'])for(const role of ['anon','authenticated','service_role'])reject(`SET LOCAL ROLE ${role};SELECT 1 FROM ${table}`,'permission denied')
reject(`SET LOCAL ROLE anon;SELECT competition_child_scoring_choices('${event}','${judge}',false)`,'permission denied')
pass('native scoring tables deny direct anonymous/authenticated/service access; authorized API RPCs only')
for(const table of ['competition_scores','competition_session_judge_scores','competition_sessions','competition_round_submissions','competition_result_calculations','competition_deductions','competition_criterion_lock_history'])assert.equal(Number(sql(`SELECT count(*) FROM ${table}`)),original[table].length)
assert.deepEqual(history(),before);const afterSource=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template));assert.deepEqual(afterSource,source)
writeFileSync(path.join(output,'postgres-integration.json'),JSON.stringify({database,template,passed:log.length,scenarios:log,originalTableCount:Object.keys(before).length,historicalBefore:before,historicalAfter:history(),sourceTemplateUnchanged:true,productionTouched:false},null,2));console.log(`Verified ${log.length} scenarios in ${database}`)
