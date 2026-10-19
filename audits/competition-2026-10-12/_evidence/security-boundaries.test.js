import { beforeEach, expect, test, vi } from 'vitest'
import request from '../../../backend/node_modules/supertest/index.js'

const fixture = vi.hoisted(() => ({ queries: [], event: { id: 'owned-event', event_type: 'competition_scoring', status: 'draft', official_rules_id: null } }))
vi.mock('../../../backend/src/config/env.js', () => ({
  isProduction: false,
  env: {
    nodeEnv: 'test', clientUrl: 'https://trusted.example', clientOrigins: ['https://trusted.example'],
    jwt: { accessSecret: 'fixture-access', refreshSecret: 'fixture-refresh', accessCookieName: 'votrix_access', refreshCookieName: 'votrix_refresh', accessExpiresIn: '15m', refreshExpiresIn: '7d' },
    cookie: { sameSite: 'none' }, csrf: { cookieName: 'votrix_csrf', headerName: 'x-csrf-token', secret: 'fixture-secret-is-at-least-32-characters' },
    supabase: {}, cloudinary: {}, resend: {},
  },
}))
vi.mock('../../../backend/src/config/database.js', () => ({ getSupabase: () => null, checkDatabaseConnection: async () => ({ connected: false }) }))
vi.mock('../../../backend/src/config/cloudinary.js', () => ({ configureCloudinary: vi.fn(), cloudinary: {} }))
vi.mock('../../../backend/src/foundation/activity.js', () => ({ recordEventActivity: vi.fn() }))
vi.mock('../../../backend/src/services/event.service.js', async importOriginal => ({ ...await importOriginal(), assertOrganizerOwnsEvent: vi.fn(async () => fixture.event) }))
vi.mock('../../../backend/src/foundation/index.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, db: () => ({ from(table) {
    const q = { table, calls: [] }; fixture.queries.push(q)
    const chain = {}
    for (const method of ['select', 'eq', 'in', 'insert', 'update', 'delete', 'single', 'maybeSingle']) chain[method] = (...args) => { q.calls.push({ method, args }); return chain }
    chain.then = resolve => resolve({ data: table === 'competition_round_criteria' ? [] : table === 'competition_criteria' ? [{ id: 'foreign-criterion', percentage: 25, is_active: true }] : { id: 'owned-round', name: 'Round', category_id: 'foreign-category' }, error: null })
    return chain
  } }) }
})

import { createApp } from '../../../backend/src/app.js'
import { csrfProtection } from '../../../backend/src/middleware/csrf.js'
import { addCriteriaToRound, removeCriteriaFromRound, updateRound } from '../../../backend/src/services/competition.service.js'

beforeEach(() => { fixture.queries.length = 0 })

test('actual CORS middleware grants an unrelated Vercel tenant credentialed CSRF-token access when preview flag is enabled', async () => {
  const prior = process.env.ALLOW_VERCEL_PREVIEWS
  process.env.ALLOW_VERCEL_PREVIEWS = 'true'
  try {
    const response = await request(createApp()).get('/api/auth/csrf').set('Origin', 'https://unrelated-audit-tenant.vercel.app')
    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('https://unrelated-audit-tenant.vercel.app')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
    expect(typeof response.body.csrfToken).toBe('string')
  } finally { if (prior === undefined) delete process.env.ALLOW_VERCEL_PREVIEWS; else process.env.ALLOW_VERCEL_PREVIEWS = prior }
})

test('CSRF equality alone accepts a protected mutation from the unrelated origin', () => {
  const next = vi.fn()
  const token = 'audit-fixture-token-abcdefghijklmnopqrstuvwxyz'
  csrfProtection({ method: 'POST', originalUrl: '/api/organizer/competition/events/owned-event/session/start', headers: { origin: 'https://unrelated-audit-tenant.vercel.app', 'x-csrf-token': token }, cookies: { votrix_csrf: token } }, {}, next)
  expect(next).toHaveBeenCalledWith()
})

test('criteria attachment authorizes URL event but requests insertion for an unchecked foreign round and criterion', async () => {
  await addCriteriaToRound('owned-event', 'organizer-a', 'foreign-round', 'foreign-criterion')
  const insertion = fixture.queries.find(q => q.calls.some(c => c.method === 'insert'))
  expect(insertion.calls.find(c => c.method === 'insert').args[0]).toEqual({ round_id: 'foreign-round', criteria_id: 'foreign-criterion' })
  expect(fixture.queries.some(q => q.table === 'competition_rounds')).toBe(false)
  expect(fixture.queries.flatMap(q => q.calls).some(c => c.method === 'eq' && c.args[0] === 'event_id')).toBe(false)
})

test('criteria removal requests deletion for the unchecked foreign round', async () => {
  await removeCriteriaFromRound('owned-event', 'organizer-a', 'foreign-round', 'foreign-criterion')
  const removal = fixture.queries.find(q => q.calls.some(c => c.method === 'delete'))
  expect(removal.calls.find(c => c.method === 'eq' && c.args[0] === 'round_id').args[1]).toBe('foreign-round')
  expect(fixture.queries.some(q => q.table === 'competition_rounds')).toBe(false)
})

test('round update accepts a foreign category without loading or checking its event', async () => {
  await updateRound('owned-event', 'organizer-a', 'owned-round', { categoryId: 'foreign-category' })
  const update = fixture.queries.find(q => q.calls.some(c => c.method === 'update'))
  expect(update.calls.find(c => c.method === 'update').args[0]).toEqual({ category_id: 'foreign-category' })
  expect(fixture.queries.some(q => q.table === 'competition_categories')).toBe(false)
})
