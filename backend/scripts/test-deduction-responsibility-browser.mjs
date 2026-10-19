// The actual main.jsx/router/login + actual Express + REAL PostgREST/PostgreSQL.
// No alternate entry JSX, mocked API, synthetic JWT endpoint or contract adapter.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {WebSocket} from '../node_modules/ws/wrapper.mjs'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),out=path.join(root,'audits/deduction-responsibility'),accounts=JSON.parse(readFileSync(path.join(dir,'accounts.json'))),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),api=JSON.parse(readFileSync(path.join(dir,'api-client.json')))
const proof=await fetch(api.supabaseUrl+'/rest/v1/rpc/votrix_local_identity',{headers:{Authorization:'Bearer '+api.serviceKey}});assert.equal(proof.status,200);assert.equal((await proof.json()).nonce,identity.nonce);mkdirSync(out,{recursive:true})
const backendProof=await fetch('http://127.0.0.1:5000/api/auth/me',{signal:AbortSignal.timeout(5000)});assert.equal(backendProof.headers.get('x-votrix-local-identity'),identity.nonce,'Backend isolation proof missing; browser writes prohibited');assert.equal(backendProof.headers.get('x-votrix-local-database'),identity.database)
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'5'};delete environment.PGSERVICE;delete environment.PGSERVICEFILE
const sql=source=>{const result=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',identity.database,'-v','ON_ERROR_STOP=1'],{input:source,env:environment,encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(result.status,0,result.stderr);return result.stdout.trim()}
assert.match(identity.database,/^votrix_dev_\d+$/);assert.equal(identity.port,55440)
const databaseProof=JSON.parse(sql('SELECT votrix_local_identity()'));assert.equal(databaseProof.nonce,identity.nonce);assert.equal(path.resolve(databaseProof.dataDirectory).toLowerCase(),path.join(dir,'pgdata').toLowerCase())
const read=file=>readFileSync(path.join(root,file),'utf8')
const migration=name=>read('backend/src/database/migrations/'+name).replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const account=name=>accounts.find(item=>item.name===name)
for(const item of accounts)assert.match(item.id,/^[0-9a-f-]{36}$/)
let helpers=read('backend/__tests__/fixtures/competition-deduction-modes-assertions.sql').split('\nDO $$')[0]
helpers=helpers.replace("WHERE u.account_status::text='active' AND u.role::text='organizer' LIMIT 1",`WHERE u.id='${account('Organizer').id}'`)
helpers=helpers.replace("WHERE account_status::text='active' AND role::text IN('participant','voter') LIMIT 1",`WHERE id='${account('Judge One').id}'`)
helpers=helpers.replace("WHERE account_status::text='active' AND role::text IN('participant','voter') AND id<>judge LIMIT 1",`WHERE id='${account('Reviewer').id}'`)
// Only this proved disposable localhost database is changed; never load backend/.env.
const alreadyUpgraded=sql("SELECT to_regprocedure('competition_child_native_deductions_enabled_v126(jsonb,uuid)') IS NOT NULL")==='t'
const fixtures=JSON.parse(sql(`BEGIN; ${migration('120_competition_live_activity.sql')} ${migration('122_competition_native_dashboard_sessions.sql')} ${alreadyUpgraded?'':migration('123_competition_configured_deduction_gate.sql')} ${migration('124_competition_review_after_calculation.sql')} ${migration('126_competition_deduction_responsibility.sql')} ${helpers} SELECT jsonb_object_agg(mode,pg_temp.deduction_fixture(mode)) FROM unnest(ARRAY['none','organizer','judge']) modes(mode); COMMIT;`))
console.log('PASS local identity and isolated fixture preparation; hosted database untouched')
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),network=[],scenarios=[]
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9346',`--user-data-dir=${path.join(dir,'real-browser-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
let browser,seq=0;const pending=new Map()
try{
 let info;for(let i=0;i<100;i++){try{info=await(await fetch('http://127.0.0.1:9346/json/version')).json();break}catch{await pause(100)}}assert.ok(info,'Chrome debug endpoint unavailable')
 browser=new WebSocket(info.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{browser.once('open',resolve);browser.once('error',reject)})
 browser.on('message',raw=>{const message=JSON.parse(raw);if(message.id){const job=pending.get(message.id);if(!job)return;pending.delete(message.id);message.error?job.reject(new Error(message.error.message)):job.resolve(message.result)}else if(message.method==='Network.responseReceived'){const r=message.params.response;const u=new URL(r.url);if(u.pathname.startsWith('/api/'))network.push({session:message.sessionId,path:u.pathname,status:r.status})}})
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method))},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});browser.send(JSON.stringify({id,method,params,sessionId}))})
 const evaluate=async(session,expression)=>{const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);return response.result.value}
 const wait=async(session,expression)=>{for(const deadline=Date.now()+45000;Date.now()<deadline;){try{if(await evaluate(session,`Boolean(${expression})`))return}catch(error){if(!/Execution context|Cannot find context|Cannot read properties/.test(error.message))throw error}await pause(100)}throw new Error('Timeout '+expression+' / '+await evaluate(session,'document.body.innerText'))}
 const field=async(session,selector,value)=>{await wait(session,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.matches(':disabled'))return false;const p=n.tagName==='SELECT'?HTMLSelectElement.prototype:n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(n,${JSON.stringify(String(value))});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`)}
 const labelled=(session,label,value)=>field(session,`[aria-label=${JSON.stringify(label)}]`,value)
 const click=async(session,text)=>{await wait(session,`[...document.querySelectorAll('button,a')].some(n=>n.textContent.trim()===${JSON.stringify(text)}&&!n.matches(':disabled'))`);await evaluate(session,`[...document.querySelectorAll('button,a')].find(n=>n.textContent.trim()===${JSON.stringify(text)}&&!n.matches(':disabled')).click()`)}
 const navigate=async(session,pathname)=>{
  const loaded=await evaluate(session,`location.origin==='http://localhost:5173'&&!!document.getElementById('root')`)
  if(loaded){await evaluate(session,`(()=>{const link=[...document.querySelectorAll('a')].find(n=>n.getAttribute('href')===${JSON.stringify(pathname)});if(link)link.click();else{history.pushState(null,'',${JSON.stringify(pathname)});window.dispatchEvent(new PopStateEvent('popstate'))}})()`)}
  else await call('Page.navigate',{url:'http://localhost:5173'+pathname},session)
  await wait(session,`document.readyState==='complete'&&location.pathname+location.search===${JSON.stringify(pathname)}`)
  await pause(250)
 }
 const contexts=new Map()
 const login=async(account)=>{
  const context=await call('Target.createBrowserContext'),target=await call('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId}),attached=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true}),session=attached.sessionId
  await call('Page.enable',{},session);await call('Runtime.enable',{},session);await call('Network.enable',{},session);await navigate(session,'/login');await field(session,'input[name="email"]',account.email);await field(session,'input[name="password"]',account.password);await evaluate(session,`document.querySelector('form').requestSubmit()`);await wait(session,`location.pathname.startsWith('/organizer')||location.pathname.startsWith('/participant')`)
  contexts.set(session,context.browserContextId);return session
 }
 const organizer=await login(account('Organizer')),judge=await login(account('Judge One')),reviewer=await login(account('Reviewer'))
 const visibleButton=(text)=>`[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)}&&n.getClientRects().length&&!n.disabled)`
 const press=async(session,text)=>{await wait(session,visibleButton(text));await evaluate(session,`${visibleButton(text)}.click()`)}
 const stage=async(session,name)=>{await wait(session,`[...document.querySelectorAll('[role=tab]')].some(n=>n.getAttribute('aria-label')?.startsWith(${JSON.stringify(name+':')})&&!n.disabled)`);await evaluate(session,`[...document.querySelectorAll('[role=tab]')].find(n=>n.getAttribute('aria-label')?.startsWith(${JSON.stringify(name+':')})).click()`)}
 const apiRequest=async(session,url,body)=>evaluate(session,`(async()=>{const csrf=document.cookie.split('; ').find(s=>s.startsWith('csrfToken='))?.split('=').slice(1).join('=');const response=await fetch('http://localhost:5000/api'+${JSON.stringify(url)},{method:${JSON.stringify(body?'POST':'GET')},credentials:'include',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':decodeURIComponent(csrf)}:{})},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});return {status:response.status,data:await response.json()}})()`)
 for(const mode of ['none','organizer','judge']){
  const f=fixtures[mode],scorePath=`/participant/competition/events/${f.event}/score?competitionId=${f.child}`,tabPath=`/organizer/competition/events/${f.event}/tabulation?competitionId=${f.child}`
  await navigate(judge,scorePath)
  await wait(judge,`document.querySelectorAll('tr[data-contestant-id] input[type=number]:not(:disabled)').length===2`)
  const controls=await evaluate(judge,`document.querySelectorAll('.v-judge-deductions').length`)
  assert.equal(controls,mode==='judge'?1:0)
  if(mode==='judge'){
   await evaluate(judge,`document.querySelector('.v-judge-deductions').open=true`)
   await press(judge,'Record Time limit')
   await labelled(judge,'Synthetic performer: Technique, Time limit violation reference','timing-1')
   await labelled(judge,'Synthetic performer: Technique, Time limit reason','Exceeded the permitted performance time')
  }
  const first=`tr[data-contestant-id="${f.entry}"] input[type=number]`
  await field(judge,first,90)
  await field(judge,`tr[data-contestant-id="${f.entry}"] td:nth-of-type(3) input[type=number]`,90)
  for(let i=0;i<2;i++){
   await wait(judge,`[...document.querySelectorAll('tr[data-contestant-id] button')].some(n=>n.textContent.trim()==='Lock'&&!n.disabled)`)
   await evaluate(judge,`[...document.querySelectorAll('tr[data-contestant-id] button')].find(n=>n.textContent.trim()==='Lock'&&!n.disabled).click()`)
   await wait(judge,`document.querySelectorAll('tr[data-contestant-id] input[type=number]:disabled').length===${i+1}`)
  }
  await press(judge,'Submit Round');await wait(judge,`document.body.innerText.includes('Round submitted')`)
  scenarios.push(mode+': actual judge UI saves original scores, configured records, locks and submits')
  console.log('PASS browser judge score/lock/submit '+mode)
  await navigate(organizer,`/organizer/competition/events/${f.event}/live?competitionId=${f.child}`)
  await wait(organizer,`document.body.innerText.includes('Close Test performance')`)
  await call('Page.handleJavaScriptDialog',{accept:true},organizer).catch(()=>{})
  // Auto-accept the explicit close confirmation only in this synthetic browser.
  await evaluate(organizer,`window.confirm=()=>true`)
  await press(organizer,'Close Test performance')
  await wait(organizer,`document.body.innerText.includes('Ready to tabulate')`)
  await navigate(organizer,tabPath)
  await wait(organizer,`document.body.innerText.includes('Original judge scores are read-only')`)
  if(mode==='organizer'){
   await stage(organizer,'Organizer Deductions')
   await labelled(organizer,'Deduction contestant',f.entry);await labelled(organizer,'Deduction rule','time')
   await labelled(organizer,'Offense identity','organizer-time-1');await labelled(organizer,'Deduction reason','Recorded official time violation')
   await press(organizer,'Apply Deduction')
   await wait(organizer,`document.body.innerText.includes('Recorded official time violation')`)
  }else assert.equal(await evaluate(organizer,`[...document.querySelectorAll('[role=tab]')].some(n=>n.textContent.includes('Organizer Deductions'))`),false)
  await stage(organizer,'Calculation');await press(organizer,'Calculate official results')
  await wait(organizer,`document.body.innerText.includes('Recalculate results')`)
  const snapshot=await apiRequest(organizer,`/organizer/competition/events/${f.event}/competitions/${f.child}/tabulation`)
  assert.equal(snapshot.status,200,JSON.stringify(snapshot));assert.equal(snapshot.data.calculation.output_snapshot.results[0].finalScore,mode==='none'?90:88)
  assert.equal(snapshot.data.reviewPolicy,null,'Calculation must precede reviewer appointment')
  if(mode==='judge')assert.equal(snapshot.data.judgeDeductions.length,1)
  await stage(organizer,'Finalization');await labelled(organizer,'Independent reviewer',f.reviewerEp);await press(organizer,'Assign Reviewer')
  await wait(organizer,`document.body.innerText.includes('Active')`)
  await navigate(reviewer,scorePath)
  await wait(reviewer,`document.body.innerText.includes('Tabulation workflow')`)
  await stage(reviewer,'Finalization');await labelled(reviewer,'Review reason','Independent verification of source and calculation');await press(reviewer,'Verify calculation')
  await wait(reviewer,`document.body.innerText.includes('Verified')`)
  await navigate(organizer,tabPath);await stage(organizer,'Finalization')
  await labelled(organizer,'Review reason','Finalize the independently verified calculation');await press(organizer,'Finalize official calculation')
  await wait(organizer,`document.body.innerText.includes('Finalized')`)
  await navigate(organizer,`/organizer/competition/events/${f.event}/rankings?competitionId=${f.child}`)
  await wait(organizer,`document.body.innerText.includes('Current official standings')`)
  assert.equal(await evaluate(organizer,`[...document.querySelectorAll('th')].some(n=>n.textContent.includes('Organizer deductions'))`),mode==='organizer')
  await labelled(organizer,'Publication reason','Publish verified synthetic deduction results');await press(organizer,'Publish selected finalized version')
  await wait(organizer,`document.body.innerText.includes('Withdraw publication')`)
  const latest=await apiRequest(organizer,`/organizer/competition/events/${f.event}/competitions/${f.child}/tabulation`)
  const exportPath=`/organizer/competition/events/${f.event}/competitions/${f.child}/results/export?kind=tabulation&sourceDigest=${latest.data.sourceDigest}&calculationId=${latest.data.calculation.id}`
  const report=await evaluate(organizer,`(async()=>{const r=await fetch('http://localhost:5000/api'+${JSON.stringify(exportPath)},{credentials:'include'});return {status:r.status,text:await r.text()}})()`)
  assert.equal(report.status,200,report.text)
  assert.equal(report.text.includes('submitted_judge_deduction'),mode==='judge')
  assert.equal(report.text.includes('deduction_decision'),mode==='organizer')
  if(mode==='none')assert.equal(report.text.split(/\r?\n/)[0].includes('deduction'),false)
  scenarios.push(mode+': Live Control close, direct deductions when configured, calculate without reviewer, independent verify/finalize, results/publication/real CSV')
  console.log('PASS browser live/tabulation/finalization/results/export '+mode)
 }
 const screenshot=await call('Page.captureScreenshot',{format:'png'},organizer);writeFileSync(path.join(out,'results.png'),Buffer.from(screenshot.data,'base64'))
 writeFileSync(path.join(out,'browser.json'),JSON.stringify({passed:true,database:identity.database,fixtures,scenarios,network,actualMainRouter:true,realPostgrest:true,mockedApi:false,productionTouched:false},null,2))
 console.log('PASS deduction responsibility real browser workflow')
}catch(error){writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({error:error.message,scenarios,network,database:identity.database,productionTouched:false},null,2));throw error}
finally{if(browser?.readyState===WebSocket.OPEN){browser.send(JSON.stringify({id:++seq,method:'Browser.close'}));browser.close()}else chrome.kill()}
