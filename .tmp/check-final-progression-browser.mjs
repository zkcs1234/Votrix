import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const pages=await(await fetch('http://127.0.0.1:9331/json/list')).json(),socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
let seq=0;const pending=new Map(),errors=[],requests=[]
socket.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.method==='Network.requestWillBeSent'&&new URL(m.params.request.url).pathname.startsWith('/api/'))requests.push(m.params.request.url);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out '+expression)}
async function click(text){await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button '+${JSON.stringify(text)});b.click()})()`)}
async function snapshot(name){const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(`${name}.png`,import.meta.url),Buffer.from(r.data,'base64'))}
async function fresh(width,mode='none',start=''){await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:`http://127.0.0.1:5178/.tmp/final-progression-preview.html?mode=${mode}${start?'&start='+encodeURIComponent(start):''}`});await wait(`Boolean(document.querySelector('[aria-label="Round Participation"]'))||Boolean(document.querySelector('[aria-label="Advancement settings"]'))`)}
async function layout(width){const g=await evaluate(`({width:document.documentElement.scrollWidth,viewport:innerWidth,nested:[...document.querySelector('main').querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.className)})`);assert.ok(g.width<=width+1,JSON.stringify(g));assert.deepEqual(g.nested,[],JSON.stringify(g))}
try{
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*/api/*','*://*.supabase.co/*']})
 for(const width of[1536,1280,1024,768,390]){
  for(const mode of['none','top','verification','approval','confirmed']){
   await fresh(width,mode);await click('Final');await wait(`document.querySelector('[aria-label="Round Participation"]').textContent.includes('Scoring status')`);await layout(width)
   const text=await evaluate(`document.querySelector('[aria-label="Round Participation"]').textContent`)
   if(mode==='none'){assert.match(text,/12 planned entries/);assert.match(text,/All eligible contestants continue/);assert.doesNotMatch(text,/confirmed qualifiers|Awaiting qualification/)}
   if(mode==='top')assert.match(text,/Awaiting Preliminary results/)
   if(mode==='verification')assert.match(text,/Awaiting verification/)
   if(mode==='approval')assert.match(text,/Awaiting advancement approval/)
   if(mode==='confirmed'){assert.match(text,/Confirmed finalists: 6/);await click('View Advancement Record');await wait(`document.querySelector('details[open]')?.textContent.includes('advancement-decision-001')`)}
   await evaluate(`document.querySelector('[aria-label="Round Participation"]').scrollIntoView({block:'center'})`);await snapshot(`final-progression-${mode}-${width}`)
  }
 }
 await fresh(390,'none_exclusions');await click('Final');assert.match(await evaluate(`document.querySelector('[aria-label="Round Participation"]').textContent`),/11 planned entries/)
 await fresh(1280,'none_open');await click('Final');assert.match(await evaluate(`document.querySelector('[aria-label="Round Participation"]').textContent`),/Scoring status: Open/)
 await fresh(1280,'confirmed');await click('Final');await click('View Qualified Entries');await wait(`document.querySelector('tbody').children.length===6`)
 await fresh(1280,'top');await click('Final');const path='/organizer/competition/events/30000000-0000-0000-0000-000000000001/workspace?tab=rounds&section=advancement&roundId=pre'
 assert.equal(await evaluate(`document.querySelector('a[href*="section=advancement"]').getAttribute('href')`),path)
 await evaluate(`document.querySelector('a[href*="section=advancement"]').click()`);await wait(`document.querySelector('[aria-label="Advancement settings"]')?.textContent.includes('Advancement & Elimination')`)
 assert.equal(await evaluate(`document.querySelector('[data-preview-path]').getAttribute('data-preview-path')`),path)
 assert.equal(await evaluate(`document.querySelector('[aria-label="Advancement settings"] select').matches(':disabled')`),true)
 await snapshot('final-progression-source-navigation-1280');await fresh(390,'top',path);assert.equal(await evaluate(`document.querySelector('[aria-label="Advancement settings"] select').value`),'top_n')
 await snapshot('final-progression-source-refresh-390')
 await fresh(390,'failure');await wait(`document.body.textContent.includes('Failed to load participation data')`);assert.equal(await evaluate(`document.body.textContent.includes('Confirmed finalists: 0')`),false);await click('Reload saved entries');await wait(`document.body.textContent.includes('Register an entry')`)
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log('PASS: five participation phases at 1536/1280/1024/768/390px; real event/source navigation and refreshed read-only settings; source exclusion, authorized open state, approved-entry filtering and read-error recovery. No live API requests or runtime exceptions.')
 await call('Browser.close')
}finally{socket.close()}
