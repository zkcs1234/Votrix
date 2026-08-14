import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  registerParticipant: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  sanitizeUser: vi.fn((user) => user),
  sendVoterInvitationEmail: vi.fn(),
  sendVoterInvitationEmailRegistered: vi.fn(),
  sendJudgeInvitationEmail: vi.fn(),
  sendJudgeInvitationEmailRegistered: vi.fn(),
  hashPassword: vi.fn(async () => 'hashed'),
  generateTemporaryPassword: vi.fn(() => 'temp-pass'),
  dbUpdate: vi.fn(),
  eventType: 'competition_scoring',
  maybeSingleData: null,
  fromTables: [],
}))

let dbUpdateSpy

vi.mock('../../src/foundation/db.js', () => ({
  db: mocks.db,
}))

vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'event-1', event_type: mocks.eventType })),
  getEventById: vi.fn(async () => ({ id: 'event-1', title: 'Test Event', event_type: mocks.eventType })),
}))

vi.mock('../../src/services/user.service.js', () => ({
  findUserByEmail: mocks.findUserByEmail,
  findUserById: mocks.findUserById,
  sanitizeUser: mocks.sanitizeUser,
}))

vi.mock('../../src/services/mailer.service.js', () => ({
  sendVoterInvitationEmail: mocks.sendVoterInvitationEmail,
  sendVoterInvitationEmailRegistered: mocks.sendVoterInvitationEmailRegistered,
  sendJudgeInvitationEmail: mocks.sendJudgeInvitationEmail,
  sendJudgeInvitationEmailRegistered: mocks.sendJudgeInvitationEmailRegistered,
}))

vi.mock('../../src/services/participant.service.js', () => ({
  registerParticipant: mocks.registerParticipant,
}))

vi.mock('../../src/utils/password.js', () => ({
  hashPassword: mocks.hashPassword,
}))

vi.mock('../../src/utils/crypto.js', () => ({
  generateTemporaryPassword: mocks.generateTemporaryPassword,
}))

vi.mock('../../src/services/notification.service.js', () => ({
  createNotification: vi.fn(),
}))

vi.mock('../../src/websocket/ws-emitter.js', () => ({
  emitToEvent: vi.fn(),
  emitToEventOrganizer: vi.fn(),
  emitToUser: vi.fn(),
  emitToRole: vi.fn(),
}))

import { inviteJudge, registerJudge, listJudges } from '../../src/services/pageant.service.js'
import * as pollingService from '../../src/services/polling.service.js'
import * as invitationService from '../../src/services/invitation.service.js'
import { previewCsv } from '../../src/services/csv-import.service.js'

const existingVoter = { id: 'user-existing', email: 'voter@example.com', role: 'voter', must_change_password: false, password: 'bcrypt-hash' }

describe('enrollment regression coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.mockImplementation(() => ({
      from(table) {
        mocks.fromTables.push(table)
        if (table === 'v_event_voters') {
          throw new Error('legacy event_voters table should not be used')
        }

        const chain = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn((...args) => { mocks.dbUpdate(...args); return chain }),
          upsert: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
          maybeSingle: vi.fn(async () => ({ data: mocks.maybeSingleData, error: null })),
          single: vi.fn().mockResolvedValue({ data: { id: 'user-1', email: 'judge@example.com' }, error: null }),
        }
        return chain
      },
    }))
    mocks.eventType = 'competition_scoring'
    mocks.maybeSingleData = null
    mocks.fromTables.length = 0
    mocks.findUserByEmail.mockResolvedValue(null)
    mocks.findUserById.mockResolvedValue(null)
    mocks.sanitizeUser.mockImplementation((user) => { const { password, ...safe } = user ?? {}; return safe })
    mocks.sendVoterInvitationEmail.mockResolvedValue({ sent: true })
    mocks.sendVoterInvitationEmailRegistered.mockResolvedValue({ sent: true })
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

  test('listJudges merges legacy participant records and first-class competition_judges rows', async () => {
    mocks.db.mockImplementation(() => ({
      from(table) {
        if (table === 'event_participants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{
                id: 'ep-1', user_id: 'u-1', participant_type: 'COMPETITION_JUDGE', first_name: 'Legacy', last_name: 'Judge', has_scored: false, metadata: {}, users: { id: 'u-1', email: 'legacy@example.com' }, created_at: '2024-01-01' }],
              error: null,
            }),
          }
        }

        if (table === 'competition_judges') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{
                id: 'cj-1', user_id: 'u-2', role: 'judge', display_name: 'First Class Judge', is_active: true, has_submitted: false, created_at: '2024-01-02', users: { id: 'u-2', email: 'firstclass@example.com' } }],
              error: null,
            }),
          }
        }

        if (table === 'invitations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }

        if (table === 'events') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { information_form_schema: { enabled: false, fields: [] } }, error: null }),
          }
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      },
    }))

    const result = await listJudges('event-1', 'organizer-1')

    expect(result.judges).toHaveLength(2)
    expect(result.judges.map((j) => j.email)).toEqual(expect.arrayContaining(['legacy@example.com', 'firstclass@example.com']))
  })

  test('polling service exposes respondent enrollment helpers', () => {
    expect(typeof pollingService.listEventRespondents).toBe('function')
    expect(typeof pollingService.registerRespondentToPoll).toBe('function')
    expect(typeof pollingService.registerExistingRespondent).toBe('function')
    expect(typeof pollingService.sendRespondentInvitation).toBe('function')
    expect(typeof pollingService.sendAllPendingRespondentInvitations).toBe('function')
  })

  // ── No-reset-on-existing assertions ──────────────────────────────────────

  test('registerRespondentToPoll: existing voter is not password-reset', async () => {
    mocks.eventType = 'polling'
    mocks.findUserByEmail.mockResolvedValue(existingVoter)
    mocks.sanitizeUser.mockImplementation((u) => { const { password, ...safe } = u ?? {}; return safe })

    const result = await pollingService.registerRespondentToPoll({
      eventId: 'event-1',
      email: existingVoter.email,
      organizerId: 'organizer-1',
    })

    expect(result.isNewRespondent).toBe(false)
    // hashPassword must NOT have been called (no password reset)
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    // Returned user must not expose the password hash
    expect(result.user).not.toHaveProperty('password')
  })

  test('inviteVoterToEvent: existing voter gets registered email, no temp password', async () => {
    mocks.findUserByEmail.mockResolvedValue(existingVoter)

    const result = await invitationService.inviteVoterToEvent({
      eventId: 'event-1',
      email: existingVoter.email,
      organizerId: 'organizer-1',
    })

    expect(result.isNewVoter).toBe(false)
    expect(mocks.sendVoterInvitationEmailRegistered).toHaveBeenCalledOnce()
    expect(mocks.sendVoterInvitationEmail).not.toHaveBeenCalled()
    expect(mocks.hashPassword).not.toHaveBeenCalled()
  })

  test('registerVoterToEvent: existing voter is returned unchanged (no password update)', async () => {
    mocks.findUserByEmail.mockResolvedValue(existingVoter)

    const result = await invitationService.registerVoterToEvent({
      eventId: 'event-1',
      email: existingVoter.email,
      organizerId: 'organizer-1',
    })

    expect(result.isNewVoter).toBe(false)
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(result.user).not.toHaveProperty('password')
  })

  test('sendVoterInvitation: voter with must_change_password=false gets registered email, no reset', async () => {
    mocks.findUserById.mockResolvedValue(existingVoter)
    mocks.maybeSingleData = { id: 'participant-1' }

    const result = await invitationService.sendVoterInvitation({
      eventId: 'event-1',
      voterId: existingVoter.id,
      organizerId: 'organizer-1',
    })

    expect(result.invitationType).toBe('existing')
    expect(mocks.sendVoterInvitationEmailRegistered).toHaveBeenCalledOnce()
    expect(mocks.sendVoterInvitationEmail).not.toHaveBeenCalled()
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(result.temporaryPassword).toBeNull()
  })

  test('returned user objects do not contain a password field', async () => {
    mocks.eventType = 'polling'
    mocks.findUserByEmail.mockResolvedValue(existingVoter)

    const pollResult = await pollingService.registerRespondentToPoll({
      eventId: 'event-1',
      email: existingVoter.email,
      organizerId: 'organizer-1',
    })
    expect(pollResult.user).not.toHaveProperty('password')

    const invResult = await invitationService.registerVoterToEvent({
      eventId: 'event-1',
      email: existingVoter.email,
      organizerId: 'organizer-1',
    })
    expect(invResult.user).not.toHaveProperty('password')
  })

  test('poll access checks canonical participant enrollment', async () => {
    mocks.maybeSingleData = {
      id: 'participant-1',
      event_id: 'event-1',
      user_id: 'user-1',
      has_responded: false,
    }

    await expect(pollingService.assertVoterCanRespond('event-1', 'user-1')).resolves.toMatchObject({
      user_id: 'user-1',
      has_responded: false,
    })

    expect(mocks.fromTables).toContain('event_participants')
    expect(mocks.fromTables).not.toContain('v_event_voters')
    expect(mocks.fromTables).not.toContain('event_voters')
  })
})
