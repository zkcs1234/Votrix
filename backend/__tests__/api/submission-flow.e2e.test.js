/**
 * End-to-End submission path tests.
 *
 * Goal: exercise the FULL HTTP stack — request, CSRF middleware, auth
 * middleware, role/permission checks, rate limiters, validators, service
 * invocation, and response envelope — for the three critical write paths:
 *
 *   1. Election:  POST /api/voter/election/events/:eventId/vote
 *   2. Polling:   POST /api/voter/polling/events/:eventId/submit
 *   3. Scoring:   POST /api/voter/competition/events/:eventId/score
 *
 * Strategy:
 *   - Mock the Supabase client (no real database calls).
 *   - Use a real signed JWT to satisfy the `authenticate` middleware.
 *   - Fetch a CSRF token from /api/auth/csrf and pass it as a header +
 *     cookie to satisfy the `csrfProtection` middleware.
 *   - The service layer is also mocked at the controller boundary so
 *     the controller can be exercised end-to-end without hitting a DB.
 */
import { describe, test, expect, vi, beforeAll, afterEach } from 'vitest'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Mocks — must come before importing the app
// ---------------------------------------------------------------------------

// A no-op fluent chain that resolves to `{ data: [], error: null }` for
// every method. The DB is never actually consulted.
const noopChain = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve) => resolve({ data: [], error: null, count: 0 })
      }
      if (prop === 'catch') {
        return () => noopChain
      }
      return vi.fn(() => noopChain)
    },
  },
)

vi.mock('../../src/config/database.js', () => ({
  getSupabase: vi.fn(() => ({
    from: vi.fn(() => noopChain),
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  })),
  checkDatabaseConnection: vi.fn(async () => ({
    connected: true,
    message: 'mocked',
    schemaReady: true,
  })),
}))

vi.mock('../../src/services/password-reset.service.js', () => ({
  requestPasswordReset: vi.fn(async () => ({ success: true, message: 'ok' })),
  resetPasswordWithToken: vi.fn(async () => ({ success: true, message: 'ok' })),
}))

vi.mock('../../src/services/email.service.js', () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
}))

// Mock the user service so `requireActiveAccount` (called on every
// authenticated request) doesn't try to read from the (mocked) database.
vi.mock('../../src/services/user.service.js', () => ({
  findUserById: vi.fn(async (id) =>
    id
      ? {
          id,
          email: 'mocked@example.com',
          role: 'voter',
          account_status: 'active',
          must_change_password: false,
        }
      : null,
  ),
  // Other exports are stubbed for safety.
  findUserByEmail: vi.fn(async () => null),
  findUserByUsername: vi.fn(async () => null),
  createUser: vi.fn(async () => null),
  updateUser: vi.fn(async () => null),
  setUserStatus: vi.fn(async () => null),
}))

// ---------------------------------------------------------------------------
// App + helpers
// ---------------------------------------------------------------------------

let createApp
let signAccessToken
let app

const TEST_JWT_SECRET = 'test-access-secret-min-32-chars-long-xxxxxx'
const TEST_CSRF_SECRET = 'test-csrf-secret-min-32-chars-long-xxxxxx'

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-long-x'
  process.env.JWT_SECRET = TEST_JWT_SECRET
  process.env.CSRF_SECRET = TEST_CSRF_SECRET

  // Use a unique test email so the rate limiter's per-user counter starts
  // fresh and doesn't collide with other test suites.
  process.env.RATE_LIMIT_GLOBAL_USER_MAX = '10000'
  process.env.RATE_LIMIT_VOTE_USER_MAX = '10000'
  process.env.RATE_LIMIT_VOTE_IP_MAX = '10000'
  process.env.RATE_LIMIT_POLL_USER_MAX = '10000'
  process.env.RATE_LIMIT_POLL_IP_MAX = '10000'
  process.env.RATE_LIMIT_SCORE_USER_MAX = '10000'
  process.env.RATE_LIMIT_SCORE_IP_MAX = '10000'

  const appModule = await import('../../src/app.js')
  createApp = appModule.createApp
  const jwtModule = await import('../../src/utils/jwt.js')
  signAccessToken = jwtModule.signAccessToken
  app = createApp()
})

/**
 * Build a CSRF-protected supertest agent.
 *
 * Steps:
 *   1. GET /api/auth/csrf to receive a CSRF token in the body and a cookie.
 *   2. Sign a JWT for the test user.
 *   3. Return a helper that issues POSTs with both the Bearer token and
 *      the CSRF token (header + cookie).
 *
 * Returning a `Request` object directly is simpler than using `agent()` —
 * supertest's `set('Cookie', ...)` plus `set('Authorization', ...)` covers
 * the middleware requirements.
 */
async function authedAgent(user) {
  const csrfRes = await request(app).get('/api/auth/csrf')
  expect(csrfRes.status).toBe(200)
  const csrfToken = csrfRes.body.csrfToken
  const csrfCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] ?? ''

  const jwtToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    username: user.username,
    accountStatus: 'active',
    mustChangePassword: false,
  })

  // Set token as cookie (votrix_access) instead of Authorization header
  // The system now extracts tokens from HTTP-only cookies
  const accessCookie = `votrix_access=${jwtToken}`

  return {
    get: (url) =>
      request(app).get(url).set('Cookie', `${csrfCookie}; ${accessCookie}`),
    post: (url) =>
      request(app)
        .post(url)
        .set('Cookie', `${csrfCookie}; ${accessCookie}`)
        .set('x-csrf-token', csrfToken),
    patch: (url) =>
      request(app)
        .patch(url)
        .set('Cookie', `${csrfCookie}; ${accessCookie}`)
        .set('x-csrf-token', csrfToken),
    put: (url) =>
      request(app)
        .put(url)
        .set('Cookie', `${csrfCookie}; ${accessCookie}`)
        .set('x-csrf-token', csrfToken),
    delete: (url) =>
      request(app)
        .delete(url)
        .set('Cookie', `${csrfCookie}; ${accessCookie}`)
        .set('x-csrf-token', csrfToken),
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const voter = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'voter@example.com',
  role: 'voter',
}

const eventId = '22222222-2222-2222-2222-222222222222'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E submission paths', () => {
  // ===========================================================
  // 1. Election vote submission
  // ===========================================================
  describe('POST /api/voter/election/events/:eventId/vote', () => {
    test('rejects unauthenticated requests', async () => {
      // No Authorization header and no CSRF token. The exact status code
      // depends on middleware ordering (CSRF runs before auth in the
      // current setup), but it should be in the 4xx range.
      const res = await request(app)
        .post(`/api/voter/election/events/${eventId}/vote`)
        .send({ selections: {} })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
    })

    test('400 when selections object is missing', async () => {
      const agent = await authedAgent(voter)
      const res = await agent.post(`/api/voter/election/events/${eventId}/vote`).send({})

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('success', false)
      expect(res.body.message).toMatch(/selections/i)
    })

    test('400 when a position value is not an array', async () => {
      const agent = await authedAgent(voter)
      const res = await agent
        .post(`/api/voter/election/events/${eventId}/vote`)
        .send({ selections: { 'pos-1': 'not-an-array' } })

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/array/i)
    })
  })

  // ===========================================================
  // 2. Polling submission
  // ===========================================================
  describe('POST /api/voter/polling/events/:eventId/submit', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post(`/api/voter/polling/events/${eventId}/submit`)
        .send({ answers: [] })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
    })

    test('passes the validator with well-formed answers', async () => {
      const agent = await authedAgent(voter)
      const res = await agent.post(`/api/voter/polling/events/${eventId}/submit`).send({
        answers: [
          { questionId: 'q-1', optionId: 'opt-1' },
          { questionId: 'q-2', optionIds: ['opt-2', 'opt-3'] },
        ],
      })

      // The validator passes → status is not a validator 400. The service
      // is mocked, so it may return success or 4xx/5xx depending on the
      // mocked DB state. We just assert the response is well-formed.
      expect(res.body).toHaveProperty('success')
      if (res.status === 400) {
        expect(res.body.message).not.toMatch(/answers/i)
      }
    })
  })

  // ===========================================================
  // 3. Competition scoring submission
  // ===========================================================
  describe('POST /api/voter/competition/events/:eventId/score', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post(`/api/voter/competition/events/${eventId}/score`)
        .send({ scores: [] })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
    })

    test('400 when scores array is missing or empty', async () => {
      const agent = await authedAgent(voter)
      const res = await agent.post(`/api/voter/competition/events/${eventId}/score`).send({})

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/scores/i)
    })

    test('400 when scores is not an array', async () => {
      const agent = await authedAgent(voter)
      const res = await agent
        .post(`/api/voter/competition/events/${eventId}/score`)
        .send({ scores: 'not-an-array' })

      expect(res.status).toBe(400)
    })

    test('passes the validator with well-formed scores', async () => {
      const agent = await authedAgent(voter)
      const res = await agent.post(`/api/voter/competition/events/${eventId}/score`).send({
        scores: [
          { contestantId: 'c-1', criteriaId: 'cr-1', score: 85 },
          { contestantId: 'c-1', criteriaId: 'cr-2', score: 90 },
        ],
      })

      expect(res.body).toHaveProperty('success')
      if (res.status === 400) {
        expect(res.body.message).not.toMatch(/scores/i)
      }
    })
  })

  // ===========================================================
  // Cross-cutting: role enforcement
  // ===========================================================
  describe('Role enforcement', () => {
    test('organizer cannot submit a vote (wrong role)', async () => {
      const organizer = {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'org@example.com',
        role: 'organizer',
      }
      const agent = await authedAgent(organizer)
      const res = await agent.post(`/api/voter/election/events/${eventId}/vote`).send({
        selections: { 'pos-1': ['cand-1'] },
      })

      expect(res.status).toBe(403)
    })

    test('admin cannot submit a poll response (wrong role)', async () => {
      const admin = {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin',
      }
      const agent = await authedAgent(admin)
      const res = await agent.post(`/api/voter/polling/events/${eventId}/submit`).send({
        answers: [{ questionId: 'q-1', optionId: 'opt-1' }],
      })

      expect(res.status).toBe(403)
    })
  })

  // ===========================================================
  // CSRF protection
  // ===========================================================
  describe('CSRF protection', () => {
    test('POST without CSRF token is rejected', async () => {
      const jwtToken = signAccessToken({
        sub: voter.id,
        role: voter.role,
        email: voter.email,
        accountStatus: 'active',
        mustChangePassword: false,
      })

      // Get CSRF cookie but don't send the CSRF token header
      const csrfRes = await request(app).get('/api/auth/csrf')
      const csrfCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] ?? ''
      const accessCookie = `votrix_access=${jwtToken}`

      const res = await request(app)
        .post(`/api/voter/election/events/${eventId}/vote`)
        .set('Cookie', `${csrfCookie}; ${accessCookie}`)
        .send({ selections: {} })

      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/csrf/i)
    })
  })
})
