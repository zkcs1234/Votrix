// Visual/component check only: isolated fixture, no login or database writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket } from '../node_modules/ws/wrapper.mjs'

const root = path.resolve(import.meta.dirname, '../..'), out = path.join(root, 'audits/pageant-tabulation-2026-10-19')
mkdirSync(out, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9369', `--user-data-dir=${path.join(root, '.tmp/tabulation-layout-chrome-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
try {
  let info
  for (let i = 0; i < 60; i++) { try { info = await (await fetch('http://127.0.0.1:9369/json/version')).json(); break } catch { await pause(150) } }
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
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1300,deviceScaleFactor:1,mobile:false},sessionId)
  await call('Page.navigate',{url:'http://localhost:5173/.tmp/pageant-tabulation-preview.html'},sessionId)
  await wait(`document.querySelectorAll('.v-tab-matrix').length===2`)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix tbody tr').length`),8)
  for(const [index,label] of [[0,'Men calculations'],[1,'Women calculations']]){
    assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix h2')[${index}].textContent`),label)
    assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix')[${index}].querySelector('tbody .v-tab-rank').textContent`),'1')
    assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix')[${index}].querySelector('tbody .v-tab-final').textContent`),'2.00')
  }
  const layouts=[]
  for(const width of [1440,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1300,deviceScaleFactor:1,mobile:false},sessionId)
    await pause(150)
    const layout=await evaluate(`({width:innerWidth,pageWidth:document.documentElement.scrollWidth})`)
    assert.ok(layout.pageWidth<=width+1,JSON.stringify(layout));layouts.push(layout)
    const metrics=await call('Page.getLayoutMetrics',{},sessionId)
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(4500,metrics.cssContentSize.height),scale:1}},sessionId)
    writeFileSync(path.join(out,`divisions-${width}.png`),Buffer.from(shot.data,'base64'))
  }
  writeFileSync(path.join(out,'browser.json'),JSON.stringify({passed:true,fixtureOnly:true,databaseTouched:false,actualNativeCalculation:true,layouts},null,2))
  console.log(JSON.stringify({passed:true,separateWinners:true,layouts,databaseTouched:false}))
  await call('Browser.close')
} finally {socket?.close();chrome.kill()}
