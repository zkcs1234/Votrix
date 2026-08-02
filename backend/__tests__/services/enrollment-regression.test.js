import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerParticipant: vi.fn(),
  findUserByEmail: vi.fn(),
  sanitizeUser: vi.fn((user) => user),
  sendJudgeInvitationEmail: vi.fn(),
  sendJudgeInvitationEmailRegistered: vi.fn(),
}))

vi.mock('../../src/foundation/db.js', () => ({
  db: () => ({
    from(table) {
      if (table === 'v_event_voters') {
        throw new Error('legacy event_voters table should not be used')
      }

      const chain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: { id: 'user-1', email: 'judge@example.com' }, error: null }),
      }
      return chain
    },
  }),
}))

vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'event-1', event_type: 'competition_scoring' })),
  getEventById: vi.fn(async () => ({ id: 'event-1', title: 'Test Event', event_type: 'competition_scoring' })),
}))

vi.mock('../../src/services/user.service.js', () => ({
  findUserByEmail: mocks.findUserByEmail,
  sanitizeUser: mocks.sanitizeUser,
}))

vi.mock('../../src/services/mailer.service.js', () => ({
  sendJudgeInvitationEmail: mocks.sendJudgeInvitationEmail,
  sendJudgeInvitationEmailRegistered: mocks.sendJudgeInvitationEmailRegistered,
}))

vi.mock('../../src/services/participant.service.js', () => ({
  registerParticipant: mocks.registerParticipant,
}))

vi.mock('../../src/utils/password.js', () => ({
  hashPassword: vi.fn(async () => 'hashed'),
}))

vi.mock('../../src/utils/crypto.js', () => ({
  generateTemporaryPassword: vi.fn(() => 'temp-pass'),
}))

vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(),
  emitToEventOrganizer: vi.fn(),
  emitToUser: vi.fn(),
  emitToRole: vi.fn(),
}))

import { inviteJudge, registerJudge } from '../../src/services/pageant.service.js'
import * as pollingService from '../../src/services/polling.service.js'
import { previewCsv } from '../../src/services/csv-import.service.js'

describe('enrollment regression coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUserByEmail.mockResolvedValue(null)
    mocks.sanitizeUser.mockImplementation((user) => user)
    mocks.sendJudgeInvitationEmail.mockResolvedValue({ sent: true })
    mocks.sendJudgeInvitationEmailRegistered.mockResolvedValue({ sent: true })
    mocks.registerParticipant.mockResolvedValue({ id: 'participant-1' })
  })

  test('inviteJudge uses the participant service instead of the legacy view', async () => {
    await expect(inviteJudge('event-1', 'organizer-1', { email: 'judge@example.com' })).resolves.toMatchObject({
      user: { id: 'user-1', email: 'judge@example.com' },
    })

    expect(mocks.registerParticipant).toHaveBeenCalledWith('event-1', 'user-1', {
      participantType: 'COMPETITION_JUDGE',
      firstName: null,
      lastName: null,
    })
  })

  test('registerJudge uses the participant service instead of the legacy view', async () => {
    await expect(registerJudge('event-1', 'organizer-1', { email: 'judge@example.com' })).resolves.toMatchObject({
      user: { id: 'user-1', email: 'judge@example.com' },
      invitationSent: false,
    })

    expect(mocks.registerParticipant).toHaveBeenCalledWith('event-1', 'user-1', {
      participantType: 'COMPETITION_JUDGE',
      firstName: null,
      lastName: null,
    })
  })

  test('previewCsv checks the canonical participant table for existing enrollments', async () => {
    const csvBuffer = Buffer.from('email\njudge@example.com\n')

    await expect(previewCsv('event-1', 'organizer-1', csvBuffer)).resolves.toMatchObject({
      total: 1,
      valid: 1,
      summary: { newAccounts: 1, existingAccounts: 0, alreadyEnrolled: 0 },
    })
  })

  test('polling service exposes respondent enrollment helpers', () => {
    expect(typeof pollingService.listEventRespondents).toBe('function')
    expect(typeof pollingService.registerRespondentToPoll).toBe('function')
    expect(typeof pollingService.registerExistingRespondent).toBe('function')
    expect(typeof pollingService.sendRespondentInvitation).toBe('function')
    expect(typeof pollingService.sendAllPendingRespondentInvitations).toBe('function')
  })
})
