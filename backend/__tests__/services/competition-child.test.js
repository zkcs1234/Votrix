import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), tables: {}, error: null, calls: [], own: vi.fn(), enrollment: vi.fn(), foundation: vi.fn() }))
vi.mock('../../src/services/event.service.js', () => ({ assertOrganizerOwnsEvent: mocks.own, getEventById: mocks.own }))
vi.mock('../../src/services/competition.service.js', () => ({ getCompetitionFoundation: mocks.foundation }))
vi.mock('../../src/middleware/auth.js', () => ({ requireEventParticipant: () => mocks.enrollment }))
vi.mock('../../src/foundation/db.js', () => ({ db: () => ({ rpc: mocks.rpc, from: table => {
  mocks.calls.push(table); const filters = []
  const rows = () => (mocks.tables[table] ?? []).filter(row => filters.every(([k, v]) => row[k] === v))
  const result = single => ({ data: single ? rows()[0] ?? null : rows(), count: rows().length, error: mocks.error })
  const q = { select: () => q, eq: (k, v) => { filters.push([k, v]); return q }, order: () => q, range: async () => result(false), maybeSingle: async () => result(true) }; return q
} }) }))
import * as service from '../../src/services/competition-child.service.js'
import childRoutes from '../../src/routes/competition-child.routes.js'
import { requireLegacyCompetitionContext } from '../../src/middleware/competition-context.js'
import organizerRoutes from '../../src/routes/pageant-organizer.routes.js'

const e = '10000000-0000-0000-0000-000000000001', c = '20000000-0000-0000-0000-000000000001', entry = '30000000-0000-0000-0000-000000000001'
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED', 'true')
  mocks.tables = { competitions: [{ id: c, event_id: e, origin: 'legacy' }], competition_legacy_contexts: [{ event_id: e, competition_id: c }], competition_entries: [{ id: 'participation', event_id: e, competition_id: c, contestant_id: entry, entry_number: 1 }] }
  mocks.calls = []; mocks.error = null; mocks.rpc.mockResolvedValue({ data: { id: c }, error: null })
  mocks.own.mockResolvedValue({ id: e, event_type: 'competition_scoring', competition_type: 'pageant', status: 'draft' })
  mocks.enrollment.mockImplementation((_req, _res, next) => next())
  mocks.foundation.mockResolvedValue({ event: { id: e }, rounds: [], scoringConfig: { calculationMethod: 'sum' }, contestants: [{ id: entry }] })
})
afterEach(() => vi.unstubAllEnvs())
function app(judge = false) {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => { req.user = { id: 'owner' }; next() })
  a.use('/events/:eventId/competitions', childRoutes)
  a.use('/events/:eventId', requireLegacyCompetitionContext({ parentResources: !judge, pageantDivisions: !judge, judge }))
  a.get('/events/:eventId/foundation', (req, res) => res.json({ unchangedLegacyPayload: true, context: req.legacyCompetitionContext }))
  a.get('/events/:eventId/contestants', (_req, res) => res.json({ parent: true }))
  a.get('/events/:eventId/divisions', (_req, res) => res.json({ parent: true }))
  a.use((err, _req, res, _next) => res.status(err.statusCode ?? 500).json({ message: err.message }))
  return a
}
test('disabled foundation does not query new tables or alter legacy responses', async () => {
  vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED', 'false')
  await expect(service.listChildCompetitions(e, 'owner')).rejects.toMatchObject({ statusCode: 503 })
  const response = await request(app()).get(`/events/${e}/foundation`)
  expect(response.status).toBe(200); expect(response.body).toEqual({ unchangedLegacyPayload: true }); expect(mocks.calls).toEqual([])
})
test('create endpoint forwards explicit identity and authenticated actor to transactional RPC', async () => {
  const response = await request(app()).post(`/events/${e}/competitions`).send({ id: c, name: ' Hip-Hop ', competitionType: 'Dance', actor: 'attacker' })
  expect(response.status).toBe(201)
  expect(mocks.rpc).toHaveBeenCalledWith('competition_create_child', { p_event: e, p_actor: 'owner', p_id: c, p_name: 'Hip-Hop', p_type: 'Dance' })
})
test('shared entry API creates only the selected explicit association', async () => {
  await service.addCompetitionEntry(e, 'owner', c, { contestantId: entry, entryNumber: 5 })
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).toHaveBeenCalledWith('competition_add_entry', expect.objectContaining({ p_competition: c, p_entry: entry, p_number: 5 }))
})
test.each([0, -1, 1.5, '5', null, 2147483648])('invalid independent entry number %j rejects before RPC', async number => {
  await expect(service.addCompetitionEntry(e, 'owner', c, { contestantId: entry, entryNumber: number })).rejects.toMatchObject({ statusCode: 400 }); expect(mocks.rpc).not.toHaveBeenCalled()
})
test('foreign child cannot be used by a nested list request', async () => {
  await expect(service.listCompetitionEntries(e, 'owner', entry)).rejects.toMatchObject({ statusCode: 404 })
  expect(mocks.calls).not.toContain('competition_entries')
})
test('ownership failure prevents all new reads and writes', async () => {
  mocks.own.mockRejectedValue({ statusCode: 403 })
  await expect(service.createChildCompetition(e, 'attacker', { id: c, name: 'Dance' })).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.calls).toEqual([]); expect(mocks.rpc).not.toHaveBeenCalled()
})
test('missing migration fails closed when enabled instead of guessing a context', async () => {
  mocks.error = { code: '42P01' }
  const response = await request(app()).get(`/events/${e}/foundation`)
  expect(response.status).toBe(503)
})
test('legacy single-competition route keeps its response; five contexts block event-only operations', async () => {
  expect((await request(app()).get(`/events/${e}/foundation`)).status).toBe(200)
  mocks.tables.competitions.push(...[2, 3, 4, 5].map(id => ({ id: `${id}`, event_id: e, origin: 'native' })))
  expect((await request(app()).get(`/events/${e}/foundation`)).status).toBe(409)
  expect((await request(app()).get(`/events/${e}/contestants`)).status).toBe(200)
  expect((await request(app()).get(`/events/${e}/competitions`)).body.competitions).toHaveLength(5)
})
test('Pageant division setup remains event-scoped when multiple child competitions exist', async () => {
  mocks.tables.competitions.push({ id: 'native', event_id: e, origin: 'native' })
  const response = await request(app()).get(`/events/${e}/divisions`)
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ parent: true })
  expect(mocks.own).toHaveBeenCalledWith(e, 'owner')
  expect(mocks.calls).toEqual([])
})
test('non-Pageant division routes retain the legacy competition ambiguity guard', async () => {
  mocks.own.mockResolvedValue({ id: e, event_type: 'competition_scoring', competition_type: 'dance', status: 'draft' })
  mocks.tables.competitions.push({ id: 'native', event_id: e, origin: 'native' })
  const response = await request(app()).get(`/events/${e}/divisions`)
  expect(response.status).toBe(409)
  expect(response.body.message).toMatch(/competition-scoped operations/)
})
test('judge safety guard requires enrollment and never exposes a native competition through legacy routes', async () => {
  mocks.enrollment.mockImplementation((_req, _res, next) => next({ statusCode: 403, message: 'Not enrolled' }))
  expect((await request(app(true)).get(`/events/${e}/foundation`)).status).toBe(403); expect(mocks.calls).toEqual([])
  mocks.enrollment.mockImplementation((_req, _res, next) => next())
  mocks.tables.competitions[0].origin = 'native'
  expect((await request(app(true)).get(`/events/${e}/foundation`)).status).toBe(409)
})
test('actual existing organizer router preserves foundation payload and stops ambiguous calls before the old service', async () => {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => { req.user = { id: 'owner' }; next() })
  a.use('/api/organizer/competition', organizerRoutes)
  a.use((err, _req, res, _next) => res.status(err.statusCode ?? 500).json({ message: err.message }))
  vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED', 'false')
  const original = await request(a).get(`/api/organizer/competition/events/${e}/foundation`)
  expect(original.status).toBe(200); expect(mocks.calls).toEqual([])
  vi.stubEnv('COMPETITION_CHILD_CONTEXTS_ENABLED', 'true')
  const mapped = await request(a).get(`/api/organizer/competition/events/${e}/foundation`)
  expect(mapped.status).toBe(200); expect(mapped.body).toEqual(original.body)
  mocks.tables.competitions.push({ id: 'second', event_id: e, origin: 'native' })
  mocks.foundation.mockClear()
  const blocked = await request(a).get(`/api/organizer/competition/events/${e}/foundation`)
  expect(blocked.status).toBe(409); expect(mocks.foundation).not.toHaveBeenCalled()
})
test('unknown database failures are availability errors and never trigger a legacy fallback', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'Connection unavailable' } })
  await expect(service.addCompetitionEntry(e, 'owner', c, { contestantId: entry })).rejects.toMatchObject({ statusCode: 503 })
})
