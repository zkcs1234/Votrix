import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { WebSocket } from '../backend/node_modules/ws/wrapper.mjs'
const pages = await (await fetch('http://127.0.0.1:9331/json/list')).json()
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
const pending = new Map(), exceptions = [], requests = []
let sequence = 0
socket.on('message', raw => {
  const message = JSON.parse(raw)
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  if (message.method === 'Network.requestWillBeSent' && new URL(message.params.request.url).pathname.startsWith('/api/')) requests.push(message.params.request.url)
  if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result) }
})
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
async function waitFor(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)) } throw new Error(`Timed out: ${expression}`) }
async function button(text) { await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)throw new Error('Missing button');n.click()})()`) }
async function input(selector, value) {
  const p = await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p }); await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p }); await command('Input.insertText', { text: value })
}
async function screenshot(name) { const r = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(new URL(`${name}.png`, import.meta.url), Buffer.from(r.data, 'base64')) }
async function fresh(width, height) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await command('Page.navigate', { url: 'http://127.0.0.1:5178/.tmp/criteria-guidance-preview.html' })
  await waitFor(`document.body.textContent.includes('1 of 2 ready') && Boolean(document.querySelector('[data-workspace-footer]'))`)
  await evaluate('new Promise(resolve=>setTimeout(resolve,200))')
}
try {
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable')
  await command('Network.setBlockedURLs', { urls: ['*/api/*', '*://*.supabase.co/*'] })
  for (const width of [1536, 1280, 1024, 768, 390]) {
    await fresh(width, width === 390 ? 844 : 900)
    const g = await evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return{form:rect('.v-workspace-form'),records:rect('.v-workspace-records'),footer:rect('[data-workspace-footer]'),viewport:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,portalChildren:document.getElementById('stage-footer-portal').children.length,portalPosition:getComputedStyle(document.getElementById('stage-footer-portal')).position,reserve:getComputedStyle(document.getElementById('workspace-panel-criteria').parentElement).paddingBottom,scrollRegions:[...document.querySelector('main').querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.className)}})()`)
    assert.ok(g.pageWidth <= width + 1, JSON.stringify(g))
    assert.deepEqual(g.scrollRegions, [], JSON.stringify(g))
    assert.equal(g.portalChildren, 1); assert.equal(g.portalPosition, 'sticky')
    assert.ok(g.footer.bottom <= g.height + 1 && g.footer.y >= 0, JSON.stringify(g))
    assert.ok(parseFloat(g.reserve) >= g.footer.height + 15, JSON.stringify(g))
    if (width >= 1024) { assert.ok(g.records.x > g.form.right); assert.ok(Math.abs(g.records.y - g.form.y) < 2) }
    else assert.ok(g.records.y >= g.form.bottom)
    await screenshot(`criteria-guidance-${width}`)
    console.log(`PASS: ${width}px columns/stacking, sticky footer, measured reserve, no horizontal or nested vertical overflow`)
  }
  await fresh(1280, 900)
  await button('Next: Final')
  await waitFor(`new URLSearchParams(window.criteriaPreviewLocation.search).get('roundId')==='final-saved-id'`)
  assert.equal(await evaluate(`[...document.querySelector('[data-workspace-footer]').querySelectorAll('button')].at(-1).disabled`), true)
  await input('#criteria-name', 'Overall Presentation'); await input('#criteria-weight', '40')
  await button('Add to round')
  await waitFor(`document.body.textContent.includes('All Rounds Ready')`)
  assert.equal(await evaluate(`[...document.querySelector('[data-workspace-footer]').querySelectorAll('button')].at(-1).disabled`), false)
  assert.equal(await evaluate(`window.criteriaPreviewCalls[0].roundId`), 'final-saved-id')
  await evaluate(`document.querySelector('[aria-label="Criteria Completion"]').scrollIntoView({block:'center'})`)
  await screenshot('criteria-guidance-ready-1280')
  await button('Continue to Divisions')
  await waitFor(`document.querySelector('[role=tab][aria-selected=true]').textContent==='Divisions'`)
  assert.equal(await evaluate(`document.getElementById('stage-footer-portal').children.length`), 0)
  console.log('PASS: guided actual-ID navigation, confirmed saved completion, enabled Divisions, portal cleanup')
  assert.deepEqual(exceptions, []); assert.deepEqual(requests, [])
  console.log('PASS: no runtime exceptions or application API requests')
} finally { await command('Browser.close').catch(() => {}); socket.close() }
