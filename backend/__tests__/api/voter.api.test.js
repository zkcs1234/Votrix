import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('Voter API Endpoints', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  describe('GET /api/voter', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/voter')
      expect(response.status).toBe(401)
    })
  })
})