// Audit-only transport characterization. No real users, cookies, database or app server.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import WebSocket from '../../../backend/node_modules/ws/wrapper.mjs'

const fixture = vi.hoisted(() => ({
  event: '20000000-0000-0000-0000-000000000001',
  other: '20000000-0000-0000-0000-000000000002',
  organizer: '10000000-0000-0000-0000-000000000001',
  judge: '10000000-0000-0000-0000-000000000002',
}))
vi.mock('../../../backend/src/config/env.js', () => ({ env: { clientOrigins: ['http://audit.local'] } }))
vi.mock('../../../backend/src/middleware/auth.js', () => ({
  authenticate(req, _res, next) {
    const persona = req.cookies?.audit_identity
    if (!['organizer', 'judge'].includes(persona)) return next(new Error('Audit identity required'))
    req.user = { id: fixture[persona], role: persona === 'judge' ? 'participant' : 'organizer' }
    next()
  },
  requireActiveAccount(_req, _res, next) { next() },
  requirePasswordChanged(_req, _res, next) { next() },
}))
vi.mock('../../../backend/src/foundation/db.js', () => ({
  db: () => ({ from(table) {
    const filters = {}
    const chain = {
      select() { return chain },
      eq(key, value) { filters[key] = value; return chain },
      in() { return chain },
      async maybeSingle() {
        if (table === 'events') return { data: { organizations: { organizer_id: fixture.organizer } }, error: null }
        return { data: { id: 'audit-enrollment', is_active: true }, error: null }
      },
      then(resolve) {
        const data = table === 'organizations' ? [{ id: 'audit-organization' }]
          : table === 'events' ? [{ id: fixture.event }, { id: fixture.other }]
            : [{ event_id: fixture.event }, { event_id: fixture.other }]
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return chain
  } }),
}))
import { attachWebSocketServer } from '../../../backend/src/websocket/ws-server.js'
import { emitToEvent, emitToEventOrganizer } from '../../../backend/src/websocket/ws-emitter.js'
import { getRoomSize } from '../../../backend/src/websocket/ws-rooms.js'

const socketSource = readFileSync(new URL('../../../frontend/src/services/socket.service.js', import.meta.url), 'utf8')
const judgeSource = readFileSync(new URL('../../../frontend/src/pages/voter/JudgeScoringPage.jsx', import.meta.url), 'utf8')
const rankingSource = readFileSync(new URL('../../../frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx', import.meta.url), 'utf8')
let http, wss, address
const contexts = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate) { for (let n = 0; n < 100; n++) { if (predicate()) return; await delay(10) } throw new Error('Audit fixture timed out') }
function browser(persona) {
  class CookieWebSocket extends WebSocket {
    constructor(url) { super(url, { headers: { Origin: 'http://audit.local', Cookie: `audit_identity=${persona}` } }) }
  }
  const context = createContext({ WebSocket: CookieWebSocket, window: { addEventListener() {} }, setTimeout, clearTimeout, console: { log() {} } })
  runInContext(socketSource.replace(/^import[^\n]*\n/, `const API_BASE_URL = '${address}/api'\n`).replace(/^export default[^\n]*$/m, '').replace(/\bexport /g, ''), context)
  const incoming = []
  for (const name of ['ws:connected', 'ws:subscription-rejected', 'session:contestant-changed', 'session:judge-score-submitted', 'rankings:updated']) context.subscribe(name, data => incoming.push({ name, data }))
  context.connect()
  contexts.push(context)
  return { context, incoming }
}
function callback(source, event, dependencySuffix, globals) {
  const marker = `useSocketEvent('${event}', `
  const start = source.indexOf(marker) + marker.length
  const end = source.indexOf(dependencySuffix, start)
  if (start < marker.length || end < 0) throw new Error(`Actual handler extraction failed: ${event}`)
  return runInContext(`(${source.slice(start, end)})`, createContext(globals))
}

beforeAll(async () => {
  http = createServer((_req, res) => { res.statusCode = 404; res.end() })
  wss = attachWebSocketServer(http)
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  address = `http://127.0.0.1:${http.address().port}`
})
afterAll(async () => {
  for (const context of contexts) context.disconnect()
  for (const ws of wss.clients) ws.terminate()
  await new Promise(resolve => wss.close(resolve))
  await new Promise(resolve => http.close(resolve))
})

test('actual two-context socket clients receive organizer stage invalidation and refetch without refresh', async () => {
  const organizer = browser('organizer'), judge = browser('judge')
  await until(() => getRoomSize(`event:${fixture.event}`) === 2)
  const sync = vi.fn(), sessionState = vi.fn(), organizerReload = vi.fn()
  const judgeHandler = callback(judgeSource, 'session:contestant-changed', ', [syncSessionView])', { setSessionState: sessionState, syncSessionView: sync })
  judge.context.subscribe('session:contestant-changed', judgeHandler)
  organizer.context.subscribe('session:contestant-changed', organizerReload)
  emitToEvent(fixture.event, 'session:contestant-changed', { session: { id: 'audit-session', eventId: fixture.event }, refresh: true })
  await until(() => sync.mock.calls.length === 1 && organizerReload.mock.calls.length === 1)
  expect(sessionState.mock.calls[0][0].eventId).toBe(fixture.event)
})

test('actual room transport limits score progress and ranking payloads to organizer', async () => {
  const organizer = browser('organizer'), judge = browser('judge')
  await until(() => getRoomSize(`event:${fixture.event}`) === 4)
  emitToEventOrganizer(fixture.event, 'session:judge-score-submitted', { judgeId: fixture.judge, action: 'lock' })
  emitToEvent(fixture.event, 'rankings:updated', { eventId: fixture.event, rankings: { privateScore: 90 } })
  await until(() => organizer.incoming.some(x => x.name === 'rankings:updated'))
  await delay(30)
  expect(judge.incoming.some(x => ['rankings:updated', 'session:judge-score-submitted'].includes(x.name))).toBe(false)
})

test('actual server rejects a participant subscribing to organizer-only event room', async () => {
  const judge = browser('judge')
  await until(() => judge.context.isConnected())
  judge.context.subscribeRoom(`event:${fixture.event}:organizer`)
  await until(() => judge.incoming.some(x => x.name === 'ws:subscription-rejected'))
})

test('characterization: actual overall Rankings handler ignores current payload-free invalidation', () => {
  const load = vi.fn(), setData = vi.fn()
  const handler = callback(rankingSource, 'rankings:updated', ', [eventId, divisionId, roundId, load])', { divisionId: '', roundId: '', load, setData })
  handler({ eventId: fixture.event })
  expect(load).not.toHaveBeenCalled()
  expect(setData).not.toHaveBeenCalled()
})

test('characterization: actual Judge status handler accepts another enrolled event status', () => {
  const setSessionState = vi.fn(), setActiveContestantId = vi.fn(), getGuardedView = vi.fn()
  const handler = callback(judgeSource, 'session:status-changed', ', [getGuardedView])', { eventId: fixture.event, setSessionState, setActiveContestantId, getGuardedView })
  handler({ session: { id: 'other-session', eventId: fixture.other, status: 'paused' } })
  expect(setSessionState.mock.calls[0][0].eventId).toBe(fixture.other)
  expect(getGuardedView).not.toHaveBeenCalled()
})

test('characterization: actual active-session polling effect schedules no fallback interval', () => {
  const marker = '// Fallback polling while the session is NOT live yet.'
  const start = judgeSource.indexOf('useEffect(() => {', judgeSource.indexOf(marker)) + 'useEffect(() => {'.length
  const end = judgeSource.indexOf('}, [loading, sessionState?.status, syncSessionView])', start)
  expect(end).toBeGreaterThan(start)
  const setInterval = vi.fn()
  const effect = runInContext(`(() => {${judgeSource.slice(start, end)}})`, createContext({ loading: false, sessionState: { status: 'active' }, socketConnected: false, setInterval, clearInterval: vi.fn(), syncSessionView: vi.fn() }))
  effect()
  expect(setInterval).not.toHaveBeenCalled()
})

test('characterization: actual Judge sync allows older HTTP response to overwrite newer round state', async () => {
  const marker = 'const syncSessionView = useCallback(() => {'
  const start = judgeSource.indexOf(marker) + marker.length
  const end = judgeSource.indexOf('}, [getGuardedView])', start)
  expect(end).toBeGreaterThan(start)
  let oldResolve, newResolve
  const old = new Promise(resolve => { oldResolve = resolve })
  const newer = new Promise(resolve => { newResolve = resolve })
  const getGuardedView = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(newer)
  const setSheet = vi.fn(), setSessionState = vi.fn(), setActiveContestantId = vi.fn()
  const sync = runInContext(`(() => {${judgeSource.slice(start, end)}})`, createContext({ getGuardedView, setSheet, setSessionState, setActiveContestantId, console }))
  sync(); sync()
  newResolve({ data: { context: { roundId: 'final' }, session: { status: 'active', revision: 2 } } })
  await Promise.resolve(); await Promise.resolve()
  oldResolve({ data: { context: { roundId: 'preliminary' }, session: { status: 'active', revision: 1 } } })
  await Promise.resolve(); await Promise.resolve()
  expect(setSheet.mock.calls.at(-1)[0].context.roundId).toBe('preliminary')
  expect(setSessionState.mock.calls.at(-1)[0].revision).toBe(1)
})

test('characterization: actual server rejects the eleventh simultaneous socket from one shared IP', async () => {
  for (let index = 0; index < 5; index++) browser('judge')
  await until(() => getRoomSize(`event:${fixture.event}`) === 10)
  const denied = new WebSocket(address.replace(/^http/, 'ws') + '/ws', { headers: { Origin: 'http://audit.local', Cookie: 'audit_identity=judge' } })
  denied.on('error', () => {})
  const status = await new Promise(resolve => denied.on('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode) }))
  denied.terminate()
  expect(status).toBe(429)
})
