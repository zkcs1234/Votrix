import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))
vi.mock('../../src/services/mailer.service.js', () => ({
  sendVoterAccountCreatedEmail: vi.fn(async () => ({ sent: true })),
}))
vi.mock('../../src/services/user-participant-type.service.js', () => ({
  addParticipantTypeMembership: vi.fn(async () => {}),
  setParticipantTypeMembership: vi.fn(async () => {}),
}))

import { previewJudgeImport } from '../../src/services/admin-participant.service.js'
import { csvWithBom, neutralizeCell } from '../../src/services/export.service.js'

beforeEach(() => {
  world = createFakeSupabase({ users: [], user_participant_types: [] })
})

describe('a file exported by the system imports back without editing', () => {
  const exported = [
    'judge_id,email,first_name,last_name,title,affiliation,expertise,account_status,password_change_pending,events_assigned,created_at',
    `j1,ana@example.com,Ana,Peña,${neutralizeCell('=Dr.')},Design Guild,Poise,active,true,2,2026-01-01T00:00:00.000Z`,
  ].join('\n')

  test('the byte-order mark, accented names and the formula-guard apostrophe are all handled', async () => {
    const preview = await previewJudgeImport(Buffer.from(csvWithBom(exported), 'utf8'))

    expect(preview.errors).toEqual([])
    expect(preview.valid).toBe(1)
    expect(preview.data[0]).toMatchObject({ email: 'ana@example.com', first_name: 'Ana', last_name: 'Peña', title: '=Dr.' })
  })

  test('columns the import does not use are listed so the admin knows they were ignored', async () => {
    const preview = await previewJudgeImport(Buffer.from(exported, 'utf8'))

    expect(preview.ignoredColumns).toEqual(
      expect.arrayContaining(['judge_id', 'account_status', 'password_change_pending', 'events_assigned', 'created_at']),
    )
    expect(preview.ignoredColumns).not.toContain('email')
    expect(preview.ignoredColumns).not.toContain('title')
  })
})

describe('neutralizeCell', () => {
  test.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx'])('guards %j', (value) => {
    expect(neutralizeCell(value)).toBe(`'${value}`)
  })
  test.each(['Jane', '2026-01-01', 'a=b', ''])('leaves %j alone', (value) => {
    expect(neutralizeCell(value)).toBe(value)
  })
})
