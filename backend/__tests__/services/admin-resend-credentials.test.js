import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

// Admin → Participants: when the credentials email failed, the admin can resend.
// The original temp password is only stored hashed, so a resend issues a NEW one.

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// The backend loads a real .env, so the mailer is ALWAYS mocked.
vi.mock('../../src/services/mailer.service.js', () => ({
  sendVoterAccountCreatedEmail: vi.fn(async () => ({ sent: true })),
}))
vi.mock('../../src/services/user-participant-type.service.js', () => ({
  addParticipantTypeMembership: vi.fn(async () => {}),
  setParticipantTypeMembership: vi.fn(async () => {}),
}))
vi.mock('../../src/services/program.service.js', () => ({
  listActivePrograms: vi.fn(async () => ['BSCS']),
}))

import { resendJudgeCredentials, resendStudentCredentials } from '../../src/services/admin-participant.service.js'
import { sendVoterAccountCreatedEmail } from '../../src/services/mailer.service.js'

const STUDENT_ID = '00000000-0000-4000-8000-0000000000a1'
const JUDGE_ID = '00000000-0000-4000-8000-0000000000b1'
const OLD_HASH = 'old-hash'

const account = (id, email, extra = {}) => ({
  id,
  email,
  role: 'participant',
  account_status: 'active',
  must_change_password: true,
  password: OLD_HASH,
  first_name: 'Ada',
  last_name: 'Lovelace',
  profile_data: {},
  ...extra,
})

function seed({ student = {}, judge = {} } = {}) {
  world = createFakeSupabase({
    users: [account(STUDENT_ID, 'student@example.com', student), account(JUDGE_ID, 'judge@example.com', judge)],
    user_participant_types: [
      { user_id: STUDENT_ID, participant_type: 'STUDENT', is_active: true },
      { user_id: JUDGE_ID, participant_type: 'JUDGE', is_active: true },
    ],
  })
}

const stored = (id) => world.raw('users').find((u) => u.id === id)

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe('resending credentials', () => {
  test('issues a new temporary password and emails it to the student', async () => {
    const { email } = await resendStudentCredentials(STUDENT_ID)

    expect(email.sent).toBe(true)
    expect(stored(STUDENT_ID).password).not.toBe(OLD_HASH)
    expect(stored(STUDENT_ID).must_change_password).toBe(true)

    const args = sendVoterAccountCreatedEmail.mock.calls[0][0]
    expect(args.email).toBe('student@example.com')
    expect(args.temporaryPassword).toEqual(expect.any(String))
    // Unique key so the email guard does not treat it as a duplicate of the failed first send.
    expect(args.dedupeKey).toMatch(/^participant-credentials-resend:/)
  })

  test('works for a judge', async () => {
    await resendJudgeCredentials(JUDGE_ID)
    expect(sendVoterAccountCreatedEmail.mock.calls[0][0].email).toBe('judge@example.com')
    expect(stored(JUDGE_ID).password).not.toBe(OLD_HASH)
  })

  test('reports a failed send so the admin can try again', async () => {
    sendVoterAccountCreatedEmail.mockResolvedValueOnce({ sent: false, error: 'provider down' })
    const { email } = await resendStudentCredentials(STUDENT_ID)
    expect(email).toMatchObject({ sent: false, error: 'provider down' })
  })

  test('refuses once the person has set their own password (would lock them out)', async () => {
    seed({ student: { must_change_password: false } })
    await expect(resendStudentCredentials(STUDENT_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/forgot password/i),
    })
    expect(sendVoterAccountCreatedEmail).not.toHaveBeenCalled()
    expect(stored(STUDENT_ID).password).toBe(OLD_HASH)
  })

  test('refuses an archived account', async () => {
    seed({ judge: { account_status: 'archived' } })
    await expect(resendJudgeCredentials(JUDGE_ID)).rejects.toMatchObject({ statusCode: 409 })
    expect(sendVoterAccountCreatedEmail).not.toHaveBeenCalled()
  })

  test('does not resend a student id through the judge path', async () => {
    await expect(resendJudgeCredentials(STUDENT_ID)).rejects.toMatchObject({ statusCode: 404 })
  })
})
