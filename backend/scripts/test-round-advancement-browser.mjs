// Visual/component check only: isolated fixture, no login or database writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket } from '../node_modules/ws/wrapper.mjs'

const root = path.resolve(import.meta.dirname, '../..'), out = path.join(root, 'audits/round-advancement-2026-10-19')
mkdirSync(out, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9371', `--user-data-dir=${path.join(root, '.tmp/round-advancement-chrome-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
try {
  let info
  for (let i = 0; i < 60; i++) { try { info = await (await fetch('http://127.0.0.1:9371/json/version')).json(); break } catch { await pause(150) } }
  assert.ok(info, 'Chrome debugging endpoint unavailable')
  socket = new WebSocket(info.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const pending = new Map()
  socket.on('message', raw => { const message = JSON.parse(raw); if (!message.id) return; const job = pending.get(message.id); if (!job) return; pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result) })
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000); pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } }); socket.send(JSON.stringify({ id, method, params, sessionId })) })
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value }
  const wait = async expression => { for (const deadline = Date.now() + 20000; Date.now() < deadline;) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100) } throw new Error(`Timeout: ${expression} / ${await evaluate('document.body.innerText')}`) }
  await call('Page.enable',{},sessionId)
  const button=label=>'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(label)+')'
  const click=async label=>{await wait(button(label));await evaluate(button(label)+'.click()')}
  const load=async pending=>{
    await call('Page.navigate',{url:'http://127.0.0.1:5173/.tmp/round-advancement-preview.html'+(pending?'?pending':'')},sessionId)
    await wait('document.querySelector(".v-tab-round-checks")')
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false},sessionId)
  await load(true)
  assert.equal(await evaluate(button('Review Advancement')+'.disabled'),true)
  assert.equal(await evaluate(button('Open Final in Live Control')+'.disabled'),true)
  assert.ok(await evaluate('document.body.innerText.includes("Prepare next-round advancement")'))
  await load(false)
  await wait('document.body.innerText.includes("Preliminary tabulation complete")')
  assert.ok(await evaluate('document.body.innerText.includes("Preliminary 30% + Final 70%")'))
  assert.ok(await evaluate('document.body.innerText.includes("Top 1 per division")'))
  assert.equal(await evaluate(button('Open Final in Live Control')+'.disabled'),true)
  await click('Review Advancement')
  const reasonField='document.querySelector('+JSON.stringify('textarea[aria-label="Review reason"]')+')'
  await wait(reasonField)
  assert.equal(await evaluate('document.querySelectorAll("fieldset input[type=checkbox]:checked").length'),2)
  await evaluate(`(()=>{const t=${reasonField};Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(t,"Reviewed top one in Men and Women");t.dispatchEvent(new Event("input",{bubbles:true}))})()`)
  await wait('!'+button('Confirm reviewed qualifiers')+'.disabled')
  await click('Confirm reviewed qualifiers')
  await wait('document.body.innerText.includes("2 qualifiers confirmed for Final.")')
  assert.equal(await evaluate(button('Open Final in Live Control')+'.disabled'),false)
  const layouts=[]
  for(const width of [1440,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1200,deviceScaleFactor:1,mobile:false},sessionId)
    await pause(150)
    const layout=await evaluate('({width:innerWidth,pageWidth:document.documentElement.scrollWidth})')
    assert.ok(layout.pageWidth<=width+1,JSON.stringify(layout));layouts.push(layout)
    const metrics=await call('Page.getLayoutMetrics',{},sessionId)
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(4500,metrics.cssContentSize.height),scale:1}},sessionId)
    writeFileSync(path.join(out,'advancement-'+width+'.png'),Buffer.from(shot.data,'base64'))
  }
  await click('Open Final in Live Control')
  await wait('document.body.innerText.includes("Final Live Control ?competitionId=pageant&roundId=final")')
  const result={passed:true,fixtureOnly:true,databaseTouched:false,pendingDisabled:true,divisionQualifiers:2,explicitConfirmation:true,correctLiveControlRound:true,layouts}
  writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
  await call('Browser.close')
} finally {socket?.close();chrome.kill()}
