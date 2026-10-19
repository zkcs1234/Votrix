import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const pages=await(await fetch('http://127.0.0.1:9339/json/list')).json()
const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
let next=0;const pending=new Map()
ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
await command('Runtime.enable');await command('Page.enable')
for(let retry=0;retry<80;retry++){if(await evaluate('!!document.querySelector(".v-control-panel")'))break;await new Promise(resolve=>setTimeout(resolve,100));if(retry===79)throw new Error(await evaluate('document.body.innerText'))}
const results=[]
for(const step of [1,2]){
 if(step===2){await evaluate(`document.querySelector('.v-control-footer button').click()`);await new Promise(resolve=>setTimeout(resolve,300));await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start Live Session')).click()`);await new Promise(resolve=>setTimeout(resolve,300))}
 for(const width of [1280,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const state=await evaluate(`(()=>{const cols=document.querySelector('.v-control-columns'),entries=document.querySelectorAll('.v-control-entry');return {step:document.querySelector('button[aria-current="step"]').textContent,body:document.body.innerText,width:innerWidth,scroll:document.documentElement.scrollWidth,columns:getComputedStyle(cols).gridTemplateColumns,rows:entries.length,tints:[...entries].map(e=>getComputedStyle(e).backgroundColor)}})()`)
  assert.equal(state.rows,6);assert.ok(state.scroll<=width,`Unexpected page overflow at ${width}: ${state.scroll}`)
  for(const weight of ['40%','30%','20%','10%'])assert.ok(state.body.includes(weight))
  assert.notEqual(state.tints[0],state.tints[1]);assert.ok(state.step.startsWith(String(step)))
  const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  await fs.writeFile(new URL(`organizer-step-${step}-${width}.png`,import.meta.url),Buffer.from(screenshot.data,'base64'))
  results.push({step,width,rows:state.rows,scroll:state.scroll,columns:state.columns,tints:state.tints.slice(0,2)})
 }
}
console.log(JSON.stringify(results,null,2));ws.close()
