import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const pages=await(await fetch('http://127.0.0.1:9338/json/list')).json()
const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
let next=0;const pending=new Map()
ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
await command('Runtime.enable');await command('Page.enable')
for(let retry=0;retry<60;retry++){if(await evaluate('!!document.querySelector(".v-judge-sheet table")'))break;await new Promise(resolve=>setTimeout(resolve,100));if(retry===59)throw new Error(await evaluate('document.body.innerText'))}
const results=[]
for(const width of [1280,390]){
 await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 const before=await evaluate(`(()=>{const viewport=document.querySelector('.v-judge-sheet-scroll');viewport.scrollTop=0;viewport.scrollLeft=0;const table=viewport.querySelector('table');return{top:table.tHead.getBoundingClientRect().top,left:table.querySelector('tbody td').getBoundingClientRect().left,client:viewport.clientWidth,scroll:viewport.scrollWidth,rows:table.tBodies[0].rows.length}})()`)
 assert.equal(before.rows,24);assert.ok(before.scroll>before.client,'Grid should scroll horizontally at '+width)
 await evaluate(`(()=>{const v=document.querySelector('.v-judge-sheet-scroll');v.scrollTop=350;v.scrollLeft=150;return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`)
 const after=await evaluate(`(()=>{const t=document.querySelector('.v-judge-sheet table');return{top:t.tHead.getBoundingClientRect().top,left:t.querySelector('tbody td').getBoundingClientRect().left,rows:t.tBodies[0].rows.length,headers:[...t.tHead.rows[0].cells].map(c=>c.innerText),cornerZ:getComputedStyle(t.tHead.querySelector('th')).zIndex,bodyZ:getComputedStyle(t.querySelector('tbody td')).zIndex}})()`)
 assert.ok(Math.abs(before.top-after.top)<2,'Both header rows should remain frozen')
 assert.ok(Math.abs(before.left-after.left)<2,'Contestant column should remain frozen')
 assert.ok(!after.headers.some(h=>/TOTAL/i.test(h)));assert.equal(after.rows,24)
 assert.ok(Number(after.cornerZ)>Number(after.bodyZ),'Frozen corner must cover body cells')
 await evaluate(`(()=>{const v=document.querySelector('.v-judge-sheet-scroll');v.scrollTop=0;v.scrollLeft=0;return new Promise(resolve=>requestAnimationFrame(resolve))})()`)
 const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 await fs.writeFile(new URL(`judge-sheet-${width}.png`,import.meta.url),Buffer.from(screenshot.data,'base64'))
 results.push({width,before,after,stickyHeader:true,stickyContestant:true})
}
console.log(JSON.stringify(results,null,2));ws.close()
