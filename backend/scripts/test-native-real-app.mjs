// The actual main.jsx/router/login + actual Express + REAL PostgREST/PostgreSQL.
// No alternate entry JSX, mocked API, synthetic JWT endpoint or contract adapter.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {WebSocket} from '../node_modules/ws/wrapper.mjs'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),out=path.join(root,'audits/native-local-activation-2026-10-14'),accounts=JSON.parse(readFileSync(path.join(dir,'accounts.json'))),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),api=JSON.parse(readFileSync(path.join(dir,'api-client.json')))
const proof=await fetch(api.supabaseUrl+'/rest/v1/rpc/votrix_local_identity',{headers:{Authorization:'Bearer '+api.serviceKey}});assert.equal(proof.status,200);assert.equal((await proof.json()).nonce,identity.nonce);mkdirSync(out,{recursive:true})
const backendProof=await fetch('http://127.0.0.1:5000/api/auth/me',{signal:AbortSignal.timeout(5000)});assert.equal(backendProof.headers.get('x-votrix-local-identity'),identity.nonce,'Backend isolation proof missing; browser writes prohibited');assert.equal(backendProof.headers.get('x-votrix-local-database'),identity.database)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),network=[],scenarios=[]
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9340',`--user-data-dir=${path.join(dir,'real-browser-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
let browser,seq=0;const pending=new Map()
try{
 let info;for(let i=0;i<100;i++){try{info=await(await fetch('http://127.0.0.1:9340/json/version')).json();break}catch{await pause(100)}}assert.ok(info,'Chrome debug endpoint unavailable')
 browser=new WebSocket(info.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{browser.once('open',resolve);browser.once('error',reject)})
 browser.on('message',raw=>{const message=JSON.parse(raw);if(message.id){const job=pending.get(message.id);if(!job)return;pending.delete(message.id);message.error?job.reject(new Error(message.error.message)):job.resolve(message.result)}else if(message.method==='Network.responseReceived'){const r=message.params.response;const u=new URL(r.url);if(u.pathname.startsWith('/api/'))network.push({session:message.sessionId,path:u.pathname,status:r.status})}})
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method))},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});browser.send(JSON.stringify({id,method,params,sessionId}))})
 const evaluate=async(session,expression)=>{const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);return response.result.value}
 const wait=async(session,expression)=>{for(let i=0;i<600;i++){try{if(await evaluate(session,`Boolean(${expression})`))return}catch(error){if(!/Execution context|Cannot find context|Cannot read properties/.test(error.message))throw error}await pause(100)}throw new Error('Timeout '+expression+' / '+await evaluate(session,'document.body.innerText'))}
 const field=async(session,selector,value)=>{await wait(session,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.matches(':disabled'))return false;const p=n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(n,${JSON.stringify(String(value))});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`)}
 const labelled=(session,label,value)=>field(session,`[aria-label=${JSON.stringify(label)}]`,value)
 const click=async(session,text)=>{await wait(session,`[...document.querySelectorAll('button,a')].some(n=>n.textContent.trim()===${JSON.stringify(text)}&&!n.matches(':disabled'))`);await evaluate(session,`[...document.querySelectorAll('button,a')].find(n=>n.textContent.trim()===${JSON.stringify(text)}&&!n.matches(':disabled')).click()`)}
 const navigate=async(session,pathname)=>{
  const loaded=await evaluate(session,`location.origin==='http://localhost:5173'&&!!document.getElementById('root')`)
  if(loaded){await evaluate(session,`(()=>{const link=[...document.querySelectorAll('a')].find(n=>n.getAttribute('href')===${JSON.stringify(pathname)});if(link)link.click();else{history.pushState(null,'',${JSON.stringify(pathname)});window.dispatchEvent(new PopStateEvent('popstate'))}})()`)}
  else await call('Page.navigate',{url:'http://localhost:5173'+pathname},session)
  await wait(session,`document.readyState==='complete'&&location.pathname===${JSON.stringify(pathname)}`)
  await pause(250)
 }
 const contexts=new Map()
 const login=async(account)=>{
  const context=await call('Target.createBrowserContext'),target=await call('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId}),attached=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true}),session=attached.sessionId
  await call('Page.enable',{},session);await call('Runtime.enable',{},session);await call('Network.enable',{},session);await navigate(session,'/login');await field(session,'input[name="email"]',account.email);await field(session,'input[name="password"]',account.password);await evaluate(session,`document.querySelector('form').requestSubmit()`);await wait(session,`location.pathname.startsWith('/organizer')||location.pathname.startsWith('/participant')`)
  contexts.set(session,context.browserContextId);return session
 }
 const owner=accounts.find(a=>a.role==='organizer'),organizer=await login(owner);await navigate(organizer,'/organizer/competition');await wait(organizer,`document.body.innerText.includes('Manage competitions')`)
 assert.equal(await evaluate(organizer,`localStorage.getItem('accessToken')`),null)
 scenarios.push('Real organizer password login through normal main.jsx/bootstrap/router, session cookies and dashboard; no fixture JWT issuance')
 console.log('PASS real organizer login and native-enabled root dashboard')
 await click(organizer,'Create Event');await wait(organizer,`location.pathname==='/organizer/competition/events/new'`);const title='Native real application '+Date.now()
 await field(organizer,'input[name="title"]',title);await field(organizer,'#startDate','2030-01-10T09:00');await field(organizer,'#endDate','2030-01-11T17:00');await click(organizer,'Next: Branding');await click(organizer,'Create & continue');await wait(organizer,`location.pathname.endsWith('/workspace')&&!!document.querySelector('[aria-label="New competition name"]')`)
 const event=await evaluate(organizer,`location.pathname.split('/')[4]`);assert.match(event,/^[0-9a-f-]{36}$/);scenarios.push('Normal Create Event draft/details/branding flow persists a parent and opens the actual event-scoped NativeSetupWorkspace')
 await labelled(organizer,'New competition name','Hip-Hop');await click(organizer,'Create competition');await wait(organizer,`!!document.querySelector('[aria-label="Competition structure"]')`)
 scenarios.push('Native child creation is reachable through the real parent workspace and persists through real PostgREST')
 const opt=async(session,label,part)=>{await wait(session,`[...document.querySelector('[aria-label=${JSON.stringify(label)}]').options].some(o=>o.textContent.includes(${JSON.stringify(part)}))`);return evaluate(session,`[...document.querySelector('[aria-label=${JSON.stringify(label)}]').options].find(o=>o.textContent.includes(${JSON.stringify(part)})).value`)}
 const settle=async()=>pause(350)
 await evaluate(organizer,`[...document.querySelectorAll('summary')].find(n=>n.textContent==='Event entrants and judge enrollment').click()`)
 for(const [n,number]of [['Alpha',1],['Beta',2]]){await labelled(organizer,'Event entrant name',n);await labelled(organizer,'Event entrant number',number);await click(organizer,'Create event entrant');await wait(organizer,`document.body.innerText.includes('Event entrant created')`);await settle()}
 for(const n of ['Judge One','Judge Two','Reviewer']){await labelled(organizer,'Available judge',await opt(organizer,'Available judge',n));await click(organizer,'Enroll judge');await wait(organizer,`document.body.innerText.includes('Judge enrolled without sending an invitation')`);await settle()}
 const roleLabel=await evaluate(organizer,`[...document.querySelectorAll('select[aria-label]')].find(n=>n.getAttribute('aria-label').includes('Reviewer event role')).getAttribute('aria-label')`)
 await labelled(organizer,roleLabel,'score_reviewer');await wait(organizer,`document.body.innerText.includes('Event role updated')`)
 const children=[]
 for(const [index,method]of ['weighted_average','sum','rank_based','highest_score','lowest_removal','manual'].entries()){
  if(index){await labelled(organizer,'New competition name',method);await click(organizer,'Create competition');await wait(organizer,`document.querySelector('[aria-label="Setup competition"]').value!==${JSON.stringify(children[index-1].id)}&&!!document.querySelector('[aria-label="Competition structure"]')&&document.body.innerText.includes('Participation — ${method}')`);await settle()}
  const child=await evaluate(organizer,`document.querySelector('[aria-label="Setup competition"]').value`);children.push({id:child,method})
  for(let e=0;e<2;e++){await click(organizer,'Add to competition');await wait(organizer,`document.querySelectorAll('button').length>0&&[...document.querySelectorAll('button')].filter(n=>n.textContent==='Participating').length===${e+1}`);await settle()}
  await labelled(organizer,'Calculation method',method)
  if(method==='lowest_removal')await labelled(organizer,'Remove lowest judges',1)
  if(method==='manual')await labelled(organizer,'Manual decision basis','Reviewed explicit placement policy')
  await click(organizer,'Add criterion to Single phase');await labelled(organizer,'Criterion 1 name',method+' performance');await click(organizer,'Save competition configuration');await wait(organizer,`document.body.innerText.includes('Configuration saved')`)
  for(const n of ['Judge One','Judge Two']){await labelled(organizer,'Assigned judge',await opt(organizer,'Assigned judge',n));await click(organizer,'Assign judge');await wait(organizer,`document.body.innerText.includes('Assignment saved')`);await settle()}
  await evaluate(organizer,`document.querySelector('[aria-label="Acknowledge competition rules"]').click()`);await click(organizer,'Freeze competition rules');await wait(organizer,`document.body.innerText.includes('Rules frozen. Continue to Live Control.')`)
  console.log('PASS real setup/panel/freeze '+method)
 }
 scenarios.push('Six independent children configured, two shared entrants assigned, two explicitly enrolled judges assigned and rules frozen through real UI')
 const j1=await login(accounts.find(a=>a.name==='Judge One')),j2=await login(accounts.find(a=>a.name==='Judge Two')),review=await login(accounts.find(a=>a.name==='Reviewer'))
 const choose=async(session,child)=>{await wait(session,`[...document.querySelector('[aria-label="Competition"]').options].some(o=>o.value===${JSON.stringify(child)})`);await labelled(session,'Competition',child);await settle()}
 const livePath=`/organizer/competition/events/${event}/live`,tabPath=`/organizer/competition/events/${event}/tabulation`,scorePath=`/participant/competition/events/${event}/score`,resultPath=`/organizer/competition/events/${event}/rankings`
 const score=async(session,values)=>{
  await wait(session,`document.querySelectorAll('tr[data-contestant-id] input[type="number"]:not(:disabled)').length===2`)
  const rows=await evaluate(session,`[...document.querySelectorAll('tr[data-contestant-id]')].map(n=>({id:n.dataset.contestantId,alpha:n.textContent.includes('Alpha')}))`)
  for(const row of rows){await field(session,`tr[data-contestant-id="${row.id}"] input[type="number"]`,values[row.alpha?0:1]);await wait(session,`[...document.querySelector('tr[data-contestant-id="${row.id}"]').querySelectorAll('button')].some(n=>n.textContent.trim()==='Lock'&&!n.matches(':disabled'))`);await evaluate(session,`[...document.querySelector('tr[data-contestant-id="${row.id}"]').querySelectorAll('button')].find(n=>n.textContent.trim()==='Lock').click()`);await wait(session,`document.querySelector('tr[data-contestant-id="${row.id}"]').innerText.includes('Completed')`)}
  await click(session,'Submit Round');await wait(session,`document.body.innerText.includes('Round submitted')`)
 }
 for(const child of children){
  await navigate(organizer,livePath);await choose(organizer,child.id);await click(organizer,'Start scoring');await wait(organizer,`[...document.querySelectorAll('legend')].some(n=>n.textContent==='Scoring access')`)
  for(let g=0;g<3;g++){await wait(organizer,`[...document.querySelectorAll('legend')].find(n=>n.textContent==='Scoring access').parentElement.querySelector('input:not(:checked):not(:disabled)')`);await evaluate(organizer,`[...document.querySelectorAll('legend')].find(n=>n.textContent==='Scoring access').parentElement.querySelector('input:not(:checked)').click()`);await wait(organizer,`[...document.querySelectorAll('legend')].find(n=>n.textContent==='Scoring access').parentElement.querySelectorAll('input:checked').length===${g+1}`);await settle()}
  for(const session of [j1,j2]){await navigate(session,scorePath);await choose(session,child.id)}
  await score(j1,[80,70]);await navigate(organizer,tabPath);await choose(organizer,child.id);await wait(organizer,`document.body.innerText.includes('Every required judge must submit')`);assert.equal(await evaluate(organizer,`document.body.innerText.includes('Read-only submitted values')`),false)
  await score(j2,[90,60]);await wait(organizer,`document.body.innerText.includes('Read-only submitted values')`)
  await labelled(organizer,'Independent reviewer',await opt(organizer,'Independent reviewer','Reviewer'));await click(organizer,'Appoint reviewer');await wait(organizer,`!document.querySelector('[aria-label="Independent reviewer"]')`)
  await navigate(organizer,livePath);await choose(organizer,child.id);await click(organizer,'Close scoring');await wait(organizer,`document.body.innerText.includes('closed')`);await navigate(organizer,tabPath);await choose(organizer,child.id)
  await labelled(organizer,'Review reason','Real browser calculation and finalization')
  if(child.method==='manual'){await labelled(organizer,'Alpha placement',1);await labelled(organizer,'Beta placement',2)}
  await click(organizer,'Calculate official results');await wait(organizer,`document.body.innerText.includes('Awaiting independent verification')`)
  await navigate(review,scorePath);await choose(review,child.id);await labelled(review,'Review reason','Independent real browser verification');await click(review,'Verify calculation');await wait(organizer,`document.body.innerText.includes('Verified')`);await click(organizer,'Finalize official calculation');await wait(organizer,`document.body.innerText.includes('Finalized')`)
  await navigate(organizer,resultPath);await choose(organizer,child.id);await wait(organizer,`document.body.innerText.includes('Current official standings')`);await labelled(organizer,'Publication reason','Explicit real browser edition');await click(organizer,'Publish selected finalized version');await wait(organizer,`[...document.querySelectorAll('button')].some(n=>n.textContent==='Withdraw publication')`)
  console.log('PASS real scoring/privacy/review/finalization/publication '+child.method)
 }
 scenarios.push('All six methods complete real judge lock/submission, incomplete-source privacy, independent review, explicit finalization and publication through actual routes')
 const screenshot=await call('Page.captureScreenshot',{format:'png'},organizer);writeFileSync(path.join(out,'real-workspace.png'),Buffer.from(screenshot.data,'base64'))
 writeFileSync(path.join(out,'real-browser.json'),JSON.stringify({passed:true,database:identity.database,event,title,scenarios,network,realPasswordLogin:true,actualMainRouter:true,realPostgrest:true,mockedApi:false,syntheticJwtIssuance:false,productionTouched:false},null,2));console.log('PASS real application smoke: parent and native child creation')
}catch(error){writeFileSync(path.join(out,'real-browser-failure.json'),JSON.stringify({error:error.message,scenarios,network,database:identity.database,productionTouched:false},null,2));throw error}
finally{if(browser?.readyState===WebSocket.OPEN){browser.send(JSON.stringify({id:++seq,method:'Browser.close'}));browser.close()}else chrome.kill()}
