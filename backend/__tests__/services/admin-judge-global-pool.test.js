import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

// Judges are a global pool: the admin creates a judge account and every
// organizer sees it. The admin side no longer assigns judges to organizers.

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
// The backend loads a real .env, so the mailer is ALWAYS mocked: creating an
// account sends a credentials email and a test must never reach a real provider.
vi.mock('../../src/services/mailer.service.js', () => ({
  sendVoterAccountCreatedEmail: vi.fn(async () => ({ sent: true })),
}))
vi.mock('../../src/services/user-participant-type.service.js', () => ({
  addParticipantTypeMembership: vi.fn(async () => {}),
  setParticipantTypeMembership: vi.fn(async () => {}),
}))

import {
  JUDGE_CSV_TEMPLATE_HEADERS,
  createJudge,
  previewJudgeImport,
  updateJudge,
} from '../../src/services/admin-participant.service.js'
import { addParticipantTypeMembership } from '../../src/services/user-participant-type.service.js'

const JUDGE_ID = '00000000-0000-4000-8000-0000000000aa'

beforeEach(() => {
  vi.clearAllMocks()
  world = createFakeSupabase({
    users: [],
    user_participant_types: [],
  })
})

describe('judge accounts have no organizer assignment', () => {
  test('the CSV template has no organizers column', () => {
    expect(JUDGE_CSV_TEMPLATE_HEADERS).toEqual(['email', 'last name', 'first name', 'title', 'affiliation', 'expertise'])
  })

  test('createJudge ignores organizerIds and stores only the judge profile fields', async () => {
    const { user, created } = await createJudge({
      email: 'New.Judge@Example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      title: 'Dr.',
      affiliation: 'Analytical Engines',
      expertise: 'Poise',
      organizerIds: ['organizer-1', 'organizer-2'],
    })
    expect(created).toBe(true)
    expect(user.email).toBe('new.judge@example.com')

    const [saved] = world.rows('users')
    expect(saved.profile_data).toEqual({ title: 'Dr.', affiliation: 'Analytical Engines', expertise: 'Poise' })
    expect(addParticipantTypeMembership).toHaveBeenCalledWith(saved.id, 'JUDGE')
  })

  test('updateJudge drops a legacy organizerIds value and keeps the real profile fields', async () => {
    world = createFakeSupabase({
      users: [{
        id: JUDGE_ID, email: 'judge@example.com', role: 'participant', account_status: 'active',
        first_name: 'Grace', last_name: 'Hopper',
        profile_data: { title: 'Cmdr.', expertise: 'Compilers', organizerIds: ['organizer-1'] },
      }],
      user_participant_types: [{ user_id: JUDGE_ID, participant_type: 'JUDGE', is_active: true }],
    })

    await updateJudge(JUDGE_ID, { firstName: 'Grace', lastName: 'Hopper', affiliation: 'Navy', organizerIds: ['organizer-2'] })

    const [saved] = world.rows('users')
    expect(saved.profile_data).toEqual({ title: 'Cmdr.', affiliation: 'Navy', expertise: 'Compilers' })
  })

  test('an older CSV that still has an "organizers" column imports without error and ignores it', async () => {
    const csv = [
      'email,last name,first name,title,affiliation,expertise,organizers',
      'a@example.com,Lovelace,Ada,Dr.,Engines,Poise,"org1@example.com;org2@example.com"',
    ].join('\n')

    const preview = await previewJudgeImport(Buffer.from(csv))

    expect(preview.errors).toEqual([])
    expect(preview.valid).toBe(1)
    expect(preview.data[0]).not.toHaveProperty('organizerEmails')
    expect(preview.data[0]).not.toHaveProperty('organizerIds')
  })
})
