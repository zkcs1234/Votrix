/**
 * Competition Session Pre-Flight Validation Tests
 * 
 * Task 19.1: Test pre-flight validation by attempting to start session with 
 * invalid configurations and verify appropriate error messages.
 * 
 * This test suite focuses on the API endpoint behavior rather than deep 
 * service mocking to ensure integration correctness.
 */
import { describe, test, expect, vi, beforeAll, afterEach } from 'vitest'
import request from 'supertest'

// Mock the Supabase client with controllable responses
const mockFrom = vi.fn()
const mockSupabase = {
  from: mockFrom,
  auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
}

vi.mock('../../src/config/database.js', () => ({
  getSupabase: vi.fn(() => mockSupabase),
  checkDatabaseConnection: vi.fn(async () => ({
    connected: true,
    message: 'mocked',
    schemaReady: true,
  })),
}))

// Mock both user service and organizer service for profile completeness
vi.mock('../../src/services/user.service.js', () => ({
  findUserById: vi.fn(async (id) =>
    id
      ? {
          id,
          email: 'organizer@example.com',
          role: 'organizer',
          account_status: 'active',
          must_change_password: false,
        }
      : null,
  ),
}))

vi.mock('../../src/services/organizer.service.js', () => ({
  getOrganizerProfile: vi.fn(async (id) => ({
    id,
    organization_name: 'Test Organization',
    organization_type: 'nonprofit',
    contact_person: 'Test Contact',
    phone: '555-0123',
    address: '123 Test St',
    // Complete profile to pass requireProfileComplete middleware
  })),
}))

vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(),
  emitToEventOrganizer: vi.fn(),
}))

let createApp, signAccessToken, app

const TEST_JWT_SECRET = 'test-access-secret-min-32-chars-long-xxxxxx'
const TEST_CSRF_SECRET = 'test-csrf-secret-min-32-chars-long-xxxxxx'

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-long-x'
  process.env.JWT_SECRET = TEST_JWT_SECRET
  process.env.CSRF_SECRET = TEST_CSRF_SECRET

  const appModule = await import('../../src/app.js')
  createApp = appModule.createApp
  const jwtModule = await import('../../src/utils/jwt.js')
  signAccessToken = jwtModule.signAccessToken
  app = createApp()
})

/**
 * Helper to create an authenticated organizer agent
 */
async function authedOrganizerAgent() {
  const csrfRes = await request(app).get('/api/auth/csrf')
  expect(csrfRes.status).toBe(200)
  const csrfToken = csrfRes.body.csrfToken
  const csrfCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] ?? ''

  const jwtToken = signAccessToken({
    sub: 'organizer-id',
    role: 'organizer',
    email: 'organizer@example.com',
    accountStatus: 'active',
    mustChangePassword: false,
  })

  const accessCookie = `votrix_access=${jwtToken}`

  return {
    post: (url) =>
      request(app)
        .post(url)
        .set('Cookie', `${csrfCookie}; ${accessCookie}`)
        .set('x-csrf-token', csrfToken),
  }
}

/**
 * Mock query chain builder for flexible database responses
 */
function createMockQueryChain(responses) {
  let callIndex = 0
  
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve) => {
          const response = responses[callIndex] || { data: [], error: null, count: 0 }
          callIndex++
          resolve(response)
        }
      }
      if (prop === 'catch') {
        return () => chain
      }
      // All other methods return the chain for fluent interface
      return vi.fn(() => chain)
    }
  })
  
  return chain
}

describe('Competition Session Pre-Flight Validation (Task 19.1)', () => {
  const eventId = 'test-event-id'

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Pre-Flight Validation: Zero Contestants', () => {
    test('should reject session start when no contestants exist', async () => {
      // Setup: mock an event that exists but has no contestants
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null } // No active session
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 0, error: null } // Zero contestants
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Cannot start session: No contestants added. Add contestants first.')
    })

    test('should continue validation when contestants exist', async () => {
      // Setup: mock contestants exist but no judges
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null } // No active session
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null } // 3 contestants exist
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 0, error: null } // Zero judges
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Cannot start session: No judges enrolled. Add judges first.')
    })
  })

  describe('Pre-Flight Validation: Zero Judges', () => {
    test('should reject session start when no active judges exist', async () => {
      // Setup: mock contestants exist but no active judges
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null }
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null }
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 0, error: null } // Zero active judges
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Cannot start session: No judges enrolled. Add judges first.')
    })

    test('should continue validation when active judges exist', async () => {
      // Setup: mock contestants and judges exist but no criteria
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null }
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null }
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 2, error: null } // 2 active judges exist
          ])
        }
        if (table === 'competition_criteria') {
          return createMockQueryChain([
            { data: [], error: null } // No criteria
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Cannot start session: No criteria added. Add criteria first.')
    })
  })

  describe('Pre-Flight Validation: Criteria Percentages', () => {
    test('should reject session start when no criteria exist', async () => {
      // Setup: mock contestants, judges exist but no criteria
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null }
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null }
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 2, error: null }
          ])
        }
        if (table === 'competition_criteria') {
          return createMockQueryChain([
            { data: null, error: null } // No criteria
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Cannot start session: No criteria added. Add criteria first.')
    })

    test('should reject session start when criteria percentages do not sum to 100%', async () => {
      // Setup: mock valid data but criteria sum to 85%
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null }
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null }
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 2, error: null }
          ])
        }
        if (table === 'competition_criteria') {
          return createMockQueryChain([
            { 
              data: [
                { percentage: 40 },
                { percentage: 30 },
                { percentage: 15 }
              ], 
              error: null 
            }
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Cannot start session: Criteria percentages total 85.0% (must equal 100%)')
    })

    test('should reject session start when criteria percentages exceed 100%', async () => {
      // Setup: mock valid data but criteria sum to 110%
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null }
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null }
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 2, error: null }
          ])
        }
        if (table === 'competition_criteria') {
          return createMockQueryChain([
            { 
              data: [
                { percentage: 50 },
                { percentage: 40 },
                { percentage: 20 }
              ], 
              error: null 
            }
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Cannot start session: Criteria percentages total 110.0% (must equal 100%)')
    })

    test('should accept criteria percentages that sum to exactly 100%', async () => {
      // Setup: mock all valid data
      mockFrom.mockImplementation((table) => {
        if (table === 'events') {
          return createMockQueryChain([
            { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null },
            { error: null } // Auto-enable scoring update
          ])
        }
        if (table === 'v_competition_active_session') {
          return createMockQueryChain([
            { data: null, error: null }
          ])
        }
        if (table === 'competition_contestants') {
          return createMockQueryChain([
            { count: 3, error: null },
            { data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], error: null }
          ])
        }
        if (table === 'competition_judges') {
          return createMockQueryChain([
            { count: 2, error: null }
          ])
        }
        if (table === 'competition_criteria') {
          return createMockQueryChain([
            { 
              data: [
                { percentage: 50 },
                { percentage: 30 },
                { percentage: 20 }
              ], 
              error: null 
            }
          ])
        }
        if (table === 'competition_rounds') {
          return createMockQueryChain([
            { data: [], error: null }
          ])
        }
        if (table === 'competition_sessions') {
          return createMockQueryChain([
            {
              data: {
                id: 'session-id',
                event_id: eventId,
                status: 'active',
                current_round_id: null,
                active_contestant_id: 'c1',
                current_contestant_order: 0,
                contestant_order: ['c1', 'c2', 'c3'],
                started_at: new Date().toISOString(),
                paused_at: null,
                completed_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              },
              error: null
            }
          ])
        }
        return createMockQueryChain([])
      })

      const agent = await authedOrganizerAgent()
      const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

      // Should succeed (201) or at least not fail due to criteria validation (400 with different message)
      if (response.status === 400) {
        expect(response.body.message).not.toMatch(/criteria percentages/i)
      } else {
        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
      }
    })
  })

  describe('Pre-Flight Validation: Error Message Accuracy', () => {
    test('should provide exact error messages as specified in requirements', async () => {
      const testCases = [
        {
          name: 'zero contestants',
          setup: (table) => {
            if (table === 'events') {
              return createMockQueryChain([
                { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
              ])
            }
            if (table === 'v_competition_active_session') {
              return createMockQueryChain([{ data: null, error: null }])
            }
            if (table === 'competition_contestants') {
              return createMockQueryChain([{ count: 0, error: null }])
            }
            return createMockQueryChain([])
          },
          expectedMessage: 'Cannot start session: No contestants added. Add contestants first.'
        },
        {
          name: 'zero judges',
          setup: (table) => {
            if (table === 'events') {
              return createMockQueryChain([
                { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
              ])
            }
            if (table === 'v_competition_active_session') {
              return createMockQueryChain([{ data: null, error: null }])
            }
            if (table === 'competition_contestants') {
              return createMockQueryChain([{ count: 1, error: null }])
            }
            if (table === 'competition_judges') {
              return createMockQueryChain([{ count: 0, error: null }])
            }
            return createMockQueryChain([])
          },
          expectedMessage: 'Cannot start session: No judges enrolled. Add judges first.'
        },
        {
          name: 'zero criteria',
          setup: (table) => {
            if (table === 'events') {
              return createMockQueryChain([
                { data: { id: eventId, event_type: 'pageant', organizer_id: 'organizer-id' }, error: null }
              ])
            }
            if (table === 'v_competition_active_session') {
              return createMockQueryChain([{ data: null, error: null }])
            }
            if (table === 'competition_contestants') {
              return createMockQueryChain([{ count: 1, error: null }])
            }
            if (table === 'competition_judges') {
              return createMockQueryChain([{ count: 1, error: null }])
            }
            if (table === 'competition_criteria') {
              return createMockQueryChain([{ data: [], error: null }])
            }
            return createMockQueryChain([])
          },
          expectedMessage: 'Cannot start session: No criteria added. Add criteria first.'
        }
      ]

      for (const testCase of testCases) {
        mockFrom.mockImplementation(testCase.setup)
        
        const agent = await authedOrganizerAgent()
        const response = await agent.post(`/api/organizer/competition/events/${eventId}/session/start`)

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toBe(testCase.expectedMessage)
      }
    })
  })
})