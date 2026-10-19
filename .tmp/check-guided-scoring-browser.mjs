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
async function button(text) { await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)throw new Error('Missing '+${JSON.stringify(text)});n.click()})()`) }
async function key(name, code, number) { await command('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: number }); await command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: number }) }
async function fresh(width, height) {
  await command('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:5178', storageTypes: 'local_storage' })
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await command('Page.navigate', { url: 'http://127.0.0.1:5178/.tmp/scoring-guided-preview.html' })
  await waitFor(`Boolean(document.querySelector('#rules-method')) && document.querySelector('#rules-method').value==='rank_based' && !document.querySelector('#rules-method').matches(':disabled')`)
  await evaluate('new Promise(resolve=>setTimeout(resolve,150))')
}
async function layout(width, stage) {
  const g = await evaluate(`(()=>{const form=document.querySelector('form[aria-label="Official scoring rules"]');const footer=document.querySelector('[data-workspace-footer]').getBoundingClientRect();return{sections:form.querySelectorAll('section').length,method:!!form.querySelector('#rules-method'),example:!!form.querySelector('[aria-label="See how it works"]'),review:!!form.querySelector('[aria-label="Review your scoring rules"]'),pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,footer:{top:footer.top,bottom:footer.bottom,height:footer.height},height:innerHeight,reserve:parseFloat(getComputedStyle(form.closest('[role=tabpanel]').parentElement).paddingBottom),portalChildren:document.getElementById('stage-footer-portal').children.length,scrollRegions:[...document.querySelector('main').querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.className)}})()`)
  assert.equal(g.sections, 1); assert.equal(g.method, stage === 1); assert.equal(g.example, stage === 1); assert.equal(g.review, stage === 3)
  assert.ok(g.pageWidth <= width + 1, JSON.stringify(g)); assert.deepEqual(g.scrollRegions, [], JSON.stringify(g)); assert.equal(g.portalChildren, 1)
  assert.ok(g.footer.top >= 0 && g.footer.bottom <= g.height + 1, JSON.stringify(g)); assert.ok(g.reserve >= g.footer.height + 15, JSON.stringify(g))
}
try {
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable')
  await command('Network.setBlockedURLs', { urls: ['*/api/*', '*://*.supabase.co/*'] })
  for (const width of [1536, 1280, 1024, 768, 390]) {
    await fresh(width, width === 390 ? 844 : 900)
    await layout(width, 1); await screenshot(`rules-guided-choose-${width}`)
    const sums = await evaluate(`[...document.querySelector('[aria-label="See how it works"]').querySelectorAll('tbody tr')].map(row=>row.lastElementChild.textContent)`)
    assert.deepEqual(sums, ['4', '5', '9'])
    await button('Continue to Settings'); await waitFor(`document.body.textContent.includes('Step 2 of 3')`)
    await layout(width, 2); await screenshot(`rules-guided-settings-${width}`)
    assert.equal(await evaluate('window.guidedRulesCalls.length'), 0)
    await button('Save & Review'); await waitFor(`Boolean(document.querySelector('[aria-label="Review your scoring rules"]'))`)
    await layout(width, 3); await screenshot(`rules-guided-review-${width}`)
    assert.equal(await evaluate('window.guidedRulesCalls.length'), 0)
    console.log(`PASS: ${width}px single visible stage, 4/5/9 example, settings/review progression, sticky footer clearance, no page/nested overflow`)
  }
  await fresh(1280, 900)
  await evaluate(`document.getElementById('rules-method').focus()`); await key('ArrowUp', 'ArrowUp', 38)
  await waitFor(`document.getElementById('rules-method').value==='sum'`)
  assert.equal(await evaluate('window.guidedRulesCalls.length'), 0)
  assert.equal(await evaluate(`document.querySelector('[aria-label="See how it works"] tbody tr td:last-child').textContent`), '268')
  await button('Continue to Settings'); await button('Save & Review')
  assert.equal(await evaluate('window.guidedRulesCalls.length'), 0)
  assert.equal(await evaluate(`document.querySelector('[aria-label="Review your scoring rules"] button[type=submit]').disabled`), true)
  await evaluate(`document.querySelector('[aria-label="Review your scoring rules"] input[type=checkbox]').click()`)
  await button('Confirm Configuration')
  await waitFor(`document.body.textContent.includes('Scoring configuration confirmed and saved')`)
  assert.equal(await evaluate('window.guidedRulesCalls.length'), 1)
  assert.equal(await evaluate('window.guidedRulesCalls[0].payload.calculationMethod'), 'sum')
  assert.equal(await evaluate('window.guidedRulesCalls[0].payload.confirmed'), true)
  assert.equal(await evaluate('window.guidedRulesCalls[0].payload.verifierId'), null)
  console.log('PASS: native keyboard method selection, no staging write, explicit confirmed save and deferred reviewer')
  await fresh(390, 844)
  await button('Continue to Settings'); await button('Change Method')
  await evaluate(`const n=document.getElementById('rules-method');n.value='manual';n.dispatchEvent(new Event('change',{bubbles:true}))`)
  await button('Continue to Settings'); await button('Save & Review')
  await waitFor(`document.activeElement.id==='manual-result-basis'`)
  assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Review your scoring rules"]'))`), false)
  await screenshot('rules-guided-invalid-mobile')
  assert.deepEqual(exceptions, []); assert.deepEqual(requests, [])
  console.log('PASS: localized mobile validation and focus; no runtime exceptions or application API calls')
  passed = true
} finally { if (passed) await command('Browser.close').catch(() => {}); socket.close() }
