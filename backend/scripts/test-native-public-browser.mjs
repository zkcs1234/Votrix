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
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9342',`--user-data-dir=${path.join(dir,'real-public-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
let browser,seq=0;const pending=new Map()
try{
 let info;for(let i=0;i<100;i++){try{info=await(await fetch('http://127.0.0.1:9342/json/version')).json();break}catch{await pause(100)}}assert.ok(info,'Chrome debug endpoint unavailable')
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
 const main=JSON.parse(readFileSync(path.join(out,'real-browser.json'))),freeze=main.network.find(n=>n.path.endsWith('/rules/freeze')),child=freeze.path.match(/competitions\/([a-f0-9-]+)\/rules/)[1]
 const context=await call('Target.createBrowserContext'),target=await call('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId}),attached=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true}),session=attached.sessionId
 await call('Page.enable',{},session);await call('Runtime.enable',{},session);await call('Network.enable',{},session);await navigate(session,`/competition/events/${main.event}/competitions/${child}/results`);await wait(session,`document.body.innerText.includes('Alpha')&&document.body.innerText.includes('85')`)
 assert.equal(await evaluate(session,`document.body.innerText.includes('Read-only submitted values')`),false)
 const shot=await call('Page.captureScreenshot',{format:'png'},session);writeFileSync(path.join(out,'real-public.png'),Buffer.from(shot.data,'base64'))
 const organizer=await login(accounts.find(a=>a.role==='organizer'));await navigate(organizer,'/organizer/competition');await click(organizer,'Manage competitions');await wait(organizer,`location.pathname==='/organizer/competition/events'&&document.body.innerText.includes(${JSON.stringify(main.title)})`);await click(organizer,main.title);await wait(organizer,`location.pathname.endsWith('/workspace')&&document.body.innerText.includes('Independent')||!!document.querySelector('[aria-label="Setup competition"]')`)
 const judge=await login(accounts.find(a=>a.name==='Judge One'));await wait(judge,`!!document.querySelector('a[href*="competitionId=${child}"]')`);await evaluate(judge,`document.querySelector('a[href*="competitionId=${child}"]').click()`);await wait(judge,`location.search.includes('competitionId=${child}')&&document.body.innerText.includes('Round submitted')`)
 writeFileSync(path.join(out,'real-public-browser.json'),JSON.stringify({passed:true,event:main.event,competition:child,anonymous:true,organizerActualEventSelection:true,judgeActualDashboardDeepLink:true,actualMainRouter:true,realPostgrest:true,network,productionTouched:false},null,2));console.log('PASS anonymous public route, organizer event selection and judge dashboard launch')
}catch(error){writeFileSync(path.join(out,'real-public-browser-failure.json'),JSON.stringify({error:error.message,network,productionTouched:false},null,2));throw error}
finally{if(browser?.readyState===WebSocket.OPEN){browser.send(JSON.stringify({id:++seq,method:'Browser.close'}));browser.close()}else chrome.kill()}
