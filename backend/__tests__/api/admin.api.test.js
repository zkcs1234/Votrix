import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('Admin API Endpoints', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  describe('GET /api/admin', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/admin')
      expect(response.status).toBe(401)
    })
  })
})