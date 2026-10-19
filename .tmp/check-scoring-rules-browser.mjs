import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { WebSocket } from '../backend/node_modules/ws/wrapper.mjs'
const pages = await (await fetch('http://127.0.0.1:9331/json/list')).json()
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
const pending = new Map(), exceptions = [], requests = []
let sequence = 0, passed = false
socket.on('message', raw => {
  const message = JSON.parse(raw)
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  if (message.method === 'Network.requestWillBeSent' && new URL(message.params.request.url).pathname.startsWith('/api/')) requests.push(message.params.request.url)
  if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result) }
})
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
async function waitFor(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)) } throw new Error(`Timed out: ${expression}`) }
async function screenshot(name) { const r = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(new URL(`${name}.png`, import.meta.url), Buffer.from(r.data, 'base64')) }
async function click(selector) {
  const p = await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p }); await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p })
}
async function button(text) { await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)throw new Error('Missing '+${JSON.stringify(text)});n.click()})()`) }
async function fresh(width, height) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await command('Page.navigate', { url: 'http://127.0.0.1:5178/.tmp/scoring-rules-preview.html' })
  await waitFor(`Boolean(document.querySelector('[role=radiogroup]')) && document.querySelector('input[value=rank_based]').checked && !document.querySelector('input[value=rank_based]').matches(':disabled')`)
  await evaluate('new Promise(resolve=>setTimeout(resolve,150))')
}
async function layout(width) {
  const g = await evaluate(`(()=>{const radio=document.querySelector('[role=radiogroup]');const labels=[...radio.querySelectorAll('label')].map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width}});return{labels,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,sections:document.querySelector('form[aria-label="Official scoring rules"]').querySelectorAll('section').length,portalChildren:document.getElementById('stage-footer-portal').children.length,scrollRegions:[...document.querySelector('main').querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.className)}})()`)
  assert.ok(g.pageWidth <= width + 1, JSON.stringify(g)); assert.deepEqual(g.scrollRegions, [], JSON.stringify(g)); assert.equal(g.sections, 4); assert.equal(g.portalChildren, 0)
  if (width >= 768) { assert.ok(g.labels[1].x > g.labels[0].right); assert.ok(Math.abs(g.labels[1].y - g.labels[0].y) < 2) }
  else assert.ok(g.labels[1].y >= g.labels[0].bottom)
}
try {
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable')
  await command('Network.setBlockedURLs', { urls: ['*/api/*', '*://*.supabase.co/*'] })
  for (const width of [1536, 1280, 1024, 768, 390]) {
    await fresh(width, width === 390 ? 844 : 900); await layout(width); await screenshot(`rules-redesign-${width}`)
    await evaluate(`document.querySelector('[aria-label="Configure the selected method"]').scrollIntoView({block:'start'})`); await screenshot(`rules-redesign-config-${width}`)
    await evaluate(`document.querySelector('[aria-label="Review and confirm"]').scrollIntoView({block:'start'})`)
    const clear = await evaluate(`(()=>{const r=document.querySelector('[aria-label="Review and confirm"]').getBoundingClientRect();const f=document.querySelector('[data-workspace-footer]').getBoundingClientRect();return f.y>=r.bottom-1})()`)
    assert.ok(clear); await screenshot(`rules-redesign-review-${width}`)
    console.log(`PASS: ${width}px four-section layout, method grid/stacking, no page overflow/nested vertical scroll, footer after content`)
  }
  await fresh(1280, 900)
  assert.equal(await evaluate('window.rulesPreviewCalls.length'), 0)
  await evaluate(`document.querySelector('input[value=rank_based]').focus()`)
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await waitFor(`document.querySelector('input[value=highest_score]').checked`)
  assert.equal(await evaluate('window.rulesPreviewCalls.length'), 0)
  assert.equal(await evaluate(`document.querySelector('[aria-label="See how it works"] tbody tr td:last-child').textContent`), '92')
  assert.equal(await evaluate(`[...document.querySelector('[data-workspace-footer]').querySelectorAll('button')].at(-1).disabled`), true)
  await button('Save Draft'); await waitFor(`document.body.textContent.includes('Draft saved. Complete and confirm')`)
  assert.equal(await evaluate('window.rulesPreviewCalls[0].payload.calculationMethod'), 'highest_score')
  assert.equal(await evaluate('window.rulesPreviewCalls[0].payload.confirmed'), false)
  assert.equal(await evaluate(`[...document.querySelector('[data-workspace-footer]').querySelectorAll('button')].at(-1).disabled`), false)
  console.log('PASS: keyboard method selection, actual-engine example, unsaved navigation block, confirmed draft save and continuation')
  await fresh(390, 844)
  await click('input[value=lowest_removal]')
  // Use native keyboard editing so React receives the value changes.
  await click('#rules-dropHighest'); await command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await command('Input.insertText',{text:'1'})
  await click('#rules-dropLowest'); await command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await command('Input.insertText',{text:'1'})
  await waitFor(`document.querySelector('[aria-label="See how it works"] tbody tr td:last-child').textContent==='90'`)
  await evaluate(`document.querySelector('[aria-label="See how it works"]').scrollIntoView({block:'start'})`); await screenshot('rules-redesign-removal-390')
  await layout(390)
  assert.deepEqual(exceptions, []); assert.deepEqual(requests, [])
  console.log('PASS: mobile removal controls and engine result; no runtime exceptions or real application API calls')
  passed = true
} finally { if (passed) await command('Browser.close').catch(() => {}); socket.close() }
