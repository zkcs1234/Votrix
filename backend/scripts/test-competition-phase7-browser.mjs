// Real Chromium components -> isolated HTTP contract adapter -> actual SQL RPCs.
// This is NOT the deployed auth controller/PostgREST/staging acceptance test.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {performance} from 'node:perf_hooks'
import express from '../node_modules/express/index.js'
import {WebSocket,WebSocketServer} from '../node_modules/ws/wrapper.mjs'
import {createServer} from '../../frontend/node_modules/vite/dist/node/index.js'
import {nativeCriteriaReadiness,validateNativeConfiguration} from '../src/modules/competition-native-configuration.js'
import {calculateNativeSnapshot} from '../src/modules/competition-native-tabulation.js'
import {nativeExportCsv} from '../src/modules/competition-native-exports.js'
import {joinRoom,leaveAllRooms} from '../src/websocket/ws-rooms.js'
import {emitToUser} from '../src/websocket/ws-emitter.js'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase7-2026-10-13'),temp=path.join(root,'.tmp/phase7-browser'),database=`votrix_phase7_browser_${Date.now()}`,template='votrix_publication_1791898451572'
mkdirSync(temp,{recursive:true});mkdirSync(out,{recursive:true})
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete environment.PGSERVICE;delete environment.PGSERVICEFILE
const timings=[],requests=[],literal=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`,id=()=>randomUUID()
function sql(source,target=database){assert.ok([database,template,'postgres'].includes(target));if(target===template)assert.match(source,/^BEGIN TRANSACTION READ ONLY;/);const start=performance.now(),r=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',env:environment,timeout:30000,windowsHide:true,maxBuffer:64*1024*1024});timings.push(performance.now()-start);if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim()}
const read=s=>JSON.parse(sql(s)),rpc=(fn,...args)=>read(`SELECT coalesce(${fn}(${args.join(',')}),'null'::jsonb)`),array=(table,condition='true')=>read(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${table} t WHERE ${condition}`)
assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8'),source=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase6-2026-10-13/native-preflight-complete.json')))
assert.deepEqual(source,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata});sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres')
const owner=id(),judge=id(),judge2=id(),reviewer=id(),org=id(),event=id(),master=id(),enrollment=id(),enrollment2=id(),reviewEnrollment=id(),actors=[owner,judge,judge2,reviewer]
sql(`INSERT INTO users(id,role) VALUES('${owner}','organizer'),('${judge}','participant'),('${judge2}','participant'),('${reviewer}','participant');INSERT INTO organizations(id,organizer_id) VALUES('${org}','${owner}');INSERT INTO events(id,organization_id,title) VALUES('${event}','${org}','Browser acceptance fixture');INSERT INTO competition_contestants(id,event_id,name,contestant_number) VALUES('${master}','${event}','Shared browser entrant',91000);INSERT INTO event_participants(id,event_id,user_id,judge_role) VALUES('${enrollment}','${event}','${judge}','judge'),('${enrollment2}','${event}','${judge2}','judge'),('${reviewEnrollment}','${event}','${reviewer}','score_reviewer');`)
const app=express();app.use(express.json());const actor=req=>req.headers.cookie?.match(/(?:^|;\s*)phase7_actor=([^;]+)/)?.[1]
const notice=c=>{const n=rpc('competition_child_official_notice',literal(event),literal(c),literal(owner),'NULL');for(const u of n.userIds??[])emitToUser(u,'competition:native-invalidated',{eventId:event,competitionId:c,roundId:null,affectedRoundIds:n.roundIds})}
app.get('/api/fixture/login',(req,res)=>{if(!actors.includes(req.query.actor))return res.sendStatus(403);res.cookie('phase7_actor',req.query.actor,{httpOnly:true,sameSite:'strict'});res.redirect(`/@fs/${temp.replaceAll('\\','/')}/index.html?page=${req.query.page??'setup'}`)})
app.get('/api/fixture/me',(req,res)=>{if(!actors.includes(actor(req)))return res.sendStatus(401);res.json({id:actor(req),role:actor(req)===owner?'organizer':'participant',event})})
app.get('/api/auth/csrf',(_req,res)=>res.json({csrfToken:'phase7-fixture-token'}))
app.use('/api',async(req,res)=>{
 const a=actor(req),ownerRoute=req.path.startsWith('/organizer/');if(!actors.includes(a))return res.status(401).json({message:'Fixture authentication required'});if(ownerRoute&&a!==owner)return res.status(403).json({message:'Owner required'})
 const b=req.body??{},r=literal(b.roundId??req.query.roundId??null),e=literal(event),u=literal(a),match=req.path.match(/\/competitions\/([0-9a-f-]{36})(.*)$/),c=literal(match?.[1]),tail=match?.[2]
 requests.push({method:req.method,path:req.path,actor:a===owner?'owner':a===reviewer?'reviewer':'judge'})
 try{
  let data={}
  if(req.path.endsWith('/competitions')&&req.method==='GET')data={competitions:array('competitions',`event_id=${e}`),legacyMapping:null}
  else if(req.path.endsWith('/competitions')&&req.method==='POST')data={competition:rpc('competition_create_child',e,u,literal(b.id),literal(b.name),literal(b.competitionType))}
  else if(req.path.endsWith(`/events/${event}`))data={event:array('events',`id=${e}`)[0]}
  else if(req.path.endsWith('/contestants'))data={contestants:array('competition_contestants',`event_id=${e}`)}
  else if(req.path.endsWith('/enrollments/pool'))data={judges:[]}
  else if(req.path.endsWith('/enrollments'))data={judges:array('event_participants',`event_id=${e}`).map(x=>({id:x.id,displayName:x.display_name,role:x.judge_role,isActive:true,accountStatus:'active'}))}
  else if(req.path.endsWith('/scoring-contexts'))data={contexts:rpc('competition_child_scoring_choices',e,u,String(ownerRoute))}
  else if(req.path.endsWith('/reviewer-contexts'))data={contexts:rpc('competition_child_reviewer_choices',e,u)}
  else if(tail==='/foundation'){data=rpc('competition_native_foundation',e,c,u);data.criteriaReadiness=data.configuration?nativeCriteriaReadiness(data.configuration):null}
  else if(tail==='/entries'&&req.method==='GET')data={entries:array('competition_entries',`competition_id=${c} AND event_id=${e}`)}
  else if(tail==='/entries')data={participation:rpc('competition_add_entry',e,u,c,literal(b.contestantId),b.entryNumber??'NULL')}
  else if(tail==='/configuration'){validateNativeConfiguration(b.configuration);data=rpc('competition_save_native_configuration',e,c,u,b.expectedSetupRevision,json(b.configuration))}
  else if(tail==='/judge-assignments')data={assignment:rpc('competition_assign_native_judge',e,c,u,literal(b.participantId),r,'false')}
  else if(tail==='/rules/freeze')data={rules:rpc('competition_freeze_native_rules',e,c,u,b.expectedSetupRevision,b.expectedInputRevision)}
  else if(tail==='/live')data=rpc('competition_child_live_view',e,c,u,r,String(ownerRoute))
  else if(tail?.startsWith('/live/')){data=rpc('competition_child_live_control',e,c,u,r,literal(tail.split('/')[2]),json(b));notice(match[1])}
  else if(tail?.startsWith('/scores/')){data=rpc('competition_child_score_write',e,c,u,r,literal(tail.split('/')[2]),json(b));notice(match[1])}
  else if(tail==='/tabulation'||tail==='/tabulation/reviewer'&&req.method==='GET')data=rpc('competition_child_tabulation_snapshot',e,c,u,r,String(!ownerRoute))
  else if(tail==='/tabulation/reviewer'){data={policy:rpc('competition_child_appoint_reviewer',e,c,u,literal(b.participantId))};notice(match[1])}
  else if(tail==='/tabulation/calculate'){const s=rpc('competition_child_tabulation_snapshot',e,c,u,r,'false'),result=calculateNativeSnapshot(s);assert.equal(s.sourceDigest,b.sourceDigest);data=rpc('competition_child_official_calculate',e,c,u,r,literal(s.sourceDigest),json(result.input),json(result.output));notice(match[1])}
  else if(['/tabulation/verify','/tabulation/finalize'].includes(tail)){data=rpc('competition_child_official_transition',e,c,u,literal(b.calculationId),literal(ownerRoute?'finalize':'verify'),literal(b.reason));notice(match[1])}
  else if(tail==='/results')data=rpc('competition_child_owned_results',e,c,u,r)
  else if(tail==='/results/publication'){data=rpc('competition_child_publication_action',e,c,u,r,literal(b.action),json(b));notice(match[1])}
  else if(tail==='/results/export'){const data=rpc('competition_child_export_sources',e,c,u,r,literal(req.query.kind),literal(req.query.sourceDigest),literal(req.query.calculationId),literal(req.query.judgeId));res.type('text/csv').send(nativeExportCsv(data));return}
  else return res.status(404).json({message:'Fixture does not implement '+req.path})
  res.json({success:true,...data})
 }catch(error){res.status(/FORBIDDEN/.test(error.message)?403:409).json({message:error.message})}
})
const server=app.listen(5057,'127.0.0.1'),wss=new WebSocketServer({noServer:true})
server.on('upgrade',(req,socket,head)=>{const a=actor(req);if(!actors.includes(a)){socket.destroy();return}wss.handleUpgrade(req,socket,head,ws=>{joinRoom(ws,`user:${a}`);ws.on('close',()=>leaveAllRooms(ws))})})
writeFileSync(path.join(temp,'index.html'),'<div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="./entry.jsx"></script>')
writeFileSync(path.join(temp,'entry.jsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Setup from '/@fs/${root.replaceAll('\\','/')}/frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx';import Scoring from '/@fs/${root.replaceAll('\\','/')}/frontend/src/components/voter/competition/NativeCompetitionWorkspace.jsx';import Tabulation from '/@fs/${root.replaceAll('\\','/')}/frontend/src/components/organizer/competition/NativeTabulationWorkspace.jsx';import Results from '/@fs/${root.replaceAll('\\','/')}/frontend/src/components/organizer/competition/NativeResultsWorkspace.jsx';import{useAuthStore}from'@/store/auth.store';import{nativeCompetitionService as service}from'@/services/competition-native.service';import{nativeTabulationService}from'@/services/competition-native-tabulation.service';import{connect}from'@/services/socket.service';import '/@fs/${root.replaceAll('\\','/')}/frontend/src/index.css';const me=await(await fetch('/api/fixture/me')).json();useAuthStore.setState({user:me,isAuthenticated:true});connect();const page=new URLSearchParams(location.search).get('page');let component;if(page==='setup'){const{data}=await service.list(me.event);component=<Setup eventId={me.event} initialChildren={data.competitions}/>;}else{const{data}=await(page==='review'?nativeTabulationService.reviewerChoices(me.event):service.choices(me.event,page!=='judge'));component=page==='live'||page==='judge'?<Scoring eventId={me.event} choices={data.contexts} owner={page==='live'}/>:page==='results'?<Results eventId={me.event} choices={data.contexts}/>:<Tabulation eventId={me.event} choices={data.contexts} reviewer={page==='review'}/>;}createRoot(document.getElementById('root')).render(<MemoryRouter>{component}</MemoryRouter>);`)
const vite=await createServer({configFile:path.join(root,'frontend/vite.config.js'),root:path.join(root,'frontend'),envDir:temp,cacheDir:path.join(temp,'vite-cache'),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},server:{host:'127.0.0.1',port:5177,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:5057'},'/ws':{target:'ws://127.0.0.1:5057',ws:true}},fs:{allow:[root]}}});await vite.listen()
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9337',`--user-data-dir=${path.join(temp,`profile-${Date.now()}`)}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
const pause=ms=>new Promise(r=>setTimeout(r,ms));let browser,seq=0;const pending=new Map(),scenarios=[]
try{
 let info;for(let n=0;n<80;n++){try{info=await(await fetch('http://127.0.0.1:9337/json/version')).json();break}catch{await pause(100)}}assert.ok(info)
 browser=new WebSocket(info.webSocketDebuggerUrl);await new Promise((r,j)=>{browser.once('open',r);browser.once('error',j)});browser.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});browser.send(JSON.stringify({id,method,params,sessionId}))})
 const tab=async(a,page)=>{const ctx=await call('Target.createBrowserContext'),target=await call('Target.createTarget',{url:'about:blank',browserContextId:ctx.browserContextId}),s=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});await call('Page.enable',{},s.sessionId);await call('Runtime.enable',{},s.sessionId);await call('Page.navigate',{url:`http://127.0.0.1:5177/api/fixture/login?actor=${a}&page=${page}`},s.sessionId);return s.sessionId}
 const evaluate=async(s,expression)=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},s);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
 const wait=async(s,expression)=>{for(let i=0;i<240;i++){if(await evaluate(s,expression))return;await pause(100)}throw new Error('Timeout '+expression+' / '+await evaluate(s,'document.body.innerText'))}
 const click=async(s,text)=>{for(let i=0;i<240;i++){if(await evaluate(s,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.matches(':disabled'));if(!b)return false;b.click();return true})()`))return;await pause(100)}throw new Error('Missing enabled button '+text+' / '+await evaluate(s,'document.body.innerText'))}
 const field=async(s,label,value)=>{for(let i=0;i<240;i++){if(await evaluate(s,`(()=>{const n=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!n||n.matches(':disabled'))return false;const proto=n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(String(value))});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`))return;await pause(100)}throw new Error('Missing enabled field '+label)}
 const settled=s=>wait(s,`!document.body.innerText.includes('Loading saved setup')&&!document.querySelector('[role="alert"]')`)
 const openGates=async s=>{for(let gate=0;gate<2;gate++){await wait(s,`!![...document.querySelectorAll('input[type="checkbox"]')].find(n=>!n.checked&&!n.matches(':disabled'))`);let clicked=false;for(let n=0;n<80&&!clicked;n++){clicked=await evaluate(s,`(()=>{const n=[...document.querySelectorAll('input[type="checkbox"]')].find(n=>!n.checked&&!n.matches(':disabled'));if(!n)return false;n.click();return true})()`);if(!clicked)await pause(100)}assert.ok(clicked);await wait(s,`[...document.querySelectorAll('input[type="checkbox"]')].filter(n=>n.checked).length===${gate+1}&&![...document.querySelectorAll('input[type="checkbox"]')].some(n=>n.matches(':disabled'))`)}}
 const setup=await tab(owner,'setup');await wait(setup,`!!document.querySelector('[aria-label="New competition name"]')&&!document.querySelector('[aria-label="New competition name"]').matches(':disabled')`)
 for(const label of ['Hip-Hop','Contemporary','Ballet','Ballroom','Folk']){
  console.log('Browser setup: '+label)
  await wait(setup,`!document.querySelector('[aria-label="New competition name"]').matches(':disabled')`);await field(setup,'New competition name',label);await click(setup,'Create competition');await wait(setup,`document.querySelector('[aria-label="Setup competition"]').selectedOptions[0]?.textContent===${JSON.stringify(label)}&&!!document.querySelector('[aria-label="Competition structure"]')&&!document.querySelector('[aria-label="Competition structure"]').matches(':disabled')`)
  await click(setup,'Add to competition');await wait(setup,`document.body.innerText.includes('Entrant added to this competition')&&!document.querySelector('[aria-label="Competition structure"]').matches(':disabled')`);await click(setup,'Add criterion to Single phase');await wait(setup,`!!document.querySelector('[aria-label="Criterion 1 name"]')`);await field(setup,'Criterion 1 name',label+' technique');await click(setup,'Save competition configuration');await wait(setup,`document.body.innerText.includes('Configuration saved')&&!document.querySelector('[aria-label="Assigned judge"]').matches(':disabled')`)
  for(const [index,ep] of [enrollment,enrollment2].entries()){await field(setup,'Assigned judge',ep);await click(setup,'Assign judge');await wait(setup,`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Remove assignment').length===${index+1}&&!document.querySelector('[aria-label="Assigned judge"]').matches(':disabled')`);await settled(setup)}
  await evaluate(setup,`document.querySelector('[aria-label="Acknowledge competition rules"]').click()`);await click(setup,'Freeze competition rules');await wait(setup,`document.body.innerText.includes('Rules frozen. Continue to Live Control.')`)
 }
 const children=array('competitions',`event_id='${event}'`);assert.equal(children.length,5);assert.equal(array('competition_entries',`event_id='${event}'`).length,5);assert.ok(children.every(c=>c.official_child_rules_id));scenarios.push('Browser creates/configures/assigns/freezes five children sharing one master entrant via setup forms')
 const c=children.find(x=>x.name==='Ballet').id,live=await tab(owner,'live'),one=await tab(judge,'judge'),two=await tab(judge2,'judge')
 await wait(live,`document.body.innerText.includes('Start scoring')`);await wait(one,`!!document.querySelector('table')`);await click(live,'Start scoring');await wait(live,`document.body.innerText.includes('Pause')`)
 await openGates(live)
 for(const [s,score] of [[one,80],[two,90]]){
  await wait(s,`!!document.querySelector('input[type="number"]:not(:disabled)')`);await evaluate(s,`(()=>{const n=document.querySelector('input[type="number"]:not(:disabled)');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'${score}');n.dispatchEvent(new Event('input',{bubbles:true}))})()`);await pause(2000);await click(s,'Lock');await wait(s,`document.body.innerText.includes('Locked')`);await click(s,'Submit Round');await wait(s,`document.body.innerText.includes('submitted')`)
  if(s===one){const privateView=rpc('competition_child_tabulation_snapshot',literal(event),literal(c),literal(owner),'NULL','false');assert.equal(privateView.complete,false);assert.deepEqual(privateView.submissions,[])}
 }
 await click(live,'Close scoring');await wait(live,`document.body.innerText.includes('closed')`);scenarios.push('Original judge table automatically opens via user-room invalidations, autosaves, locks and submits two isolated judges; partial sheets remain private')
 const tabulation=await tab(owner,'tabulation');await wait(tabulation,`!!document.querySelector('[aria-label="Independent reviewer"]')`);await field(tabulation,'Independent reviewer',reviewEnrollment);await click(tabulation,'Appoint reviewer');await wait(tabulation,`!document.querySelector('[aria-label="Independent reviewer"]')`);await click(tabulation,'Calculate official results');await wait(tabulation,`document.body.innerText.includes('Awaiting independent verification')`)
 const review=await tab(reviewer,'review');await wait(review,`!!document.querySelector('[aria-label="Review reason"]')`);await field(review,'Review reason','Browser independent review');await click(review,'Verify calculation');await wait(tabulation,`document.body.innerText.includes('Verified')`);await field(tabulation,'Review reason','Browser organizer finalization');await click(tabulation,'Finalize official calculation');await wait(tabulation,`document.body.innerText.includes('Finalized')`)
 const results=await tab(owner,'results');await wait(results,`document.body.innerText.includes('Current official standings')`);await field(results,'Publication reason','Browser selected version publication');await click(results,'Publish selected finalized version');await wait(results,`document.body.innerText.includes('Publication: version 1')`);const published=rpc('competition_child_public_results',literal(event),literal(c),'NULL');assert.equal(published.results.standings[0].score,85);await field(results,'Publication reason','Browser explicit withdrawal');await click(results,'Withdraw publication');await wait(results,`document.body.innerText.includes('Not published')`);assert.equal(rpc('competition_child_public_results',literal(event),literal(c),'NULL').withdrawn,true)
 scenarios.push('Browser appoints reviewer/calculates; independent reviewer verifies; owner finalizes/publishes/withdraws the exact official result')
 for(const child of children.filter(x=>x.id!==c)){
  console.log('Browser complete workflow: '+child.name)
  for(const s of [live,one,two,tabulation,results])await field(s,'Competition',child.id)
  await wait(live,`document.querySelector('[aria-label="Competition"]').value===${JSON.stringify(child.id)}&&document.body.innerText.includes(${JSON.stringify(child.name+' technique')})`)
  await click(live,'Start scoring')
  await wait(live,`document.querySelector('[aria-label="Competition"]').value===${JSON.stringify(child.id)}&&[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Pause'&&!b.matches(':disabled'))`)
  assert.equal(array('competition_child_sessions',`competition_id='${child.id}'`)[0]?.status,'active')
  await openGates(live)
  for(const [s,score] of [[one,70],[two,80]]){
   await wait(s,`!!document.querySelector('input[type="number"]:not(:disabled)')`)
   await evaluate(s,`(()=>{const n=document.querySelector('input[type="number"]:not(:disabled)');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'${score}');n.dispatchEvent(new Event('input',{bubbles:true}))})()`)
   await pause(1800);await click(s,'Lock');await click(s,'Submit Round');await wait(s,`document.body.innerText.includes('Round submitted')`)
  }
  await click(live,'Close scoring');await wait(tabulation,`!!document.querySelector('[aria-label="Independent reviewer"]')`);await field(tabulation,'Independent reviewer',reviewEnrollment);await click(tabulation,'Appoint reviewer');await click(tabulation,'Calculate official results')
  const anotherReviewer=await tab(reviewer,'review');await wait(anotherReviewer,`!!document.querySelector('[aria-label="Competition"]')`);await field(anotherReviewer,'Competition',child.id);await wait(anotherReviewer,`!!document.querySelector('[aria-label="Review reason"]')`);await field(anotherReviewer,'Review reason','Independent sibling verification');await click(anotherReviewer,'Verify calculation')
  await wait(tabulation,`!!document.querySelector('[aria-label="Review reason"]')`);await field(tabulation,'Review reason','Explicit sibling finalization');await click(tabulation,'Finalize official calculation');await wait(results,`document.body.innerText.includes('Current official standings')`);await field(results,'Publication reason','Explicit sibling publication');await click(results,'Publish selected finalized version');await wait(results,`document.body.innerText.includes('Publication: version 1')`)
  assert.equal(rpc('competition_child_public_results',literal(event),literal(child.id),'NULL').results.standings[0].score,75)
 }
 assert.equal(array('competition_child_sessions',`event_id='${event}'`).length,5)
 assert.equal(array('competition_child_calculations',`event_id='${event}'`).length,5)
 scenarios.push('Actual browser competition selectors conduct scoring, independent review, finalization and publication for all five sibling competitions without manual refresh')
 const screenshot=await call('Page.captureScreenshot',{format:'png'},results);writeFileSync(path.join(out,'browser-results.png'),Buffer.from(screenshot.data,'base64'))
 assert.deepEqual(JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),source)
 const report={passed:true,database,template,scenarios,requestCount:requests.length,requests,sqlProcessCallMilliseconds:{count:timings.length,min:Math.min(...timings),max:Math.max(...timings),mean:timings.reduce((s,x)=>s+x,0)/timings.length},productionTouched:false,hostedAcceptance:false,authScope:'Synthetic HTTP-only fixture cookie; NOT deployed JWT/CSRF controller',httpScope:'Isolated contract adapter invoking real SQL RPCs, NOT production Express services/PostgREST',browser:'Actual headless Chromium; production React components and unchanged judge table',multiInstanceVerified:false};writeFileSync(path.join(out,'browser-integration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,requests:undefined}))
}finally{if(browser?.readyState===WebSocket.OPEN){browser.send(JSON.stringify({id:++seq,method:'Browser.close'}));browser.close()}else chrome.kill();for(const ws of wss.clients)ws.close();wss.close();server.close();await vite.close()}
