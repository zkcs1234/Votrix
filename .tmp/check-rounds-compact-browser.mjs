import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'

const pages=await(await fetch('http://127.0.0.1:9331/json/list')).json()
const socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
const pending=new Map(),exceptions=[],appRequests=[]
let sequence=0
socket.on('message',raw=>{const message=JSON.parse(raw)
  if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text)
  if(message.method==='Network.requestWillBeSent'&&new URL(message.params.request.url).pathname.startsWith('/api/'))appRequests.push(message.params.request.method)
  if(message.id){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result)}
})
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error(`Timed out: ${expression}`)}
async function click(selector){const point=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('Missing '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
async function button(text,scope='document'){await evaluate(`(()=>{const n=[...${scope}.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')===${JSON.stringify(text)}||n.textContent.trim()===${JSON.stringify(text)});if(!n)throw new Error('Button missing: '+${JSON.stringify(text)});n.click()})()`)}
async function select(label,value,scope='document'){await evaluate(`(()=>{const root=${scope};const label=[...root.querySelectorAll('label')].find(n=>n.textContent.trim()===${JSON.stringify(label)});const field=document.getElementById(label.htmlFor);field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('change',{bubbles:true}))})()`)}
async function screenshot(name){await evaluate('new Promise(resolve=>setTimeout(resolve,200))');const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(`${name}.png`,import.meta.url),Buffer.from(result.data,'base64'))}
async function fresh(width,height=900){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await command('Page.navigate',{url:'http://127.0.0.1:5178/.tmp/rounds-compact-preview.html'});await waitFor(`Boolean(document.querySelector('form[aria-label="Create Round"]'))`);await evaluate('new Promise(resolve=>setTimeout(resolve,200))')}
async function layout(width){const geometry=await evaluate(`(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return{form:box('[data-round-form-column]'),list:box('[data-round-list-column]'),pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,portalEmpty:document.getElementById('stage-footer-portal').children.length===0,footerPosition:getComputedStyle(document.querySelector('[data-workspace-footer]')).position,scrollRegions:[...document.querySelector('main').querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.tagName+':'+n.className)}})()`)
  assert.ok(geometry.pageWidth<=geometry.viewport+1,`No horizontal overflow: ${JSON.stringify(geometry)}`)
  assert.deepEqual(geometry.scrollRegions,[],'No nested vertical page scroll regions')
  assert.ok(geometry.portalEmpty);assert.equal(geometry.footerPosition,'static')
  if(width>=1024){assert.ok(geometry.list.x>geometry.form.right);assert.ok(Math.abs(geometry.form.y-geometry.list.y)<2);const ratio=geometry.form.width/(geometry.form.width+geometry.list.width);assert.ok(Math.abs(ratio-0.42)<0.015);assert.ok(geometry.list.y<innerHeightProxy);}
  else assert.ok(geometry.list.y>=geometry.form.bottom-1)
  console.log(`PASS: ${width}px ${width>=1024?'42/58 columns':'stacked layout'}; no horizontal/nested overflow; footer in page flow`)
}
const innerHeightProxy=900
try{
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable')
  await command('Network.setBlockedURLs',{urls:['*/api/*','*://*.supabase.co/*']})
  for(const width of [1536,1280,1024,768,390]){
    await fresh(width,width===390?844:900);await layout(width)
    await screenshot(`rounds-compact-${width}`)
  }
  await fresh(1280)
  await click('form[aria-label="Create Round"] input:not([type])')
  await command('Input.insertText',{text:'Dance Performance'})
  await button('Create Round')
  await waitFor("document.body.textContent.includes('Dance Performance created successfully.')")
  const saved=await evaluate('window.roundPreviewCalls[0].round')
  assert.equal(saved.progression,'back_to_zero');assert.equal(saved.weight,0)
  await click(`[data-round-id="${saved.id}"] [data-next-action]`)
  await waitFor("document.body.textContent.includes('New criterion for “Dance Performance”')")
  assert.equal(new URLSearchParams((await evaluate('window.roundPreviewLocation')).search).get('roundId'),saved.id)
  console.log('PASS: confirmed create and correct round-ID Criteria navigation in actual competition shell')

  for(const [width,height]of[[1280,900],[390,844]]){
    await fresh(width,height)
    await click('button[aria-label="Settings for Preliminary"]')
    await waitFor("Boolean(document.querySelector('[role=dialog]'))")
    const bounds=await evaluate(`(()=>{const d=document.querySelector('[role=dialog]');const r=d.getBoundingClientRect();const footer=d.lastElementChild.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,footerBottom:footer.bottom,scrollBodies:d.querySelectorAll('[data-drawer-content]').length,backgroundLocked:document.body.style.overflow==='hidden'}})()`)
    assert.ok(bounds.left>=-1&&bounds.right<=bounds.width+1&&bounds.top>=-1&&bounds.bottom<=bounds.height+1)
    if(width===390)assert.ok(bounds.left<1)
    assert.ok(bounds.footerBottom<=bounds.height+1);assert.equal(bounds.scrollBodies,1);assert.ok(bounds.backgroundLocked)
    await screenshot(`rounds-drawer-${width}`)
    await button('Round Details',"document.querySelector('[role=dialog]')")
    await waitFor(`Boolean(document.querySelector('[role=dialog] form[aria-label="Edit Preliminary"]'))`)
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] form').length"),1)
    assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog] button[aria-label=\"Scoring Criteria\"]'))"),false)
    await screenshot(`rounds-drawer-edit-${width}`)
    await button('Cancel',"document.querySelector('[role=dialog]')")
    await waitFor("Boolean(document.querySelector('[role=dialog] button[aria-label=\"Scoring Criteria\"]'))")
    await evaluate("[...document.querySelector('[role=dialog]').querySelectorAll('button')].find(n=>n.textContent.trim()==='Done').focus()")
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Close')
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await waitFor("!document.querySelector('[role=dialog]')")
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Settings for Preliminary')
    assert.notEqual(await evaluate('document.body.style.overflow'),'hidden')
    console.log(`PASS: ${width}px drawer bounds, one editor/scroll body, visible Done, focus trap and Escape restoration`)
  }
  await fresh(390,844)
  await select('How are scores used?','weighted')
  await waitFor("Boolean(document.querySelector('form[aria-label=\"Create Round\"] input[type=number]'))")
  await layout(390)
  await screenshot('rounds-compact-mobile-combined')
  assert.deepEqual(exceptions,[]);assert.deepEqual(appRequests,[])
  console.log('PASS: conditional contribution field; no runtime exceptions or real application API calls')
}finally{await command('Browser.close').catch(()=>{});socket.close()}
