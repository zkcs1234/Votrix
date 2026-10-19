// Actual local PostgreSQL official-workflow checks. No .env or Supabase.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {spawnSync,spawn} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {calculateNativeSnapshot,nativeQualifierProposal} from '../src/modules/competition-native-tabulation.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'audits/competition-phase5-2026-10-13')
const template='votrix_scoring_1791886877034',database=`votrix_tabulation_${Date.now()}`,exe='C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete environment.PGSERVICE;delete environment.PGSERVICEFILE
function sql(source,target=database){assert.ok([database,'postgres',template].includes(target));if(target===template)assert.match(source,/^BEGIN TRANSACTION READ ONLY;/);const r=spawnSync(exe,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',env:environment,windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()}
const literal=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`,read=s=>JSON.parse(sql(s)),id=()=>crypto.randomUUID(),log=[]
const pass=s=>{log.push(s);console.log('PASS '+s)}
const reject=(s,m)=>sql(`DO $$ BEGIN BEGIN ${s};RAISE EXCEPTION 'UNEXPECTED_SUCCESS';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ${literal('%'+m+'%')} THEN RAISE;END IF;END;END $$;`)
const concurrent=source=>new Promise((resolve,rejectPromise)=>{const p=spawn(exe,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',error='';const timer=setTimeout(()=>{p.kill();rejectPromise(new Error('Timeout'))},30000);p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>error+=x);p.on('error',rejectPromise);p.on('close',code=>{clearTimeout(timer);resolve({code,out:out.trim(),error})});p.stdin.end(source)})
assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8'),source=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase4-2026-10-13/native-preflight-complete.json'),'utf8'))
assert.equal(reviewed.target.database,template);assert.equal(reviewed.blockers,0);assert.deepEqual(source,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata})
sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres');mkdirSync(output,{recursive:true});writeFileSync(path.join(output,'local-target.json'),JSON.stringify({database,template,host:'127.0.0.1',port:55439,disposable:true},null,2))
const original=Object.fromEntries(Object.keys(reviewed.inventory).map(t=>[t,read(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${t} t`)]))
const history=()=>Object.fromEntries(Object.entries(original).map(([t,rows])=>[t,sql(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM ${t} t WHERE to_jsonb(t) IN(SELECT value FROM jsonb_array_elements(${json(rows)}))`)]))
const before=history(),migration=readFileSync(path.join(root,'backend/src/database/migrations/106_competition_scoped_tabulation.sql'),'utf8');sql(migration);assert.deepEqual(history(),before);sql(migration);assert.deepEqual(history(),before)
pass('106 installation/rerun preserve all 39 original inventories in a catalog-reviewed disposable clone')
const owner=id(),reviewer=id(),outsider=id(),org=id(),event=id(),reviewEnrollment=id(),judges=[id(),id(),id()],enrollments=judges.map(id)
sql(`INSERT INTO users(id,role) VALUES('${owner}','organizer'),('${reviewer}','participant'),('${outsider}','participant'),${judges.map(j=>`('${j}','participant')`).join(',')};INSERT INTO organizations(id,organizer_id) VALUES('${org}','${owner}');INSERT INTO events(id,organization_id,title) VALUES('${event}','${org}','Phase 5 isolated fixture');INSERT INTO event_participants(id,event_id,user_id,judge_role) VALUES('${reviewEnrollment}','${event}','${reviewer}','score_reviewer'),${enrollments.map((ep,i)=>`('${ep}','${event}','${judges[i]}','judge')`).join(',')};`)
const rev=c=>read(`SELECT jsonb_build_object('setup',setup_revision,'input',input_revision) FROM competitions WHERE id='${c}'`)
let number=5000
const make=(method='weighted_average',options={})=>{
 const c=id(),major=id(),minor=id(),masters=[id(),id()],pre=options.multiple?id():null,final=options.multiple?id():null,finalMajor=id(),finalMinor=id()
 read(`SELECT competition_create_child('${event}','${owner}','${c}','${method} ${number}','Dance')`)
 const entries=masters.map(m=>{sql(`INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${m}','${event}','Synthetic ${number}',${number++})`);return read(`SELECT competition_add_entry('${event}','${owner}','${c}','${m}',NULL)`).id})
 const cfg={structure:options.multiple?'multiple':'single',rounds:options.multiple?[{id:pre,name:'Preliminary',displayOrder:0,progression:options.carry==='weighted'?'weighted':'back_to_zero',...(options.carry==='weighted'?{weight:50}:{}),advancementType:options.policy??'none',...(options.value!=null?{advancementValue:options.value}:{}),nextRoundId:final},{id:final,name:'Final',displayOrder:1,progression:options.carry??'back_to_zero',...(options.carry==='weighted'?{weight:50}:{})}]:[],criteria:[{id:major,roundId:pre,name:'Technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[{id:minor,name:'Execution',minScore:0,maxScore:10}]},...(options.multiple?[{id:finalMajor,roundId:final,name:'Final Technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[{id:finalMinor,name:'Final execution',minScore:0,maxScore:10}]}]:[])],scoringConfig:{calculationMethod:method,decimalPlaces:2,tiePolicy:'shared',dropLowest:1,dropHighest:0,...(method==='manual'?{manualBasis:'Recorded independent official placements'}:{deductionRules:[{id:'penalty',description:'Approved scope violation',amount:2,units:method==='rank_based'?'placements':'points',...(pre?{roundId:pre}:{})}]})}}
 read(`SELECT competition_save_native_configuration('${event}','${c}','${owner}',${rev(c).setup},${json(cfg)})`)
 for(const ep of enrollments)read(`SELECT competition_assign_native_judge('${event}','${c}','${owner}','${ep}',NULL,false)`)
 const r=rev(c);read(`SELECT competition_freeze_native_rules('${event}','${c}','${owner}',${r.setup},${r.input})`)
 return {c,major,minor,entries,cfg,round:pre,pre,final,finalMajor,finalMinor,tie:options.tie}
}
const view=(x,j=judges[0])=>read(`SELECT competition_child_live_view('${event}','${x.c}','${j}',${x.round?literal(x.round)+'::uuid':'NULL'},false)`)
const control=(x,action,extra={})=>read(`SELECT competition_child_live_control('${event}','${x.c}','${owner}',${x.round?literal(x.round)+'::uuid':'NULL'},'${action}',${json({...view(x).context,requestId:id(),...extra})})`)
const sheet=(x,j)=>{for(const [i,e] of x.entries.entries())read(`SELECT competition_child_score_write('${event}','${x.c}','${j}',${x.round?literal(x.round)+'::uuid':'NULL'},'lock',${json({...view(x,j).context,requestId:id(),entryId:e,criterionId:x.major,rowRevision:view(x,j).drafts.find(d=>d.entry_id===e)?.revision??0,scores:{[x.minor]:i===0||x.tie?[8,7,6][judges.indexOf(j)]:5}})})`);return read(`SELECT competition_child_score_write('${event}','${x.c}','${j}',${x.round?literal(x.round)+'::uuid':'NULL'},'submit',${json({...view(x,j).context,requestId:id()})})`)}
const snapshot=(x,j=owner,isReviewer=false)=>read(`SELECT competition_child_tabulation_snapshot('${event}','${x.c}','${j}',${x.round?literal(x.round)+'::uuid':'NULL'},${isReviewer})`)
const appoint=x=>read(`SELECT competition_child_appoint_reviewer('${event}','${x.c}','${owner}','${reviewEnrollment}')`)
const calculateSQL=(x,data=calculateNativeSnapshot(snapshot(x)))=>`SELECT competition_child_official_calculate('${event}','${x.c}','${owner}',${x.round?literal(x.round)+'::uuid':'NULL'},'${snapshot(x).sourceDigest}',${json(data.input)},${json(data.output)})`
const transitionSQL=(x,calc,action,actor=action==='verify'?reviewer:owner)=>`SELECT competition_child_official_transition('${event}','${x.c}','${actor}','${calc}','${action}','Explicit independent review')`
const a=make();control(a,'start');for(const e of a.entries)control(a,'access',{kind:'entry',targetId:e,open:true});control(a,'access',{kind:'criterion',targetId:a.major,open:true});appoint(a)
sheet(a,judges[0]);const incomplete=snapshot(a);assert.equal(incomplete.complete,false);assert.deepEqual(incomplete.submissions,[]);assert.equal(incomplete.rules,null);assert.equal(incomplete.calculation,null);assert.equal(incomplete.evidence,null)
pass('partial current submissions expose progress only: no worksheet payload, rules, calculation output or source evidence')
sheet(a,judges[1]);sheet(a,judges[2]);assert.equal(snapshot(a).complete,true);assert.equal(snapshot(a).submissions.length,3);control(a,'close')
const first=read(calculateSQL(a));read(transitionSQL(a,first.calculationId,'verify'));read(transitionSQL(a,first.calculationId,'finalize'));assert.equal(snapshot(a).calculation.finalized,true)
const old=read(`SELECT to_jsonb(c) FROM competition_child_calculations c WHERE id='${first.calculationId}'`)
control(a,'reopen',{judgeId:judges[0],acknowledged:true,reason:'Authorized source correction'})
assert.equal(Number(sql(`SELECT count(*) FROM competition_child_submissions WHERE session_id='${view(a).session.id}'`)),3)
const reopened=snapshot(a);assert.equal(reopened.complete,false);assert.equal(reopened.progress.filter(j=>j.submitted).length,2);assert.deepEqual(reopened.submissions,[]);assert.equal(reopened.calculation,null);assert.equal(reopened.rules,null)
const oldSubmit=read(`SELECT payload FROM competition_child_scoring_audit WHERE session_id='${view(a).session.id}' AND actor_id='${judges[0]}' AND action='submit' ORDER BY created_at LIMIT 1`);read(`SELECT competition_child_score_write('${event}','${a.c}','${judges[0]}',NULL,'submit',${json(oldSubmit)})`);assert.equal(snapshot(a).complete,false);assert.equal(snapshot(a).progress.filter(j=>j.submitted).length,2)
reject(transitionSQL(a,first.calculationId,'verify'),'STALE_OR_INCOMPLETE');reject(transitionSQL(a,first.calculationId,'finalize'),'STALE_OR_INCOMPLETE');assert.deepEqual(read(`SELECT to_jsonb(c) FROM competition_child_calculations c WHERE id='${first.calculationId}'`),old)
pass('authorized correction clears CURRENT completeness and revokes all worksheet/results visibility despite historical submissions and finalized calculation')
pass('replaying a historical idempotent submit receipt never recreates the cleared current pointer')
control(a,'resume');sheet(a,judges[0]);control(a,'close');assert.equal(snapshot(a).complete,true);assert.equal(snapshot(a).calculation,null)
const revised=read(calculateSQL(a));assert.notEqual(first.calculationId,revised.calculationId);assert.equal(revised.version,2)
reject(transitionSQL(a,revised.calculationId,'finalize'),'INDEPENDENT_VERIFICATION_REQUIRED');reject(transitionSQL(a,revised.calculationId,'verify',owner),'FORBIDDEN');read(transitionSQL(a,revised.calculationId,'verify'))
const races=await Promise.all([concurrent(transitionSQL(a,revised.calculationId,'finalize')),concurrent(transitionSQL(a,revised.calculationId,'finalize'))]);assert.equal(races.filter(r=>r.code===0).length,1)
pass('resubmission creates a new auditable version; independent review and concurrent single finalization are enforced')
const open=x=>{control(x,'start');for(const e of x.entries)control(x,'access',{kind:'entry',targetId:e,open:true});control(x,'access',{kind:'criterion',targetId:x.major,open:true})}
const finish=x=>{for(const judge of judges)sheet(x,judge);control(x,'close');const calc=read(calculateSQL(x));read(transitionSQL(x,calc.calculationId,'verify'));read(transitionSQL(x,calc.calculationId,'finalize'));return calc}
const siblings=[]
for(const [method,expected] of [['sum',210],['rank_based',3],['highest_score',80],['lowest_removal',75]]){
 const x=make(method);open(x);appoint(x);finish(x);assert.equal(snapshot(x).calculation.output_snapshot.results.find(r=>r.contestantId===x.entries[0]).finalScore,expected);siblings.push(x)
}
assert.equal(Number(sql(`SELECT count(*) FROM competitions WHERE event_id='${event}'`)),5)
pass('five competitions retain independent current official calculations for all five numeric methods using the unchanged engine')
const manual=make('manual');open(manual);appoint(manual);for(const judge of judges)sheet(manual,judge);control(manual,'close')
const manualData=calculateNativeSnapshot(snapshot(manual),{manualResults:manual.entries.map((contestantId,i)=>({contestantId,rank:i+1})),reason:'Explicit approved manual placements'})
const manualCalc=read(calculateSQL(manual,manualData));read(transitionSQL(manual,manualCalc.calculationId,'verify'));read(transitionSQL(manual,manualCalc.calculationId,'finalize'));assert.ok(snapshot(manual).calculation.output_snapshot.results.every(r=>r.manual&&r.finalScore===null))
pass('manual official results require explicit complete placements, recorded basis and independent approval without fabricated scores')
const dedSQL=(x,action,body,actor=action==='propose'?owner:reviewer)=>`SELECT competition_child_deduction_action('${event}','${x.c}','${actor}',${x.round?literal(x.round)+'::uuid':'NULL'},'${action}',${json(body)})`
const proposed=read(dedSQL(a,'propose',{entryId:a.entries[0],ruleKey:'penalty',offenseKey:'recorded offense',reason:'Explicit rule violation'}))
assert.equal(snapshot(a).calculation,null);assert.equal(snapshot(a).deductionsResolved,false);reject(calculateSQL(a),'RESOLVED_SOURCES_REQUIRED')
reject(dedSQL(a,'approve',{decisionId:proposed.decisionId,reason:'Attempted own approval'},owner),'FORBIDDEN');read(dedSQL(a,'approve',{decisionId:proposed.decisionId,reason:'Independent approved violation'}))
const penaltyCalc=read(calculateSQL(a));assert.equal(snapshot(a).calculation.output_snapshot.results.find(r=>r.contestantId===a.entries[0]).finalScore,68)
reject(dedSQL(a,'propose',{entryId:a.entries[0],ruleKey:'penalty',offenseKey:'recorded offense',reason:'Duplicate violation'}),'duplicate key')
const preservedPenalty=read(`SELECT output_snapshot FROM competition_child_calculations WHERE id='${penaltyCalc.calculationId}'`);read(dedSQL(a,'revoke',{decisionId:proposed.decisionId,reason:'Approved decision correction'}));assert.equal(snapshot(a).calculation,null);assert.deepEqual(read(`SELECT output_snapshot FROM competition_child_calculations WHERE id='${penaltyCalc.calculationId}'`),preservedPenalty)
const rank=siblings.find(x=>x.cfg.scoringConfig.calculationMethod==='rank_based'),placement=read(dedSQL(rank,'propose',{entryId:rank.entries[0],ruleKey:'penalty',offenseKey:'placement offense',reason:'Recorded placement violation'}));read(dedSQL(rank,'approve',{decisionId:placement.decisionId,reason:'Independent placement approval'}));read(calculateSQL(rank));assert.equal(snapshot(rank).calculation.output_snapshot.results.find(r=>r.contestantId===rank.entries[0]).finalScore,5)
reject(dedSQL(siblings[0],'approve',{decisionId:proposed.decisionId,reason:'Cross-child review'}),'FORBIDDEN')
pass('approved numeric subtraction and rank-placement addition apply once; pending/revoked/foreign decisions invalidate or reject without overwriting history')
const confirmSQL=(x,qualifierIds,extra={})=>{const state=snapshot(x);return `SELECT competition_child_confirm_qualification('${event}','${x.c}','${owner}','${x.round}','${state.calculation.id}','${state.sourceDigest}',${json(qualifierIds)},'Explicit qualification review',true)`}
for(const [policy,value,tie,count] of [['top_n',1,true,2],['top_percent',50,false,1],['threshold',60,false,1],['manual',null,false,1],['none',null,false,2]]){
 const x=make('weighted_average',{multiple:true,policy,value,tie});open(x);appoint(x);finish(x)
 const proposal=nativeQualifierProposal(snapshot(x),snapshot(x).calculation),selected=policy==='manual'?[x.entries[1]]:proposal.automatic
 assert.equal(selected.length,count)
 const future={...x,round:x.final,major:x.finalMajor,minor:x.finalMinor,entries:selected}
 reject(`SELECT competition_child_live_control('${event}','${x.c}','${owner}','${x.final}','start',${json({...view(future).context,requestId:id()})})`,'CONFIRMED_QUALIFICATION_REQUIRED')
 if(policy==='top_n')reject(confirmSQL(x,[selected[0]]),'POLICY_MISMATCH')
 read(confirmSQL(x,selected));assert.equal(view(future).session,null);assert.equal(view(future).laterRoundBlocked,false);open(future);assert.deepEqual(view(future).session.entry_ids,selected);finish(future)
 const oldFinal=snapshot(future).calculation.id;control(x,'reopen',{judgeId:judges[0],acknowledged:true,reason:'Authorized earlier source correction'});assert.equal(view(future).scoringAvailable,false);assert.equal(snapshot(future).complete,false);assert.equal(snapshot(future).calculation,null);reject(transitionSQL(future,oldFinal,'finalize'),'STALE_OR_INCOMPLETE')
 control(x,'resume');sheet(x,judges[0]);control(x,'close');const revisedPre=read(calculateSQL(x));read(transitionSQL(x,revisedPre.calculationId,'verify'));read(transitionSQL(x,revisedPre.calculationId,'finalize'));read(confirmSQL(x,selected));assert.deepEqual(view(future).session.entry_ids,selected);assert.equal(snapshot(future).complete,true);assert.equal(snapshot(future).calculation,null)
}
pass('Top-N ties, percentage, threshold, manual and all-continue qualification freeze rosters without starting sessions; earlier corrections revoke downstream authority and require reconfirmation')
for(const [carry,expected] of [['carry_forward',140],['weighted',70]]){
 const x=make('weighted_average',{multiple:true,policy:'none',carry});open(x);appoint(x);finish(x);read(confirmSQL(x,x.entries));const future={...x,round:x.final,major:x.finalMajor,minor:x.finalMinor};open(future);finish(future);assert.equal(snapshot(future).calculation.output_snapshot.results.find(r=>r.contestantId===x.entries[0]).finalScore,expected)
}
pass('Back to Zero, additive carry and configured weighted final contributions reuse existing exact engine semantics without a new formula')
const active=make('weighted_average',{multiple:true,policy:'none'});open(active);appoint(active);finish(active);read(confirmSQL(active,active.entries));const nextActive={...active,round:active.final,major:active.finalMajor,minor:active.finalMinor};open(nextActive);assert.equal(view(nextActive).session.status,'active');control(active,'reopen',{judgeId:judges[0],acknowledged:true,reason:'Earlier scoring source correction'});assert.equal(view(nextActive).session.status,'paused');control(active,'resume');sheet(active,judges[0]);control(active,'close');const currentPre=read(calculateSQL(active));read(transitionSQL(active,currentPre.calculationId,'verify'));read(transitionSQL(active,currentPre.calculationId,'finalize'));read(confirmSQL(active,active.entries));assert.equal(view(nextActive).session.status,'paused');control(nextActive,'resume');assert.equal(view(nextActive).session.status,'active')
pass('earlier source corrections atomically pause active dependent scoring; roster reconfirmation requires an explicit resume')
reject(`SELECT competition_child_tabulation_snapshot('${event}','${a.c}','${outsider}',NULL,false)`,'FORBIDDEN');reject(`SELECT competition_child_tabulation_snapshot('${event}','${a.c}','${judges[0]}',NULL,true)`,'FORBIDDEN');reject(transitionSQL(siblings[0],first.calculationId,'finalize'),'FORBIDDEN')
const trace=snapshot(siblings[0]).calculation.output_snapshot.worksheets.find(w=>w.entryId===siblings[0].entries[0]&&w.judgeId===judges[0]);assert.equal(trace.criteria[0].minors[0].raw,8);assert.equal(trace.criteria[0].minors[0].normalized,80);assert.equal(trace.criteria[0].contribution,80)
pass('actual owner/reviewer/cross-child authorization and exact raw/normalized/weighted calculation traces are verified')
for(const table of ['competition_child_calculations','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_review_policies','competition_child_calculation_transitions','competition_child_qualifications'])for(const role of ['anon','authenticated','service_role'])reject(`SET LOCAL ROLE ${role};SELECT * FROM ${table}`,'permission denied')
reject(`UPDATE competition_child_calculations SET output_snapshot='{}' WHERE id='${first.calculationId}'`,'immutable')
pass('official snapshots, policies, decisions, transitions and qualified rosters are immutable and deny direct public/authenticated/service reads')
for(const role of ['anon','authenticated','service_role'])reject(`SET LOCAL ROLE ${role};SELECT competition_child_current_sources('${event}','${a.c}',NULL)`,'permission denied')
for(const table of ['competition_scores','competition_session_judge_scores','competition_sessions','competition_round_submissions','competition_result_calculations','competition_deductions','competition_criterion_lock_history'])assert.equal(Number(sql(`SELECT count(*) FROM ${table}`)),original[table].length)
assert.deepEqual(history(),before)
writeFileSync(path.join(output,'postgres-integration.json'),JSON.stringify({database,template,passed:log.length,scenarios:log,historicalBefore:before,historicalAfter:history(),productionTouched:false},null,2))
console.log(`Verified ${log.length} scenarios in ${database}`)
