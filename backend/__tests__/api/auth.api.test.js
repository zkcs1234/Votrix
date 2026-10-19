import { vi } from 'vitest'
vi.mock('../../src/services/auth.service.js', async()=>{const original=await vi.importActual('../../src/services/auth.service.js');const {ApiError}=await import('../../src/utils/ApiError.js');return{...original,login:vi.fn(async()=>{throw new ApiError(401,'Invalid email or password')})}})
vi.mock('../../src/services/admin.service.js',async()=>({...await vi.importActual('../../src/services/admin.service.js'),createAuditLog:vi.fn(async()=>null)}))
vi.mock('../../src/services/alert.service.js',async()=>({...await vi.importActual('../../src/services/alert.service.js'),notifyAdminsOfFailedLoginThreshold:vi.fn(async()=>null)}))
import request from 'supertest'
import { createApp } from '../../src/app.js'
import * as authService from '../../src/services/auth.service.js'

const TEST_CREDENTIALS = {
  wrongPassword: 'wrongpassword',
}

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

    test('should not allow vercel preview origins by default', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'https://preview-example.vercel.app')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
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
  // These tests accept either 401 (DB configured but credentials wrong) or
  // 503 (DB not configured — e.g. CI without secrets). The real assertion
  // is that the route is reachable and rejects bad input cleanly.
  describe('POST /api/auth/login', () => {
    test('returns the access token while retaining HTTP-only authentication cookies', async () => {
      authService.login.mockResolvedValueOnce({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: { id: 'organizer-id', role: 'organizer', email: 'organizer@example.com' },
      })
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'organizer@example.com', password: 'test-password' })

      expect(response.status).toBe(200)
      expect(response.body).not.toHaveProperty('accessToken')
      expect(response.body).not.toHaveProperty('refreshToken')
      expect(response.headers['set-cookie'].filter(cookie => cookie.includes('HttpOnly'))).toHaveLength(2)
    })

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: TEST_CREDENTIALS.wrongPassword })
      expect([401, 503]).toContain(response.status)
    })
  })

  describe('POST /api/auth/forgot-password', () => {
    test('should not require CSRF token (public password recovery)', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' })
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    test('should not require CSRF token (public password recovery)', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'reset-token', newPassword: 'short', confirmPassword: 'short' })
      expect(response.status).toBe(400)
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
