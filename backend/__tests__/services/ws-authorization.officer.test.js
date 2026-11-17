import { beforeEach, describe, expect, test, vi } from 'vitest'

// Table-aware stub: each table answers with whatever the test put in `tables`.
const tables = vi.hoisted(() => ({}))
vi.mock('../../src/foundation/db.js', () => ({
  db: () => ({
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => tables[table] ?? { data: null, error: null },
      }
      return chain
    },
  }),
}))

import { canSubscribeToRoom } from '../../src/websocket/ws-authorization.js'

const STUDENT = '10000000-0000-0000-0000-000000000001'
const OWNER = '30000000-0000-0000-0000-000000000003'
const OTHER_OWNER = '40000000-0000-0000-0000-000000000004'
const EVENT = '20000000-0000-0000-0000-000000000001'

const student = { id: STUDENT, role: 'participant' }
const officer = (over = {}) => ({
  data: { id: 'off-1', student_id: STUDENT, organizer_id: OWNER, status: 'active', ...over },
  error: null,
})
const eventOwnedBy = (organizerId) => ({ data: { organizations: { organizer_id: organizerId } }, error: null })

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key]
})

describe('student officers and event rooms', () => {
  test('an active officer may follow the owner’s event in the organizer view', async () => {
    tables.organization_officers = officer()
    tables.events = eventOwnedBy(OWNER)

    expect(await canSubscribeToRoom(student, `event:${EVENT}:organizer`)).toBe(true)
    expect(await canSubscribeToRoom(student, `event:${EVENT}`)).toBe(true)
  })

  test('not another organization’s event', async () => {
    tables.organization_officers = officer()
    tables.events = eventOwnedBy(OTHER_OWNER)

    expect(await canSubscribeToRoom(student, `event:${EVENT}:organizer`)).toBe(false)
    expect(await canSubscribeToRoom(student, `event:${EVENT}`)).toBe(false)
  })

  test('a deactivated officer (no active row) is refused', async () => {
    tables.organization_officers = { data: null, error: null }
    tables.events = eventOwnedBy(OWNER)

    expect(await canSubscribeToRoom(student, `event:${EVENT}:organizer`)).toBe(false)
  })

  test.each([
    ['belongs to another student', { student_id: 'someone-else' }],
    ['is not active', { status: 'inactive' }],
  ])('an officership row that %s is never trusted', async (_label, over) => {
    tables.organization_officers = officer(over)
    tables.events = eventOwnedBy(OWNER)

    expect(await canSubscribeToRoom(student, `event:${EVENT}:organizer`)).toBe(false)
  })

  test('a failing officership lookup fails closed', async () => {
    tables.organization_officers = { data: null, error: { message: 'db down' } }
    tables.events = eventOwnedBy(OWNER)

    expect(await canSubscribeToRoom(student, `event:${EVENT}:organizer`)).toBe(false)
  })

  test('the voters channel stays participant-only even for an officer', async () => {
    tables.organization_officers = officer()
    tables.events = eventOwnedBy(OWNER)
    tables.event_participants = { data: null, error: null } // not enrolled

    expect(await canSubscribeToRoom(student, `event:${EVENT}:voters`)).toBe(false)
  })

  test('an officer who is also enrolled keeps ordinary participant access', async () => {
    tables.organization_officers = officer()
    tables.events = eventOwnedBy(OTHER_OWNER)
    tables.event_participants = { data: { id: 'e', is_active: true }, error: null }

    expect(await canSubscribeToRoom(student, `event:${EVENT}:voters`)).toBe(true)
    expect(await canSubscribeToRoom(student, `event:${EVENT}`)).toBe(true)
  })

  test('an ordinary student with no officership still cannot open the organizer channel', async () => {
    tables.organization_officers = { data: null, error: null }
    tables.events = eventOwnedBy(OWNER)
    tables.event_participants = { data: { id: 'e', is_active: true }, error: null }

    expect(await canSubscribeToRoom(student, `event:${EVENT}:organizer`)).toBe(false)
  })

  test('organizers keep exactly their previous behaviour', async () => {
    tables.events = eventOwnedBy(OWNER)
    const organizer = { id: OWNER, role: 'organizer' }

    expect(await canSubscribeToRoom(organizer, `event:${EVENT}:organizer`)).toBe(true)
    expect(await canSubscribeToRoom(organizer, `event:${EVENT}:voters`)).toBe(false)
    expect(await canSubscribeToRoom({ id: OTHER_OWNER, role: 'organizer' }, `event:${EVENT}`)).toBe(false)
  })
})
