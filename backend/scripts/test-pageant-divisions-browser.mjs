// Visual/component check only: isolated fixture, no login or database writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket } from '../node_modules/ws/wrapper.mjs'

const root = path.resolve(import.meta.dirname, '../..'), out = path.join(root, 'audits/pageant-divisions-2026-10-19')
mkdirSync(out, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9368', `--user-data-dir=${path.join(root, '.tmp/tabulation-layout-chrome-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
try {
  let info
  for (let i = 0; i < 60; i++) { try { info = await (await fetch('http://127.0.0.1:9368/json/version')).json(); break } catch { await pause(150) } }
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
  await call('Page.enable', {}, sessionId)
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId)
  await call('Page.navigate', { url: 'http://localhost:5173/.tmp/pageant-divisions-preview.html' }, sessionId)
  await wait(`document.querySelector('.v-native-division-filter')`)
  const click=label=>evaluate(`[...document.querySelectorAll('.v-native-division-filter button')].find(n=>n.textContent===${JSON.stringify(label)}).click()`)
  const numbers=()=>evaluate(`[...document.querySelectorAll('.v-judge-number > span')].map(n=>n.textContent)`)
  assert.deepEqual(await numbers(),['#1','#1','#2','#2','#3','#3','#4','#4','#5','#5'])
  const header=await evaluate(`document.querySelector('.v-judge-sheet thead').innerHTML`)
  for(const label of ['Men','Women','Event Wide']){
    await click(label)
    await pause(150)
    assert.equal(await evaluate(`document.querySelector('.v-judge-sheet thead').innerHTML`),header)
    if(label!=='Event Wide')assert.deepEqual(await numbers(),['#1','#2','#3','#4','#5'])
    const shot=await call('Page.captureScreenshot',{format:'png'},sessionId)
    writeFileSync(path.join(out,label.replaceAll(' ','-')+'.png'),Buffer.from(shot.data,'base64'))
  }
  const layouts=[]
  for(const width of [1440,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false},sessionId)
    await pause(150)
    const layout=await evaluate(`({width:innerWidth,pageWidth:document.documentElement.scrollWidth,barWidth:document.querySelector('.v-native-division-filter').clientWidth,overflow: getComputedStyle(document.querySelector('.v-judge-sheet-scroll')).overflow,tableWidth:document.querySelector('.v-judge-sheet-scroll').clientWidth})`)
    if(layout.pageWidth>width+1)console.log(await evaluate(`[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1&&!n.closest('.v-judge-sheet-scroll')).map(n=>({tag:n.tagName,cls:n.className,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width})).slice(0,12)`))
    assert.ok(layout.pageWidth<=width+1,JSON.stringify(layout));layouts.push(layout)
  }
  writeFileSync(path.join(out,'browser.json'),JSON.stringify({passed:true,fixtureOnly:true,databaseTouched:false,layouts,headersPreserved:true},null,2))
  console.log(JSON.stringify({passed:true,layouts,headersPreserved:true,databaseTouched:false}))
  await call('Browser.close')
} finally { socket?.close(); chrome.kill() }
