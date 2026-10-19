// Actual local PostgreSQL official-workflow checks. No .env or Supabase.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {spawnSync,spawn} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {calculateNativeSnapshot,nativeQualifierProposal} from '../src/modules/competition-native-tabulation.js'
import {nativeExportCsv,nativeExportRows} from '../src/modules/competition-native-exports.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'audits/competition-phase6-2026-10-13')
const template='votrix_tabulation_1791894228454',database=`votrix_publication_${Date.now()}`,exe='C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete environment.PGSERVICE;delete environment.PGSERVICEFILE
function sql(source,target=database){assert.ok([database,'postgres',template].includes(target));if(target===template)assert.match(source,/^BEGIN TRANSACTION READ ONLY;/);const r=spawnSync(exe,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',env:environment,windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()}
const literal=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`,read=s=>JSON.parse(sql(s)),id=()=>crypto.randomUUID(),log=[]
const pass=s=>{log.push(s);console.log('PASS '+s)}
const reject=(s,m)=>sql(`DO $$ BEGIN BEGIN ${s};RAISE EXCEPTION 'UNEXPECTED_SUCCESS';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ${literal('%'+m+'%')} THEN RAISE;END IF;END;END $$;`)
const concurrent=source=>new Promise((resolve,rejectPromise)=>{const p=spawn(exe,['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',error='';const timer=setTimeout(()=>{p.kill();rejectPromise(new Error('Timeout'))},30000);p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>error+=x);p.on('error',rejectPromise);p.on('close',code=>{clearTimeout(timer);resolve({code,out:out.trim(),error})});p.stdin.end(source)})
assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8'),source=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase5-2026-10-13/native-preflight-complete.json'),'utf8'))
assert.equal(reviewed.target.database,template);assert.equal(reviewed.blockers,0);assert.deepEqual(source,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata})
sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres');mkdirSync(output,{recursive:true});writeFileSync(path.join(output,'local-target.json'),JSON.stringify({database,template,host:'127.0.0.1',port:55439,disposable:true},null,2))
const original=Object.fromEntries(Object.keys(reviewed.inventory).map(t=>[t,read(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${t} t`)]))
const history=()=>Object.fromEntries(Object.entries(original).map(([t,rows])=>[t,sql(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM ${t} t WHERE to_jsonb(t) IN(SELECT value FROM jsonb_array_elements(${json(rows)}))`)]))
const before=history(),migration=readFileSync(path.join(root,'backend/src/database/migrations/107_competition_scoped_results.sql'),'utf8');sql(migration);assert.deepEqual(history(),before);sql(migration);assert.deepEqual(history(),before)
pass('107 installation/rerun preserve all 45 original inventories in a catalog-reviewed disposable clone')
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
const open=x=>{control(x,'start');for(const e of x.entries)control(x,'access',{kind:'entry',targetId:e,open:true});control(x,'access',{kind:'criterion',targetId:x.major,open:true});appoint(x)}
const finish=x=>{for(const judge of judges)sheet(x,judge);control(x,'close');const source=snapshot(x),data=calculateNativeSnapshot(source,x.cfg.scoringConfig.calculationMethod==='manual'?{manualResults:x.entries.map((contestantId,i)=>({contestantId,rank:i+1})),reason:'Explicit manual official review'}:{}),calc=read(calculateSQL(x,data));read(transitionSQL(x,calc.calculationId,'verify'));read(transitionSQL(x,calc.calculationId,'finalize'));return calc}
const pub=(x)=>read(`SELECT coalesce(competition_child_public_results('${event}','${x.c}',${x.round?literal(x.round)+'::uuid':'NULL'}),'null'::jsonb)`)
const owned=x=>read(`SELECT competition_child_owned_results('${event}','${x.c}','${owner}',${x.round?literal(x.round)+'::uuid':'NULL'})`)
const publishBody=(x,action)=>({roundId:x.round,requestId:id(),acknowledged:true,reason:'Explicit selected version publication',expectedPublicationVersion:owned(x).publication?.version??0,calculationId:owned(x).calculation?.id??null,sourceDigest:owned(x).sourceDigest,action})
const publishSQL=(x,action,body=publishBody(x,action),actor=owner)=>`SELECT competition_child_publication_action('${event}','${x.c}','${actor}',${x.round?literal(x.round)+'::uuid':'NULL'},'${action}',${json(body)})`
const exportSQL=(x,kind='worksheets',source=snapshot(x),judge=null)=>`SELECT competition_child_export_sources('${event}','${x.c}','${owner}',${x.round?literal(x.round)+'::uuid':'NULL'},'${kind}','${source.sourceDigest}',${source.calculation?literal(source.calculation.id)+'::uuid':'NULL'},${judge?literal(judge)+'::uuid':'NULL'})`
const a=make();open(a);sheet(a,judges[0]);assert.equal(pub(a),null);assert.equal(owned(a).complete,false);reject(exportSQL(a),'INCOMPLETE_OR_STALE_EXPORT');reject(publishSQL(a,'publish'),'FINALIZED_PUBLICATION_REQUIRED')
pass('unpublished/incomplete scope denies public results, all private score exports and publication')
sheet(a,judges[1]);sheet(a,judges[2]);control(a,'close');const calc=read(calculateSQL(a));read(transitionSQL(a,calc.calculationId,'verify'));read(transitionSQL(a,calc.calculationId,'finalize'));assert.equal(owned(a).official.standings.length,2);assert.equal(pub(a),null)
const siblings=[];for(const method of ['sum','rank_based','highest_score','lowest_removal']){const x=make(method);open(x);finish(x);siblings.push(x)}
assert.equal(Number(sql(`SELECT count(*) FROM competitions WHERE event_id='${event}'`)),5)
const request=publishBody(a,'publish'),published=read(publishSQL(a,'publish',request));assert.deepEqual(read(publishSQL(a,'publish',request)),published);assert.equal(pub(a).publicationVersion,1);assert.ok(siblings.every(x=>pub(x)===null));assert.ok(siblings.every(x=>owned(x).official.standings.length===2))
const publicBefore=pub(a);assert.ok(!JSON.stringify(publicBefore).includes('judge'));assert.ok(!JSON.stringify(publicBefore).includes('source_digest'));assert.ok(!JSON.stringify(publicBefore).includes('worksheets'))
pass('five independent official result/analytics scopes; publishing one leaves siblings private and exposes only whitelisted finalized data')
for(const kind of ['judge','worksheets','tabulation','final']){
 const data=read(exportSQL(a,kind,snapshot(a),kind==='judge'?judges[0]:null)),rows=nativeExportRows(data),csv=nativeExportCsv(data)
 assert.ok(rows.length>0);assert.ok(csv.includes(a.c));assert.ok(rows.every(r=>r.competition_id===a.c));assert.ok(csv.includes('source_digest'))
 if(kind==='judge')assert.equal(new Set(rows.map(r=>r.judge_id)).size,1)
 if(kind==='worksheets')assert.equal(new Set(rows.map(r=>r.judge_id)).size,3)
 if(kind==='tabulation')assert.ok(csv.includes('calculation_trace')&&csv.includes('submitted_raw_target'))
 if(kind==='final')assert.ok(rows.every(r=>r.finalized&&r.calculation_current&&r.calculation_id===calc.calculationId&&r.finalized_at))
}
pass('all four CSV formats bind exact child/round/source/calculation identities and finalization evidence')
const old=snapshot(a),historical=owned(a).history[0];control(a,'reopen',{judgeId:judges[0],acknowledged:true,reason:'Authorized source correction after publication'});assert.equal(owned(a).complete,false);assert.equal(owned(a).official,null);assert.ok(owned(a).history.every(h=>h.results===null));assert.deepEqual(pub(a),publicBefore);reject(exportSQL(a,'worksheets',old),'INCOMPLETE_OR_STALE_EXPORT');reject(publishSQL(a,'replace',{...request,requestId:id(),expectedPublicationVersion:1,action:'replace'}),'FINALIZED_PUBLICATION_REQUIRED')
pass('source correction revokes private current/historical score views and exports without silently changing the immutable published version')
const withdrawal=publishBody(a,'withdraw');read(publishSQL(a,'withdraw',withdrawal));assert.equal(pub(a).withdrawn,true);assert.equal(pub(a).publicationVersion,2);read(publishSQL(a,'publish',request));assert.equal(pub(a).withdrawn,true)
control(a,'resume');sheet(a,judges[0]);control(a,'close');const nextCalc=read(calculateSQL(a));read(transitionSQL(a,nextCalc.calculationId,'verify'));read(transitionSQL(a,nextCalc.calculationId,'finalize'));read(publishSQL(a,'publish'));assert.equal(pub(a).publicationVersion,3);assert.equal(owned(a).history.find(h=>h.calculationId===historical.calculationId).current,false)
const replacement=publishBody(a,'replace'),races=await Promise.all([concurrent(publishSQL(a,'replace',replacement)),concurrent(publishSQL(a,'replace',{...replacement,requestId:id()}))]);assert.equal(races.filter(r=>r.code===0).length,1);assert.ok(races.find(r=>r.code!==0).error.includes('PUBLICATION_VERSION_CONFLICT'))
reject(`UPDATE competition_child_publications SET public_snapshot='{}' WHERE id='${published.publicationId}'`,'immutable');reject(publishSQL(siblings[0],'publish',{...publishBody(siblings[0],'publish'),calculationId:nextCalc.calculationId}),'FINALIZED_PUBLICATION_REQUIRED');reject(publishSQL(a,'withdraw',publishBody(a,'withdraw'),outsider),'FORBIDDEN')
pass('withdrawal, republish, replacement, idempotent old receipts, concurrent publication CAS, historical versions and cross-child authorization are enforced')
const manual=make('manual');open(manual);finish(manual);read(publishSQL(manual,'publish'));assert.ok(pub(manual).results.standings.every(r=>r.manual&&r.score===null));assert.ok(nativeExportRows(read(exportSQL(manual,'final'))).every(r=>r.manual_placement&&r.final_score===''))
pass('manual official placements remain nonnumeric in both published results and CSV')
sql(`UPDATE events SET title='=HYPERLINK("malicious")' WHERE id='${event}'`)
const sheetData=read(exportSQL(siblings[0],'judge',snapshot(siblings[0]),judges[0]));assert.ok(nativeExportCsv(sheetData).includes("'=HYPERLINK"));assert.equal(sheetData.rawRows[0].rawText,String(sheetData.source.submissions.find(s=>s.judge_id===judges[0]).sources.find(s=>s.entry_id===sheetData.rawRows[0].participationId).scores[sheetData.rawRows[0].targetId]))
pass('actual export data uses shared CSV formula shielding and exact SQL decimal text rather than silently rounding source cells')
for(const role of ['anon','authenticated','service_role'])reject(`SET LOCAL ROLE ${role};SELECT * FROM competition_child_publications`,'permission denied')
reject(`SET LOCAL ROLE anon;SELECT competition_child_public_results('${event}','${a.c}',NULL)`,'permission denied')
assert.deepEqual(history(),before);const afterSource=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template));assert.deepEqual(afterSource,source)
writeFileSync(path.join(output,'postgres-integration.json'),JSON.stringify({database,template,passed:log.length,scenarios:log,historicalBefore:before,historicalAfter:history(),sourceTemplateUnchanged:true,productionTouched:false},null,2));console.log(`Verified ${log.length} scenarios in ${database}`)
