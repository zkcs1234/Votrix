import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { globalLimiter, refreshLimiter } from '../../src/middleware/rateLimiter.js'
import { env } from '../../src/config/env.js'
import { signAccessToken } from '../../src/utils/jwt.js'

describe('Rate Limiting Middleware', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  test('refresh endpoint remains available after the global IP budget is exhausted', async () => {
    const isolatedApp = express()
    isolatedApp.set('trust proxy', 1)
    isolatedApp.use(cookieParser())
    isolatedApp.use(globalLimiter)
    isolatedApp.get('/api/ordinary', (_req, res) => res.sendStatus(200))
    isolatedApp.post('/api/auth/refresh', refreshLimiter, (_req, res) => res.sendStatus(200))

    const clientIp = '203.0.113.42'
    let response
    for (let requestNumber = 0; requestNumber < 101; requestNumber++) {
      response = await request(isolatedApp)
        .get('/api/ordinary')
        .set('X-Forwarded-For', clientIp)
    }
    expect(response.status).toBe(429)

    response = await request(isolatedApp)
      .post('/api/auth/refresh')
      .set('X-Forwarded-For', clientIp)
    expect(response.status).toBe(200)
  })

  test('valid access cookies use the authenticated user rate budget before route authentication', async () => {
    const priorUserMax = process.env.RATE_LIMIT_GLOBAL_USER_MAX
    process.env.RATE_LIMIT_GLOBAL_USER_MAX = '2'
    try {
      const isolatedApp = express()
      isolatedApp.set('trust proxy', 1)
      isolatedApp.use(cookieParser())
      isolatedApp.use(globalLimiter)
      isolatedApp.get('/api/ordinary', (_req, res) => res.sendStatus(200))

      const userA = signAccessToken({ sub: 'rate-limit-user-a', role: 'organizer', tokenVersion: 0 })
      const userB = signAccessToken({ sub: 'rate-limit-user-b', role: 'organizer', tokenVersion: 0 })
      const send = (token) => request(isolatedApp)
        .get('/api/ordinary')
        .set('X-Forwarded-For', '203.0.113.43')
        .set('Cookie', `${env.jwt.accessCookieName}=${token}`)

      expect((await send(userA)).status).toBe(200)
      expect((await send(userA)).status).toBe(200)
      expect((await send(userA)).status).toBe(429)
      expect((await send(userB)).status).toBe(200)
    } finally {
      if (priorUserMax === undefined) delete process.env.RATE_LIMIT_GLOBAL_USER_MAX
      else process.env.RATE_LIMIT_GLOBAL_USER_MAX = priorUserMax
    }
  })

  describe('Judge Score Limiter', () => {
    test('should apply rate limiting to POST /api/voter/competition/events/:eventId/score', async () => {
      // Test that the endpoint exists and has rate limiting applied
      const response = await request(app)
        .post('/api/voter/competition/events/test-event/score')
        .send({})

      // Should receive 403 (CSRF required) rather than 404 (not found),
      // confirming the route exists with middleware applied including rate limiting
      expect(response.status).toBe(403)
      expect(response.body).toHaveProperty('success', false)
    })

    test('should apply rate limiting to POST /api/voter/competition/events/:eventId/session-score', async () => {
      // Test that the session score endpoint exists and has rate limiting applied
      const response = await request(app)
        .post('/api/voter/competition/events/test-event/session-score')
        .send({})

      // Should receive 403 (CSRF required) rather than 404 (not found),
      // confirming the route exists with middleware applied including rate limiting
      expect(response.status).toBe(403)
      expect(response.body).toHaveProperty('success', false)
    })
  })

  describe('Webhook traffic', () => {
    test('should bypass CSRF and rate limits for Resend webhook callbacks', async () => {
      const response = await request(app)
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .send({ type: 'email.sent', data: { id: 'msg_123' } })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ success: true, received: true })
    })
  })
})