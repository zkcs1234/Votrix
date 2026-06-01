import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('Auth API Endpoints', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  describe('GET /api', () => {
    test('should return API info', async () => {
      const response = await request(app).get('/api')
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('message', 'VOTRIX API')
      expect(response.body).toHaveProperty('version', '1.0.0')
    })
  })

  describe('GET /api/health', () => {
    test('should return health status', async () => {
      const response = await request(app).get('/api/health')
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
    })
  })

  describe('GET /api/auth/csrf', () => {
    test('should return CSRF token', async () => {
      const response = await request(app).get('/api/auth/csrf')
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('csrfToken')
    })
  })

  describe('POST /api/auth/logout', () => {
    test('should return success on logout', async () => {
      const response = await request(app).post('/api/auth/logout')
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('message', 'Logged out')
    })
  })

  // Login endpoints are CSRF exempt
  describe('POST /api/auth/admin/login', () => {
    test('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({ username: 'admin', password: 'wrongpassword' })
      expect(response.status).toBe(401)
    })
  })

  describe('POST /api/auth/organizer/login', () => {
    test('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/organizer/login')
        .send({ email: 'nonexistent@example.com', password: 'wrongpassword' })
      expect(response.status).toBe(401)
    })
  })

  describe('POST /api/auth/voter/login', () => {
    test('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/voter/login')
        .send({ email: 'nonexistent@example.com', password: 'wrongpassword' })
      expect(response.status).toBe(401)
    })
  })

  describe('POST /api/auth/forgot-password', () => {
    test('should return 403 without CSRF token (CSRF protection', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' })
      expect(response.status).toBe(403)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    test('should return 403 without CSRF token (CSRF protection)', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'reset-token', newPassword: 'short', confirmPassword: 'short' })
      expect(response.status).toBe(403)
    })
  })

  describe('GET /api/auth/me', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/auth/me')
      expect(response.status).toBe(401)
    })
  })

  describe('POST /api/auth/refresh', () => {
    test('should return 401 without refresh token', async () => {
      const response = await request(app).post('/api/auth/refresh')
      expect(response.status).toBe(401)
      expect(response.body).toHaveProperty('message', 'Refresh token missing')
    })
  })
})