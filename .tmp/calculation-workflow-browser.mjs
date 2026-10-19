
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { WebSocket } from '../backend/node_modules/ws/wrapper.mjs'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9356',`--user-data-dir=C:/Github/Votrix/.tmp/tabulation-header-chrome-${Date.now()}`,'about:blank'], { windowsHide:true, stdio:'ignore' })
let socket
try {
 let info
 for(let i=0;i<60;i++){try{info=await(await fetch('http://127.0.0.1:9356/json/version')).json();break}catch{await pause(150)}}
 assert.ok(info,'Browser ready')
 socket = new WebSocket(info.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
 let sequence=0
 const pending=new Map()
 socket.on('message',raw=>{const m=JSON.parse(raw);if(!m.id)return;const task=pending.get(m.id);if(task){pending.delete(m.id);m.error?task.reject(new Error(m.error.message)):task.resolve(m.result)}})
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))})
 const {targetId}=await call('Target.createTarget',{url:'about:blank'})
 const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true})
 const evaluate=async expression=>{const data=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(data.exceptionDetails)throw new Error(data.exceptionDetails.text);return data.result.value}
 await call('Page.enable',{},sessionId)
 await call('Page.navigate',{url:'http://127.0.0.1:5175/.tmp/calculation-workflow-preview.html'},sessionId)
 let ready=false
 for(let i=0;i<120;i++){ready=await evaluate(`!!document.querySelector('.v-tab-round-summary')`);if(ready)break;await pause(250)}
 assert.ok(ready,await evaluate('document.body.innerText'))
 const wait=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100)}throw new Error('Timed out: '+expression)}
 const click=async text=>{await evaluate(`[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)}&&!n.matches(':disabled')).click()`)}
 await evaluate(`document.querySelector('[role=tab][aria-label^="Calculation:"]').click()`)
 assert.equal(await evaluate(`!![...document.querySelectorAll('h2')].find(n=>n.textContent==='Independent review')`),false)
 await click('Calculate official results')
 await wait(`!!document.querySelector('.v-tab-calculation-table')`)
 assert.equal(await evaluate(`document.querySelector('[role=tab][aria-label^="Calculation:"]').getAttribute('aria-selected')`),'true')
 for(const width of [1440,1024,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId)
  await pause(200)
  const layout=await evaluate(`(()=>{const root=document.querySelector('.v-tabulation'),main=document.querySelector('.v-tabulation-layout > main'),info=document.querySelector('.v-tab-round-summary');return {width:innerWidth,bodyWidth:document.documentElement.scrollWidth,rootWidth:root.getBoundingClientRect().width,tableAreaWidth:main.getBoundingClientRect().width,headerInfo:!!info.closest('header'),summaryHeight:info.getBoundingClientRect().height,asideCount:root.querySelectorAll('aside').length}})()`)
  assert.equal(layout.headerInfo,true)
  assert.equal(layout.asideCount,0)
  assert.ok(Math.abs(layout.rootWidth-layout.tableAreaWidth)<2,JSON.stringify(layout))
  assert.ok(layout.bodyWidth<=width,JSON.stringify(layout))
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)
  writeFileSync(`C:/Github/Votrix/.tmp/calculation-workflow-${width}.png`,Buffer.from(screenshot.data,'base64'))
  console.log(JSON.stringify(layout))
 }
 await evaluate(`document.querySelector('[role=tab][aria-label^="Finalization:"]').click()`)
 assert.equal(await evaluate(`!!document.querySelector('[aria-label="Independent reviewer"]')`),true)
 await evaluate(`(()=>{const select=document.querySelector('[aria-label="Independent reviewer"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'reviewer-enrollment');select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await click('Assign Reviewer')
 await wait(`document.body.innerText.includes('John Reyes')&&!document.querySelector('[aria-label="Independent reviewer"]')`)
 assert.equal(await evaluate(`document.querySelector('[role=tab][aria-label^="Finalization:"]').getAttribute('aria-selected')`),'true')
 await evaluate(`document.querySelector('[role=tab][aria-label^="Calculation:"]').click()`)
 await evaluate(`document.querySelector('[aria-label="View calculation for Dancer a"]').click()`)
 await wait(`!!document.querySelector('[role="dialog"]')`)
 assert.equal(await evaluate(`document.body.innerText.includes('How the total is calculated')`),true)
 console.log('PASS calculate without reviewer, retain selected stage after delayed refresh, assign reviewer in finalization without recalculation, inspect entry breakdown')
} finally {socket?.close();chrome.kill()}
