import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('Organizer API Endpoints', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  describe('GET /api/organizer', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/organizer')
      expect(response.status).toBe(401)
    })
  })
})