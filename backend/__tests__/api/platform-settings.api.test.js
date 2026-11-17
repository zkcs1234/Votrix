import { beforeEach, describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import { IDS, makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// The backend loads a real .env, so no test may reach a real mail provider.
vi.mock('../../src/services/mailer.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendOrganizerInviteLinkEmail: vi.fn(async () => ({ sent: true })),
  sendOrganizerInvitationEmail: vi.fn(async () => ({ sent: true })),
}))

import { createApp } from '../../src/app.js'
import { signAccessToken, signRefreshToken } from '../../src/utils/jwt.js'
import { buildTokenPayload } from '../../src/services/token.service.js'
import { hashPassword } from '../../src/utils/password.js'
import { invalidatePlatformSettings } from '../../src/services/platform-settings.service.js'
import { env } from '../../src/config/env.js'

const CSRF = 'c'.repeat(40)
const PASSWORD = 'Sup3r-secret-pw'
world = makeWorld({ extra: { system_settings: [], user_sessions: [] } })
const app = createApp()

const userRow = (id) => world.raw('users').find((u) => u.id === id)
function cookiesFor(id, { access = true, refresh = false } = {}) {
  const row = userRow(id)
  const parts = [`${env.csrf.cookieName}=${CSRF}`]
  if (access) parts.push(`${env.jwt.accessCookieName}=${signAccessToken(buildTokenPayload(row))}`)
  if (refresh) parts.push(`${env.jwt.refreshCookieName}=${signRefreshToken(buildTokenPayload(row))}`)
  return parts.join('; ')
}
const call = (method, url, { as, cookies, body } = {}) => {
  let req = request(app)[method](url)
  const cookie = cookies ?? (as ? cookiesFor(as) : `${env.csrf.cookieName}=${CSRF}`)
  req = req.set('Cookie', cookie).set(env.csrf.headerName, CSRF)
  return body === undefined ? req : req.send(body)
}
const saveSetting = (key, value) => call('put', '/api/admin/settings', { as: IDS.ADMIN, body: { key, value } })

beforeEach(async () => {
  world = makeWorld({ extra: { system_settings: [], user_sessions: [] } })
  invalidatePlatformSettings()
  for (const id of [IDS.ADMIN, IDS.ORG, IDS.S1]) userRow(id).password = await hashPassword(PASSWORD)
})

describe('GET /api/public/platform', () => {
  test('is public and returns the defaults when nothing is saved', async () => {
    const res = await request(app).get('/api/public/platform')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, platformName: 'Votrix', maintenanceMode: false })
    expect(res.headers['cache-control']).toMatch(/no-store/)
  })

  test('the platform name is fixed, even if an older save left a different one in the database', async () => {
    world.raw('system_settings').push({ setting_key: 'platform_name', setting_value: 'Left over from an old save' })
    const res = await request(app).get('/api/public/platform')
    expect(res.body.platformName).toBe('Votrix')
  })

  test('never exposes the organizer limit', async () => {
    await saveSetting('max_organizers', 7)

    const res = await request(app).get('/api/public/platform')
    expect(res.body).not.toHaveProperty('maxOrganizers')
    expect(JSON.stringify(res.body)).not.toMatch(/max_organizers|\b7\b/)
  })

  test('reflects maintenance mode immediately after an admin saves it', async () => {
    await saveSetting('maintenance_mode', true)
    expect((await request(app).get('/api/public/platform')).body.maintenanceMode).toBe(true)
    await saveSetting('maintenance_mode', false)
    expect((await request(app).get('/api/public/platform')).body.maintenanceMode).toBe(false)
  })
})

describe('saving the three settings', () => {
  test.each([
    ['platform_name', 'BISU Votes', /platform name is fixed/i],
    ['platform_name', 'Votrix', /platform name is fixed/i],
    ['maintenance_mode', 'true', /true or false/],
    ['max_organizers', 0, /whole number/],
    ['max_organizers', 2.5, /whole number/],
    ['email_daily_limit', 0, /Daily email limit/],
    ['email_daily_limit', '50', /Daily email limit/],
    ['email_daily_limit', 10001, /Daily email limit/],
    ['invitation_expiry_days', 0, /days from 1 to 30/],
    ['invitation_expiry_days', 31, /days from 1 to 30/],
  ])('rejects %s = %j with a 400', async (key, value, message) => {
    const res = await saveSetting(key, value)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(message)
    expect(world.rows('system_settings')).toHaveLength(0)
  })

  test('stores valid values', async () => {
    await saveSetting('max_organizers', 25)
    await saveSetting('maintenance_mode', true)
    expect(world.rows('system_settings').map((r) => [r.setting_key, r.setting_value])).toEqual([
      ['max_organizers', 25],
      ['maintenance_mode', true],
    ])
  })

  test('only administrators can change them', async () => {
    expect((await call('put', '/api/admin/settings', { as: IDS.ORG, body: { key: 'max_organizers', value: 1 } })).status).toBe(403)
    expect((await call('put', '/api/admin/settings', { as: IDS.S1, body: { key: 'maintenance_mode', value: true } })).status).toBe(403)
    expect(world.rows('system_settings')).toHaveLength(0)
  })

  test('other custom settings still save as before', async () => {
    expect((await saveSetting('some_custom_flag', { a: 1 })).status).toBe(200)
  })
})

describe('GET /api/admin/settings → effective values', () => {
  const effective = async () => (await call('get', '/api/admin/settings', { as: IDS.ADMIN })).body.effective

  test('shows what is in force when nothing is saved (env / 50 emails, 7 days)', async () => {
    const saved = env.resend.dailyLimit
    env.resend.dailyLimit = undefined
    try {
      expect(await effective()).toEqual({ maintenanceMode: false, maxOrganizers: 100, emailDailyLimit: 50, invitationExpiryDays: 7 })
    } finally {
      env.resend.dailyLimit = saved
    }
  })

  test('shows the values an admin saved', async () => {
    await saveSetting('email_daily_limit', 80)
    await saveSetting('invitation_expiry_days', 14)
    expect(await effective()).toMatchObject({ emailDailyLimit: 80, invitationExpiryDays: 14 })
  })

  test('is admin only', async () => {
    expect((await call('get', '/api/admin/settings', { as: IDS.ORG })).status).toBe(403)
  })
})

describe('default invitation expiry through the admin API', () => {
  const invite = (body = {}) =>
    call('post', '/api/admin/organizer-invitations', { as: IDS.ADMIN, body: { email: 'invitee@example.com', ...body } })
  const days = (res) => Math.round((new Date(res.body.invitation.expiresAt) - Date.now()) / 86_400_000)

  test('a new invitation expires after the saved default', async () => {
    await saveSetting('invitation_expiry_days', 14)
    const res = await invite()
    expect(res.status).toBe(201)
    expect(days(res)).toBe(14)
  })

  test('an explicit expiry still wins, and is still capped at 30 days', async () => {
    await saveSetting('invitation_expiry_days', 14)
    expect(days(await invite({ expiresInDays: 3 }))).toBe(3)
    expect((await invite({ expiresInDays: 31 })).status).toBe(400)
  })
})

describe('maintenance mode', () => {
  const turnOn = async () => expect((await saveSetting('maintenance_mode', true)).status).toBe(200)

  test('everyone works normally while it is off', async () => {
    expect((await call('get', '/api/organizer/profile', { as: IDS.ORG })).status).toBe(200)
  })

  test('turns away organizers and students on their next request, with a recognisable 503', async () => {
    await turnOn()

    for (const [who, url] of [[IDS.ORG, '/api/organizer/profile'], [IDS.S1, '/api/auth/me'], [IDS.S1, '/api/participant/overview']]) {
      const res = await call('get', url, { as: who })
      expect(res.status, url).toBe(503)
      expect(res.body.code).toBe('MAINTENANCE_MODE')
      expect(res.body.message).toMatch(/Votrix is under maintenance/)
    }
  })

  test('turns away signed-out visitors from everything except the allowed paths', async () => {
    await turnOn()
    expect((await call('get', '/api/public/organizer-apply/' + 'a'.repeat(64))).status).toBe(503)
    expect((await call('get', '/api/auth/me')).status).toBe(503)
    expect((await call('post', '/api/auth/forgot-password', { body: { email: 'x@y.z' } })).status).toBe(503)
  })

  test('administrators keep working', async () => {
    await turnOn()
    expect((await call('get', '/api/admin/settings', { as: IDS.ADMIN })).status).toBe(200)
    expect((await call('get', '/api/auth/me', { as: IDS.ADMIN })).status).toBe(200)
  })

  test('an admin whose access token just expired can still refresh (the guard reads the refresh cookie)', async () => {
    await turnOn()
    const res = await call('post', '/api/auth/refresh', { cookies: cookiesFor(IDS.ADMIN, { access: false, refresh: true }) })
    expect(res.status).toBe(200)
  })

  test('a non-admin cannot keep a session alive through refresh', async () => {
    await turnOn()
    const res = await call('post', '/api/auth/refresh', { cookies: cookiesFor(IDS.ORG, { access: false, refresh: true }) })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('MAINTENANCE_MODE')
  })

  test('the platform state, CSRF and health stay reachable so the maintenance screen can load', async () => {
    await turnOn()
    const platform = await request(app).get('/api/public/platform')
    expect(platform.status).toBe(200)
    expect(platform.body.maintenanceMode).toBe(true)
    expect((await call('get', '/api/auth/csrf')).status).toBe(200)
    const health = await request(app).get('/api/health')
    expect(health.body.code).not.toBe('MAINTENANCE_MODE')
  })

  test('sign-in: administrators can, everyone else is refused after their password is checked', async () => {
    await turnOn()

    const admin = await request(app).post('/api/auth/login').send({ email: userRow(IDS.ADMIN).email, password: PASSWORD })
    expect(admin.status).toBe(200)

    const organizer = await request(app).post('/api/auth/login').send({ email: userRow(IDS.ORG).email, password: PASSWORD })
    expect(organizer.status).toBe(503)
    expect(organizer.body.code).toBe('MAINTENANCE_MODE')
    expect(organizer.headers['set-cookie'] ?? []).toHaveLength(0) // no session was issued

    const student = await request(app).post('/api/auth/login').send({ email: userRow(IDS.S1).email, password: PASSWORD })
    expect(student.status).toBe(503)
  })

  test('a wrong password still reads as a wrong password, not as maintenance', async () => {
    await turnOn()
    const res = await request(app).post('/api/auth/login').send({ email: userRow(IDS.ORG).email, password: 'nope-nope-nope' })
    expect(res.status).toBe(401)
  })

  test('turning it off restores access immediately', async () => {
    await turnOn()
    expect((await call('get', '/api/organizer/profile', { as: IDS.ORG })).status).toBe(503)

    expect((await saveSetting('maintenance_mode', false)).status).toBe(200)
    expect((await call('get', '/api/organizer/profile', { as: IDS.ORG })).status).toBe(200)
    expect((await request(app).post('/api/auth/login').send({ email: userRow(IDS.ORG).email, password: PASSWORD })).status).toBe(200)
  })

  test('a database error while reading settings never locks everyone out', async () => {
    world.failNext('system_settings', 'select', 'db down')
    expect((await call('get', '/api/organizer/profile', { as: IDS.ORG })).status).toBe(200)
  })
})

describe('organizer limit through the admin API', () => {
  test('blocks new invitations and new organizers at the limit, with a clear message', async () => {
    await saveSetting('max_organizers', 2) // the fixture already has 2 organizers

    const invite = await call('post', '/api/admin/organizer-invitations', { as: IDS.ADMIN, body: { email: 'invitee@example.com' } })
    expect(invite.status).toBe(409)
    expect(invite.body.code).toBe('ORGANIZER_LIMIT_REACHED')
    expect(invite.body.message).toMatch(/Maximum organizers allowed/)

    const create = await call('post', '/api/admin/organizers', {
      as: IDS.ADMIN,
      body: { email: 'new@example.com', organizerName: 'N', position: 'P', organizationName: 'O', organizationType: 'T', scopeType: 'all' },
    })
    expect(create.status).toBe(409)
    expect(create.body.code).toBe('ORGANIZER_LIMIT_REACHED')
    expect(world.rows('users').filter((u) => u.role === 'organizer')).toHaveLength(2)
  })

  test('raising the limit takes effect straight away', async () => {
    await saveSetting('max_organizers', 2)
    expect((await call('post', '/api/admin/organizer-invitations', { as: IDS.ADMIN, body: { email: 'invitee@example.com' } })).status).toBe(409)

    await saveSetting('max_organizers', 3)
    expect((await call('post', '/api/admin/organizer-invitations', { as: IDS.ADMIN, body: { email: 'invitee@example.com' } })).status).toBe(201)
  })
})
