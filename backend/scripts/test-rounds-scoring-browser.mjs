// The actual main.jsx/router/login + actual Express + REAL PostgREST/PostgreSQL.
// No alternate entry JSX, mocked API, synthetic JWT endpoint or contract adapter.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {WebSocket} from '../node_modules/ws/wrapper.mjs'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),out=path.join(root,'audits/rounds-scoring-2026-10-16'),accounts=JSON.parse(readFileSync(path.join(dir,'accounts.json'))),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),api=JSON.parse(readFileSync(path.join(dir,'api-client.json')))
const proof=await fetch(api.supabaseUrl+'/rest/v1/rpc/votrix_local_identity',{headers:{Authorization:'Bearer '+api.serviceKey}});assert.equal(proof.status,200);assert.equal((await proof.json()).nonce,identity.nonce);mkdirSync(out,{recursive:true})
const backendProof=await fetch('http://127.0.0.1:5000/api/auth/me',{signal:AbortSignal.timeout(5000)});assert.equal(backendProof.headers.get('x-votrix-local-identity'),identity.nonce,'Backend isolation proof missing; browser writes prohibited');assert.equal(backendProof.headers.get('x-votrix-local-database'),identity.database)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),network=[],scenarios=[]
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9343',`--user-data-dir=${path.join(dir,'real-browser-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
let browser,seq=0;const pending=new Map()
try{
 let info;for(let i=0;i<100;i++){try{info=await(await fetch('http://127.0.0.1:9343/json/version')).json();break}catch{await pause(100)}}assert.ok(info,'Chrome debug endpoint unavailable')
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
 const owner=accounts.find(a=>a.role==='organizer'),organizer=await login(owner);await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},organizer);await navigate(organizer,'/organizer/competition');await wait(organizer,`document.body.innerText.includes('Manage competitions')`)
 assert.equal(await evaluate(organizer,`localStorage.getItem('votrix_access_token')`),null)
 scenarios.push('Real organizer password login through normal main.jsx/bootstrap/router, session cookies and dashboard; no fixture JWT issuance')
 console.log('PASS real organizer login and native-enabled root dashboard')
 await click(organizer,'Create Event');await wait(organizer,`location.pathname==='/organizer/competition/events/new'`);const title='Native real application '+Date.now()
 await field(organizer,'input[name="title"]',title);await field(organizer,'#startDate','2030-01-10T09:00');await field(organizer,'#endDate','2030-01-11T17:00');await click(organizer,'Next: Branding');await click(organizer,'Next: Competition Type');await field(organizer,'#competition-template','dance');await click(organizer,'Next: Competitions / Categories');await wait(organizer,`location.pathname.endsWith('/categories')&&document.body.innerText.includes('Your selected competitions')`)
 const event=await evaluate(organizer,`location.pathname.split('/')[4]`);assert.match(event,/^[0-9a-f-]{36}$/)
 const opt=async(session,label,part)=>{await wait(session,`[...document.querySelector('[aria-label=${JSON.stringify(label)}]').options].some(o=>o.textContent.includes(${JSON.stringify(part)}))`);return evaluate(session,`[...document.querySelector('[aria-label=${JSON.stringify(label)}]').options].find(o=>o.textContent.includes(${JSON.stringify(part)})).value`)}
 const settle=async()=>pause(350)
 for(const n of ['Contemporary Dance','Hip-Hop']){await wait(organizer,`document.querySelector('fieldset:not(:disabled) input[type=checkbox]')`);await evaluate(organizer,`[...document.querySelectorAll('label')].find(n=>n.textContent.trim()===${JSON.stringify(n)}).querySelector('input').click()`);await wait(organizer,`document.querySelectorAll('article').length===${n==='Contemporary Dance'?1:2}`);await settle()}
 scenarios.push('Actual eight-step create route preserves one parent, and Step 4 selects independent competitions')
 const children=[]
 await navigate(organizer,`/organizer/competition/events/${event}/workspace`)
 for(const [index,method]of ['weighted_average','sum'].entries()){
  const option=await opt(organizer,'Setup competition',index===0?'Contemporary Dance':'Hip-Hop');await labelled(organizer,'Setup competition',option);await settle()
  children.push({id:option,method})
  await click(organizer,'Structure');await labelled(organizer,'Single round name','Final Performance')
  await click(organizer,'Next: Criteria');await labelled(organizer,'Major criterion name',method+' performance');await labelled(organizer,'Major criterion weight (%)',100);await click(organizer,'+ Add Criterion')
  await click(organizer,'Next: Score Sheet');await labelled(organizer,'Calculation method',method);await labelled(organizer,'Input decimal places',1)
  await field(organizer,'[aria-label="Judge score sheet preview"] input[type=number]',80);await wait(organizer,`document.body.innerText.includes('80.00 / 100')`)
  await click(organizer,'Lock Preview Scores');assert.equal(await evaluate(organizer,`document.querySelector('[aria-label="Judge score sheet preview"] input[type=number]').disabled`),true)
  await click(organizer,'Next: Deductions')
  if(index===0){await evaluate(organizer,`[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Enable deduction rules')).querySelector('input').click()`);await labelled(organizer,'Deduction rule name','Time limit');await labelled(organizer,'Deduction value',2);await click(organizer,'+ Add Deduction Rule')}
  await click(organizer,'Save & Complete');await wait(organizer,`document.body.innerText.includes('Configuration saved')`)
  if(index===0){
   await click(organizer,'Criteria');await wait(organizer,`document.body.innerText.includes('Saved criteria')`)
   const capture=async(filename,width)=>{await pause(250);const metrics=await call('Page.getLayoutMetrics',{},organizer);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.cssContentSize.height,scale:1}},organizer);writeFileSync(path.join(out,filename),Buffer.from(shot.data,'base64'))}
   await capture('step5-criteria-desktop.png',1440);await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},organizer);await capture('step5-criteria-mobile.png',390);await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},organizer)
  }
 }
 scenarios.push('Step 5 saves separate single-phase criteria and methods without artificial rounds')
 await navigate(organizer,`/organizer/competition/events/${event}/contestants`);await labelled(organizer,'Setup competition',children[0].id);await settle()
 for(const [n,number]of [['Alpha',1],['Beta',2]]){await labelled(organizer,'Event entrant name',n);await labelled(organizer,'Event entrant number',number);await click(organizer,'Create event entrant');await wait(organizer,`document.body.innerText.includes('Event entrant created')`);await settle()}
 await labelled(organizer,'Setup competition',children[1].id);await wait(organizer,`document.querySelectorAll('button').length>0&&[...document.querySelectorAll('button')].filter(n=>n.textContent==='Add to competition').length===2`)
 for(let e=0;e<2;e++){await click(organizer,'Add to competition');await wait(organizer,`[...document.querySelectorAll('button')].filter(n=>n.textContent==='Participating').length===${e+1}`);await settle()}
 scenarios.push('Step 6 explicitly reuses two underlying entrants through distinct memberships')
 await navigate(organizer,`/organizer/competition/events/${event}/review`);await wait(organizer,`document.body.innerText.includes('Assign an active judge')`);assert.equal(await evaluate(organizer,`[...document.querySelectorAll('button')].find(n=>n.textContent.includes('Create Event')).disabled`),true)
 await navigate(organizer,`/organizer/competition/events/${event}/judges`)
 for(const n of ['Judge One','Judge Two','Reviewer']){await labelled(organizer,'Available judge',await opt(organizer,'Available judge',n));await click(organizer,'Enroll judge');await wait(organizer,`document.body.innerText.includes('Judge enrolled without sending an invitation')`);await settle()}
 const roleLabel=await evaluate(organizer,`[...document.querySelectorAll('select[aria-label]')].find(n=>n.getAttribute('aria-label').includes('Reviewer event role')).getAttribute('aria-label')`)
 await labelled(organizer,roleLabel,'score_reviewer');await wait(organizer,`document.body.innerText.includes('Event role updated')`)
 for(const child of children){await labelled(organizer,'Setup competition',child.id);await settle();for(const n of ['Judge One','Judge Two']){await labelled(organizer,'Assigned judge',await opt(organizer,'Assigned judge',n));await click(organizer,'Assign judge');await wait(organizer,`document.body.innerText.includes('Assignment saved')`);await settle()}}
 await navigate(organizer,`/organizer/competition/events/${event}/review`);await wait(organizer,`document.querySelector('input[type="checkbox"]:not(:disabled)')`);await evaluate(organizer,`document.querySelector('input[type="checkbox"]').click()`);await click(organizer,'Create Event');await wait(organizer,`location.pathname.endsWith('/live')`)
 scenarios.push('Steps 7–8 block missing assignments then atomically freeze all children and reach Live Control')
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
  for(const session of [j1,j2]){await navigate(session,scorePath);await choose(session,child.id)}
  await navigate(organizer,livePath);await choose(organizer,child.id);await click(organizer,'Start scoring');await wait(organizer,`[...document.querySelectorAll('legend')].some(n=>n.textContent==='Scoring access')`)
  for(let g=0;g<3;g++){await wait(organizer,`[...document.querySelectorAll('legend')].find(n=>n.textContent==='Scoring access').parentElement.querySelector('input:not(:checked):not(:disabled)')`);await evaluate(organizer,`[...document.querySelectorAll('legend')].find(n=>n.textContent==='Scoring access').parentElement.querySelector('input:not(:checked)').click()`);await wait(organizer,`[...document.querySelectorAll('legend')].find(n=>n.textContent==='Scoring access').parentElement.querySelectorAll('input:checked').length===${g+1}`);await settle()}
  await wait(j1,`document.querySelectorAll('tr[data-contestant-id] input:not(:disabled)').length===2`);scenarios.push('Judge inputs open through server invalidation without browser refresh')
  await score(j1,[80,70]);await wait(organizer,`document.body.innerText.includes('Submitted')`);await navigate(organizer,tabPath);await choose(organizer,child.id);await wait(organizer,`document.body.innerText.includes('Every required judge must submit')`);assert.equal(await evaluate(organizer,`document.body.innerText.includes('Read-only submitted values')`),false)
  await score(j2,[90,60]);await wait(organizer,`document.body.innerText.includes('Read-only submitted values')`)
  await labelled(organizer,'Independent reviewer',await opt(organizer,'Independent reviewer','Reviewer'));await click(organizer,'Appoint reviewer');await wait(organizer,`!document.querySelector('[aria-label="Independent reviewer"]')`)
  await navigate(organizer,livePath);await choose(organizer,child.id);await click(organizer,'Close scoring');await wait(organizer,`document.body.innerText.includes('closed')`);await navigate(organizer,tabPath);await choose(organizer,child.id)
  await labelled(organizer,'Review reason','Real browser calculation and finalization')
  if(child.method==='weighted_average'){
   await labelled(organizer,'Deduction contestant',await opt(organizer,'Deduction contestant','Alpha'));await labelled(organizer,'Deduction rule',await opt(organizer,'Deduction rule','Time limit'));await labelled(organizer,'Offense identity','time-limit-1');await click(organizer,'Propose deduction');await wait(organizer,`document.body.innerText.includes('pending')`)
   await navigate(review,scorePath);await choose(review,child.id);await labelled(review,'Review reason','Confirmed time limit violation');await click(review,'approve');await wait(organizer,`document.body.innerText.includes('approve')`)
   scenarios.push('Organizer deduction proposal and independent approval synchronize to tabulation')
  }
  if(child.method==='manual'){await labelled(organizer,'Alpha placement',1);await labelled(organizer,'Beta placement',2)}
  await click(organizer,'Calculate official results');await wait(organizer,`document.body.innerText.includes('Awaiting independent verification')`)
  await navigate(review,scorePath);await choose(review,child.id);await labelled(review,'Review reason','Independent real browser verification');await click(review,'Verify calculation');await wait(organizer,`document.body.innerText.includes('Verified')`);await click(organizer,'Finalize official calculation');await wait(organizer,`document.body.innerText.includes('Finalized')`)
  await navigate(organizer,resultPath);await choose(organizer,child.id);await wait(organizer,`document.body.innerText.includes('Current official standings')`);await labelled(organizer,'Publication reason','Explicit real browser edition');await click(organizer,'Publish selected finalized version');await wait(organizer,`[...document.querySelectorAll('button')].some(n=>n.textContent==='Withdraw publication')`)
  if(child.method==='weighted_average')assert.ok(await evaluate(organizer,`document.body.innerText.includes('83')`),'Final score must be 85 minus approved 2-point deduction');console.log('PASS real scoring/privacy/review/finalization/publication '+child.method)
 }
 scenarios.push('Both independent competition methods complete real judge lock/submission, incomplete-source privacy, independent review, explicit finalization and publication through actual routes')
 const cookieChecks=await evaluate(organizer,`(async()=>{const cookie=await fetch('http://localhost:5000/api/auth/me',{credentials:'include',headers:{Authorization:'Bearer unrelated-token'}});const header=await fetch('http://localhost:5000/api/auth/me',{credentials:'omit',headers:{Authorization:'Bearer unrelated-token'}});const refresh=await fetch('http://localhost:5000/api/auth/refresh',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});const body=await refresh.json();return {cookieStatus:cookie.status,headerOnlyStatus:header.status,refreshStatus:refresh.status,refreshHasAccessToken:'accessToken' in body,refreshHasRefreshToken:'refreshToken' in body,storedAccessToken:localStorage.getItem('votrix_access_token')}})()`)
 assert.deepEqual(cookieChecks,{cookieStatus:200,headerOnlyStatus:401,refreshStatus:200,refreshHasAccessToken:false,refreshHasRefreshToken:false,storedAccessToken:null})
 scenarios.push('Real cookie-only authentication: legacy token storage empty; unrelated bearer cannot override cookie identity; no-cookie bearer rejected; refresh returns no access/refresh token JSON')
 const screenshot=await call('Page.captureScreenshot',{format:'png'},organizer);writeFileSync(path.join(out,'real-workspace.png'),Buffer.from(screenshot.data,'base64'))
 writeFileSync(path.join(out,'real-browser.json'),JSON.stringify({passed:true,database:identity.database,event,title,scenarios,network,realPasswordLogin:true,actualMainRouter:true,realPostgrest:true,mockedApi:false,syntheticJwtIssuance:false,productionTouched:false},null,2));console.log('PASS revised creation, judging, live control, tabulation and results in the real application')
}catch(error){writeFileSync(path.join(out,'real-browser-failure.json'),JSON.stringify({error:error.message,scenarios,network,database:identity.database,productionTouched:false},null,2));throw error}
finally{if(browser?.readyState===WebSocket.OPEN){browser.send(JSON.stringify({id:++seq,method:'Browser.close'}));browser.close()}else chrome.kill()}
