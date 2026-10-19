import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'

const pages=await (await fetch('http://127.0.0.1:9331/json/list')).json()
const socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
const pending=new Map(),exceptions=[],appRequests=[]
let sequence=0
socket.on('message',raw=>{
  const message=JSON.parse(raw)
  if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text)
  if(message.method==='Network.requestWillBeSent'&&new URL(message.params.request.url).pathname.startsWith('/api/'))appRequests.push(message.params.request.method)
  if(message.id){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result)}
})
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error(`Timed out: ${expression}`)}
async function click(selector){const point=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('Control missing');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
async function clickText(text){await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)throw new Error('Button missing: '+${JSON.stringify(text)});n.click()})()`)}
async function fill(selector,text){await click(selector);await command('Input.insertText',{text})}
async function viewport(width,height){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})}
async function screenshot(name,full=true){await evaluate('new Promise(resolve=>setTimeout(resolve,200))');const size=(await command('Page.getLayoutMetrics')).cssContentSize;const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(full?{clip:{x:0,y:0,width:Math.ceil(size.width),height:Math.ceil(size.height),scale:1}}:{})});await fs.writeFile(new URL(`${name}.png`,import.meta.url),Buffer.from(image.data,'base64'))}
async function noOverflow(label){const size=await evaluate('({content:document.documentElement.scrollWidth,viewport:innerWidth})');assert.ok(size.content<=size.viewport+1,`${label}: ${JSON.stringify(size)}`);console.log(`PASS: ${label} has no horizontal overflow`)}
async function fresh(){await command('Page.navigate',{url:'http://127.0.0.1:5178/.tmp/rounds-preview.html'});await waitFor(`Boolean(document.querySelector('form[aria-label="Create a Round"]'))`)}
try{
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable')
  await viewport(1280,900);await fresh();await noOverflow('Desktop form')
  assert.equal(await evaluate("Boolean(document.querySelector('.v-rounds input[type=number]'))"),false)
  assert.equal(await evaluate("document.body.textContent.includes('Setup checklist')"),false)
  await screenshot('rounds-desktop-before')
  await fill('form[aria-label="Create a Round"] input:not([type=radio])','Dance Performance')
  await clickText('Create Round')
  await waitFor("document.body.textContent.includes('Dance Performance created successfully.')")
  const saved=await evaluate('window.roundPreviewCalls[0].round')
  assert.equal(saved.progression,'back_to_zero');assert.equal(saved.weight,0)
  const primaryColor=await evaluate("getComputedStyle(document.querySelector('button[data-next-action]')).color")
  assert.equal(primaryColor,'rgb(255, 255, 255)')
  await screenshot('rounds-desktop-created',false)
  await clickText('Configure Scoring Criteria')
  await waitFor("document.body.textContent.includes('New criterion for “Dance Performance”')")
  assert.equal(new URLSearchParams((await evaluate('window.roundPreviewLocation')).search).get('roundId'),saved.id)
  console.log('PASS: confirmed creation and correct database-ID navigation to the existing Criteria editor')
  await click('#workspace-tab-rounds');await waitFor("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='More Settings')");await clickText('More Settings')
  await waitFor("document.body.textContent.includes('Stage Lineup & Live Judging')")
  assert.equal(await evaluate("document.body.textContent.includes('Stage Lineup & Live Judging')"),true)
  assert.equal(await evaluate("document.body.textContent.includes('Disabled. Define permitted deductions')"),true)
  await evaluate("document.querySelector('section[aria-label$=\" settings\"]').scrollIntoView({block:'start'})")
  await screenshot('rounds-desktop-settings',false)
  await clickText('Configure progression')
  await waitFor("Boolean(document.querySelector('form[aria-label=\"Next round and score settings\"]'))")
  assert.equal(await evaluate("document.querySelector('form[aria-label=\"Next round and score settings\"] select').value"),'back_to_zero')
  console.log('PASS: progressive settings open without leaving the workspace')

  for(const [label,width,height]of[['Tablet',768,1024],['Mobile',390,844],['Small mobile',320,568]]){
    await viewport(width,height);await fresh();await noOverflow(`${label} form`)
    if(width===320)await screenshot('rounds-mobile-before')
    await click('input[value="back_to_zero"]')
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
    await waitFor("Boolean(document.querySelector('.v-rounds input[type=number]'))")
    assert.equal(await evaluate("document.querySelector('input[value=weighted]').checked"),true)
    await noOverflow(`${label} combined form`)
    if(width===320)await screenshot('rounds-mobile-combined')
  }
  await fill('.v-rounds input[type=number]','30')
  await fill('form[aria-label="Create a Round"] input:not([type=radio])','Mobile Preliminary')
  await click('input[value="qualification"]')
  await clickText('Create Round')
  await waitFor("document.body.textContent.includes('Mobile Preliminary created successfully.')")
  await clickText('More Settings')
  await waitFor("document.body.textContent.includes('Stage Lineup & Live Judging')")
  await noOverflow('Small mobile settings')
  await clickText('Edit')
  await waitFor(`Boolean(document.querySelector('form[aria-label="Edit Mobile Preliminary"]'))`)
  await noOverflow('Small mobile edit form')
  await screenshot('rounds-mobile-settings',false)
  assert.deepEqual(exceptions,[]);assert.deepEqual(appRequests,[])
  console.log('PASS: keyboard radio selection; no runtime errors and no real application API requests')
}finally{await command('Browser.close').catch(()=>{});socket.close()}
