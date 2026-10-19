import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { WebSocket } from '../backend/node_modules/ws/wrapper.mjs'

const output = path.resolve('.tmp/step5-refactor-evidence')
await fs.mkdir(output, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9338', `--user-data-dir=${output}/chrome-${Date.now()}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket, seq = 0
const pending = new Map(), exceptions = [], apiRequests = [], checks = []
try {
  let pages
  for (let i = 0; i < 60; i++) { try { pages = await (await fetch('http://127.0.0.1:9338/json/list')).json(); break } catch { await pause(100) } }
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
    await command('Page.navigate', { url: 'http://127.0.0.1:5178/.tmp/step5-refactor-preview.html' })
    await wait(`Boolean(document.querySelector('[aria-label="Edit Configuration Mr. Campus 2026"]:not(:disabled)'))`)
    await bounds(); await shot(`list-${width}`)
    const style = await evaluate(`(()=>{const b=document.querySelector('[aria-label="Configure Folk Dance"]');const s=getComputedStyle(b);return {bg:s.backgroundColor,padding:s.padding,color:s.color}})()`)
    assert.notEqual(style.bg,'rgba(0, 0, 0, 0)');assert.ok(parseFloat(style.padding)>0);assert.equal(style.color,'rgb(255, 255, 255)')
    await button('Edit Configuration Mr. Campus 2026'); await wait(`Boolean(document.querySelector('[aria-label="Select Round"]'))`)
    assert.equal(await evaluate(`document.querySelectorAll('.rs-setting[open]').length`), 0)
    await bounds(); await shot(`configuration-${width}`)
    await button('Edit criterion Facial Features'); await bounds(true); await shot(`criterion-${width}`)
    assert.ok(await evaluate(`(()=>{const b=[...document.querySelector('[role=dialog]').querySelectorAll('button')].find(b=>b.textContent==='Save Criterion').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight})()`),'Criterion Save button stays in view')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Facial Symmetry minor weight (%)"]').value`), '40')
    await button('Cancel')
    await select('Select Round', 'final')
    assert.equal(await evaluate(`document.body.innerText.includes('Round Advancement')`), false)
    assert.equal(await evaluate(`document.body.innerText.includes('Next Round Score Handling')`), false)
    await button('Preview Score Sheet'); await wait(`Boolean(document.querySelector('[aria-label="Judge score sheet preview"]'))`)
    assert.equal(await evaluate(`document.querySelector('[role=dialog]').innerText.includes('Round: Final')`), true)
    assert.equal(await evaluate(`document.querySelector('[role=dialog]').innerText.includes('Formal Wear')`), true)
    await bounds(true); await shot(`preview-${width}`)
    await button('Close Preview')
    assert.equal(await evaluate('window.fixtureSaves.length'), 0)
    checks.push(`${width}px: list, collapsed settings, minor weights, final-round visibility, preview bounds and no writes`)
  }
  await button('Back to Competitions'); await wait(`Boolean(document.querySelector('[aria-label="Configure Folk Dance"]'))`); await button('Configure Folk Dance')
  assert.equal(await evaluate(`document.body.innerText.includes('Facial Features')`), false)
  assert.equal(await evaluate(`document.querySelectorAll('.rs-criterion-summary').length`), 0)
  await bounds(); checks.push('Folk Dance opens an empty independent configuration')
  assert.deepEqual(exceptions, []); assert.deepEqual(apiRequests, [])
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, exceptions, apiRequests }, null, 2))
  console.log(JSON.stringify({ checks, exceptions, apiRequests }, null, 2))
  await command('Browser.close').catch(() => {})
} finally { socket?.close(); chrome.kill() }
