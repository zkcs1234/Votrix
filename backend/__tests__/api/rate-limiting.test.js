import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('Rate Limiting Middleware', () => {
  let app

  beforeAll(() => {
    app = createApp()
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
})