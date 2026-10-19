// Visual/component check only: isolated fixture, no login or database writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket } from '../node_modules/ws/wrapper.mjs'

const root = path.resolve(import.meta.dirname, '../..'), out = path.join(root, 'audits/tabulation-layout-2026-10-19')
mkdirSync(out, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9367', `--user-data-dir=${path.join(root, '.tmp/tabulation-layout-chrome-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
try {
  let info
  for (let i = 0; i < 60; i++) { try { info = await (await fetch('http://127.0.0.1:9367/json/version')).json(); break } catch { await pause(150) } }
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
  await call('Page.navigate', { url: 'http://localhost:5173/.tmp/tabulation-clean-preview.html' }, sessionId)
  await wait(`document.querySelector('.v-tab-matrix tbody tr')`)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix').length`), 1)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix tbody tr').length`), 12)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-entry,.v-tab-round-summary,.v-tab-calculation-table,.v-tab-verification').length`), 0)
  assert.equal(await evaluate(`document.querySelectorAll('#judge-submissions,.v-tab-detail-cards').length`), 0)
  assert.equal(await evaluate(`[...document.querySelectorAll('h2')].some(n=>['Automatic score calculation','Independent review','Final results','Audit trail'].includes(n.textContent))`), false)
  const layouts = []
  for (const width of [1440, 1024, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId)
    await pause(250)
    const layout = await evaluate(`(()=>{const grid=document.querySelector('.v-tab-matrix .v-tab-grid-scroll'),row=document.querySelector('.v-tab-matrix tbody tr'),facts=document.querySelector('.v-tab-facts dd');return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,matrixWidth:grid.clientWidth,matrixContentWidth:grid.scrollWidth,rowHeight:row.getBoundingClientRect().height,overviewCardHeight:document.querySelector('.v-tab-overview-cards > section').getBoundingClientRect().height,factFontSize:parseFloat(getComputedStyle(facts).fontSize),panelCount:document.querySelectorAll('.v-tab-detail-cards > section').length}})()`)
    assert.ok(layout.pageWidth <= width + 1, JSON.stringify(layout))
    if (width === 1440) { assert.ok(layout.matrixContentWidth <= layout.matrixWidth + 1, JSON.stringify(layout)); assert.ok(layout.rowHeight <= 34, JSON.stringify(layout)); assert.ok(layout.overviewCardHeight < 210, JSON.stringify(layout)); assert.ok(layout.factFontSize <= 13, JSON.stringify(layout)) }
    assert.equal(layout.panelCount, 0)
    layouts.push(layout)
    const metrics = await call('Page.getLayoutMetrics', {}, sessionId)
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(5000, metrics.cssContentSize.height), scale: 1 } }, sessionId)
    writeFileSync(path.join(out, `overview-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId)
  await evaluate(`document.querySelector('[role=tab][aria-label^="Judge Submissions:"]').click()`)
  await wait(`document.querySelector('#judge-submissions')`)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix,.v-tab-overview-cards,.v-tab-detail-cards').length`), 0)
  assert.equal(await evaluate(`[...document.querySelectorAll('h2')].some(n=>['Automatic score calculation','Independent review','Final results','Audit trail'].includes(n.textContent))`), false)
  await evaluate(`[...document.querySelectorAll('button')].find(n=>n.textContent==='View Sheet').click()`)
  await wait(`document.querySelector('#original-judge-score-sheet')`)
  assert.equal(await evaluate(`document.querySelectorAll('.v-original-sheet-table tbody tr').length`), 12)
  assert.equal(await evaluate(`document.querySelectorAll('td table').length`), 0, 'Original sheet must not be nested inside an action cell')
  const sheetShot = await call('Page.captureScreenshot', { format: 'png' }, sessionId)
  writeFileSync(path.join(out, 'original-judge-sheet.png'), Buffer.from(sheetShot.data, 'base64'))
  assert.equal(await evaluate(`document.querySelector('#original-judge-score-sheet').innerText.includes('Judge: Judge 1')`), true)
  for (const width of [390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId)
    await pause(150)
    const sheetLayout = await evaluate(`(()=>{const modal=document.querySelector('#original-judge-score-sheet'),scroll=modal.querySelector('.v-original-sheet-scroll');return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,modalWidth:modal.getBoundingClientRect().width,scrollWidth:scroll.clientWidth,contentWidth:scroll.scrollWidth}})()`)
    assert.ok(sheetLayout.pageWidth <= width + 1, JSON.stringify(sheetLayout))
    assert.ok(sheetLayout.modalWidth <= width, JSON.stringify(sheetLayout))
    assert.ok(sheetLayout.contentWidth > sheetLayout.scrollWidth, 'Wide judge sheets scroll inside the modal')
    const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId)
    writeFileSync(path.join(out, `original-judge-sheet-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId)
  await evaluate(`[...document.querySelectorAll('#original-judge-score-sheet button')].find(n=>n.textContent==='Close Sheet').click()`)
  await wait(`!document.querySelector('#original-judge-score-sheet')`)
  await evaluate(`document.querySelector('[role=tab][aria-label^="Tabulation Matrix:"]').click()`)
  await wait(`document.querySelector('.v-tab-matrix')`)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-overview-cards,.v-tab-detail-cards,#judge-submissions').length`), 0)
  await evaluate(`document.querySelector('[role=tab][aria-label^="Validation:"]').click()`)
  await wait(`document.body.innerText.includes('Automatic score calculation')`)
  assert.equal(await evaluate(`document.querySelectorAll('.v-tab-matrix,.v-tab-calculation-table').length`), 0)
  await evaluate(`document.querySelector('[role=tab][aria-label^="Finalization:"]').click()`)
  await wait(`document.body.innerText.includes('Independent review')`)
  assert.equal(await evaluate(`document.querySelectorAll('main table').length`), 0, 'Finalization must not repeat standings')
  writeFileSync(path.join(out, 'browser.json'), JSON.stringify({ passed: true, fixtureOnly: true, databaseTouched: false, contestantCount: 12, judgeCount: 7, criterionCount: 5, layouts, distinctSubsections: true, nestedActionTables: false }, null, 2))
  console.log(JSON.stringify({ passed: true, layouts, distinctSubsections: true, databaseTouched: false }))
  await call('Browser.close')
} finally { socket?.close(); chrome.kill() }
