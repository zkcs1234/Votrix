import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'audits/criteria-reference-2026-10-16');mkdirSync(out,{recursive:true})
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9357',`--user-data-dir=${path.join(root,'.tmp/criteria-reference-chrome-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
let chromeError='';chrome.stderr.on('data',data=>{chromeError+=data.toString()})
let ws,id=0;const jobs=new Map(),errors=[]
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try{
 let pages;for(let i=0;i<80;i++){try{pages=await(await fetch('http://127.0.0.1:9357/json/list')).json();break}catch{await pause(100)}}
 assert.ok(pages);ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
 ws.on('close',()=>{for(const job of jobs.values())job.reject(new Error('Chrome disconnected: '+chromeError));jobs.clear()})
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.id){const job=jobs.get(m.id);if(job){jobs.delete(m.id);m.error?job.reject(new Error(m.error.message)):job.resolve(m.result)}}})
 const call=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;jobs.set(request,{resolve,reject});ws.send(JSON.stringify({id:request,method,params}))})
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1413,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:'http://127.0.0.1:5173/.tmp/criteria-reference.html'})
 let ready=false;for(let i=0;i<150;i++){if(await evaluate("!!document.querySelector('.rs-criteria-layout')")){ready=true;break}await pause(100)}assert.ok(ready,'preview loads')
 await call('Emulation.setFocusEmulationEnabled',{enabled:true});await evaluate("document.querySelector('[aria-label=\"Technique minor score range\"]').focus()");await pause(250)
 const geometry=await evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{layout:rect('.rs-criteria-layout'),form:rect('.rs-criteria-form'),card:rect('.rs-criterion-card'),range:rect('.rs-minor-form select'),labels:[...document.querySelectorAll('.rs-criteria-form label')].map(n=>n.firstChild.textContent),buttons:[...document.querySelectorAll('.rs-minor-form-actions button')].map(n=>n.textContent),rangeLabel:document.querySelector('.rs-minor-form select').selectedOptions[0].textContent,pageWidth:document.documentElement.scrollWidth}})()`)
 assert.deepEqual(geometry.labels,['Criteria name','Weight percentage']);assert.deepEqual(geometry.buttons,['Add','Cancel']);assert.equal(geometry.rangeLabel,'1–10');assert.equal(geometry.range.height,60);assert.ok(geometry.pageWidth<=1413)
 const colors=await evaluate(`(()=>{const button=document.querySelector('.rs-add-criterion'),range=document.querySelector('.rs-minor-form select');return {buttonColor:getComputedStyle(button).color,buttonBackground:getComputedStyle(button).backgroundColor,rangeFocus:getComputedStyle(range).boxShadow}})()`);assert.equal(colors.buttonColor,'rgb(255, 255, 255)');assert.notEqual(colors.rangeFocus,'none')
 let shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:geometry.layout.y-14,width:1413,height:Math.max(geometry.form.height,geometry.card.height)+36,scale:1}});writeFileSync(path.join(out,'desktop.png'),Buffer.from(shot.data,'base64'))
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});await evaluate('document.activeElement.blur()');await pause(200)
 const mobile=await evaluate(`(()=>{const form=document.querySelector('.rs-criteria-form').getBoundingClientRect(),card=document.querySelector('.rs-criterion-card').getBoundingClientRect();return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,stacked:card.y>=form.bottom}})()`);assert.ok(mobile.pageWidth<=390,JSON.stringify(mobile));assert.ok(mobile.stacked)
 shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(path.join(out,'mobile.png'),Buffer.from(shot.data,'base64'))
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'checks.json'),JSON.stringify({geometry,mobile,errors},null,2));console.log(JSON.stringify({passed:true,geometry,mobile,errors}))
}finally{if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify({id:++id,method:'Browser.close'}));ws.close()}else chrome.kill()}
