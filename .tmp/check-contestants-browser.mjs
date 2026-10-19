import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const pages=await(await fetch('http://127.0.0.1:9331/json/list')).json()
const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
let seq=0;const pending=new Map(),exceptions=[],requests=[]
socket.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);if(m.method==='Network.requestWillBeSent'&&new URL(m.params.request.url).pathname.startsWith('/api/'))requests.push(m.params.request.url);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})
const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timed out '+expression)}
async function click(text){await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button');b.click()})()`)}
async function photo(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(`${name}.png`,import.meta.url),Buffer.from(r.data,'base64'))}
async function fresh(width,mode='draft'){
 await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:false})
 await command('Page.navigate',{url:`http://127.0.0.1:5178/.tmp/contestants-preview.html?mode=${mode}`})
 await wait(`document.querySelector('h2')?.textContent==='Contestants & Entries' && Boolean(document.querySelector('table'))`)
}
async function layout(width){const g=await evaluate(`({page:document.documentElement.scrollWidth,viewport:innerWidth,nested:[...document.querySelector('main').querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.className)})`);assert.ok(g.page<=width+1,JSON.stringify(g));assert.deepEqual(g.nested,[],JSON.stringify(g))}
try{
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['*/api/*','*://*.supabase.co/*']})
 for(const width of[1536,1280,1024,768,390]){
  await fresh(width);await layout(width);await photo(`contestants-initial-${width}`)
  await click('Final');await wait(`document.body.textContent.includes('Awaiting qualification')`);await layout(width)
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Assign Selected')`),false)
  await photo(`contestants-awaiting-${width}`)
  await fresh(width,'approved');await click('Final');await wait(`document.body.textContent.includes('Qualification confirmed')`);await layout(width);await photo(`contestants-qualified-${width}`)
  assert.equal(await evaluate(`document.querySelector('tbody').querySelectorAll('tr').length`),7)
  assert.equal(await evaluate(`document.querySelector('tbody').textContent.includes('Eliminated')`),true)
 }
 await fresh(390,'nodiv');assert.equal(await evaluate(`Boolean(document.querySelector('#entry-division'))`),false)
 await evaluate(`(()=>{const s=document.querySelector('#entry-type');s.value='group';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await wait(`document.querySelector('label[for=entry-name]').textContent==='Entry or group name'`)
 await layout(390);await photo('contestants-group-no-divisions-390')
 await fresh(1280,'manual');await click('Final');await wait(`document.querySelector('tbody').textContent.includes('Approved manual qualifier')`)
 await photo('contestants-approved-manual-1280')
 assert.deepEqual(exceptions,[]);assert.deepEqual(requests,[])
 console.log('PASS: initial, protected and confirmed rosters at 1536/1280/1024/768/390px; group/no-division labels; manual provenance; no page overflow, nested vertical scrollers or live API requests.')
 await command('Browser.close')
}finally{socket.close()}
