import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'

const response = await fetch('http://127.0.0.1:9331/json/list')
const pages = await response.json()
const page=pages.find(item=>item.type==='page')
assert.ok(page,'Headless browser page is available')
const socket=new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
const pending=new Map()
const exceptions=[]
let sequence=0
socket.on('message',raw=>{
  const message=JSON.parse(raw)
  if(message.method==='Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  if(message.id){const handler=pending.get(message.id);pending.delete(message.id);message.error?handler.reject(new Error(message.error.message)):handler.resolve(message.result)}
})
function command(method,params={}){
  return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(expression){
  for(let index=0;index<100;index+=1){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100))}
  throw new Error(`Timed out waiting for ${expression}`)
}
async function click(selector){
  const point=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw new Error('Missing control');const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
}
async function clickText(text){
  await evaluate(`(()=>{const node=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!node)throw new Error('Missing button');node.click()})()`)
}
async function bounds(name){
  const rect=await evaluate(`(()=>{const r=document.querySelector('.v-cal-pop-polished').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`)
  assert.ok(rect.left>=15&&rect.right<=rect.width-15&&rect.top>=15&&rect.bottom<=rect.height-15,`${name} popup stays in viewport: ${JSON.stringify(rect)}`)
  console.log(`PASS: ${name} popup remains within viewport (${rect.width}x${rect.height})`)
}
async function screenshot(name){
  await evaluate("new Promise(resolve=>setTimeout(resolve,200))")
  const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  await fs.writeFile(new URL(`${name}.png`,import.meta.url),Buffer.from(result.data,'base64'))
}
async function viewport(width,height){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})}
async function chooseToday(){await click('.v-cal-cell[aria-current="date"]')}
try{
  await command('Page.enable')
  await command('Runtime.enable')
  await viewport(1280,900)
  await command('Page.navigate',{url:'http://127.0.0.1:5178/.tmp/election-picker-preview.html'})
  await waitFor("Boolean(document.getElementById('preview-start'))")
  await click('#preview-start')
  await waitFor("Boolean(document.querySelector('.v-cal-grid'))")
  await chooseToday()
  assert.equal(await evaluate('window.pickerSelection.start'),'')
  await bounds('Desktop date')
  await screenshot('election-picker-desktop-date')
  await clickText('Continue')
  await waitFor("Boolean(document.querySelector('[aria-label=\"Hour clock\"]'))")
  assert.equal(await evaluate("Boolean(document.querySelector('.v-cal-grid'))"),false)
  assert.equal(await evaluate("document.querySelector('.v-clock-polished input')"),null)
  await click('[aria-label="Hour 3"]')
  await click('[aria-label="Minute 25"]')
  await clickText('PM')
  const point=await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Minute clock\"]').getBoundingClientRect();const angle=17*Math.PI/30;return{x:r.left+r.width/2+Math.sin(angle)*r.width*0.45,y:r.top+r.height/2-Math.cos(angle)*r.height*0.45}})()")
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Select minute\"]').textContent.trim()"),'17')
  await evaluate("new Promise(resolve=>setTimeout(resolve,200))")
  const colors=await evaluate("[...document.querySelectorAll('.v-clock-period button')].map(n=>({label:n.textContent.trim(),pressed:n.getAttribute('aria-pressed'),disabled:n.disabled,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor,opacity:getComputedStyle(n).opacity}))")
  assert.notEqual(colors[0].background,colors[1].background)
  assert.equal(colors.find(item=>item.pressed==='true').color,'rgb(255, 255, 255)')
  console.log(JSON.stringify(await evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Done');const rules=[];function scan(list){for(const r of list){if(r.selectorText&&n.matches(r.selectorText)&&r.style.color)rules.push({selector:r.selectorText,color:r.style.color});if(r.cssRules)scan(r.cssRules)}}for(const sheet of document.styleSheets)scan(sheet.cssRules);return{className:n.className,color:getComputedStyle(n).color,rules}})()")))
  assert.equal(await evaluate("getComputedStyle([...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Done')).color"),'rgb(255, 255, 255)')
  console.log('PASS: exact-minute dial selection and clear selected AM/PM colors')
  await bounds('Desktop clock')
  await screenshot('election-picker-desktop-time')
  assert.equal(await evaluate('window.pickerSelection.start'),'')
  await clickText('Back')
  await waitFor("Boolean(document.querySelector('.v-cal-grid'))")
  await clickText('Continue')
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Select minute\"]').textContent.trim()"),'17')
  assert.equal(await evaluate("[...document.querySelectorAll('.v-clock-period button')].find(n=>n.textContent.trim()==='PM').getAttribute('aria-pressed')"),'true')
  await clickText('Done')
  await waitFor("!document.querySelector('.v-cal-pop-polished')")
  assert.match(await evaluate('window.pickerSelection.start'),/T15:17$/)
  assert.equal(await evaluate('document.activeElement.id'),'preview-start')
  console.log('PASS: actual browser Date → Continue → clock → Back → Done preserves selection and local value format')

  for(const [label,width,height] of [['Tablet',768,1024],['Mobile',390,844],['Small mobile',320,568],['Landscape',640,360]]){
    await viewport(width,height)
    await click('#preview-start')
    await waitFor("Boolean(document.querySelector('.v-cal-grid'))")
    await bounds(`${label} date`)
    if(label==='Small mobile')await screenshot('election-picker-mobile-date')
    await clickText('Continue')
    await waitFor("Boolean(document.querySelector('.v-clock-polished'))")
    await bounds(`${label} clock`)
    if(label==='Small mobile')await screenshot('election-picker-mobile-time')
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
    await waitFor("!document.querySelector('.v-cal-pop-polished')")
  }
  await viewport(390,844)
  await click('#preview-start')
  await clickText('Continue')
  await screenshot('election-picker-mobile-hour')
  assert.deepEqual(exceptions,[])
  console.log('PASS: no browser runtime exceptions; desktop/tablet/mobile screenshots saved under .tmp')
}finally{
  await command('Browser.close').catch(()=>{})
  socket.close()
}
