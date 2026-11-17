import { beforeEach, describe, expect, test, vi } from 'vitest'

// The judge pool is global: every active judge is visible to every organizer, and
// an organizer picks judges for their own event. There is no admin-side
// judge -> organizer assignment (users.profile_data.organizerIds is ignored).

const state = { tables: {} }

// Tiny chainable stand-in for the query builder: every filter returns the same
// builder, `.in('user_id', ids)` narrows rows by the (embedded) user id, and
// awaiting it resolves the rows configured for that table.
function fromTable(table) {
  let userIds = null
  const builder = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve, reject) => {
          const rows = (state.tables[table] ?? []).filter((row) => !userIds || userIds.includes(row.users?.id ?? row.user_id))
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        }
      }
      if (prop === 'in') {
        return (column, values) => {
          if (column === 'user_id') userIds = values
          return builder
        }
      }
      return () => builder
    },
  })
  return builder
}

vi.mock('../../src/foundation/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  db: () => ({ from: fromTable }),
}))
vi.mock('../../src/services/event.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'event-1', event_type: 'competition_scoring', status: 'draft' })),
  getEventById: vi.fn(async () => ({ id: 'event-1', title: 'Pageant' })),
}))
vi.mock('../../src/services/participant.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  registerParticipant: vi.fn(async () => ({})),
}))
vi.mock('../../src/services/mailer.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendJudgeInvitationEmailRegistered: vi.fn(async () => ({ sent: true })),
}))

import { getJudgePool, pickJudges } from '../../src/services/competition.service.js'
import { registerParticipant } from '../../src/services/participant.service.js'

const judgeUser = (id, extra = {}) => ({
  id,
  email: `${id}@example.com`,
  first_name: id.toUpperCase(),
  last_name: 'Judge',
  account_status: 'active',
  profile_data: {},
  ...extra,
})

const ORGANIZER_A = 'organizer-a'
const ORGANIZER_B = 'organizer-b'

beforeEach(() => {
  vi.clearAllMocks()
  state.tables = {
    user_participant_types: [
      { users: judgeUser('j1', { profile_data: { title: 'Dr.', affiliation: 'Navy', expertise: 'Poise', organizerIds: [ORGANIZER_B], notes: 'private' } }) },
      { users: judgeUser('j2', { profile_data: { organizerIds: ['someone-else'] } }) },
      { users: judgeUser('j3') },
    ],
    event_participants: [],
  }
})

describe('getJudgePool', () => {
  test('shows every judge to every organizer, ignoring any legacy organizer assignment', async () => {
    const forA = await getJudgePool('event-1', ORGANIZER_A)
    const forB = await getJudgePool('event-1', ORGANIZER_B)
    expect(forA.map((j) => j.id)).toEqual(['j1', 'j2', 'j3'])
    expect(forB.map((j) => j.id)).toEqual(['j1', 'j2', 'j3'])
  })

  test('exposes only the fields the picker needs, not the whole profile', async () => {
    const [first] = await getJudgePool('event-1', ORGANIZER_A)
    expect(first.profileData).toEqual({ title: 'Dr.', affiliation: 'Navy', expertise: 'Poise' })
    expect(JSON.stringify(first)).not.toMatch(/organizerIds|private/)
  })

  test('filters by name or email search', async () => {
    const found = await getJudgePool('event-1', ORGANIZER_A, { search: 'J3@EXAMPLE' })
    expect(found.map((j) => j.id)).toEqual(['j3'])
  })

  test('marks judges already enrolled in the event', async () => {
    state.tables.event_participants = [{ user_id: 'j2' }]
    const pool = await getJudgePool('event-1', ORGANIZER_A)
    expect(pool.find((j) => j.id === 'j2').enrolled).toBe(true)
    expect(pool.find((j) => j.id === 'j1').enrolled).toBe(false)
  })
})

describe('pickJudges', () => {
  test('lets an organizer pick a judge that was once assigned to a different organizer', async () => {
    const result = await pickJudges('event-1', ORGANIZER_A, { userIds: ['j1'] })
    expect(result.enrolled).toBe(1)
    expect(registerParticipant).toHaveBeenCalledTimes(1)
    expect(registerParticipant.mock.calls[0][1]).toBe('j1')
  })

  test('still rejects ids that are not judges in the pool', async () => {
    await expect(pickJudges('event-1', ORGANIZER_A, { userIds: ['not-a-judge'] })).rejects.toMatchObject({ statusCode: 403 })
    expect(registerParticipant).not.toHaveBeenCalled()
  })

  test('requires at least one judge', async () => {
    await expect(pickJudges('event-1', ORGANIZER_A, { userIds: [] })).rejects.toMatchObject({ statusCode: 400 })
  })
})
