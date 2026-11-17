import { beforeEach, describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import { IDS, activeOfficerRow, makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// The portal reads classified events; the per-module listing queries are not what
// is under test here, so they are replaced with a fixed list.
vi.mock('../../src/services/voter.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadClassifiedEvents: vi.fn(async () => []),
}))

import { createApp } from '../../src/app.js'
import { signAccessToken } from '../../src/utils/jwt.js'
import { buildTokenPayload } from '../../src/services/token.service.js'
import { env } from '../../src/config/env.js'
import { loadClassifiedEvents } from '../../src/services/voter.service.js'

const CSRF = 'c'.repeat(40)
world = makeWorld()
const app = createApp()

function as(userId) {
  const row = world.raw('users').find((u) => u.id === userId)
  const token = signAccessToken(buildTokenPayload(row))
  const cookie = `${env.jwt.accessCookieName}=${token}; ${env.csrf.cookieName}=${CSRF}`
  return { get: (url) => request(app).get(url).set('Cookie', cookie).set(env.csrf.headerName, CSRF) }
}

const ENDPOINTS = ['events', 'history', 'results']
const PREFIXES = ['/api/participant', '/api/voter']

beforeEach(() => {
  world = makeWorld()
  world.raw('organization_officers').push(activeOfficerRow(IDS.S1, IDS.ORG, { position: 'President' }))
  loadClassifiedEvents.mockClear()
})

describe('participant portal endpoints are for signed-in participants only', () => {
  test.each(PREFIXES.flatMap((p) => ENDPOINTS.map((e) => `${p}/${e}`)))('%s requires authentication', async (url) => {
    expect((await request(app).get(url)).status).toBe(401)
  })

  test.each(ENDPOINTS)('%s refuses an organizer and an admin', async (endpoint) => {
    expect((await as(IDS.ORG).get(`/api/participant/${endpoint}`)).status).toBe(403)
    expect((await as(IDS.ADMIN).get(`/api/participant/${endpoint}`)).status).toBe(403)
  })

  test.each(ENDPOINTS)('%s answers a student, a judge and an officer', async (endpoint) => {
    for (const id of [IDS.S3, IDS.JUDGE, IDS.S1]) {
      const res = await as(id).get(`/api/participant/${endpoint}`)
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, total: 0 })
    }
  })

  test('only the caller\'s own id is used to load events', async () => {
    await as(IDS.S3).get(`/api/participant/history?userId=${IDS.S2}`)
    expect(loadClassifiedEvents).toHaveBeenCalledWith(IDS.S3)
    expect(loadClassifiedEvents).not.toHaveBeenCalledWith(IDS.S2)
  })

  test('hostile paging and filter values are clamped, not trusted', async () => {
    const res = await as(IDS.S3).get('/api/participant/history?limit=99999&page=-4&range=bogus&type=<script>&outcome=x')
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(50)
    expect(res.body.page).toBe(1)
  })
})

describe('sign-in payload carries the participant type', () => {
  test('a student officer gets STUDENT and the officership', async () => {
    const res = await as(IDS.S1).get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.user.participantTypes).toEqual(['STUDENT'])
    expect(res.body.user.officership).toMatchObject({ position: 'President' })
  })

  test('a judge gets JUDGE and no officership', async () => {
    const res = await as(IDS.JUDGE).get('/api/auth/me')
    expect(res.body.user.participantTypes).toEqual(['JUDGE'])
    expect(res.body.user.officership).toBeNull()
  })

  test('an organizer gets neither field', async () => {
    const res = await as(IDS.ORG).get('/api/auth/me')
    expect(res.body.user).not.toHaveProperty('participantTypes')
    expect(res.body.user).not.toHaveProperty('officership')
  })
})
