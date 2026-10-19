import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { WebSocket } from '../backend/node_modules/ws/wrapper.mjs'

const output = path.resolve('.tmp/tabulation-evidence')
await fs.mkdir(output, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9339', `--user-data-dir=${output}/chrome-${Date.now()}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket, seq = 0
const pending = new Map(), exceptions = [], apiRequests = [], checks = []
try {
  let pages
  for (let i = 0; i < 60; i++) { try { pages = await (await fetch('http://127.0.0.1:9339/json/list')).json(); break } catch { await pause(100) } }
  assert.ok(pages, 'Headless Chrome started')
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  socket.on('close', (code,reason)=>console.log('CDP closed',code,reason.toString()))
  chrome.on('exit',code=>console.log('Chrome exit',code))
  socket.on('message', raw => {
    const message = JSON.parse(raw)
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails)
    if (message.method === 'Network.requestWillBeSent' && new URL(message.params.request.url).pathname.startsWith('/api/')) apiRequests.push(message.params.request.url)
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}; socket ${socket.readyState}`)) } }, 10000) })
  const evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error(`Timed out: ${expression}`) }
  const button = async name => { await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)}||b.textContent.trim()===${JSON.stringify(name)});if(!b)throw new Error('Missing button');b.click()})()`); await pause(100) }
  const select = async (label, value) => { await evaluate(`(()=>{const n=document.querySelector('[aria-label="${label}"]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}))})()`); await pause(100) }
  const shot = async name => { const modal=await evaluate(`!!document.querySelector('[role=dialog]')`); const metrics = await command('Page.getLayoutMetrics'); const result = await command('Page.captureScreenshot', modal?{format:'png',captureBeyondViewport:false}:{ format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssVisualViewport.clientWidth, height: metrics.cssContentSize.height, scale: 1 } }); await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64')) }
  const bounds = async modal => {
    const geometry = await evaluate(`(()=>{const d=document.querySelector('[role=dialog]'),r=d?.getBoundingClientRect();return {pageWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,modal:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null}})()`)
    assert.ok(geometry.pageWidth <= geometry.width + 1, JSON.stringify(geometry))
    if (modal) { assert.ok(geometry.modal); assert.ok(geometry.modal.left >= -1 && geometry.modal.right <= geometry.width + 1 && geometry.modal.top >= -1 && geometry.modal.bottom <= geometry.height + 1, JSON.stringify(geometry)) }
  }
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable')
  await command('Network.setBlockedURLs', { urls: ['*/api/*', '*://*.supabase.co/*'] })
  for (const width of [1440, 768, 390]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: false })
    await command('Page.navigate', { url: 'http://127.0.0.1:5178/.tmp/tabulation-preview.html' })
    await wait(`Boolean(document.querySelector('[aria-label="Expand entry 1"]'))`)
    await bounds(); await button('Expand entry 1'); await bounds(); await shot(`entries-${width}`)
    await button('Calculation Breakdown for Dancer a'); await bounds(true); await shot(`breakdown-${width}`)
    await button('Panel Summary'); await bounds(true); await shot(`summary-${width}`)
    await button('Close Breakdown'); await button('View Scoring Rules'); await bounds(true); await shot(`rules-${width}`)
    await button('Close Rules'); await button('Export All Entries (Excel)'); await bounds(true)
    await wait(`!document.querySelector('[role=dialog]').innerText.includes('Checking current sources')`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Export format"]').value`),'xls')
    await shot(`export-${width}`); await button('Cancel')
    checks.push(`${width}px: entries, judge and panel breakdown, rules and export fit viewport`)
  }
  assert.deepEqual(exceptions, [])
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, exceptions, apiRequests }, null, 2))
  console.log(JSON.stringify({ checks, exceptions, apiRequests }, null, 2))
  await command('Browser.close').catch(() => {})
} finally { socket?.close(); chrome.kill() }
