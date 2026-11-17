import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))

import { attachParticipantContext, listParticipantTypes } from '../../src/services/auth.service.js'

const S = '00000000-0000-4000-8000-0000000000a1'
const J = '00000000-0000-4000-8000-0000000000b1'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  world = createFakeSupabase({
    users: [],
    organization_officers: [],
    user_participant_types: [
      { user_id: S, participant_type: 'STUDENT', is_active: true },
      { user_id: J, participant_type: 'JUDGE', is_active: true },
      { user_id: J, participant_type: 'STUDENT', is_active: false },
    ],
  })
})

describe('participant types on the signed-in user', () => {
  test('a student gets STUDENT and no officership', async () => {
    const user = await attachParticipantContext({ id: S, role: 'participant' })
    expect(user.participantTypes).toEqual(['STUDENT'])
    expect(user.officership).toBeNull()
  })

  test('a judge gets JUDGE; an inactive membership is ignored', async () => {
    const user = await attachParticipantContext({ id: J, role: 'participant' })
    expect(user.participantTypes).toEqual(['JUDGE'])
  })

  test('an account with no memberships gets an empty list', async () => {
    expect(await listParticipantTypes('00000000-0000-4000-8000-0000000000ff')).toEqual([])
  })

  test('a failed lookup never breaks sign-in', async () => {
    world.failNext('user_participant_types', 'select', 'db down')
    const user = await attachParticipantContext({ id: S, role: 'participant' })
    expect(user.participantTypes).toEqual([])
    expect(user.id).toBe(S)
  })

  test('admins and organizers are returned unchanged', async () => {
    const admin = { id: 'a', role: 'admin' }
    const organizer = { id: 'o', role: 'organizer' }
    expect(await attachParticipantContext(admin)).toEqual(admin)
    expect(await attachParticipantContext(organizer)).toEqual(organizer)
    expect(await attachParticipantContext(null)).toBeNull()
  })
})
