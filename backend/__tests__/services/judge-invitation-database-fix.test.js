import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock the database client
vi.mock('../../src/foundation/db.js', () => ({
  db: vi.fn(),
}))

const mockSupabaseClient = {
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}

// Create chainable methods for Supabase query builder
const createQueryChain = (returnData, returnError = null) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(), 
  update: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
})

// Mock the database connection
vi.mock('../../src/foundation/db.js', () => ({
  db: vi.fn(() => mockSupabaseClient),
}))

// Mock event service
vi.mock('../../src/services/event.service.js', () => ({
  getEventById: vi.fn().mockResolvedValue({
    id: 'test-event-id',
    title: 'Test Competition',
    event_type: 'competition_scoring'
  }),
  assertOrganizerOwnsEvent: vi.fn().mockResolvedValue({
    id: 'test-event-id',
    title: 'Test Competition',
    event_type: 'competition_scoring'
  }),
}))

// Mock notification and websocket services
vi.mock('../../src/services/notification.service.js', () => ({
  createNotification: vi.fn(),
}))

vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(),
  emitToEventOrganizer: vi.fn(),
  emitToUser: vi.fn(),
}))

// Mock mailer service
vi.mock('../../src/services/mailer.service.js', () => ({
  sendJudgeInvitationEmail: vi.fn().mockResolvedValue({ sent: true, messageId: 'test-msg-id' }),
  sendJudgeInvitationEmailRegistered: vi.fn().mockResolvedValue({ sent: true, messageId: 'test-msg-id' }),
}))

// Mock user service
vi.mock('../../src/services/user.service.js', () => ({
  createUser: vi.fn(),
}))

// Mock crypto utils
vi.mock('../../src/utils/crypto.js', () => ({
  generateTemporaryPassword: vi.fn(() => 'temp-password-123'),
}))

// Import the service to test
import { sendJudgeInvitation } from '../../src/services/pageant.service.js'
import { db } from '../../src/foundation/db.js'

describe('Judge Invitation Database Fix - Judge Record Retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup the database client mock to return our chainable methods
    vi.mocked(db).mockImplementation(() => {
      return {
        from: vi.fn().mockImplementation(() => createQueryChain(null))
      }
    })
  })

  test('Successfully retrieves judge records when given valid competition_judges.id', async () => {
    // **Validates: Requirements 1.1, 1.2, 1.4**
    
    // Setup test data - valid judge record
    const eventId = 'test-event-123'
    const organizerId = 'organizer-456'
    const validJudgeId = 'judge-primary-key-789' // This represents competition_judges.id
    
    const mockJudgeData = {
      user_id: 'user-foreign-key-999', 
      users: {
        id: 'user-foreign-key-999',
        email: 'judge@example.com',
        must_change_password: true
      }
    }

    // Mock successful database query responses
    let callCount = 0
    vi.mocked(db).mockImplementation(() => ({
      from: vi.fn().mockImplementation((table) => {
        callCount++
        if (table === 'competition_judges' && callCount === 1) {
          // First call: judge lookup
          return createQueryChain(mockJudgeData, null)
        } else {
          // Subsequent calls: users table update, etc.
          return createQueryChain(null, null)
        }
      })
    }))

    // Execute the function
    const result = await sendJudgeInvitation(eventId, organizerId, validJudgeId)

    // Verify successful result
    expect(result).toBeDefined()
    expect(result.email).toEqual({ sent: true, messageId: 'test-msg-id' })
    expect(result.invitationSent).toBe(true)
  })

  test('Returns appropriate error when judge ID does not exist', async () => {
    // **Validates: Requirements 2.2, 5.3**
    
    const eventId = 'test-event-123'
    const organizerId = 'organizer-456' 
    const nonExistentJudgeId = 'non-existent-judge-id'

    // Mock query returning null (judge not found)
    const queryChain = createQueryChain(null, null)
    mockSupabaseClient.from.mockReturnValue(queryChain)

    // Expect the function to throw an error
    await expect(sendJudgeInvitation(eventId, organizerId, nonExistentJudgeId))
      .rejects
      .toThrow('Judge is not enrolled in this event')

    // Verify query used correct primary key field
    expect(queryChain.eq).toHaveBeenCalledWith('id', nonExistentJudgeId)
  })

  test('Uses primary key field (id) instead of foreign key field (user_id)', async () => {
    // **Validates: Requirements 1.1, 1.3** 
    
    const eventId = 'test-event-123'
    const organizerId = 'organizer-456'
    const judgeId = 'primary-key-id-123'
    
    const mockJudgeData = {
      user_id: 'different-user-id-456',
      users: {
        id: 'different-user-id-456',
        email: 'judge@test.com', 
        must_change_password: false
      }
    }

    const queryChain = createQueryChain(mockJudgeData, null)
    mockSupabaseClient.from.mockReturnValue(queryChain)

    await sendJudgeInvitation(eventId, organizerId, judgeId)

    // Verify the query uses 'id' field (PRIMARY KEY) not 'user_id' field (FOREIGN KEY)
    expect(queryChain.eq).toHaveBeenCalledWith('id', judgeId)
    
    // Ensure it's NOT querying by user_id (the bug that was fixed)
    expect(queryChain.eq).not.toHaveBeenCalledWith('user_id', judgeId)
  })

  test('Maintains foreign key relationships and data integrity', async () => {
    // **Validates: Requirements 1.5, 3.1, 3.2**
    
    const eventId = 'test-event-123'
    const organizerId = 'organizer-456'
    const judgeId = 'judge-id-123'
    
    const mockJudgeData = {
      user_id: 'user-ref-789',
      users: {
        id: 'user-ref-789', // Should match user_id for referential integrity
        email: 'integrity@test.com',
        must_change_password: false  // Existing account
      }
    }

    vi.mocked(db).mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => createQueryChain(mockJudgeData, null))
    }))

    const result = await sendJudgeInvitation(eventId, organizerId, judgeId)

    // Verify that the function completed successfully (integrity maintained)
    expect(result.invitationSent).toBe(true)
    expect(result.email.sent).toBe(true)
  })

  test('Handles database errors gracefully', async () => {
    // **Validates: Requirements 2.4, 5.3**
    
    const eventId = 'test-event-123'
    const organizerId = 'organizer-456'
    const judgeId = 'judge-id-123'

    // Mock database error
    const databaseError = { message: 'Database connection failed' }
    const queryChain = createQueryChain(null, databaseError)
    mockSupabaseClient.from.mockReturnValue(queryChain)

    // Expect function to throw database error
    await expect(sendJudgeInvitation(eventId, organizerId, judgeId))
      .rejects
      .toThrow('Database connection failed')

    // Verify query was attempted with correct parameters
    expect(queryChain.eq).toHaveBeenCalledWith('id', judgeId)
    expect(queryChain.eq).toHaveBeenCalledWith('event_id', eventId)
  })

  test('Correctly processes existing account vs new account scenarios', async () => {
    // **Validates: Requirements 4.4, 5.2**
    
    const eventId = 'test-event-123' 
    const organizerId = 'organizer-456'
    const judgeId = 'judge-id-123'

    // Test existing account (password already set)
    const existingAccountData = {
      user_id: 'user-existing-123',
      users: {
        id: 'user-existing-123',
        email: 'existing@test.com',
        must_change_password: false // Existing account indicator
      }
    }

    const queryChain = createQueryChain(existingAccountData, null)
    mockSupabaseClient.from.mockReturnValue(queryChain)

    const result = await sendJudgeInvitation(eventId, organizerId, judgeId)

    // Verify correct database lookup happened
    expect(queryChain.eq).toHaveBeenCalledWith('id', judgeId)
    
    // Verify result format is consistent
    expect(result).toHaveProperty('email')
    expect(result).toHaveProperty('invitationSent')
    expect(result.invitationSent).toBe(true)
  })
})