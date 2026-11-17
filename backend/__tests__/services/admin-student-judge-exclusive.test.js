import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

// A participant is EITHER a student OR a judge, never both
// (docs/plans/student-judge-separation-migration.md). The admin create and CSV
// import paths must refuse to attach the other type to an existing account.

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
vi.mock('../../src/services/program.service.js', () => ({
  listActivePrograms: vi.fn(async () => ['BSCS']),
}))

import {
  VOTER_CSV_TEMPLATE_HEADERS,
  createJudge,
  createVoter,
  previewJudgeImport,
  previewVoterImport,
  registerJudgeImport,
  registerVoterImport,
} from '../../src/services/admin-participant.service.js'
import { addParticipantTypeMembership } from '../../src/services/user-participant-type.service.js'

const STUDENT_ID = '00000000-0000-4000-8000-0000000000a1'
const JUDGE_ID = '00000000-0000-4000-8000-0000000000b1'

const account = (id, email, extra = {}) => ({
  id,
  email,
  role: 'participant',
  account_status: 'active',
  first_name: 'Ada',
  last_name: 'Lovelace',
  school_id: null,
  program: null,
  year_section: null,
  profile_data: {},
  ...extra,
})

function seed({ studentActive = true } = {}) {
  world = createFakeSupabase({
    users: [
      account(STUDENT_ID, 'student@example.com', { school_id: '2024-0001', program: 'BSCS' }),
      account(JUDGE_ID, 'judge@example.com', { first_name: 'Grace', last_name: 'Hopper' }),
    ],
    user_participant_types: [
      { user_id: STUDENT_ID, participant_type: 'STUDENT', is_active: studentActive },
      { user_id: JUDGE_ID, participant_type: 'JUDGE', is_active: true },
    ],
  })
}

const judgeInput = (email) => ({ email, firstName: 'Ada', lastName: 'Lovelace' })
const studentCsv = (email) =>
  Buffer.from([VOTER_CSV_TEMPLATE_HEADERS.join(','), `${email},2024-0099,Hopper,Grace,BSCS`].join('\n'))
const judgeCsv = (email) => Buffer.from(['email,last name,first name', `${email},Lovelace,Ada`].join('\n'))

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe('adding a judge', () => {
  test('is refused for an email that already belongs to a student', async () => {
    await expect(createJudge(judgeInput('student@example.com'))).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/student account.*not both/i),
    })
    expect(addParticipantTypeMembership).not.toHaveBeenCalled()
  })

  test('is allowed again when the student membership was removed (inactive)', async () => {
    seed({ studentActive: false })
    const { created } = await createJudge(judgeInput('student@example.com'))
    expect(created).toBe(false)
    expect(addParticipantTypeMembership).toHaveBeenCalledWith(STUDENT_ID, 'JUDGE')
  })

  test('still updates an existing judge', async () => {
    const { created } = await createJudge({ email: 'judge@example.com', firstName: 'Grace', lastName: 'Hopper', title: 'Cmdr.' })
    expect(created).toBe(false)
    expect(world.rows('users').find((u) => u.id === JUDGE_ID).profile_data).toEqual({ title: 'Cmdr.' })
  })

  test('CSV preview flags a student row and keeps it out of the import', async () => {
    const preview = await previewJudgeImport(judgeCsv('student@example.com'))
    expect(preview.valid).toBe(0)
    expect(preview.errors).toEqual([expect.stringMatching(/Row 2: .*student account/)])
  })

  test('CSV register rejects a student row even if the preview was skipped', async () => {
    const result = await registerJudgeImport([
      { type: 'existing', email: 'student@example.com', first_name: 'Ada', last_name: 'Lovelace', rowNumber: 2 },
    ])
    expect(result.failed).toBe(1)
    expect(result.results[0]).toMatchObject({ success: false, error: expect.stringMatching(/student account/) })
    expect(addParticipantTypeMembership).not.toHaveBeenCalled()
  })
})

describe('adding a student', () => {
  test('is refused for an email that already belongs to a judge', async () => {
    await expect(
      createVoter({ email: 'judge@example.com', schoolId: '2024-0042', firstName: 'Grace', lastName: 'Hopper', program: 'BSCS' }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/judge account.*not both/i) })
    expect(addParticipantTypeMembership).not.toHaveBeenCalled()
  })

  test('the program must be in the programs list, and no year & section is needed', async () => {
    // Only the program is reported: nothing complains about a missing year/section.
    await expect(
      createVoter({ email: 'new@example.com', schoolId: '2024-0777', firstName: 'Ada', lastName: 'Lovelace', program: 'NOT-A-PROGRAM' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { errors: ['program "NOT-A-PROGRAM" is not in the program list'] },
    })
  })

  test('CSV import needs no year & section column; only the program is checked', async () => {
    // The template has no year & section column, and an unknown program is the only error.
    const csv = Buffer.from([VOTER_CSV_TEMPLATE_HEADERS.join(','), 'x@example.com,2024-0555,Cruz,Juan,NOT-A-PROGRAM'].join('\n'))
    const preview = await previewVoterImport(csv)
    expect(preview.errors).toEqual(['Row 2: program "NOT-A-PROGRAM" is not in the program list'])
  })

  test('CSV preview flags a judge row and keeps it out of the import', async () => {
    const preview = await previewVoterImport(studentCsv('judge@example.com'))
    expect(preview.valid).toBe(0)
    expect(preview.errors).toEqual([expect.stringMatching(/Row 2: .*judge account/)])
  })

  test('CSV register rejects a judge row even if the preview was skipped', async () => {
    const result = await registerVoterImport([
      { type: 'existing', email: 'judge@example.com', first_name: 'Grace', last_name: 'Hopper', school_id: '2024-0099', program: 'BSCS', rowNumber: 2 },
    ])
    expect(result.failed).toBe(1)
    expect(result.results[0]).toMatchObject({ success: false, error: expect.stringMatching(/judge account/) })
    expect(addParticipantTypeMembership).not.toHaveBeenCalled()
  })
})
